#!/usr/bin/env node
'use strict';

/**
 * MongoDB -> PostgreSQL data migration — Phase 0, deliverable 5.
 *
 * Reads a collection, converts each document through sql/etl/transform.js, and
 * upserts the rows. Mongo is opened read-only; nothing here can damage the source.
 *
 * Three properties this is built around, in order of how expensive they are to
 * retrofit:
 *
 * **Idempotent.** Every write is an upsert keyed on the primary key, so a re-run
 * changes nothing. This is the assertion most often skipped and most often needed:
 * an ETL that cannot be re-run cannot be *resumed* after failing halfway through
 * 27 clinics, which is exactly when you need to resume it.
 *
 * **Orphans reported, never dropped.** Mongo never enforced the 194 references, so
 * violations exist. A row whose parent is missing is loaded and recorded, not
 * discarded -- silently dropping it converts a data-quality question into
 * permanent data loss, and the foreign keys are NOT VALID precisely so the load
 * can carry the damage while someone decides what it is.
 *
 * **Problems collected, not thrown.** One malformed document out of 50,000 should
 * appear in the report next to the other 49,999, rather than aborting the run and
 * taking the report with it.
 *
 * Usage:
 *   node sql/etl/load.js --platform
 *   node sql/etl/load.js --slug=jathar-dental
 *   node sql/etl/load.js --all
 *   node sql/etl/load.js --platform --dry-run
 */

const { MongoClient } = require('mongodb');
const knexLib = require('knex');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const ddl = require('../schema/ddl');
const manifest = require('../schema/manifest.json');
const transform = require('./transform');
const { schemaFor } = require('../tenant/naming');

const REPORT_DIR = path.resolve(__dirname, '../reports');
const PLATFORM_SCHEMA = 'platform';
const BATCH = 500;

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const DRY_RUN = Boolean(flag('dry-run'));
const write = (s) => process.stdout.write(s);

/* ── Connections ───────────────────────────────────────────── */

function pg() {
  return knexLib({
    client: 'pg',
    connection: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    },
    pool: { min: 0, max: 4 },
  });
}

async function mongo() {
  if (!config.mongo.uri) throw new Error('No Mongo source configured — set SQL_SOURCE_MONGO_URI or PLATFORM_DB_URI.');
  const client = new MongoClient(config.mongo.uri, { readPreference: config.mongo.readPreference });
  await client.connect();
  return client;
}

/* ── Loading one table ─────────────────────────────────────── */

/**
 * Upsert in batches, on conflict of the primary key.
 *
 * `merge()` rather than `ignore()`: a re-run after a partial failure must correct
 * rows written by the failed attempt, not leave whichever version landed first.
 */
async function upsert(knex, schema, table, rows, conflictColumns) {
  if (!rows.length || DRY_RUN) return rows.length;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await knex(`${schema}.${table}`).insert(slice).onConflict(conflictColumns).merge();
    written += slice.length;
  }
  return written;
}

async function loadTable(knex, db, spec, { schema, clinicId }) {
  const collection = db.collection(spec.collection);
  const sourceCount = await collection.countDocuments();

  const report = {
    table: spec.table,
    collection: spec.collection,
    sourceDocuments: sourceCount,
    rowsLoaded: 0,
    childRowsLoaded: {},
    junctionRowsLoaded: {},
    problems: [],
    notes: [],
  };

  if (sourceCount === 0) return report;

  const cursor = collection.find({}, { readPreference: config.mongo.readPreference });
  let buffer = [];
  const childBuffers = {};
  const junctionBuffers = {};

  const flush = async () => {
    if (buffer.length) {
      report.rowsLoaded += await upsert(knex, schema, spec.table, buffer, ['id']);
      buffer = [];
    }
    for (const child of spec.childTables) {
      const rows = childBuffers[child.table];
      if (rows && rows.length) {
        const key = [child.columns[0].column, 'line_no'];
        report.childRowsLoaded[child.table] =
          (report.childRowsLoaded[child.table] || 0) + await upsert(knex, schema, child.table, rows, key);
        childBuffers[child.table] = [];
      }
    }
    for (const j of spec.junctionTables) {
      const rows = junctionBuffers[j.table];
      if (rows && rows.length) {
        report.junctionRowsLoaded[j.table] =
          (report.junctionRowsLoaded[j.table] || 0)
          + await upsert(knex, schema, j.table, rows, [j.parentColumn, j.targetColumn]);
        junctionBuffers[j.table] = [];
      }
    }
  };

  for await (const doc of cursor) {
    const { row, problems, notes } = transform.buildRow(spec, doc, { clinicId });

    // A document whose own id will not convert cannot be keyed, so it cannot be
    // upserted and cannot be a parent. Reported and skipped -- the one case where
    // skipping is correct, because there is nothing to write it under.
    if (!row.id) {
      report.problems.push(`_id ${String(doc._id)}: unusable primary key — row skipped`);
      continue;
    }

    if (problems.length) report.problems.push(...problems.map((p) => `_id ${row.id}: ${p}`));
    if (notes.length) report.notes.push(...notes.map((n) => `_id ${row.id}: ${n}`));
    buffer.push(row);

    for (const child of spec.childTables) {
      const built = transform.buildChildRows(child, doc, row.id, { clinicId });
      (childBuffers[child.table] ||= []).push(...built.rows);
      if (built.problems.length) report.problems.push(...built.problems.map((p) => `_id ${row.id}: ${p}`));
    }
    for (const j of spec.junctionTables) {
      const built = transform.buildJunctionRows(j, doc, row.id, { clinicId });
      (junctionBuffers[j.table] ||= []).push(...built.rows);
      if (built.problems.length) report.problems.push(...built.problems.map((p) => `_id ${row.id}: ${p}`));
    }

    if (buffer.length >= BATCH) await flush();
  }
  await flush();

  return report;
}

/* ── Foreign keys around the load ──────────────────────────── */

/**
 * Foreign keys are dropped for the duration of the load and rebuilt afterwards.
 *
 * Two problems make this necessary, and neither is solved by NOT VALID -- that
 * only skips the initial scan of *existing* rows; every INSERT is still checked.
 *
 * 1. **Ordering.** Tables load alphabetically, so `plans` is written before
 *    `platform_users` and `plans.created_by_id` has nothing to point at yet. No
 *    load order fixes this in general: the reference graph has cycles
 *    (`users.branch_id` -> branches, `branches.manager_id` -> users), so there is
 *    no ordering in which every parent precedes its children.
 * 2. **Existing violations.** Mongo never enforced these references. An enforced
 *    foreign key would reject those rows at insert, and the only ways to make the
 *    load succeed would be to drop the rows -- destroying data before anyone has
 *    decided what it is -- or to drop the constraint permanently.
 *
 * Rebuilding afterwards is what makes this better than simply not having the
 * constraints. Each one is restored **validated** where the loaded data satisfies
 * it, and NOT VALID only where a real violation was measured. So the migration
 * ends with the strongest enforcement the data actually permits, and the
 * exceptions are a short, reportable list rather than a blanket exemption.
 *
 * Restoration runs in a `finally`, so an ETL that crashes mid-load still leaves
 * the schema constrained.
 */
function foreignKeysFor(scope, schema, resolveSchema) {
  const out = [];
  for (const t of manifest.tables.filter((x) => x.scope === scope)) {
    for (const fk of t.foreignKeys) {
      if (!fk.referencesTable) continue;
      out.push({
        schema,
        table: t.table,
        fk,
        name: ddl.foreignKeyName(t.table, fk.column),
        targetSchema: resolveSchema(fk.referencesScope),
      });
    }
    // Child and junction tables carry their own parent links. Those are
    // ON DELETE CASCADE and are dropped and restored the same way.
    for (const c of t.childTables) {
      out.push({
        schema, table: c.table, parentLink: true,
        name: `${c.table}_parent_fkey`,
        sql: `alter table ${schema}.${c.table} add constraint ${c.table}_parent_fkey `
          + `foreign key (${c.columns[0].column}) references ${schema}.${t.table} (id) on delete cascade;`,
      });
      for (const fk of c.foreignKeys) {
        if (!fk.referencesTable) continue;
        out.push({
          schema, table: c.table, fk, name: ddl.foreignKeyName(c.table, fk.column),
          targetSchema: resolveSchema(fk.referencesScope),
        });
      }
    }
    for (const j of t.junctionTables) {
      out.push({
        schema, table: j.table, parentLink: true,
        name: `${j.table}_parent_fkey`,
        sql: `alter table ${schema}.${j.table} add constraint ${j.table}_parent_fkey `
          + `foreign key (${j.parentColumn}) references ${schema}.${t.table} (id) on delete cascade;`,
      });
      if (j.targetTable) {
        const ts = resolveSchema(j.targetScope);
        out.push({
          schema, table: j.table, parentLink: true,
          name: `${j.table}_target_fkey`,
          sql: `alter table ${schema}.${j.table} add constraint ${j.table}_target_fkey `
            + `foreign key (${j.targetColumn}) references ${ts}.${j.targetTable} (id) on delete cascade not valid;`,
        });
      }
    }
  }
  return out;
}

/** Postgres errors carry multi-line detail; the board wants one line. */
const firstLine = (err) => String(err && err.message ? err.message : err).split(String.fromCharCode(10))[0].trim();

async function dropForeignKeys(knex, keys) {
  if (DRY_RUN) return;
  for (const k of keys) {
    await knex.raw(ddl.dropForeignKey(k.schema, k.table, k.name));
  }
}

/**
 * `orphanCounts` maps `table.column` to the number of rows that violate it, so a
 * constraint the data satisfies comes back fully validated rather than being left
 * permanently unenforced out of caution.
 */
async function restoreForeignKeys(knex, keys, orphanCounts = {}) {
  if (DRY_RUN) return { restored: 0, notValid: 0, failed: [], degraded: [] };
  let restored = 0;
  let notValid = 0;
  const failed = [];
  const degraded = [];

  for (const k of keys) {
    try {
      if (k.sql) { await knex.raw(k.sql); restored += 1; continue; }
      const violations = orphanCounts[`${k.table}.${k.fk.column}`] || 0;
      const sql = ddl.addForeignKey(k.schema, k.table, { ...k.fk, notValid: violations > 0 }, k.targetSchema);
      await knex.raw(sql);
      restored += 1;
      if (violations > 0) notValid += 1;
    } catch (err) {
      /**
       * A validated constraint that will not build is retried NOT VALID.
       *
       * This matters most when the load aborted partway: parent tables may be
       * empty, so a constraint the *complete* data satisfies still cannot be
       * validated now. Leaving it off entirely would end the run with an
       * unconstrained schema and no record of it -- the exact state the migration
       * exists to escape. NOT VALID keeps it enforced for every future write, and
       * the failure is still reported.
       */
      try {
        await knex.raw(ddl.addForeignKey(k.schema, k.table, { ...k.fk, notValid: true }, k.targetSchema));
        restored += 1;
        notValid += 1;
        degraded.push(`${k.table}.${k.name}: could not validate, added NOT VALID (${firstLine(err)})`);
      } catch (err2) {
        failed.push(`${k.table}.${k.name}: ${firstLine(err2)}`);
      }
    }
  }
  return { restored, notValid, failed, degraded };
}

/* ── Orphan audit ──────────────────────────────────────────── */

/**
 * After loading, find rows whose references point at nothing.
 *
 * Run in SQL rather than in the ETL loop because it needs both sides fully
 * loaded: a reference that looks orphaned mid-load may simply point at a row the
 * loader has not reached yet, and reporting those would bury the real violations
 * in noise.
 *
 * This is the report the plan requires before the NOT VALID foreign keys can be
 * promoted with VALIDATE CONSTRAINT.
 */
async function auditOrphans(knex, scope, schema, resolveSchema) {
  const findings = [];
  for (const t of manifest.tables.filter((x) => x.scope === scope)) {
    for (const fk of t.foreignKeys) {
      if (!fk.referencesTable) continue;
      const targetSchema = resolveSchema(fk.referencesScope);
      const { rows } = await knex.raw(`
        select count(*)::int as n
        from ${schema}.${t.table} c
        where c.${fk.column} is not null
          and not exists (select 1 from ${targetSchema}.${fk.referencesTable} p where p.id = c.${fk.column})
      `);
      if (rows[0].n > 0) {
        findings.push({
          table: t.table,
          column: fk.column,
          references: `${targetSchema}.${fk.referencesTable}`,
          orphanRows: rows[0].n,
          finding: fk.finding || null,
          decision: fk.decision || 'undecided — must be resolved before VALIDATE CONSTRAINT',
        });
      }
    }
  }
  return findings;
}

/* ── Scope runners ─────────────────────────────────────────── */

/** `table.column` -> violating row count, for deciding NOT VALID per constraint. */
function orphanCountsOf(orphans) {
  return Object.fromEntries(orphans.map((o) => [`${o.table}.${o.column}`, o.orphanRows]));
}

async function loadPlatform(knex, client) {
  const db = client.db();
  const specs = manifest.tables.filter((t) => t.scope === 'platform');
  const resolve = () => PLATFORM_SCHEMA;
  const keys = foreignKeysFor('platform', PLATFORM_SCHEMA, resolve);
  const reports = [];

  write(`\nPlatform  (${specs.length} collections)\n${'-'.repeat(72)}\n`);
  await dropForeignKeys(knex, keys);

  let orphans = [];
  let restore = { restored: 0, notValid: 0, failed: [], degraded: [] };
  try {
    for (const spec of specs) {
      const r = await loadTable(knex, db, spec, { schema: PLATFORM_SCHEMA, clinicId: null });
      reports.push(r);
      if (r.sourceDocuments || r.problems.length) {
        write(`  ${r.table.padEnd(34)} ${String(r.rowsLoaded).padStart(6)} / ${String(r.sourceDocuments).padStart(6)}`);
        write(r.problems.length ? `   ${r.problems.length} problem(s)\n` : '\n');
      }
    }
    orphans = await auditOrphans(knex, 'platform', PLATFORM_SCHEMA, resolve);
  } finally {
    // In a `finally` so an ETL that crashes mid-load still leaves the schema
    // constrained rather than silently unenforced.
    restore = await restoreForeignKeys(knex, keys, orphanCountsOf(orphans));
    write(`  constraints: ${restore.restored} restored, ${restore.notValid} NOT VALID\n`);
    for (const f of restore.failed) write(`  CONSTRAINT FAILED  ${f}\n`);
  }

  return {
    scope: 'platform', schema: PLATFORM_SCHEMA, tables: reports, orphans, constraints: restore,
  };
}

/**
 * Each clinic has its own MongoDB database, addressed by a `dbUri` on the platform
 * `clinics` collection — the plaintext credentials F-4 records. Resolved here and
 * never written to the report.
 */
async function loadTenant(knex, client, clinic) {
  const schema = schemaFor(clinic.slug);
  const clinicId = transform.toObjectId(clinic._id);
  const tenantClient = new MongoClient(clinic.dbUri, { readPreference: config.mongo.readPreference });
  await tenantClient.connect();

  try {
    const db = tenantClient.db();
    const specs = manifest.tables.filter((t) => t.scope === 'tenant');
    const resolve = (s) => (s === 'platform' ? PLATFORM_SCHEMA : schema);
    const keys = foreignKeysFor('tenant', schema, resolve);
    const reports = [];

    write(`\n${clinic.slug}  ->  ${schema}  (${specs.length} collections)\n${'-'.repeat(72)}\n`);
    await dropForeignKeys(knex, keys);

    let orphans = [];
    let restore = { restored: 0, notValid: 0, failed: [], degraded: [] };
    try {
      for (const spec of specs) {
        const r = await loadTable(knex, db, spec, { schema, clinicId });
        reports.push(r);
        if (r.sourceDocuments || r.problems.length) {
          write(`  ${r.table.padEnd(34)} ${String(r.rowsLoaded).padStart(6)} / ${String(r.sourceDocuments).padStart(6)}`);
          write(r.problems.length ? `   ${r.problems.length} problem(s)\n` : '\n');
        }
      }
      orphans = await auditOrphans(knex, 'tenant', schema, resolve);
    } finally {
      restore = await restoreForeignKeys(knex, keys, orphanCountsOf(orphans));
      write(`  constraints: ${restore.restored} restored, ${restore.notValid} NOT VALID\n`);
      for (const f of restore.failed) write(`  CONSTRAINT FAILED  ${f}\n`);
    }

    return {
      scope: 'tenant', slug: clinic.slug, schema, tables: reports, orphans, constraints: restore,
    };
  } finally {
    await tenantClient.close();
  }
}

/* ── Report ────────────────────────────────────────────────── */

function summarise(runs) {
  const write2 = (s) => process.stdout.write(s);
  let problems = 0;
  let orphanRows = 0;

  write2(`\n${'='.repeat(72)}\nSummary\n${'='.repeat(72)}\n`);
  for (const run of runs) {
    const rows = run.tables.reduce((n, t) => n + t.rowsLoaded, 0);
    const src = run.tables.reduce((n, t) => n + t.sourceDocuments, 0);
    const p = run.tables.reduce((n, t) => n + t.problems.length, 0);
    problems += p;
    write2(`  ${(run.slug || run.scope).padEnd(24)} ${rows} rows from ${src} documents, ${p} problem(s)\n`);

    for (const o of run.orphans) {
      orphanRows += o.orphanRows;
      write2(`      orphan  ${o.table}.${o.column} -> ${o.references}: ${o.orphanRows} row(s)`);
      write2(o.finding ? `  [${o.finding}]\n` : '\n');
    }
  }
  write2(`${'-'.repeat(72)}\n`);
  write2(`  ${problems} conversion problem(s), ${orphanRows} orphaned row(s)\n`);
  write2('  Orphans are loaded and reported, never dropped. Each class needs a decision\n');
  write2('  before its foreign key can be promoted with VALIDATE CONSTRAINT.\n\n');
  return { problems, orphanRows };
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  const knex = pg();
  let client = null;
  let failed = false;

  try {
    client = await mongo();
    const runs = [];

    if (DRY_RUN) write('\nDRY RUN — reading and converting, writing nothing.\n');

    if (flag('platform') || flag('all')) {
      runs.push(await loadPlatform(knex, client));
    }

    if (flag('all') || flag('slug')) {
      const query = flag('slug') ? { slug: flag('slug') } : {};
      const clinics = await client.db().collection('clinics')
        .find(query, { projection: { slug: 1, dbUri: 1 } })
        .toArray();

      if (!clinics.length) {
        write(`\nNo clinic matched ${JSON.stringify(query)}.\n\n`);
        failed = true;
      }
      for (const clinic of clinics) {
        if (!clinic.dbUri) {
          write(`\n  SKIPPED ${clinic.slug}: no dbUri on the platform record\n`);
          failed = true;
          continue;
        }
        runs.push(await loadTenant(knex, client, clinic));
      }
    }

    if (!runs.length) {
      process.stderr.write('\nNothing to do. Pass --platform, --slug=<clinic> or --all.\n\n');
      process.exit(1);
    }

    const { problems } = summarise(runs);

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, 'etl-last-run.json');
    fs.writeFileSync(reportPath, `${JSON.stringify({ dryRun: DRY_RUN, runs }, null, 2)}\n`, 'utf8');
    write(`  Full report: ${path.relative(process.cwd(), reportPath).replace(/\\/g, '/')}\n\n`);

    // Conversion problems fail the run. An orphan is a known data-quality issue
    // with a decision pending; a value that would not convert is a defect in the
    // mapping, and letting it pass would mean loading a null where a value existed.
    if (problems > 0) failed = true;
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    failed = true;
  } finally {
    if (client) await client.close();
    await knex.destroy();
  }

  process.exit(failed ? 1 : 0);
})();
