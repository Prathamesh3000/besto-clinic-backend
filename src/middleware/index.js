'use strict';

/**
 * Middleware barrel — re-exports for convenient imports.
 *
 * Usage:
 *   const { authenticate, authorize, tenantResolver, validate } = require('../middleware');
 */

module.exports = {
  ...require('./authenticate'),
  ...require('./authorize'),
  tenantResolver: require('./tenantResolver'),
  validate: require('./validate'),
  errorHandler: require('./errorHandler'),
  requestLogger: require('./requestLogger'),
  getCorsOptions: require('./corsConfig'),
  subscriptionGuard: require('./subscriptionGuard'),
  ...require('./rateLimiter'),
};
