'use strict';

/**
 * Centralized error handler — MUST be the last middleware registered.
 *
 * Catches all errors (thrown, next(err), rejected promises via asyncHandler)
 * and returns a consistent JSON response.
 *
 * Shape:
 *   { success: false, message: '...', errors?: [], stack?: '...' }
 */

const logger = require('../utils/logger');

/**
 * Convert a Mongoose validation error into a user-friendly message.
 */
function _humanizeMongooseError(e) {
  const field = (e.path || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/, (c) => c.toUpperCase())
    .trim() || 'This field';

  switch (e.kind) {
    case 'required':
      return `${field} is required`;
    case 'minlength':
      return `${field} must be at least ${e.properties?.minlength} characters`;
    case 'maxlength':
      return `${field} must be at most ${e.properties?.maxlength} characters`;
    case 'enum':
      return `${field} has an invalid value`;
    case 'min':
      return `${field} must be at least ${e.properties?.min}`;
    case 'max':
      return `${field} must be at most ${e.properties?.max}`;
    default:
      // Strip quotes and return the original message
      return (e.message || `${field} is invalid`).replace(/"/g, '');
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Default to 500
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];
  const isOperational = err.isOperational !== undefined ? err.isOperational : false;

  // In production, mask non-operational 500 errors to avoid leaking
  // internal details (DB connection strings, file paths, stack traces, etc.)
  if (statusCode >= 500 && !isOperational && process.env.NODE_ENV === 'production') {
    message = 'Internal server error';
  }

  // ── Mongoose Validation Error ─────────────────
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: _humanizeMongooseError(e),
    }));
    message = errors[0]?.message || 'Please check the form and try again';
  }

  // ── Mongoose Cast Error (invalid ObjectId) ────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  }

  // ── Mongoose Duplicate Key Error ──────────────
  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate value — a record with this value already exists';
  }

  // ── JWT Errors ────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // ── Joi Validation Error (fallback if bypassing validate middleware) ──
  if (err.isJoi) {
    const { humanizeJoiMessage } = require('./validate');
    statusCode = 400;
    errors = err.details.map((d) => ({
      field: d.path.join('.'),
      message: humanizeJoiMessage(d),
    }));
    message = errors[0]?.message || 'Please check the form and try again';
  }

  // ── Log (with correlation + tenant context) ────
  const logMeta = {
    correlationId: req.correlationId || null,
    tenantSlug: req.tenantSlug || null,
    method: req.method,
    url: req.originalUrl,
    statusCode,
  };
  if (statusCode >= 500) {
    logger.error('Unhandled error [%s %s]: %s', req.method, req.originalUrl, err.stack || err.message, logMeta);
  } else if (statusCode >= 400) {
    logger.warn('Client error [%s %s]: %d %s', req.method, req.originalUrl, statusCode, message, logMeta);
  }

  // ── Response ──────────────────────────────────
  const body = {
    success: false,
    message,
  };

  if (errors.length > 0) body.errors = errors;
  if (err.data) body.data = err.data;

  // Expose stack in development only
  if (process.env.NODE_ENV === 'development' && !isOperational) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
