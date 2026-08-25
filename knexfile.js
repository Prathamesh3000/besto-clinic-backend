'use strict';

/**
 * Knex configuration for the MongoDB -> PostgreSQL migration.
 *
 * Two migration sets, because the two schemas have different lifecycles:
 *
 *   platform  one schema, migrated once, tracked in platform.knex_migrations
 *   tenant    one schema per clinic, the same migrations run once per clinic,
 *             each tracked in that clinic's own knex_migrations table
 *
 * The tenant set is not listed as an environment here. A tenant migration needs
 * to know *which* clinic it is running for, which is a runtime value rather than
 * a config file constant -- `sql/tenant/provision.js` builds that config per
 * clinic. Putting a single hard-coded tenant here would make `knex migrate:latest`
 * silently migrate one arbitrary clinic and report success.
 *
 * Migration state lives in a separate `migrations` schema, never inside the schema
 * being migrated. That is not tidiness -- it is required for rollback to work at
 * all. `down` drops the whole schema, so tracking stored inside it is destroyed by
 * the very statement whose completion Knex then tries to record, and the rollback
 * dies with `relation "platform.knex_migrations" does not exist`.
 *
 * One table per schema (`platform`, `tenant_<slug>`), so 27 clinics each track
 * their own migration state independently and one clinic's failed migration does
 * not read as applied for the rest.
 *
 * Safety: the connection is refused unless it is local or SQL_ALLOW_REMOTE=true,
 * and it is always refused against a database whose name contains `prod`. These
 * are the same rules CP-0 checks, applied at the point the connection is actually
 * opened so a tool that bypasses the gate still cannot reach production.
 */

const config = require('./sql/config');

const { postgres } = config;

/** Where migration state lives. Never a schema that a migration's `down` drops. */
const MIGRATION_SCHEMA = 'migrations';

if (!config.isLocalHost(postgres.host) && !postgres.allowRemote) {
  throw new Error(
    `Refusing to connect to a non-local PostgreSQL host (${postgres.host}). `
    + 'Set SQL_ALLOW_REMOTE=true if this is deliberate.'
  );
}

if (/prod/i.test(postgres.database)) {
  throw new Error(
    `Refusing to run migrations against a database named "${postgres.database}". `
    + 'The name contains "prod".'
  );
}

const connection = {
  host: postgres.host,
  port: postgres.port,
  database: postgres.database,
  user: postgres.user,
  password: postgres.password,
};

/**
 * A single connection for migrations.
 *
 * Migrations take locks and must not interleave, and `min: 0` means an idle
 * process does not hold a connection open -- which matters because the tenant
 * loop opens one of these per clinic.
 */
const pool = { min: 0, max: 1 };

module.exports = {
  MIGRATION_SCHEMA,

  platform: {
    client: 'pg',
    connection,
    pool,
    migrations: {
      directory: './sql/migrations/platform',
      schemaName: MIGRATION_SCHEMA,
      tableName: 'platform',
      disableTransactions: false,
    },
  },

  /**
   * Used by `sql/tenant/provision.js`, which clones it and fills in `tenantSchema`
   * plus a per-clinic `tableName`. Exported so there is one definition of how
   * tenant migrations are configured rather than one per caller.
   *
   * `tenantSchema` is a field of our own, not a Knex option. Knex offers a
   * migration no way to learn which schema it is meant to build, and
   * `migrations.schemaName` now points at the tracking schema, so the target is
   * passed explicitly and the migration reads it back from the client config.
   */
  tenantTemplate: {
    client: 'pg',
    connection,
    pool,
    tenantSchema: null,
    migrations: {
      directory: './sql/migrations/tenant',
      schemaName: MIGRATION_SCHEMA,
      tableName: null,
      disableTransactions: false,
    },
  },
};
