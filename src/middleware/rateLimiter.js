'use strict';

/**
 * Rate limiters — Redis-backed for multi-replica safety.
 *
 * Exports:
 *   globalLimiter  — blanket limit on all routes
 *   authLimiter    — stricter limit on auth endpoints (login, register, refresh)
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedis } = require('../config/redis');
const ApiError = require('../utils/ApiError');

/**
 * Create a Redis-backed rate limiter.
 * Falls back to in-memory if Redis is unavailable (dev convenience only).
 */
function createLimiter({ windowMs, max, prefix, message, keyGenerator }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests(message));
    },
  };

  if (keyGenerator) options.keyGenerator = keyGenerator;

  try {
    const redis = getRedis();
    options.store = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch {
    // Redis not connected yet (e.g. in tests) — fall back to memory store
    const logger = require('../utils/logger');
    logger.warn('Rate limiter falling back to in-memory store (Redis unavailable)');
  }

  return rateLimit(options);
}

/** Global limiter — all routes */
function globalLimiter() {
  const env = require('../config/env');
  return createLimiter({
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS),
    max: Number(env.RATE_LIMIT_MAX),
    prefix: 'global',
    message: 'Too many requests — please try again later',
  });
}

/** Auth limiter — login, register, refresh, forgot-password */
function authLimiter() {
  const env = require('../config/env');
  return createLimiter({
    windowMs: Number(env.AUTH_RATE_LIMIT_WINDOW_MS),
    max: Number(env.AUTH_RATE_LIMIT_MAX),
    prefix: 'auth',
    message: 'Too many authentication attempts — please try again later',
  });
}

/** Tenant-scoped limiter — per-tenant isolation to prevent noisy-neighbor */
function tenantLimiter() {
  const env = require('../config/env');
  return createLimiter({
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS),
    max: Number(env.RATE_LIMIT_MAX) * 5, // 5x global per tenant
    prefix: 'tenant',
    message: 'Tenant rate limit exceeded — please try again later',
    keyGenerator: (req) => req.tenantSlug || req.ip, // scope by tenant, fallback to IP
  });
}

module.exports = { globalLimiter, authLimiter, tenantLimiter };
