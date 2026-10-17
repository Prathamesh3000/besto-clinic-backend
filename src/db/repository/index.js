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

/**
 * True when this entity's reads and writes go to PostgreSQL for this request.
 *
 * Two sources, deliberately ordered:
 *
 * 1. The clinic's own `migration.sqlEntities`, carried on the request context.
 *    This is how a real cutover happens — one clinic at a time, reversible for
 *    that clinic alone, without redeploying or touching the others.
 * 2. `SQL_ENTITIES` in the environment, which applies to every clinic. It stays
 *    because parity harnesses and CP-6 need to force a backend without writing
 *    to the registry, but it is not how production cuts over.
 *
 * The union rather than a precedence rule: a clinic cut over to PostgreSQL must
 * not be silently pulled back to Mongo because an environment variable happens
 * to omit that entity. Rolling a clinic back is an explicit act on its record,
 * not a side effect of configuration.
 */
function isSqlBacked(modelName) {
  const { currentSqlEntities } = require('./context');

  const perClinic = currentSqlEntities();
  if (perClinic.includes('*') || perClinic.includes(modelName)) return true;

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

/**
 * Run several writes as one unit.
 *
 *   await transaction(async () => {
 *     const invoice = await repo('Invoice').create(data);
 *     await repo('Payment').create({ invoice: invoice._id, ... });
 *   });
 *
 * Both writes commit, or neither does. Without this each repository call opens
 * its own transaction, and a failure between them leaves the first committed —
 * an invoice with no payment against it, which reconciles to the wrong number
 * and looks like a complete record.
 *
 * On the Mongo side this is a no-op passthrough rather than a session-backed
 * transaction. Replica-set transactions are available but nothing in the
 * application uses them today, and quietly introducing them here would change
 * the failure behaviour of every existing multi-write path at the moment a
 * module is ported — which is precisely when nobody would be looking for it.
 * Services get atomicity as they move to SQL, not before.
 */
async function transaction(fn) {
  const { getPool } = require('./sqlConnection');
  const { runWithTransaction, currentTransaction, requireTenant } = require('./context');
  const { schemaFor } = require('../../../sql/tenant/naming');

  // Already inside one: join it rather than nesting. A service must not be able
  // to commit half of its own operation.
  if (currentTransaction()) return fn();

  const tenant = requireTenant();
  const schema = schemaFor(tenant.slug);

  return getPool().transaction(async (trx) => {
    await trx.raw('set local search_path to ??, public', [schema]);
    return runWithTransaction(trx, fn);
  });
}

module.exports = {
  repo,
  transaction,
  isSqlBacked,
  sqlEntities,
  bothBackends,
  ...require('./context'),
};
