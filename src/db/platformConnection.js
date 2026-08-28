'use strict';

/**
 * Platform database connection — single Mongoose connection to the
 * shared platform DB that holds Clinic, Subscription, and PlatformUser docs.
 *
 * This DB is NOT tenant-scoped. It is the "control plane" database.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

let connection = null;

/**
 * Connect to the platform MongoDB.
 * @returns {mongoose.Connection}
 */
async function connectPlatformDB() {
  if (connection) return connection;

  const env = require('../config/env');

  connection = await mongoose.connect(env.PLATFORM_DB_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    retryWrites: true,
  });

  logger.info('Platform DB: connected to %s', _maskUri(env.PLATFORM_DB_URI));

  mongoose.connection.on('error', (err) => {
    logger.error('Platform DB: connection error — %s', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Platform DB: disconnected');
  });

  return connection;
}

/**
 * Disconnect from the platform DB (for graceful shutdown).
 */
async function disconnectPlatformDB() {
  if (connection) {
    await mongoose.disconnect();
    connection = null;
    logger.info('Platform DB: disconnected');
  }
}

/**
 * Get the default mongoose connection (platform).
 */
function getPlatformDB() {
  if (!connection) {
    throw new Error('Platform DB not initialized — call connectPlatformDB() first');
  }
  return mongoose.connection;
}

/** Mask the URI for safe logging (hide credentials). */
function _maskUri(uri) {
  try {
    const url = new URL(uri);
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return '***masked***';
  }
}

module.exports = { connectPlatformDB, disconnectPlatformDB, getPlatformDB };
