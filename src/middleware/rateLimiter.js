'use strict';

/**
 * Rate limiters — Redis-backed for multi-replica safety.
 *
 * Exports:
 *   globalLimiter  — blanket limit on all routes
 *   authLimiter    — stricter limit on auth endpoints (login, register, refresh)
 */

const rateLimit = require('express-rate-limit');
// rate-limit-redis v4 exports { RedisStore, default } — it is NOT the class itself.
// Requiring the module object and calling `new` on it threw "not a constructor",
// which the try/catch below swallowed, so every limiter silently used the memory
// store no matter when it was built.
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../config/redis');
const ApiError = require('../utils/ApiError');

/**
 * Defer building a limiter until the first request it handles.
 *
 * Route modules call authLimiter() at module scope, which runs during the require
 * chain in server.js — long before boot() reaches connectRedis(). Building the
 * limiter there meant getRedis() threw and every auth limiter silently bound to
 * per-process memory, so the limit multiplied by replica count and reset on every
 * deploy. By the time a request actually arrives, Redis is connected.
 */
function lazyLimiter(factory) {
  let instance;
  return (req, res, next) => {
    if (!instance) instance = factory();
    return instance(req, res, next);
  };
}

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
  } catch (err) {
    // Fall back to the memory store, but say WHY. This used to swallow the error,
    // which hid a bad import for as long as the code has existed: the message read
    // "Redis unavailable" while Redis was healthy and the real fault was a
    // TypeError constructing the store.
    const logger = require('../utils/logger');
    logger.warn(
      'Rate limiter "%s" falling back to in-memory store — %s',
      prefix, err.message,
    );
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

/**
 * Auth limiter — login, register, refresh, forgot-password.
 * Lazy: these are constructed at route-module load, before Redis exists.
 */
function authLimiter() {
  return lazyLimiter(() => {
    const env = require('../config/env');
    return createLimiter({
      windowMs: Number(env.AUTH_RATE_LIMIT_WINDOW_MS),
      max: Number(env.AUTH_RATE_LIMIT_MAX),
      prefix: 'auth',
      message: 'Too many authentication attempts — please try again later',
    });
  });
}

/**
 * Tenant-scoped limiter — per-tenant isolation to prevent noisy-neighbor.
 * Lazy for the same reason as authLimiter: it is designed to be mounted with
 * router.use() at module scope.
 */
function tenantLimiter() {
  return lazyLimiter(() => {
    const env = require('../config/env');
    return createLimiter({
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS),
      max: Number(env.RATE_LIMIT_MAX) * 5, // 5x global per tenant
      prefix: 'tenant',
      message: 'Tenant rate limit exceeded — please try again later',
      keyGenerator: (req) => req.tenantSlug || req.ip, // scope by tenant, fallback to IP
    });
  });
}

module.exports = { globalLimiter, authLimiter, tenantLimiter };
