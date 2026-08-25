'use strict';

/**
 * The repository seam — Phase 0, deliverable 7.
 *
 * A data-access boundary that lets modules move to SQL one at a time, so the
 * application keeps working throughout the programme instead of breaking until
 * the end.
 *
 * A module asks for `repo('Department')` and gets an object with `findById`,
 * `find`, `create`, `updateById`, `softDeleteById`. Whether that call reaches
 * MongoDB or PostgreSQL is decided here, per entity, from configuration — not by
 * the module, and not at build time.
 *
 * Why per-entity rather than a global switch
 * ------------------------------------------
 * The plan's cutover is "module-by-module conversion behind a repository seam,
 * then clinic-by-clinic cutover with a tested rollback". A global switch would
 * make the unit of risk the entire application; per-entity makes it one table.
 * If `Department` misbehaves in production, it is one environment variable to put
 * it back on Mongo, with no deploy and nothing else affected.
 *
 * Default is Mongo. An entity reaches PostgreSQL only by being named explicitly,
 * so adding a table to the manifest cannot silently redirect live traffic.
 */

const { MongoRepository } = require('./mongoRepository');
const { SqlRepository } = require('./sqlRepository');

/**
 * Which entities are served from PostgreSQL.
 *
 * `SQL_ENTITIES=Department,Role` — Mongoose model names, comma-separated.
 * `SQL_ENTITIES=*` routes everything to SQL, which is for parity testing rather
 * than production: it is only safe once every clinic has been through the ETL.
 */
function sqlEntities() {
  const raw = String(require('../../config/env').SQL_ENTITIES || '').trim();
  if (!raw) return new Set();
  if (raw === '*') return '*';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

const cache = new Map();

/** True when this entity's reads and writes go to PostgreSQL. */
function isSqlBacked(modelName) {
  const entities = sqlEntities();
  return entities === '*' || entities.has(modelName);
}

/**
 * The repository for one entity.
 *
 * Cached per (model, backend) rather than per model, so flipping `SQL_ENTITIES`
 * between requests — which the parity gate does — cannot hand back a repository
 * pointing at the database that was configured a moment ago.
 */
function repo(modelName) {
  const backend = isSqlBacked(modelName) ? 'sql' : 'mongo';
  const key = `${backend}:${modelName}`;

  if (!cache.has(key)) {
    cache.set(key, backend === 'sql' ? new SqlRepository(modelName) : new MongoRepository(modelName));
  }
  return cache.get(key);
}

/**
 * Both implementations for one entity, for CP-6.
 *
 * Parity is only meaningful when both are driven from the same request with the
 * same arguments; comparing the new code against a remembered description of the
 * old behaviour proves nothing.
 */
function bothBackends(modelName) {
  return { mongo: new MongoRepository(modelName), sql: new SqlRepository(modelName) };
}

module.exports = {
  repo,
  isSqlBacked,
  sqlEntities,
  bothBackends,
  ...require('./context'),
};
