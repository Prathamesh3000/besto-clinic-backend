'use strict';

/**
 * Singleton Redis client — lazy-initialized, shared across the app.
 *
 * Usage:
 *   const { getRedis, connectRedis, disconnectRedis } = require('./redis');
 *   await connectRedis();
 *   const client = getRedis();
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let client = null;

/**
 * Connect to Redis. Safe to call multiple times — returns the existing client.
 * @returns {Redis} ioredis instance
 */
async function connectRedis() {
  if (client) return client;

  const env = require('./env');

  const useTls = env.REDIS_URL.startsWith('rediss://');

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Redis: max retries exceeded — giving up');
        return null; // stop retrying
      }
      return Math.min(times * 200, 5000);
    },
    enableReadyCheck: false,
    lazyConnect: true,
    ...(useTls && { tls: { rejectUnauthorized: false } }),
  });

  client.on('connect', () => logger.info('Redis: connected'));
  client.on('ready', () => logger.info('Redis: ready'));
  client.on('error', (err) => logger.error('Redis: error —', err.message));
  client.on('close', () => logger.warn('Redis: connection closed'));

  await client.connect();
  return client;
}

/**
 * Get the existing Redis client. Throws if not connected.
 * @returns {Redis}
 */
function getRedis() {
  if (!client) {
    throw new Error('Redis not initialized — call connectRedis() first');
  }
  return client;
}

/**
 * Graceful disconnect.
 */
async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis: disconnected');
  }
}

module.exports = { connectRedis, getRedis, disconnectRedis };
