'use strict';

/**
 * The platform schema — 21 tables, their child and junction tables, foreign keys
 * and indexes.
 *
 * Every statement is generated from sql/schema/manifest.json rather than written
 * here. That is deliberate: this file has no table names in it, so it cannot
 * drift from the Mongoose schemas the manifest was built from. Regenerating the
 * manifest and re-running is the whole update path.
 *
 * The manifest is required at migration time rather than embedded, so a stale
 * checkout cannot apply a schema that does not match the code it ships with.
 * `npm run sql:schema:check` fails the build if manifest.json is out of date.
 */

const manifest = require('../../schema/manifest.json');
const ddl = require('../../schema/ddl');

/**
 * Which schema this run builds.
 *
 * Normally `platform`. The CP-2 up -> down -> up cycle points it at a scratch
 * schema instead, because `down` drops the schema and everything in it -- running
 * that against the live one destroys the loaded platform data and, through
 * CASCADE, every tenant foreign key that references it. That is exactly what
 * happened the first time the full gate board ran: CP-2 passed in isolation,
 * then wiped 185 rows and took CP-4 down with it.
 */
function targetSchema(knex) {
  return (knex.client.config && knex.client.config.platformSchema) || 'platform';
}

exports.up = async function up(knex) {
  const SCHEMA = targetSchema(knex);

  /**
   * A platform table never references a tenant table -- clinics own their data
   * and the platform only records that a clinic exists. If a reference the other
   * way ever appears, resolving it to the platform schema here would silently
   * point it at the wrong table, so it fails loudly instead.
   */
  const resolveSchema = (scope) => {
    if (scope === 'platform' || scope === undefined || scope === null) return SCHEMA;
    throw new Error(`platform migration cannot resolve a reference into scope "${scope}"`);
  };

  for (const sql of ddl.createDomain()) await knex.raw(sql);
  for (const sql of ddl.createSchema(SCHEMA)) await knex.raw(sql);

  const { create, constraints, indexes } = ddl.emitScope(manifest, 'platform', SCHEMA, { resolveSchema });

  // Order is fixed by emitScope: tables, then the foreign keys between them,
  // then indexes. Splitting the loops rather than interleaving them is what
  // removes the circular-reference ordering problem (see ddl.js).
  for (const sql of create) await knex.raw(sql);
  for (const sql of constraints) await knex.raw(sql);
  for (const sql of indexes) await knex.raw(sql);
};

/**
 * `down` drops the schema rather than reversing statement by statement.
 *
 * CP-2 requires up -> down -> up to run cleanly, and Phase 7 requires a rehearsed
 * rollback before the first real clinic cutover. A hand-written reversal of ~600
 * statements is where a rollback quietly stops working; dropping the schema
 * cannot half-succeed.
 *
 * The `objectid` domain is dropped last and only if nothing else uses it -- the
 * tenant schemas share it, so dropping it unconditionally here would break every
 * clinic in the same database.
 */
exports.down = async function down(knex) {
  const SCHEMA = targetSchema(knex);
  for (const sql of ddl.dropSchema(SCHEMA)) await knex.raw(sql);

  const { rows } = await knex.raw(`
    select count(*)::int as n
    from pg_depend d
    join pg_type t on t.oid = d.refobjid
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'objectid' and n.nspname = ?
  `, [ddl.OBJECTID_SCHEMA]);

  if (!rows[0] || rows[0].n === 0) {
    for (const sql of ddl.dropDomain()) await knex.raw(sql);
  }
};
