'use strict';

/**
 * Monitoring Service — collects system health metrics.
 *
 * Provides:
 *  - Memory usage (heap, RSS, external)
 *  - Redis health (connected, latency, memory, keys)
 *  - MongoDB health (platform + tenant connections)
 *  - Background job stats (BullMQ queues)
 *  - Slow query detection
 *  - System info (CPU, load average)
 */

const os = require('os');
const logger = require('../utils/logger');

// ── Memory Monitoring ─────────────────────────────

function getMemoryUsage() {
  const mem = process.memoryUsage();
  const totalSystem = os.totalmem();
  const freeSystem = os.freemem();
  return {
    heap: {
      used: Math.round(mem.heapUsed / 1048576),    // MB
      total: Math.round(mem.heapTotal / 1048576),
      percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100),
    },
    rss: Math.round(mem.rss / 1048576),
    external: Math.round(mem.external / 1048576),
    arrayBuffers: Math.round((mem.arrayBuffers || 0) / 1048576),
    system: {
      total: Math.round(totalSystem / 1048576),
      free: Math.round(freeSystem / 1048576),
      usedPercent: Math.round(((totalSystem - freeSystem) / totalSystem) * 100),
    },
  };
}

// ── Redis Monitoring ──────────────────────────────

async function getRedisHealth() {
  try {
    const { getRedis } = require('../config/redis');
    const redis = getRedis();
    if (!redis || redis.status !== 'ready') {
      return { status: 'disconnected', latencyMs: null };
    }

    // Ping latency
    const start = Date.now();
    await redis.ping();
    const latencyMs = Date.now() - start;

    // Server info
    const info = await redis.info('memory');
    const usedMemLine = info.split('\n').find((l) => l.startsWith('used_memory_human:'));
    const usedMemory = usedMemLine ? usedMemLine.split(':')[1].trim() : 'unknown';

    const keyspace = await redis.info('keyspace');
    const dbLine = keyspace.split('\n').find((l) => l.startsWith('db0:'));
    const keys = dbLine ? parseInt(dbLine.match(/keys=(\d+)/)?.[1] || '0', 10) : 0;

    const connectedClients = await redis.info('clients');
    const clientLine = connectedClients.split('\n').find((l) => l.startsWith('connected_clients:'));
    const clients = clientLine ? parseInt(clientLine.split(':')[1].trim(), 10) : 0;

    return {
      status: 'connected',
      latencyMs,
      usedMemory,
      keys,
      connectedClients: clients,
    };
  } catch (err) {
    logger.error('Redis health check failed: %s', err.message);
    return { status: 'error', error: err.message, latencyMs: null };
  }
}

// ── MongoDB Monitoring ────────────────────────────

async function getMongoHealth() {
  try {
    const mongoose = require('mongoose');
    const { getPoolSize: getTenantPoolSize } = require('../db/tenantConnectionManager');

    // Platform DB
    const platformState = mongoose.connection.readyState;
    const platformStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    // Ping platform DB
    let platformLatencyMs = null;
    if (platformState === 1) {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      platformLatencyMs = Date.now() - start;
    }

    // Tenant pool info
    let tenantPoolSize = 0;
    try { tenantPoolSize = getTenantPoolSize(); } catch { /* pool not initialized */ }

    return {
      platform: {
        status: platformStates[platformState] || 'unknown',
        latencyMs: platformLatencyMs,
      },
      tenantPool: {
        activeConnections: tenantPoolSize,
      },
    };
  } catch (err) {
    logger.error('MongoDB health check failed: %s', err.message);
    return { platform: { status: 'error', error: err.message }, tenantPool: { activeConnections: 0 } };
  }
}

// ── Job Queue Monitoring ──────────────────────────

async function getJobQueueHealth() {
  try {
    const { getQueueStats } = require('../jobs');
    const stats = await getQueueStats();
    return stats;
  } catch {
    // Queue stats may not be available
    return { available: false };
  }
}

// ── System Info ───────────────────────────────────

function getSystemInfo() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    pid: process.pid,
    uptime: Math.round(process.uptime()),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'unknown',
    loadAverage: os.loadavg().map((l) => Math.round(l * 100) / 100),
    hostname: os.hostname(),
  };
}

// ── Slow Query Tracker ────────────────────────────

const _slowQueries = [];
const MAX_SLOW_QUERIES = 30;
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_MS, 10) || 500;

function recordSlowQuery(operation, collectionName, durationMs, tenantSlug, query) {
  if (durationMs < SLOW_QUERY_THRESHOLD_MS) return;

  const entry = {
    ts: new Date().toISOString(),
    operation,
    collection: collectionName,
    durationMs,
    tenantSlug: tenantSlug || null,
    query: query ? JSON.stringify(query).substring(0, 200) : null,
  };
  _slowQueries.push(entry);
  if (_slowQueries.length > MAX_SLOW_QUERIES) _slowQueries.shift();

  logger.warn('Slow query detected', entry);
}

function getSlowQueries() {
  return _slowQueries.slice(-20);
}

// ── Webhook Monitoring ────────────────────────────

const _webhookEvents = [];
const MAX_WEBHOOK_EVENTS = 50;

function recordWebhookEvent(provider, event, status, durationMs, error) {
  const entry = {
    ts: new Date().toISOString(),
    provider,
    event,
    status,
    durationMs,
    error: error || null,
  };
  _webhookEvents.push(entry);
  if (_webhookEvents.length > MAX_WEBHOOK_EVENTS) _webhookEvents.shift();

  if (status === 'error') {
    logger.error('Webhook processing failed', entry);
  }
}

function getWebhookEvents() {
  return _webhookEvents.slice(-20);
}

// ── Integration Error Logging ─────────────────────

const _integrationErrors = [];
const MAX_INTEGRATION_ERRORS = 30;

function recordIntegrationError(integrationType, operation, error, tenantSlug) {
  const entry = {
    ts: new Date().toISOString(),
    type: integrationType,
    operation,
    error: (error?.message || String(error)).substring(0, 300),
    tenantSlug: tenantSlug || null,
  };
  _integrationErrors.push(entry);
  if (_integrationErrors.length > MAX_INTEGRATION_ERRORS) _integrationErrors.shift();

  logger.error('Integration error', entry);
}

function getIntegrationErrors() {
  return _integrationErrors.slice(-20);
}

// ── Full Health Report ────────────────────────────

async function getFullHealthReport() {
  const [memory, redis, mongo, jobs] = await Promise.all([
    getMemoryUsage(),
    getRedisHealth(),
    getMongoHealth(),
    getJobQueueHealth(),
  ]);

  return {
    system: getSystemInfo(),
    memory,
    redis,
    mongo,
    jobs,
    slowQueries: getSlowQueries(),
    webhooks: getWebhookEvents(),
    integrationErrors: getIntegrationErrors(),
  };
}

module.exports = {
  getMemoryUsage,
  getRedisHealth,
  getMongoHealth,
  getJobQueueHealth,
  getSystemInfo,
  recordSlowQuery,
  getSlowQueries,
  recordWebhookEvent,
  getWebhookEvents,
  recordIntegrationError,
  getIntegrationErrors,
  getFullHealthReport,
};
