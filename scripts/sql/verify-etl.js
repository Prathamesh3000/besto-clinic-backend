#!/usr/bin/env node
'use strict';

/**
 * CP-4 — ETL correctness.
 *
 * Row-count parity per collection, foreign-key integrity, spot-value comparison,
 * and idempotency.
 *
 * Idempotency is the assertion most often skipped and most often needed. An ETL
 * that cannot be re-run without duplicating data cannot be resumed after failing
 * halfway through 27 clinics -- which is precisely when you need to resume it.
 * Here it is checked the only way that actually proves it: run the load again and
 * compare every row count before and after.
 *
 * Orphan handling is a report, never a silent drop. Mongo never enforced the 194
 * `ref:` declarations, so violations exist. This gate does not fail because
 * orphans exist -- it fails when an orphan is **unreported**, i.e. present in the
 * data but absent from the ETL's own report. An ETL that quietly discards them
 * converts a data-quality question into permanent data loss; one that fails to
 * mention them is just as bad, because the decision never gets made.
 *
 * Note this gate cannot detect the failure CP-5 exists for. Appointment times
 * shifted by 5.5 hours preserve row counts, referential integrity and spot-value
 * *presence* perfectly. CP-4 green and CP-5 red is a coherent state, and the
 * reason both exist.
 *
 * Run:  npm run sql:verify:etl
 */

const { MongoClient } = require('mongodb');
const knexLib = require('knex');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('../../sql/config');
const manifest = require('../../sql/schema/manifest.json');
const transform = require('../../sql/etl/transform');
const { schemaFor } = require('../../sql/tenant/naming');

const ROOT = path.resolve(__dirname, '../..');
const REPORT = path.join(ROOT, 'sql/reports/etl-last-run.json');
const PLATFORM_SCHEMA = 'platform';
const SPOT_SAMPLE = 25;

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const write = (s) => process.stdout.write(s);
const results = [];
function record(ok, name, detail) {
  results.push({ ok, name, detail });
  write(`  ${ok ? 'pass' : 'FAIL'}  ${name}\n`);
  if (detail) write(`        ${detail}\n`);
}

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

/* ── Parity ────────────────────────────────────────────────── */

async function countParity(knex, db, scope, schema) {
  const specs = manifest.tables.filter((t) => t.scope === scope);
  const mismatches = [];
  let compared = 0;
  let rows = 0;

  for (const spec of specs) {
    const source = await db.collection(spec.collection).countDocuments();
    const { rows: r } = await knex.raw(`select count(*)::int as n from ${schema}.${spec.table}`);
    const target = r[0].n;
    compared += 1;
    rows += target;
    if (source !== target) mismatches.push(`${spec.table}: mongo ${source} vs pg ${target}`);
  }
  return { compared, rows, mismatches };
}

/**
 * Spot-check field values, not just counts.
 *
 * Row-count parity is satisfied by a table full of nulls. This re-reads a sample
 * of documents from Mongo, converts them through the same transform the ETL used,
 * and compares field by field against what is actually stored -- so a column that
 * silently failed to map shows up as a value difference rather than passing
 * because the row exists.
 */
async function spotValues(knex, db, scope, schema) {
  const specs = manifest.tables.filter((t) => t.scope === scope);
  const diffs = [];
  let checked = 0;

  for (const spec of specs) {
    const docs = await db.collection(spec.collection).find({}).limit(SPOT_SAMPLE).toArray();
    if (!docs.length) continue;

    const ids = docs.map((d) => transform.toObjectId(d._id)).filter(Boolean);
    const stored = await knex(`${schema}.${spec.table}`).whereIn('id', ids);
    const byId = Object.fromEntries(stored.map((r) => [String(r.id).trim(), r]));

    for (const doc of docs) {
      const id = transform.toObjectId(doc._id);
      const row = byId[id];
      if (!row) { diffs.push(`${spec.table}/${id}: row absent from PostgreSQL`); continue; }

      for (const col of spec.columns) {
        if (!col.mongoPath || col.type === 'jsonb') continue;
        const { value: expectedRaw } = transform.convert(col, transform.readPath(doc, col.mongoPath));
        const actual = row[col.column];
        if (!sameValue(col, expectedRaw, actual)) {
          diffs.push(`${spec.table}/${id}.${col.column}: expected ${fmt(expectedRaw)}, stored ${fmt(actual)}`);
        }
        checked += 1;
      }
    }
  }
  return { checked, diffs };
}

/**
 * Compare one value, forgiving only representation.
 *
 * `objectid` is `char(24)`, which pads on read; `numeric` comes back as a string;
 * `timestamptz` as a Date. Those are storage artifacts. Everything else is
 * compared strictly -- a date that moved, a number that lost precision or a
 * string that changed is exactly what this is looking for.
 */
function sameValue(col, expected, actual) {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;

  switch (col.type) {
    case 'objectid': return String(actual).trim() === String(expected).trim();
    case 'numeric': return Number(actual) === Number(expected);
    case 'timestamptz': return new Date(actual).getTime() === new Date(expected).getTime();
    case 'boolean': return Boolean(actual) === Boolean(expected);
    case 'integer': return Number(actual) === Number(expected);
    default: return String(actual) === String(expected);
  }
}

const fmt = (v) => {
  if (v === null || v === undefined) return String(v);
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
};

/** Orphans present in the database, for comparison against the ETL's own report. */
async function liveOrphans(knex, scope, schema, resolveSchema) {
  const found = {};
  for (const t of manifest.tables.filter((x) => x.scope === scope)) {
    for (const fk of t.foreignKeys) {
      if (!fk.referencesTable) continue;
      const target = resolveSchema(fk.referencesScope);
      const { rows } = await knex.raw(`
        select count(*)::int as n from ${schema}.${t.table} c
        where c.${fk.column} is not null
          and not exists (select 1 from ${target}.${fk.referencesTable} p where p.id = c.${fk.column})
      `);
      if (rows[0].n > 0) found[`${t.table}.${fk.column}`] = rows[0].n;
    }
  }
  return found;
}

/** Every table's row count, for the before/after idempotency comparison. */
async function snapshot(knex, schema) {
  const { rows } = await knex.raw(
    "select table_name from information_schema.tables where table_schema = ? and table_type='BASE TABLE' order by 1",
    [schema]
  );
  const out = {};
  for (const r of rows) {
    const c = await knex.raw(`select count(*)::int as n from ${schema}.${r.table_name}`);
    out[r.table_name] = c.rows[0].n;
  }
  return out;
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  write('\nCP-4 — ETL correctness\n');
  write('-'.repeat(64) + '\n\n');

  const slug = flag('slug', 'jathar-dental');
  const knex = pg();
  let client = null;
  let tenantClient = null;

  try {
    if (!fs.existsSync(REPORT)) {
      record(false, 'an ETL run report exists', 'run `node sql/etl/load.js --all` first');
      throw new Error('no report');
    }
    const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    record(!report.dryRun, 'the last ETL run wrote data', report.dryRun ? 'last run was --dry-run' : null);

    client = new MongoClient(config.mongo.uri, { readPreference: config.mongo.readPreference });
    await client.connect();

    /* Platform */
    const pParity = await countParity(knex, client.db(), 'platform', PLATFORM_SCHEMA);
    record(
      pParity.mismatches.length === 0,
      `platform row counts match across ${pParity.compared} collections`,
      pParity.mismatches.length ? pParity.mismatches.join('; ') : `${pParity.rows} rows`
    );

    const pSpot = await spotValues(knex, client.db(), 'platform', PLATFORM_SCHEMA);
    record(
      pSpot.diffs.length === 0,
      `platform spot values match (${pSpot.checked} field comparisons)`,
      pSpot.diffs.length ? `${pSpot.diffs.length}: ${pSpot.diffs.slice(0, 3).join('; ')}` : null
    );

    /* Tenant */
    const clinic = await client.db().collection('clinics').findOne({ slug }, { projection: { slug: 1, dbUri: 1 } });
    if (!clinic || !clinic.dbUri) {
      record(false, `clinic ${slug} is available to verify`, 'no clinic record or no dbUri');
    } else {
      const schema = schemaFor(clinic.slug);
      tenantClient = new MongoClient(clinic.dbUri, { readPreference: config.mongo.readPreference });
      await tenantClient.connect();
      const tdb = tenantClient.db();

      const tParity = await countParity(knex, tdb, 'tenant', schema);
      record(
        tParity.mismatches.length === 0,
        `${slug} row counts match across ${tParity.compared} collections`,
        tParity.mismatches.length ? tParity.mismatches.join('; ') : `${tParity.rows} rows`
      );

      const tSpot = await spotValues(knex, tdb, 'tenant', schema);
      record(
        tSpot.diffs.length === 0,
        `${slug} spot values match (${tSpot.checked} field comparisons)`,
        tSpot.diffs.length ? `${tSpot.diffs.length}: ${tSpot.diffs.slice(0, 3).join('; ')}` : null
      );

      /**
       * Child-table parity is checked separately: a promoted array's rows are not
       * counted by its parent's collection count, so a child table that loaded
       * nothing would leave every other assertion green.
       */
      const childDiffs = [];
      for (const t of manifest.tables.filter((x) => x.scope === 'tenant')) {
        for (const child of t.childTables) {
          const [{ n: expected }] = (await tdb.collection(t.collection).aggregate([
            { $project: { n: { $size: { $ifNull: [`$${child.mongoPath}`, []] } } } },
            { $group: { _id: null, n: { $sum: '$n' } } },
          ]).toArray()).concat([{ n: 0 }]);
          const { rows } = await knex.raw(`select count(*)::int as n from ${schema}.${child.table}`);
          if (expected !== rows[0].n) childDiffs.push(`${child.table}: mongo ${expected} vs pg ${rows[0].n}`);
        }
      }
      record(childDiffs.length === 0, 'promoted array rows match their source arrays', childDiffs.join('; ') || null);

      /* Orphans reported, not hidden */
      const live = await liveOrphans(knex, 'tenant', schema, (s) => (s === 'platform' ? PLATFORM_SCHEMA : schema));
      const run = report.runs.find((r) => r.slug === slug);
      const reported = new Set((run ? run.orphans : []).map((o) => `${o.table}.${o.column}`));
      const unreported = Object.keys(live).filter((k) => !reported.has(k));
      record(
        unreported.length === 0,
        `every orphan in the data appears in the ETL report (${Object.keys(live).length} class(es))`,
        unreported.length
          ? `UNREPORTED: ${unreported.map((k) => `${k} (${live[k]} rows)`).join('; ')}`
          : Object.entries(live).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'
      );

      /**
       * Idempotency, proven rather than asserted: run the real loader again and
       * compare every row count.
       */
      const before = await snapshot(knex, schema);
      const rerun = spawnSync('node', ['sql/etl/load.js', `--slug=${slug}`], {
        cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 600_000,
      });
      const after = await snapshot(knex, schema);

      const drift = Object.keys(before).filter((t) => before[t] !== after[t])
        .map((t) => `${t}: ${before[t]} -> ${after[t]}`);
      record(
        rerun.status === 0 && drift.length === 0,
        're-running the ETL changes no row count (idempotent)',
        drift.length ? drift.slice(0, 5).join('; ') : `${Object.keys(before).length} tables unchanged`
      );
    }
  } catch (err) {
    if (err.message !== 'no report') record(false, 'gate execution', err.message);
  } finally {
    if (tenantClient) await tenantClient.close();
    if (client) await client.close();
    await knex.destroy();
  }

  const failed = results.filter((r) => !r.ok);
  write(`\n${'-'.repeat(64)}\n`);
  write(`${results.length - failed.length} of ${results.length} assertions passed\n`);
  write(failed.length ? 'CP-4 FAILED\n\n' : 'CP-4 PASSED — the data migrated faithfully and the load is re-runnable.\n\n');
  process.exit(failed.length ? 1 : 0);
})();
