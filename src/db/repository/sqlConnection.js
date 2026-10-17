'use strict';

/**
 * The one function that decides how tenant isolation is enforced.
 *
 * Rule 2 of SQL_MIGRATION_PLAN.md section 2.2 asks for exactly this: a single
 * place that knows *how* a tenant is scoped, so changing the model is an edit
 * here rather than across every module. `withTenantScope` below is that place.
 *
 * One pool for every clinic, not one per clinic. Today's Mongo tenant manager
 * opens a connection pool per tenant database, which is the ceiling capping the
 * product at roughly nine clinics per process (tracker C-08). Schema-per-clinic
 * removes it: one pool, and `search_path` selects the schema.
 */

const knexLib = require('knex');

const { requireTenant, currentTransaction } = require('./context');
const { schemaFor } = require('../../../sql/tenant/naming');

let pool = null;

/**
 * Connection settings come from the SQL tooling's config module.
 *
 * The application connects as the owner while the migration is in progress,
 * because it still has to reach every schema. Connecting as the per-tenant role
 * -- the arrangement CP-3 verifies -- is a Phase 7 cutover step, and doing it
 * before the ETL has run for every clinic would lock the app out of clinics that
 * have not been provisioned yet.
 */
function getPool() {
  if (pool) return pool;
  const { postgres } = require('../../../sql/config');

  pool = knexLib({
    client: 'pg',
    connection: {
      host: postgres.host,
      port: postgres.port,
      database: postgres.database,
      user: postgres.user,
      password: postgres.password,
    },
    // One pool for every clinic — see the note above on the C-08 connection
    // ceiling. Sized through env.js so it is validated at boot like everything else.
    pool: { min: 0, max: Number(require('../../config/env').PG_POOL_MAX) },
  });
  return pool;
}

/**
 * Run `fn(trx)` scoped to the current tenant's schema.
 *
 * **`SET LOCAL` inside an explicit transaction, always** -- rule 3 of section
 * 2.2, and the reason this is a transaction rather than a bare query.
 *
 * `search_path` is per-session state. Under PgBouncer transaction pooling a
 * connection is handed to the next request as soon as a transaction ends, so a
 * plain `SET` leaks the previous request's schema into the next one. The result
 * is a request served against another clinic's data: silent, intermittent, and
 * close to impossible to reproduce. `SET LOCAL` is scoped to the transaction and
 * is reverted at commit, which CP-3 asserts directly.
 *
 * The schema is never interpolated from user input -- `schemaFor` validates the
 * slug and refuses anything that is not a plain identifier, so a crafted tenant
 * header cannot reach the search_path.
 */
function withTenantScope(fn) {
  const tenant = requireTenant();
  const schema = schemaFor(tenant.slug);

  /**
   * Reuse a transaction a service has already opened.
   *
   * Opening a fresh one per repository call would make a multi-write operation
   * non-atomic — the invoice commits, the payment fails, and the books are
   * wrong in a way that looks right. `search_path` is already set on the
   * outer transaction, so nothing more is needed here.
   */
  const ambient = currentTransaction();
  if (ambient) {
    return fn(ambient, { schema, clinicId: tenant.clinicId, slug: tenant.slug });
  }

  return getPool().transaction(async (trx) => {
    // `public` stays on the path for the shared `objectid` domain.
    await trx.raw('set local search_path to ??, public', [schema]);
    return fn(trx, { schema, clinicId: tenant.clinicId, slug: tenant.slug });
  });
}

/**
 * Run `fn(trx)` against the platform schema.
 *
 * Separate from `withTenantScope` because platform data is not tenant-scoped and
 * routing it through the tenant path would require a tenant to be bound for
 * queries that have nothing to do with one.
 */
function withPlatformScope(fn) {
  return getPool().transaction(async (trx) => {
    await trx.raw('set local search_path to platform, public');
    return fn(trx);
  });
}

/** Close the pool. Used by tests and by graceful shutdown. */
async function destroyPool() {
  if (pool) {
    await pool.destroy();
    pool = null;
  }
}

module.exports = { getPool, withTenantScope, withPlatformScope, destroyPool };
