'use strict';

/**
 * Tenant Connection Manager — lazy pool of per-tenant Mongoose connections.
 *
 * Architecture:
 *   1. Platform DB stores each clinic's encrypted dbUri.
 *   2. On first request for a tenant, we decrypt the URI, open a Mongoose
 *      connection, cache it in an in-memory Map, and register tenant models.
 *   3. Subsequent requests reuse the cached connection (no cold-start).
 *   4. A circuit breaker prevents cascading failures when a tenant DB is down.
 *   5. Idle connections are pruned after IDLE_TIMEOUT_MS.
 *
 * Race-condition safety:
 *   In-flight connection promises are tracked in a separate Map so concurrent
 *   requests for the same tenant don't create duplicate connections.
 *
 * Redis cache layer:
 *   Encrypted URIs are cached in Redis (key: tenant:dbUri:<slug>) so the
 *   platform DB is only hit once per tenant per process lifecycle.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const { getRedis } = require('../config/redis');

/** @type {Map<string, { conn: mongoose.Connection, lastUsed: number, circuitOpen: boolean }>} */
const pool = new Map();

/** @type {Map<string, Promise<mongoose.Connection>>} — in-flight connection promises to prevent races */
const connecting = new Map();

const MAX_POOL_SIZE = 5;
const MAX_TOTAL_CONNECTIONS = 50;    // cap total tenant connections per process
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const CIRCUIT_RESET_MS = 60 * 1000;     // 1 min
const REDIS_URI_TTL = 3600;             // 1 hour

/**
 * Get (or create) a Mongoose connection for the given tenant slug.
 *
 * @param {string} slug - clinic slug (from X-Tenant-ID header)
 * @returns {Promise<mongoose.Connection>}
 */
async function getTenantConnection(slug) {
  // 1. Return cached connection if alive
  const cached = pool.get(slug);
  if (cached) {
    if (cached.circuitOpen) {
      throw new Error(`Circuit open for tenant "${slug}" — DB temporarily unavailable`);
    }
    cached.lastUsed = Date.now();
    if (cached.conn.readyState === 1) return cached.conn;
    // Connection dropped — clean up and reconnect
    pool.delete(slug);
    logger.warn('Tenant DB [%s]: stale connection removed, reconnecting…', slug);
  }

  // 2. If a connection attempt is already in-flight, wait for it (prevents race condition)
  if (connecting.has(slug)) {
    return connecting.get(slug);
  }

  // 3. Start a new connection attempt and track the promise
  const connectPromise = _createConnection(slug);
  connecting.set(slug, connectPromise);

  try {
    const conn = await connectPromise;
    return conn;
  } finally {
    connecting.delete(slug);
  }
}

/**
 * Internal: actually create and cache a new connection.
 */
async function _createConnection(slug) {
  // Guard: cap total connections to prevent memory exhaustion
  if (pool.size >= MAX_TOTAL_CONNECTIONS) {
    _pruneOldest();
    if (pool.size >= MAX_TOTAL_CONNECTIONS) {
      throw new Error(
        `Tenant connection pool full (${MAX_TOTAL_CONNECTIONS}) — cannot open connection for "${slug}"`,
      );
    }
  }

  const dbUri = await _resolveTenantUri(slug);

  try {
    const conn = await mongoose.createConnection(dbUri, {
      maxPoolSize: MAX_POOL_SIZE,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }).asPromise();

    // Register tenant-scoped models on this connection
    _registerTenantModels(conn);

    pool.set(slug, { conn, lastUsed: Date.now(), circuitOpen: false });
    logger.info('Tenant DB [%s]: connection established (pool size: %d)', slug, pool.size);

    conn.on('error', (err) => {
      logger.error('Tenant DB [%s]: error — %s', slug, err.message);
      _openCircuit(slug);
    });

    conn.on('disconnected', () => {
      logger.warn('Tenant DB [%s]: disconnected', slug);
    });

    return conn;
  } catch (err) {
    _openCircuit(slug);
    throw err;
  }
}

/**
 * Close a specific tenant connection.
 */
async function closeTenantConnection(slug) {
  const entry = pool.get(slug);
  if (entry) {
    await entry.conn.close();
    pool.delete(slug);
    logger.info('Tenant DB [%s]: connection closed', slug);
  }
}

/**
 * Close ALL tenant connections (graceful shutdown).
 */
async function closeAllTenantConnections() {
  const closeTasks = [];
  for (const [slug, { conn }] of pool) {
    closeTasks.push(
      conn.close().then(() => logger.info('Tenant DB [%s]: closed', slug)),
    );
  }
  await Promise.allSettled(closeTasks);
  pool.clear();
  connecting.clear();
  logger.info('Tenant connection manager: all connections closed');
}

/**
 * Prune idle connections (call from a setInterval in server.js).
 */
function pruneIdleConnections() {
  const now = Date.now();
  for (const [slug, entry] of pool) {
    if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      entry.conn.close().catch(() => {});
      pool.delete(slug);
      logger.info('Tenant DB [%s]: pruned (idle > %dmin)', slug, IDLE_TIMEOUT_MS / 60000);
    }
  }
}

/** Evict the oldest (least recently used) connection when pool is full. */
function _pruneOldest() {
  let oldestSlug = null;
  let oldestTime = Infinity;
  for (const [slug, entry] of pool) {
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestSlug = slug;
    }
  }
  if (oldestSlug) {
    const entry = pool.get(oldestSlug);
    entry.conn.close().catch(() => {});
    pool.delete(oldestSlug);
    logger.info('Tenant DB [%s]: evicted (pool full)', oldestSlug);
  }
}

/** Current pool size (for health checks). */
function getPoolSize() {
  return pool.size;
}

// ── Internal helpers ──────────────────────────────────────

/**
 * Resolve the DB URI for a tenant: check Redis cache first, then platform DB.
 */
async function _resolveTenantUri(slug) {
  const env = require('../config/env');
  const redis = getRedis();
  const cacheKey = `tenant:dbUri:${slug}`;

  // Check Redis cache
  const cachedEncrypted = await redis.get(cacheKey);
  if (cachedEncrypted) {
    return decrypt(cachedEncrypted, env.APP_ENCRYPTION_KEY);
  }

  // Query platform DB — use .select('+dbUri') since dbUri has select: false.
  // Note: we do NOT filter by isActive here — the tenant middleware enforces
  // active-tenant gating for API requests.  Internal callers (provisioning
  // worker, sync worker) need access to pending/inactive tenants.
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug }).select('+dbUri').lean();
  if (!clinic || !clinic.dbUri) {
    throw new Error(`Tenant "${slug}" not found`);
  }

  // Cache encrypted URI in Redis
  const encrypted = encrypt(clinic.dbUri, env.APP_ENCRYPTION_KEY);
  await redis.set(cacheKey, encrypted, 'EX', REDIS_URI_TTL);

  return clinic.dbUri;
}

/**
 * Register tenant-scoped Mongoose models on the given connection.
 */
function _registerTenantModels(conn) {
  const models = require('../models/tenant');
  for (const [name, schema] of Object.entries(models)) {
    if (!conn.models[name]) {
      conn.model(name, schema);
    }
  }
}

/**
 * Open the circuit breaker for a tenant — auto-resets after CIRCUIT_RESET_MS.
 */
function _openCircuit(slug) {
  const entry = pool.get(slug);
  if (entry) {
    entry.circuitOpen = true;
    setTimeout(() => {
      if (pool.has(slug)) {
        pool.get(slug).circuitOpen = false;
        logger.info('Tenant DB [%s]: circuit breaker reset', slug);
      }
    }, CIRCUIT_RESET_MS);
  }
}

module.exports = {
  getTenantConnection,
  closeTenantConnection,
  closeAllTenantConnections,
  pruneIdleConnections,
  getPoolSize,
};
