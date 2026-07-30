'use strict';

/**
 * Wraps async route handlers so rejected promises are forwarded to
 * Express error middleware automatically — no try/catch in controllers.
 *
 * Usage:
 *   router.get('/patients', asyncHandler(patientController.list));
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
