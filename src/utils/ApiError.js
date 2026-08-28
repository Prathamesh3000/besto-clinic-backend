'use strict';

/**
 * Custom error class — throw from any layer and the centralized
 * errorHandler middleware will format the response consistently.
 *
 * Usage:
 *   throw new ApiError(404, 'Patient not found');
 *   throw ApiError.badRequest('Missing required field: email');
 *   throw ApiError.unauthorized();
 *   throw ApiError.forbidden('Insufficient permissions');
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message
   * @param {object} [options]
   * @param {Array}  [options.errors] - field-level validation errors
   * @param {boolean} [options.isOperational] - true = expected error (vs programmer bug)
   */
  constructor(statusCode, message, { errors = [], isOperational = true, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.data = data;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory methods ─────────────────────────────────

  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(400, message, { errors });
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden', data = null) {
    return new ApiError(403, message, { data });
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests — try again later') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, { isOperational: false });
  }

  /**
   * 501 — the route exists but the work behind it is not built.
   *
   * Distinct from 503: retrying later will not help, because nothing is
   * temporarily down. Used so an unbuilt feature cannot answer 200 and be read
   * as having done its job.
   */
  static notImplemented(message = 'Not implemented') {
    return new ApiError(501, message);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;
