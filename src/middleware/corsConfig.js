'use strict';

/**
 * CORS configuration — reads allowed origins from env and produces
 * an options object for the `cors` package.
 */

const ApiError = require('../utils/ApiError');

function getCorsOptions() {
  const env = require('../config/env');
  const allowedOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  return {
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Allow Razorpay domains (checkout iframe callbacks & webhooks)
      if (origin === 'https://api.razorpay.com' || origin === 'https://checkout.razorpay.com') {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin) || (env.NODE_ENV === 'development' && origin.startsWith('http://localhost'))) {
        return callback(null, true);
      }

      callback(ApiError.forbidden(`Origin "${origin}" not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24h preflight cache
  };
}

module.exports = getCorsOptions;
