'use strict';

/**
 * Strip MongoDB operator syntax from user input.
 *
 * Mongoose casts most values, and Joi covers the routes that validate — but not
 * every route has a validator, and object-typed fields (metadata, filters,
 * address blocks) pass through as-is. That leaves the classic hole:
 *
 *     { "email": { "$ne": null }, "password": { "$ne": null } }
 *
 * which turns a findOne into "any user at all". Keys are rejected rather than
 * escaped: nothing legitimate in this API starts with `$`, and a dotted key in
 * a value object is always an attempt to reach into a nested path.
 *
 * Runs before the routes and mutates in place — Express 4 exposes req.query as
 * a plain object, so reassignment is unnecessary and would break the getter in
 * Express 5.
 */

const logger = require('../utils/logger');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/**
 * @returns {number} how many keys were removed
 */
function _scrub(value, path, removed) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => _scrub(item, `${path}[${i}]`, removed));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      removed.push(`${path}.${key}`);
      delete value[key];
      continue;
    }
    _scrub(value[key], `${path}.${key}`, removed);
  }
}

function sanitizeMongo() {
  return (req, _res, next) => {
    const removed = [];
    for (const source of ['body', 'query', 'params']) {
      if (req[source]) _scrub(req[source], source, removed);
    }

    if (removed.length) {
      // Worth knowing about: legitimate clients never send these.
      logger.warn(
        'Stripped %d Mongo operator key(s) from %s %s: %s',
        removed.length, req.method, req.originalUrl, removed.join(', '),
      );
    }

    next();
  };
}

module.exports = sanitizeMongo;
module.exports.sanitizeMongo = sanitizeMongo;
