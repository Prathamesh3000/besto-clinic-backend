'use strict';

/**
 * Joi validation middleware factory.
 *
 * Usage:
 *   const { loginSchema } = require('./auth.validator');
 *   router.post('/login', validate(loginSchema), authController.login);
 *
 * Validates req.body by default. Pass { source: 'query' } or { source: 'params' }
 * to validate other parts of the request.
 */

const ApiError = require('../utils/ApiError');

// ── Friendly message templates keyed by Joi error type ──────────────

const FRIENDLY_TEMPLATES = {
  // Required / empty
  'any.required': '{label} is required',
  'string.empty': '{label} is required',

  // String formats
  'string.email': 'Please enter a valid email address',
  'string.uri': 'Please enter a valid URL',
  'string.pattern.base': '{label} format is invalid',
  'string.alphanum': '{label} must only contain letters and numbers',
  'string.hex': '{label} must be a valid hex string',
  'string.length': '{label} must be exactly {limit} characters',

  // String length
  'string.min': '{label} must be at least {limit} characters',
  'string.max': '{label} must be at most {limit} characters',

  // Number
  'number.base': '{label} must be a number',
  'number.integer': '{label} must be a whole number',
  'number.min': '{label} must be at least {limit}',
  'number.max': '{label} must be at most {limit}',
  'number.greater': '{label} must be greater than {limit}',
  'number.less': '{label} must be less than {limit}',
  'number.positive': '{label} must be a positive number',

  // Date
  'date.base': '{label} must be a valid date',
  'date.greater': '{label} must be after {limit}',
  'date.less': '{label} must be before {limit}',
  'date.min': '{label} must be on or after {limit}',
  'date.max': '{label} must be on or before {limit}',
  'date.format': '{label} must be a valid date format',

  // Boolean
  'boolean.base': '{label} must be true or false',

  // Array
  'array.base': '{label} must be a list',
  'array.min': 'At least {limit} {label} required',
  'array.max': 'No more than {limit} {label} allowed',
  'array.unique': '{label} contains duplicate values',
  'array.includes': '{label} contains an invalid item',

  // Object
  'object.base': '{label} must be an object',
  'object.unknown': 'Unknown field: {child}',

  // Enum / allowlist
  'any.only': '{label} must be one of: {valids}',
  'any.invalid': '{label} contains an invalid value',

  // Type coercion failures
  'string.base': '{label} must be text',
};

/**
 * Prettify a Joi field path into a human-readable label.
 * e.g. "compensation.salaryMin" → "Salary min"
 *      "requirements.skills"   → "Skills"
 *      "email"                 → "Email"
 */
function prettifyLabel(label) {
  if (!label) return 'This field';

  // Take the last segment of a dot-delimited path
  const last = label.includes('.') ? label.split('.').pop() : label;

  // Convert camelCase / snake_case to spaced words
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .replace(/_/g, ' ')                    // snake_case → snake case
    .replace(/\b\w/, (c) => c.toUpperCase()) // Capitalize first letter
    .trim();
}

/**
 * Convert a Joi validation error detail into a user-friendly message.
 *
 * If the validator already defined a custom `.messages()` override,
 * Joi sets a `flags.description` or the message won't match the
 * auto-generated pattern — in that case we keep the custom message.
 */
function humanizeJoiMessage(detail) {
  const template = FRIENDLY_TEMPLATES[detail.type];

  // No template for this type — clean up the raw message at minimum
  if (!template) {
    return detail.message.replace(/"/g, '');
  }

  const ctx = detail.context || {};
  const label = prettifyLabel(ctx.label || ctx.key);

  // Format the {limit} value (could be a date, number, or Joi ref)
  let limit = ctx.limit;
  if (limit instanceof Date) {
    limit = limit.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } else if (limit && typeof limit === 'object' && limit.key) {
    // Joi ref like { ref: 'startDate' } — prettify the ref field name
    limit = prettifyLabel(limit.key);
  }

  // Format valids list for enum errors
  let valids = '';
  if (ctx.valids) {
    valids = ctx.valids
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => String(v).replace(/_/g, ' '))
      .join(', ');
  }

  const child = ctx.child || ctx.key || '';

  return template
    .replace(/\{label\}/g, label)
    .replace(/\{limit\}/g, limit != null ? String(limit) : '')
    .replace(/\{valids\}/g, valids)
    .replace(/\{child\}/g, child);
}

/**
 * @param {import('joi').ObjectSchema} schema - Joi schema
 * @param {{ source?: 'body' | 'query' | 'params' }} [options]
 */
function validate(schema, { source = 'body' } = {}) {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: humanizeJoiMessage(d),
      }));

      // Use the first specific error as the top-level message instead of generic "Validation failed"
      const topMessage = errors[0]?.message || 'Please check the form and try again';
      return next(ApiError.badRequest(topMessage, errors));
    }

    // Replace with sanitized values
    req[source] = value;
    next();
  };
}

module.exports = { validate, humanizeJoiMessage };
