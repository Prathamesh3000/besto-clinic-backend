'use strict';

/**
 * Per-clinic cutover state on `platform.clinics` — Phase 7.
 *
 * `Clinic.migration` records which entities a clinic reads from PostgreSQL, when
 * it was cut over, and when and why it was rolled back. Before this the only
 * switch was the `SQL_ENTITIES` environment variable, which moves every clinic at
 * once — a big-bang cutover, and the one thing a rehearsed rollback is meant to
 * avoid.
 *
 * ── Why this file exists at all ────────────────────────
 *
 * The first migration builds the whole schema from the manifest, and its `down`
 * drops the schema. That is right for creating a database and wrong for changing
 * one that already holds data: rebuilding `platform` to pick up five columns
 * would destroy the loaded rows and, through CASCADE, every tenant foreign key
 * pointing at them.
 *
 * So schema *changes* are additive migrations like this one, and the manifest
 * stays the single description of what the schema should be. CP-2 compares the
 * live schema against the manifest and fails when they diverge — which is how
 * this omission was found rather than deployed.
 *
 * ── Why the columns are not written out here ───────────
 *
 * The types come from the manifest via `columnClause`, the same function the
 * initial migration uses. Restating them by hand would let this file disagree
 * with the manifest, and a migration that disagrees with the thing CP-2 checks
 * against is a migration that makes the gate go red on its own output.
 */

const manifest = require('../../schema/manifest.json');
const ddl = require('../../schema/ddl');

const TABLE = 'clinics';
const PREFIX = 'migration_';

function targetSchema(knex) {
  return (knex.client.config && knex.client.config.platformSchema) || 'platform';
}

/** The `migration.*` columns as the manifest declares them. */
function columns() {
  const table = manifest.tables.find((t) => t.scope === 'platform' && t.table === TABLE);
  if (!table) throw new Error(`manifest has no platform table "${TABLE}"`);

  const cols = table.columns.filter((c) => c.column.startsWith(PREFIX));
  if (!cols.length) {
    throw new Error(
      `manifest declares no ${PREFIX}* columns on ${TABLE} — regenerate it `
      + '(npm run sql:schema) before applying this migration',
    );
  }
  return cols;
}

exports.up = async function up(knex) {
  const SCHEMA = targetSchema(knex);

  /**
   * `if not exists` per column rather than one `alter table ... add a, add b`.
   *
   * The initial migration builds every manifest column, so a schema created
   * after this manifest was regenerated already has them. Without the guard this
   * migration fails on exactly the databases that are most up to date — and the
   * CP-2 up → down → up cycle runs against a freshly built scratch schema, so
   * that is not a rare case but the normal one.
   */
  for (const col of columns()) {
    await knex.raw(
      `alter table ${ddl.ident(SCHEMA)}.${ddl.ident(TABLE)} `
      + `add column if not exists ${ddl.columnClause(col)}`,
    );
  }
};

/**
 * Dropping these loses the record of which clinics were cut over.
 *
 * That is acceptable and the reason is worth stating: the columns describe where
 * a clinic *reads from*, not any clinical or financial data. A clinic whose
 * state is dropped falls back to reading from MongoDB, which is where its data
 * is regardless. The rows that were written to PostgreSQL while it was cut over
 * are not touched by this.
 */
exports.down = async function down(knex) {
  const SCHEMA = targetSchema(knex);
  for (const col of columns()) {
    await knex.raw(
      `alter table ${ddl.ident(SCHEMA)}.${ddl.ident(TABLE)} `
      + `drop column if exists ${ddl.ident(col.column)}`,
    );
  }
};
