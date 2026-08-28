'use strict';

/**
 * HTTP request logger — uses Morgan with Winston stream.
 * Concise in production, verbose in development.
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

// Custom tokens for correlation & tenant context
morgan.token('correlation-id', (req) => req.correlationId || '-');
morgan.token('tenant', (req) => req.tenantSlug || '-');

const format = process.env.NODE_ENV === 'production'
  ? ':method :url :status :res[content-length] - :response-time ms cid=:correlation-id tenant=:tenant'
  : 'dev';

const requestLogger = morgan(format, {
  stream: logger.stream,
  skip: (req) => req.url === '/api/v1/health' || req.url.startsWith('/api/v1/monitoring/live'),
});

module.exports = requestLogger;
