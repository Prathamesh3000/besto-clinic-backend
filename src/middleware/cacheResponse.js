'use strict';

/**
 * Express middleware for Redis-based response caching.
 *
 * Caches JSON responses by tenant + URL (+ optionally userId).
 * Significantly reduces DB reads for frequently polled endpoints
 * like branch monitor, queue, and notification counts.
 *
 * Usage:
 *   const { cacheResponse } = require('../middleware/cacheResponse');
 *   router.get('/endpoint', cacheResponse(30), handler);
 *
 *   // Per-user caching (e.g. notification count):
 *   router.get('/endpoint', cacheResponse(30, { perUser: true }), handler);
 */

const logger = require('../utils/logger');

/**
 * @param {number} ttlSeconds — cache TTL in seconds
 * @param {{ perUser?: boolean }} opts
 */
function cacheResponse(ttlSeconds = 30, opts = {}) {
  return async (req, res, next) => {
    let redis;
    try {
      redis = require('../config/redis').getRedis();
    } catch {
      // Redis not available — skip caching
      return next();
    }

    const tenant = req.tenantSlug || 'global';
    const userPart = opts.perUser && req.user?.userId ? `:u:${req.user.userId}` : '';
    const cacheKey = `rc:${tenant}${userPart}:${req.originalUrl}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cached);
      }
    } catch (err) {
      logger.warn('Cache read error: %s', err.message);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.setHeader('X-Cache', 'MISS');
      // Cache in background — don't block response
      const payload = JSON.stringify(body);
      redis.set(cacheKey, payload, 'EX', ttlSeconds).catch((err) => {
        logger.warn('Cache write error: %s', err.message);
      });
      return originalJson(body);
    };

    next();
  };
}

module.exports = { cacheResponse };
