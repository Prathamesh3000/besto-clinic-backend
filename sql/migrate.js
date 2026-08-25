#!/usr/bin/env node
'use strict';

/**
 * Migration runner for the platform schema.
 *
 * This exists instead of `npx knex migrate:latest` for two reasons, both found by
 * running the CLI first:
 *
 * 1. **Knex creates its `knex_migrations` tracking table inside the target schema
 *    before running any migration**, and it does not create the schema. So the
 *    very first run fails with `schema "platform" does not exist` — the migration
 *    that would have created it never gets to run. The schema has to exist before
 *    Knex is invoked at all.
 *
 * 2. **The Knex CLI exited 0 on that failure.** A migration runner that reports
 *    success when the schema was not created is worse than no runner: CP-2 would
 *    go green against an empty database. Everything here checks its own result and
 *    exits non-zero when anything failed.
 *
 * Usage:
 *   node sql/migrate.js                # apply
 *   node sql/migrate.js --rollback     # roll back the last batch
 *   node sql/migrate.js --verify       # up -> down -> up, the CP-2 cycle
 *   node sql/migrate.js --status
 */

const knexLib = require('knex');
const path = require('path');

const knexfile = require('../knexfile');
const ddl = require('./schema/ddl');

const PLATFORM_SCHEMA = 'platform';

/**
 * The CP-2 cycle builds and destroys this, never the live schema.
 *
 * `down` drops the whole schema, so running the cycle against `platform` deletes
 * the loaded platform data and, via CASCADE, every tenant foreign key pointing at
 * it. That is not hypothetical: the first full gate-board run passed CP-2 in
 * isolation, then wiped 185 rows and failed CP-4 as a direct consequence.
 *
 * A gate must not damage the thing the next gate measures.
 */
const SCRATCH_SCHEMA = 'platform_ddl_check';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const write = (s) => process.stdout.write(s);

function connect(schema = PLATFORM_SCHEMA) {
  const cfg = JSON.parse(JSON.stringify(knexfile.platform));
  cfg.migrations.directory = path.resolve(__dirname, 'migrations/platform');

  // Which schema the migration builds, and a matching tracking table so a scratch
  // run does not overwrite the live schema's migration history.
  cfg.platformSchema = schema;
  cfg.migrations.tableName = schema === PLATFORM_SCHEMA ? 'platform' : `platform_${schema}`;
  return knexLib(cfg);
}

/**
 * The bootstrap Knex cannot do for itself. Also creates the shared `objectid`
 * domain, because a tenant schema provisioned before the platform one would
 * otherwise be the first to need it.
 */
async function bootstrap(knex, schema = PLATFORM_SCHEMA) {
  for (const sql of ddl.createDomain()) await knex.raw(sql);
  // The tracking schema must exist before Knex writes its first row, and it must
  // survive `down` dropping the schema being migrated.
  await knex.raw(`create schema if not exists ${ddl.ident(knexfile.MIGRATION_SCHEMA)};`);
  await knex.raw(`create schema if not exists ${ddl.ident(schema)};`);
}

async function counts(knex, schema = PLATFORM_SCHEMA) {
  const q = async (sql, binds = []) => (await knex.raw(sql, binds)).rows[0].n;
  return {
    tables: await q("select count(*)::int n from information_schema.tables where table_schema=? and table_type='BASE TABLE'", [schema]),
    indexes: await q('select count(*)::int n from pg_indexes where schemaname=?', [schema]),
    foreignKeys: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='f'", [schema]),
    notValid: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='f' and not c.convalidated", [schema]),
    checks: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='c'", [schema]),
  };
}

async function up(knex, schema = PLATFORM_SCHEMA) {
  await bootstrap(knex, schema);
  const [batch, applied] = await knex.migrate.latest();
  return { batch, applied };
}

async function down(knex) {
  const [batch, reverted] = await knex.migrate.rollback();
  return { batch, reverted };
}

(async function main() {
  const knex = connect();
  let failed = false;

  try {
    if (has('status')) {
      await bootstrap(knex);
      const completed = await knex.migrate.list();
      const c = await counts(knex);
      write(`\nPlatform schema status\n${'-'.repeat(56)}\n`);
      write(`  applied migrations : ${completed[0].length}\n`);
      write(`  pending migrations : ${completed[1].length}\n`);
      for (const [k, v] of Object.entries(c)) write(`  ${k.padEnd(18)} : ${v}\n`);
      write('\n');
      return;
    }

    if (has('rollback')) {
      const { reverted } = await down(knex);
      write(`\nRolled back ${reverted.length} migration(s).\n\n`);
      return;
    }

    if (has('verify')) {
      /**
       * CP-2's cycle, against a scratch schema.
       *
       * Rolling forward is the easy half; the half that matters is that `down`
       * was written and works, because Phase 7 requires a rehearsed rollback
       * before the first real clinic cutover, and that is a bad moment to
       * discover it was never tested.
       *
       * It builds `platform_ddl_check` rather than `platform`, because `down`
       * drops the schema outright. Against the live one that deletes the loaded
       * data and cascades into every tenant foreign key referencing it — the gate
       * would report a clean cycle while destroying what CP-4 measures next.
       */
      write(`\nCP-2 cycle — up, down, up (scratch schema ${SCRATCH_SCHEMA})\n${'-'.repeat(56)}\n`);

      await knex.destroy();
      const scratch = connect(SCRATCH_SCHEMA);

      try {
        const first = await up(scratch, SCRATCH_SCHEMA);
        const afterUp = await counts(scratch, SCRATCH_SCHEMA);
        write(`  up      ${first.applied.length} migration(s), ${afterUp.tables} tables, ${afterUp.indexes} indexes\n`);

        await down(scratch);
        const afterDown = await counts(scratch, SCRATCH_SCHEMA);
        write(`  down    ${afterDown.tables} tables remaining\n`);
        if (afterDown.tables !== 0) {
          write(`\n  FAILED: ${afterDown.tables} tables survived the rollback.\n`);
          failed = true;
        }

        const second = await up(scratch, SCRATCH_SCHEMA);
        const afterReUp = await counts(scratch, SCRATCH_SCHEMA);
        write(`  up      ${second.applied.length} migration(s), ${afterReUp.tables} tables, ${afterReUp.indexes} indexes\n`);

        if (afterReUp.tables !== afterUp.tables || afterReUp.indexes !== afterUp.indexes) {
          write('\n  FAILED: re-applying produced a different schema than the first run.\n');
          write(`          tables ${afterUp.tables} -> ${afterReUp.tables}, indexes ${afterUp.indexes} -> ${afterReUp.indexes}\n`);
          failed = true;
        }
      } finally {
        // Removed either way, so a failed cycle does not leave a half-built
        // schema behind to confuse the next run.
        await scratch.raw(`drop schema if exists ${ddl.ident(SCRATCH_SCHEMA)} cascade;`).catch(() => {});
        await scratch.raw(
          `drop table if exists ${ddl.ident(knexfile.MIGRATION_SCHEMA)}.${ddl.ident(`platform_${SCRATCH_SCHEMA}`)};`
        ).catch(() => {});
        await scratch.destroy();
      }

      write(`${'-'.repeat(56)}\n${failed ? 'CYCLE FAILED' : 'Cycle clean — the live platform schema was not touched.'}\n\n`);
      process.exit(failed ? 1 : 0);
    }

    const { applied } = await up(knex);
    const c = await counts(knex);
    write(`\nPlatform schema migrated\n${'-'.repeat(56)}\n`);
    write(`  migrations applied : ${applied.length}\n`);
    for (const [k, v] of Object.entries(c)) write(`  ${k.padEnd(18)} : ${v}\n`);
    write('\n');

    // A migration that applied cleanly but created nothing is a silent failure —
    // exactly what the Knex CLI reported as success.
    if (c.tables === 0) {
      write('FAILED: migrations reported success but no tables exist.\n\n');
      failed = true;
    }
  } catch (err) {
    process.stderr.write(`\n${err.message}\n`);
    if (err.detail) process.stderr.write(`${err.detail}\n`);
    process.stderr.write('\n');
    failed = true;
  } finally {
    // The verify branch destroys and replaces this connection itself, and exits
    // before reaching here.
    await knex.destroy().catch(() => {});
  }

  process.exit(failed ? 1 : 0);
})();
