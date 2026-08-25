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

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const write = (s) => process.stdout.write(s);

function connect() {
  const cfg = JSON.parse(JSON.stringify(knexfile.platform));
  cfg.migrations.directory = path.resolve(__dirname, 'migrations/platform');
  return knexLib(cfg);
}

/**
 * The bootstrap Knex cannot do for itself. Also creates the shared `objectid`
 * domain, because a tenant schema provisioned before the platform one would
 * otherwise be the first to need it.
 */
async function bootstrap(knex) {
  for (const sql of ddl.createDomain()) await knex.raw(sql);
  // The tracking schema must exist before Knex writes its first row, and it must
  // survive `down` dropping the platform schema.
  await knex.raw(`create schema if not exists ${ddl.ident(knexfile.MIGRATION_SCHEMA)};`);
  await knex.raw(`create schema if not exists ${ddl.ident(PLATFORM_SCHEMA)};`);
}

async function counts(knex) {
  const q = async (sql, binds = []) => (await knex.raw(sql, binds)).rows[0].n;
  return {
    tables: await q("select count(*)::int n from information_schema.tables where table_schema=? and table_type='BASE TABLE'", [PLATFORM_SCHEMA]),
    indexes: await q('select count(*)::int n from pg_indexes where schemaname=?', [PLATFORM_SCHEMA]),
    foreignKeys: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='f'", [PLATFORM_SCHEMA]),
    notValid: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='f' and not c.convalidated", [PLATFORM_SCHEMA]),
    checks: await q("select count(*)::int n from pg_constraint c join pg_namespace ns on ns.oid=c.connamespace where ns.nspname=? and c.contype='c'", [PLATFORM_SCHEMA]),
  };
}

async function up(knex) {
  await bootstrap(knex);
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
       * CP-2's cycle. Rolling forward is the easy half; the half that matters is
       * that `down` was written and works, because Phase 7 requires a rehearsed
       * rollback before the first real clinic cutover and that is a bad moment to
       * discover it was never tested.
       */
      write(`\nCP-2 cycle — up, down, up\n${'-'.repeat(56)}\n`);

      const first = await up(knex);
      const afterUp = await counts(knex);
      write(`  up      ${first.applied.length} migration(s), ${afterUp.tables} tables, ${afterUp.indexes} indexes\n`);

      await down(knex);
      const afterDown = await counts(knex);
      write(`  down    ${afterDown.tables} tables remaining\n`);
      if (afterDown.tables !== 0) {
        write(`\n  FAILED: ${afterDown.tables} tables survived the rollback.\n`);
        failed = true;
      }

      const second = await up(knex);
      const afterReUp = await counts(knex);
      write(`  up      ${second.applied.length} migration(s), ${afterReUp.tables} tables, ${afterReUp.indexes} indexes\n`);

      if (afterReUp.tables !== afterUp.tables || afterReUp.indexes !== afterUp.indexes) {
        write('\n  FAILED: re-applying produced a different schema than the first run.\n');
        write(`          tables ${afterUp.tables} -> ${afterReUp.tables}, indexes ${afterUp.indexes} -> ${afterReUp.indexes}\n`);
        failed = true;
      }

      write(`${'-'.repeat(56)}\n${failed ? 'CYCLE FAILED' : 'Cycle clean.'}\n\n`);
      return;
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
    await knex.destroy();
  }

  process.exit(failed ? 1 : 0);
})();
