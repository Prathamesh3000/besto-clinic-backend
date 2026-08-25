#!/usr/bin/env node
'use strict';

/**
 * CP-5 — Timezone gate.
 *
 * Asserts that an appointment's wall-clock display is byte-identical before and
 * after the migration.
 *
 * Why this gate exists
 * -------------------
 * `scheduledAt` does not store an instant. It stores a clinic wall-clock time
 * wearing a UTC label: slotGenerator.js builds it as
 *
 *     new Date(`${date}T${hh}:${mm}:00.000Z`)     // slotGenerator.js:25
 *
 * from a doctor's schedule written in IST. So "2026-06-12T10:00:00.000Z" means
 * 10:00 IST, and the UI reads it back with getUTC*() accordingly
 * (website/src/utils/fakeUtcTime.js).
 *
 * A migration that treats the column as a real instant — `timestamptz`, or a
 * naive `new Date(value)` into one — moves every appointment in the system by
 * 5½ hours. Nothing crashes. Row counts match. Referential integrity holds.
 * CP-4 goes green. The only symptom is that every clinic's day is wrong, and it
 * would be discovered by a patient arriving at the wrong time.
 *
 * How it works
 * ------------
 *   1. `--baseline`  Sample appointments from MongoDB, render each through the
 *                    frontend's own helper, and write the rendered strings to
 *                    sql/baselines/timezone-<...>.json.
 *   2. (default)     Read the same rows back from PostgreSQL, render them the
 *                    same way, and fail on any difference.
 *
 * THE BASELINE MUST BE CAPTURED BEFORE THE DATA IS MIGRATED. It is a record of
 * what users see today; once the source is gone or converted it cannot be
 * reconstructed, and the gate degrades into comparing the new system with
 * itself.
 *
 * Run:
 *   node scripts/sql/verify-timezone.js --baseline    # pre-migration, once
 *   node scripts/sql/verify-timezone.js               # the gate
 *   node scripts/sql/verify-timezone.js --baseline --tenant=<slug> --sample=500
 */

const fs = require('fs');
const path = require('path');

const { mongo, redact } = require('../../sql/config');
const fakeUtc = require('../../sql/lib/fakeUtcTime');
const tenants = require('../../sql/lib/tenants');

// ── Options ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const options = {
  baseline: Boolean(flag('baseline', false)),
  tenantSlug: flag('tenant', null),
  sample: Number(flag('sample', 250)),
  baselineDir: path.resolve(__dirname, '../../sql/baselines'),
};

/**
 * Fields that carry the fake-UTC convention. Chat timestamps, createdAt and
 * notification times are REAL UTC and must not be listed here — including them
 * would assert the wrong thing and make the gate reject a correct migration.
 */
const FAKE_UTC_FIELDS = ['scheduledAt', 'originalScheduledAt'];

const BASELINE_FILE = path.join(options.baselineDir, 'timezone.json');

// ── Rendering ──────────────────────────────────────────────────

/**
 * Render one row's fake-UTC fields to display strings.
 *
 * `value` may arrive as a JS Date (Mongo), a Date (pg with `timestamp`), or a
 * string. All three are normalised to the ISO form the helper expects. A pg
 * `timestamp without time zone` comes back as a Date whose LOCAL components are
 * the stored wall clock, so it is re-encoded from local getters; a Mongo Date
 * is a true instant whose UTC components are the wall clock. Getting this
 * distinction wrong is precisely the bug being tested for, so both paths are
 * explicit rather than inferred.
 */
function renderRow(helpers, row, { pgLocalComponents = false } = {}) {
  const out = {};
  for (const field of FAKE_UTC_FIELDS) {
    const value = row[field] ?? row[field.toLowerCase()] ?? row[toSnake(field)];
    if (value === null || value === undefined) {
      out[field] = null;
      continue;
    }
    out[field] = helpers.displayDateTime(toIso(value, pgLocalComponents));
  }
  return out;
}

function toSnake(s) {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toIso(value, pgLocalComponents) {
  if (typeof value === 'string') return value;
  if (!(value instanceof Date)) return String(value);

  if (pgLocalComponents) {
    // `timestamp without time zone` → node-pg builds a Date in the process's
    // local zone whose local components are the stored wall clock. Re-label
    // those components as UTC so the helper reads them back unchanged.
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
      + `T${pad(value.getHours())}:${pad(value.getMinutes())}:00.000Z`;
  }

  return value.toISOString();
}

// ── Baseline capture (MongoDB) ─────────────────────────────────

async function captureBaseline(helpers) {
  process.stdout.write('\nCP-5 — capturing pre-migration baseline\n');
  process.stdout.write('─'.repeat(64) + '\n');
  process.stdout.write(`source: ${redact(mongo.uri)} (${mongo.readPreference})\n\n`);

  const platformConn = await tenants.connectPlatform();
  const entries = [];
  let unreachable = 0;

  try {
    const results = await tenants.forEachTenant(
      platformConn,
      async (conn, clinic) => {
        // Stable ordering so --baseline and the gate sample the same rows.
        const rows = await conn.db
          .collection('appointments')
          .find({ scheduledAt: { $ne: null } })
          .sort({ _id: 1 })
          .limit(options.sample)
          .toArray();

        for (const row of rows) {
          entries.push({
            clinic: clinic.slug,
            id: String(row._id),
            rendered: renderRow(helpers, row),
            // Kept for diagnosis only — never compared, since the whole point
            // is that the stored representation changes.
            rawScheduledAt: row.scheduledAt instanceof Date
              ? row.scheduledAt.toISOString()
              : String(row.scheduledAt),
          });
        }

        process.stdout.write(`  ${clinic.slug.padEnd(28)} ${String(rows.length).padStart(5)} appointments\n`);
        return rows.length;
      },
      {
        slug: options.tenantSlug,
        onError: (clinic, err) => {
          unreachable += 1;
          process.stdout.write(`  ${clinic.slug.padEnd(28)}   SKIPPED — ${err.message}\n`);
        },
      },
    );

    if (results.length === 0) {
      process.stderr.write('\nNo clinics found. Nothing to baseline.\n');
      return 1;
    }

    fs.mkdirSync(options.baselineDir, { recursive: true });
    const payload = {
      capturedAt: new Date().toISOString(),
      source: redact(mongo.uri),
      convention: 'fake-UTC — stored UTC components ARE the clinic wall clock (IST)',
      renderer: path.relative(path.resolve(__dirname, '../..'), fakeUtc.SOURCE).replace(/\\/g, '/'),
      fields: FAKE_UTC_FIELDS,
      samplePerClinic: options.sample,
      clinicsCaptured: results.filter((r) => !r.error).length,
      clinicsUnreachable: unreachable,
      entries,
    };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2));

    process.stdout.write('\n' + '─'.repeat(64) + '\n');
    process.stdout.write(`Baseline written: ${path.relative(process.cwd(), BASELINE_FILE)}\n`);
    process.stdout.write(`  ${entries.length} appointments across ${payload.clinicsCaptured} clinics\n`);
    if (unreachable > 0) {
      process.stdout.write(`  ${unreachable} clinic(s) unreachable — re-run to include them\n`);
    }
    process.stdout.write('\nCommit this file. It records what users see today and cannot be\n');
    process.stdout.write('reconstructed once the source data has been migrated.\n\n');
    return 0;
  } finally {
    await platformConn.close().catch(() => {});
  }
}

// ── The gate (PostgreSQL vs baseline) ──────────────────────────

async function verifyAgainstBaseline(helpers) {
  process.stdout.write('\nCP-5 — Timezone gate\n');
  process.stdout.write('─'.repeat(64) + '\n');

  if (!fs.existsSync(BASELINE_FILE)) {
    fail(
      'No baseline has been captured.',
      'Run this BEFORE migrating any appointment data:\n'
      + '      node scripts/sql/verify-timezone.js --baseline\n\n'
      + '  The baseline records the wall-clock time every appointment displays today.\n'
      + '  Captured after migration it would compare the new system against itself and\n'
      + '  pass while every appointment sat 5½ hours out.',
    );
    return 1;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  process.stdout.write(`baseline: ${baseline.entries.length} appointments, captured ${baseline.capturedAt}\n`);

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    fail('pg is not installed.', 'Run:  npm install');
    return 1;
  }

  const { postgres } = require('../../sql/config');
  const client = new Client({
    host: postgres.host,
    port: postgres.port,
    user: postgres.user,
    password: postgres.password,
    database: postgres.database,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
  } catch (err) {
    fail(`Cannot reach PostgreSQL at ${postgres.host}:${postgres.port}/${postgres.database}`, err.message);
    return 1;
  }

  try {
    // Has the appointment data landed yet?
    const { rows: probe } = await client.query(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_name = 'appointments'
        LIMIT 1`,
    );
    if (probe.length === 0) {
      fail(
        'No "appointments" table exists in PostgreSQL yet.',
        `The baseline is captured and safe (${baseline.entries.length} appointments).\n`
        + '  This gate stays red until the ETL has loaded appointment data — which is correct.\n'
        + '  It turns green the moment the migration preserves wall-clock display.',
      );
      return 1;
    }

    // Determine how the column was typed — this alone predicts the failure.
    const { rows: colInfo } = await client.query(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_name = 'appointments' AND column_name IN ('scheduled_at','scheduledat')
        LIMIT 1`,
    );
    const dataType = colInfo[0] ? colInfo[0].data_type : null;
    const isTimestamptz = dataType === 'timestamp with time zone';

    if (isTimestamptz) {
      process.stdout.write(
        '\n  ! scheduled_at is "timestamp with time zone".\n'
        + '    The stored value is a wall clock, not an instant, so this type will render it\n'
        + '    through the session timezone and shift it. Expect this gate to fail below;\n'
        + '    the fix is "timestamp without time zone".\n',
      );
    }

    const byClinic = new Map();
    for (const e of baseline.entries) {
      if (!byClinic.has(e.clinic)) byClinic.set(e.clinic, []);
      byClinic.get(e.clinic).push(e);
    }

    const mismatches = [];
    let compared = 0;
    let missing = 0;

    for (const [clinic, entries] of byClinic) {
      const ids = entries.map((e) => e.id);
      const { rows } = await client.query(
        `SELECT * FROM ${quoteIdent(clinic.replace(/-/g, '_'))}.appointments
          WHERE mongo_id = ANY($1::text[])`,
        [ids],
      ).catch(() => ({ rows: null }));

      if (rows === null) {
        process.stdout.write(`  ${clinic.padEnd(28)}   schema/table not found — skipped\n`);
        missing += entries.length;
        continue;
      }

      const found = new Map(rows.map((r) => [String(r.mongo_id), r]));
      for (const entry of entries) {
        const row = found.get(entry.id);
        if (!row) { missing += 1; continue; }
        compared += 1;

        const after = renderRow(helpers, row, { pgLocalComponents: !isTimestamptz });
        for (const field of FAKE_UTC_FIELDS) {
          if (entry.rendered[field] !== after[field]) {
            mismatches.push({ clinic, id: entry.id, field, before: entry.rendered[field], after: after[field] });
          }
        }
      }
      process.stdout.write(`  ${clinic.padEnd(28)} ${String(rows.length).padStart(5)} rows compared\n`);
    }

    return report({ compared, missing, mismatches, total: baseline.entries.length });
  } finally {
    await client.end().catch(() => {});
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function report({ compared, missing, mismatches, total }) {
  process.stdout.write('\n' + '─'.repeat(64) + '\n');
  process.stdout.write(`compared ${compared} of ${total} baselined appointments`);
  process.stdout.write(missing > 0 ? `, ${missing} not found in PostgreSQL\n` : '\n');

  if (mismatches.length === 0 && compared === 0) {
    fail('Nothing was compared.', 'No baselined appointment was found in PostgreSQL. A gate that\n  compares zero rows is not green — it is uninformed.');
    return 1;
  }

  if (mismatches.length > 0) {
    process.stdout.write(`\n${mismatches.length} MISMATCH(ES) — showing up to 10:\n\n`);
    for (const m of mismatches.slice(0, 10)) {
      process.stdout.write(`  ${m.clinic} / ${m.id} / ${m.field}\n`);
      process.stdout.write(`    before (Mongo): ${m.before}\n`);
      process.stdout.write(`    after  (SQL)  : ${m.after}\n`);
    }
    const shift = inferShift(mismatches[0]);
    if (shift) process.stdout.write(`\n  Consistent shift detected: ${shift}\n`);
    process.stdout.write('\nCP-5 FAILED — appointment times changed meaning across the migration.\n\n');
    return 1;
  }

  if (missing > 0) {
    process.stdout.write(`\nCP-5 FAILED — ${missing} baselined appointment(s) absent from PostgreSQL.\n`);
    process.stdout.write('Every appointment that existed must still exist. Re-run the ETL.\n\n');
    return 1;
  }

  process.stdout.write('\nCP-5 PASSED — every sampled appointment displays the same wall-clock time.\n\n');
  return 0;
}

/** Name the offset when the difference is a clean whole-minute shift. */
function inferShift(m) {
  const parse = (s) => {
    const match = /(\d+) (\w+) (\d+), (\d+):(\d+) (AM|PM)/.exec(s || '');
    if (!match) return null;
    const [, d, mon, y, hh, mm, ap] = match;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let h = Number(hh) % 12;
    if (ap === 'PM') h += 12;
    return Date.UTC(Number(y), months.indexOf(mon), Number(d), h, Number(mm));
  };
  const a = parse(m.before);
  const b = parse(m.after);
  if (a === null || b === null) return null;
  const mins = Math.round((b - a) / 60000);
  if (mins === 0) return null;
  const sign = mins > 0 ? '+' : '-';
  const abs = Math.abs(mins);
  return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m — the classic wall-clock-read-as-instant error`;
}

function fail(headline, detail) {
  process.stdout.write(`\n✗ ${headline}\n`);
  if (detail) process.stdout.write(`\n  ${detail}\n`);
  process.stdout.write('\n' + '─'.repeat(64) + '\n');
  process.stdout.write('CP-5 FAILED\n\n');
}

// ── Entry point ────────────────────────────────────────────────

(async function main() {
  const helpers = fakeUtc.load();
  const selfTestFailures = fakeUtc.selfTest(helpers);
  if (selfTestFailures.length > 0) {
    process.stderr.write('\nCP-5 cannot run — the time helper does not behave as the convention requires:\n');
    for (const f of selfTestFailures) process.stderr.write(`  ${f}\n`);
    process.stderr.write('\nEither the convention changed, or the helper is broken. Both need a human.\n\n');
    process.exit(1);
  }

  const code = options.baseline
    ? await captureBaseline(helpers)
    : await verifyAgainstBaseline(helpers);

  process.exit(code);
})().catch((err) => {
  process.stderr.write(`\nCP-5 crashed: ${err.stack}\n`);
  process.exit(1);
});
