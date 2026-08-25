#!/usr/bin/env node
'use strict';

/**
 * CP-2 — DDL.
 *
 * Migrations apply, roll back and re-apply cleanly; every declared index and
 * constraint exists; per-tenant roles hold USAGE on exactly one schema.
 *
 * The up -> down -> up cycle is the part worth insisting on. A migration that only
 * rolls forward cannot be rehearsed, and Phase 7 requires a rehearsed rollback
 * before the first real clinic cutover. Discovering at that point that `down` was
 * never written is the expensive version of this finding.
 *
 * Object counts are checked against the generated manifest rather than eyeballed.
 * The plan warns that silently losing index declarations is how a migration lands
 * and the product gets slow the same day without anyone connecting the two events,
 * so a missing index is a failure here, not a note.
 *
 * Run:  npm run sql:migrate:verify
 */

const knexLib = require('knex');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('../../sql/config');
const knexfile = require('../../knexfile');
const manifest = require('../../sql/schema/manifest.json');
const typeMap = require('../../sql/schema/typeMap');

const ROOT = path.resolve(__dirname, '../..');
const PLATFORM_SCHEMA = 'platform';

const write = (s) => process.stdout.write(s);
const results = [];

function record(ok, name, detail) {
  results.push({ ok, name, detail });
  write(`  ${ok ? 'pass' : 'FAIL'}  ${name}\n`);
  if (detail) write(`        ${detail}\n`);
}

function connect() {
  return knexLib({
    client: 'pg',
    connection: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    },
    pool: { min: 0, max: 2 },
  });
}

/** What the manifest says a scope should contain. */
function expected(scope) {
  const tables = manifest.tables.filter((t) => t.scope === scope);
  const names = new Set();
  const indexes = new Set();

  for (const t of tables) {
    names.add(t.table);
    for (const c of t.childTables) names.add(c.table);
    for (const j of t.junctionTables) names.add(j.table);

    // `relocatedTo` indexes are created on the child/junction table, and an
    // `unsupported` index is one the generator refused to guess at — counting
    // either against the parent table would make this check assert the wrong thing.
    for (const i of t.indexes) if (i.kind !== 'unsupported') indexes.add(i.name);
    for (const c of t.childTables) for (const i of c.indexes) indexes.add(i.name);
  }
  return { tableNames: names, indexNames: indexes, tables };
}

(async function main() {
  write('\nCP-2 — DDL\n');
  write('-'.repeat(64) + '\n\n');

  // The manifest is the contract this gate checks against, so a stale one would
  // let the gate pass against a schema nobody generated.
  const check = spawnSync('node', ['sql/schema/build.js', '--check'], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
  });
  record(check.status === 0, 'manifest.json is current', check.status === 0 ? null : 'run `npm run sql:schema`');

  // The full up -> down -> up cycle, run as its own process so this gate exercises
  // the same entry point an operator would.
  const cycle = spawnSync('node', ['sql/migrate.js', '--verify'], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300_000,
  });
  const cycleOut = `${cycle.stdout || ''}${cycle.stderr || ''}`;
  record(
    cycle.status === 0 && /Cycle clean/.test(cycleOut),
    'migrations apply, roll back, and re-apply identically',
    cycle.status === 0 ? null : cycleOut.trim().split('\n').slice(-3).join(' | ')
  );

  const knex = connect();
  try {
    const exp = expected('platform');

    const liveTables = new Set((await knex.raw(
      "select table_name from information_schema.tables where table_schema = ? and table_type = 'BASE TABLE'",
      [PLATFORM_SCHEMA]
    )).rows.map((r) => r.table_name));

    const missingTables = [...exp.tableNames].filter((t) => !liveTables.has(t));
    record(
      missingTables.length === 0,
      `all ${exp.tableNames.size} platform tables exist`,
      missingTables.length ? `missing: ${missingTables.join(', ')}` : `${liveTables.size} present`
    );

    const liveIndexes = new Set((await knex.raw(
      'select indexname from pg_indexes where schemaname = ?', [PLATFORM_SCHEMA]
    )).rows.map((r) => r.indexname));

    const missingIndexes = [...exp.indexNames].filter((i) => !liveIndexes.has(i));
    record(
      missingIndexes.length === 0,
      `all ${exp.indexNames.size} declared platform indexes exist`,
      missingIndexes.length
        ? `missing ${missingIndexes.length}: ${missingIndexes.slice(0, 5).join(', ')}`
        : `${liveIndexes.size} present`
    );

    /**
     * Every table needs a primary key. A table without one cannot be the target of
     * a foreign key and gives the ETL no way to recognise a row it has already
     * loaded, which is what makes a re-run duplicate data instead of resuming.
     */
    const noPk = (await knex.raw(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ? and c.relkind = 'r'
        and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
    `, [PLATFORM_SCHEMA])).rows.map((r) => r.relname);
    record(noPk.length === 0, 'every platform table has a primary key', noPk.length ? noPk.join(', ') : null);

    // NOT NULL is where the profile's authority actually lands, so it is checked
    // column by column rather than counted.
    const liveCols = (await knex.raw(
      'select table_name, column_name, is_nullable from information_schema.columns where table_schema = ?',
      [PLATFORM_SCHEMA]
    )).rows;
    const nullableByTable = {};
    for (const r of liveCols) {
      (nullableByTable[r.table_name] ||= {})[r.column_name] = r.is_nullable === 'YES';
    }

    const nullMismatches = [];
    for (const t of exp.tables) {
      for (const c of t.columns) {
        const live = nullableByTable[t.table] && nullableByTable[t.table][c.column];
        if (live === undefined) { nullMismatches.push(`${t.table}.${c.column} absent`); continue; }
        if (c.notNull === live) nullMismatches.push(`${t.table}.${c.column} expected ${c.notNull ? 'NOT NULL' : 'nullable'}`);
      }
    }
    record(
      nullMismatches.length === 0,
      'every column matches the nullability the manifest decided',
      nullMismatches.length ? `${nullMismatches.length}: ${nullMismatches.slice(0, 4).join('; ')}` : null
    );

    /**
     * Foreign keys created NOT VALID are the recorded decision for references the
     * existing data violates. If one is silently missing, the migration has
     * quietly reverted to Mongo's unenforced state.
     */
    const liveFks = (await knex.raw(`
      select c.conname, c.convalidated from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = ? and c.contype = 'f'
    `, [PLATFORM_SCHEMA])).rows;
    const fkByName = Object.fromEntries(liveFks.map((r) => [r.conname, r.convalidated]));

    const fkProblems = [];
    for (const t of exp.tables) {
      for (const fk of t.foreignKeys) {
        if (!fk.referencesTable) continue;
        const name = typeMap.fitIdentifier(`${t.table}_${fk.column}_fkey`);
        if (!(name in fkByName)) { fkProblems.push(`${name} missing`); continue; }
        if (fk.notValid && fkByName[name]) fkProblems.push(`${name} should be NOT VALID`);
      }
    }
    record(
      fkProblems.length === 0,
      `all ${liveFks.length} platform foreign keys present, NOT VALID where the data requires it`,
      fkProblems.length ? `${fkProblems.length}: ${fkProblems.slice(0, 4).join('; ')}` : null
    );

    /**
     * Rule 4 of plan section 2.2. A tenant role with USAGE on two schemas is an
     * isolation failure that CP-3 would not necessarily catch — CP-3 tests the two
     * probe roles, this checks every role that exists.
     */
    const roleGrants = (await knex.raw(`
      select r.rolname, n.nspname
      from pg_roles r
      join pg_namespace n on has_schema_privilege(r.oid, n.oid, 'USAGE')
      where r.rolname like 'tenant\\_%'
        and n.nspname not in ('pg_catalog', 'information_schema', 'public')
      order by 1, 2
    `)).rows;

    const byRole = {};
    for (const g of roleGrants) (byRole[g.rolname] ||= []).push(g.nspname);
    const overreaching = Object.entries(byRole).filter(([, s]) => s.length !== 1);

    record(
      overreaching.length === 0,
      `every tenant role holds USAGE on exactly one schema (${Object.keys(byRole).length} role(s))`,
      overreaching.length
        ? overreaching.map(([r, s]) => `${r} -> ${s.join(', ')}`).join('; ')
        : Object.entries(byRole).map(([r, s]) => `${r} -> ${s[0]}`).join(', ') || 'no tenant roles provisioned yet'
    );
  } catch (err) {
    record(false, 'gate execution', `${err.code || ''} ${err.message}`);
  } finally {
    await knex.destroy();
  }

  const failed = results.filter((r) => !r.ok);
  write(`\n${'-'.repeat(64)}\n`);
  write(`${results.length - failed.length} of ${results.length} assertions passed\n`);
  write(failed.length ? 'CP-2 FAILED\n\n' : 'CP-2 PASSED — the schema matches the manifest.\n\n');
  process.exit(failed.length ? 1 : 0);
})();
