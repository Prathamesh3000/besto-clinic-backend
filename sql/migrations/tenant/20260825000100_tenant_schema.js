'use strict';

/**
 * One clinic's schema — 52 tables, their child and junction tables, foreign keys
 * and indexes.
 *
 * This migration runs once per clinic, against the schema named in the Knex config
 * that invoked it (see sql/tenant/provision.js). Knex passes a migration no
 * arguments, so the target arrives on the client config as `tenantSchema` and is
 * read back here -- hard-coding one would migrate a single arbitrary clinic and
 * report success for all 27.
 *
 * Note `migrations.schemaName` is NOT the target: it points at the separate
 * `migrations` schema where tracking lives, precisely so that `down` dropping this
 * clinic's schema does not destroy the record of what it dropped.
 */

const manifest = require('../../schema/manifest.json');
const ddl = require('../../schema/ddl');

const PLATFORM_SCHEMA = 'platform';

function targetSchema(knex) {
  const name = knex.client.config && knex.client.config.tenantSchema;

  if (!name) {
    throw new Error(
      'Tenant migrations must be run with `tenantSchema` set to the clinic schema. '
      + 'Use sql/tenant/provision.js rather than `knex migrate:latest` directly.'
    );
  }
  return name;
}

exports.up = async function up(knex) {
  const SCHEMA = targetSchema(knex);

  for (const sql of ddl.createDomain()) await knex.raw(sql);
  for (const sql of ddl.createSchema(SCHEMA)) await knex.raw(sql);

  /**
   * A tenant table referencing a platform table crosses schemas. That is
   * resolved rather than assumed: without this, a `ref: 'Clinic'` would generate
   * a foreign key against `<clinic>.clinics`, a table that does not exist, and
   * the migration would fail with a confusing missing-relation error.
   */
  const resolveSchema = (scope) => (scope === 'platform' ? PLATFORM_SCHEMA : SCHEMA);

  const { create, constraints, indexes } = ddl.emitScope(manifest, 'tenant', SCHEMA, { resolveSchema });

  for (const sql of create) await knex.raw(sql);
  for (const sql of constraints) await knex.raw(sql);
  for (const sql of indexes) await knex.raw(sql);
};

exports.down = async function down(knex) {
  const SCHEMA = targetSchema(knex);

  // Only this clinic's schema. The domain and the platform schema are shared and
  // are not this migration's to remove -- dropping either would take every other
  // clinic in the database with it.
  for (const sql of ddl.dropSchema(SCHEMA)) await knex.raw(sql);
};
