'use strict';

/**
 * Correlation ID middleware — attaches a unique request ID to every request.
 * 
 * Propagates X-Request-ID from upstream (e.g., load balancer) or generates a new one.
 * The ID is attached to req, res headers, and the logger context.
 */

const { randomUUID } = require('crypto');

function correlationId() {
  return (req, res, next) => {
    const id = req.headers['x-request-id'] || randomUUID();
    req.id = id;
    req.correlationId = id;
    res.setHeader('X-Request-ID', id);
    next();
  };
}

module.exports = correlationId;
