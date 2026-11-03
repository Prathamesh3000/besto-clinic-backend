'use strict';

const Joi = require('joi');

/**
 * Bulk import helpers.
 *
 * The route validates only the SHAPE of the payload (a list of 1-500 objects). Each
 * row's contents are checked here, one row at a time, so a single bad row is reported
 * against its own line instead of rejecting the whole batch with a 400.
 */

// Same options the `validate` middleware uses, so a row is checked exactly as the
// equivalent single-record create would be (trim/lowercase/defaults all still apply).
const ROW_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true };

/** Route-level schema for `{ rows: [...] }`. */
const bulkRowsSchema = (max = 500) => Joi.object({
  rows: Joi.array().items(Joi.object().unknown(true)).min(1).max(max).required(),
});

/**
 * Validate one row against its schema.
 * @returns {{ value: object } | { message: string }}
 */
function validateBulkRow(schema, row) {
  const { error, value } = schema.validate(row, ROW_OPTIONS);
  if (error) {
    return { message: error.details.map((d) => d.message.replace(/"/g, '')).join('; ') };
  }
  return { value };
}

/**
 * Readable message for a per-row failure. A Mongo duplicate-key error otherwise leaks
 * the raw E11000 text (collection, index, quoted values) into the row's message.
 */
function bulkRowError(err, duplicateMessage) {
  if (err && err.code === 11000) return duplicateMessage;
  return (err && err.message) || 'Unknown error';
}

module.exports = { bulkRowsSchema, validateBulkRow, bulkRowError, ROW_OPTIONS };
