#!/usr/bin/env node
'use strict';

/**
 * CP-0 — Environment gate.
 *
 * The first checkpoint, and the only one whose main job is to say "no".
 *
 * It answers three questions before any migration work is allowed to start:
 *   1. Is PostgreSQL installed, reachable and new enough?
 *   2. Are we pointed at a development database rather than a production one?
 *   3. Does the existing MongoDB application still work?
 *
 * Exit 0 = safe to proceed. Exit 1 = stop; the output says what to fix.
 *
 * Run:  node scripts/sql/check-env.js
 */

const { postgres, mongo, hostOf, isLocalHost, looksLikeProduction, redact } = require('../../sql/config');

const MIN_PG_MAJOR = 14;

const results = [];
let failed = false;

/** Record a check result. `fix` is printed only when the check does not pass. */
function record(name, status, detail, fix) {
  results.push({ name, status, detail, fix });
  if (status === 'FAIL') failed = true;
}

const ICON = { PASS: '✓', WARN: '!', FAIL: '✗' };

/**
 * Extract a usable message from an error.
 *
 * Node 18+ attempts IPv6 and IPv4 in parallel when resolving localhost, and on
 * failure throws an AggregateError whose own `.message` is an empty string —
 * so the naive `err.message` renders a blank line. Fall back to the first
 * inner error, which carries the real cause.
 */
function messageOf(err) {
  if (err.message) return err.message;
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const causes = [...new Set(err.errors.map((e) => e.message).filter(Boolean))];
    if (causes.length > 0) return causes.join('; ');
  }
  return String(err.code || err.name || 'connection failed');
}

// ── 1. Node runtime ────────────────────────────────────────────
function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) {
    record('Node runtime', 'PASS', `v${process.versions.node}`);
  } else {
    record('Node runtime', 'FAIL', `v${process.versions.node}`, 'Node 18 or newer is required (see package.json engines).');
  }
}

// ── 2. Required packages ───────────────────────────────────────
function checkPackages() {
  const missing = [];
  for (const pkg of ['pg', 'knex']) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length === 0) {
    record('SQL packages', 'PASS', 'pg, knex installed');
    return true;
  }
  record('SQL packages', 'FAIL', `missing: ${missing.join(', ')}`, 'Run:  npm install');
  return false;
}

// ── 3. Postgres target is not production ───────────────────────
function checkPostgresTargetSafety() {
  const { host, database, allowRemote } = postgres;

  if (isLocalHost(host)) {
    record('Postgres target', 'PASS', `${host}:${postgres.port}/${database} (local)`);
    return;
  }

  if (!allowRemote) {
    record(
      'Postgres target',
      'FAIL',
      `${host} is not a local host`,
      'This tooling creates, drops and migrates schemas. Pointing it at a shared host by accident\n' +
        '    is exactly the failure it exists to prevent. If the target is genuinely correct, set\n' +
        '    SQL_ALLOW_REMOTE=true in .env to confirm you meant it.',
    );
    return;
  }

  if (/prod/i.test(database) || /prod/i.test(host)) {
    record(
      'Postgres target',
      'FAIL',
      `${host}/${database} looks like production`,
      'Refusing to run migration tooling against a target named "prod". Rename the target or use a\n' +
        '    dedicated migration host.',
    );
    return;
  }

  record('Postgres target', 'WARN', `${host}:${postgres.port}/${database} (remote, explicitly allowed)`);
}

// ── 4. Postgres reachable and new enough ───────────────────────
async function checkPostgresConnection() {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    record('Postgres server', 'FAIL', 'cannot check — pg package not installed', 'Run:  npm install');
    return;
  }

  const client = new Client({
    host: postgres.host,
    port: postgres.port,
    user: postgres.user,
    password: postgres.password,
    database: 'postgres', // connect to the always-present maintenance DB
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const { rows } = await client.query('SHOW server_version');
    const version = rows[0].server_version;
    const major = Number(String(version).split('.')[0]);

    if (major >= MIN_PG_MAJOR) {
      record('Postgres server', 'PASS', `v${version} reachable`);
    } else {
      record(
        'Postgres server',
        'FAIL',
        `v${version} is too old`,
        `PostgreSQL ${MIN_PG_MAJOR}+ is required. We rely on features that behave differently on older\n` +
          '    versions, and validating against one version while deploying another defeats the purpose.',
      );
    }

    // Does the target database exist yet? Not fatal — the migration creates it.
    const { rows: dbs } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [postgres.database]);
    if (dbs.length > 0) {
      record('Target database', 'PASS', `"${postgres.database}" exists`);
    } else {
      record('Target database', 'WARN', `"${postgres.database}" does not exist yet`, `Create it with:  createdb ${postgres.database}\n    (or it will be created by the first migration run)`);
    }
  } catch (err) {
    record(
      'Postgres server',
      'FAIL',
      messageOf(err),
      'PostgreSQL does not appear to be installed or running.\n' +
        '    Install it (this also installs pgAdmin 4 for browsing data):\n' +
        '        winget install PostgreSQL.PostgreSQL.17\n' +
        '    Then set PG_PASSWORD in .env to the password chosen during installation.',
    );
  } finally {
    await client.end().catch(() => {});
  }
}

// ── 5. Mongo source — reachable, and read-only by policy ───────
async function checkMongoSource() {
  if (!mongo.uri) {
    record('Mongo source', 'FAIL', 'no source URI', 'Set PLATFORM_DB_URI (or SQL_SOURCE_MONGO_URI) in .env');
    return;
  }

  const host = hostOf(mongo.uri);

  if (looksLikeProduction(mongo.uri) && !mongo.allowProductionRead) {
    record(
      'Mongo source',
      'FAIL',
      `${host} looks like a live cluster`,
      'Profiling scans every collection. Against a cluster serving 19 clinics that is real load.\n' +
        '    Preferred: restore a snapshot and point SQL_SOURCE_MONGO_URI at it.\n' +
        `    Accepted:  set SQL_ALLOW_PRODUCTION_READ=true — reads then go to ${mongo.readPreference},\n` +
        '               never the primary. All tooling here is read-only; this guard controls load, not safety.',
    );
    return;
  }

  let mongoose;
  try {
    mongoose = require('mongoose');
  } catch {
    record('Mongo source', 'FAIL', 'mongoose not installed', 'Run:  npm install');
    return;
  }

  const conn = await mongoose
    .createConnection(mongo.uri, {
      serverSelectionTimeoutMS: 8000,
      readPreference: mongo.readPreference,
    })
    .asPromise()
    .catch((err) => err);

  if (conn instanceof Error) {
    record('Mongo source', 'FAIL', messageOf(conn), `Check the connection string and network access for ${host}`);
    return;
  }

  const clinics = await conn.db.collection('clinics').countDocuments().catch(() => null);
  const label = looksLikeProduction(mongo.uri) ? 'LIVE cluster, read-only' : 'local';
  record(
    'Mongo source',
    looksLikeProduction(mongo.uri) ? 'WARN' : 'PASS',
    `${redact(mongo.uri)} (${label})${clinics === null ? '' : ` — ${clinics} clinics`}`,
  );

  await conn.close().catch(() => {});
}

// ── Report ─────────────────────────────────────────────────────
function report() {
  const width = Math.max(...results.map((r) => r.name.length));

  process.stdout.write('\nCP-0 — Environment gate\n');
  process.stdout.write('─'.repeat(60) + '\n');

  for (const r of results) {
    process.stdout.write(`${ICON[r.status]} ${r.name.padEnd(width)}  ${r.detail}\n`);
  }

  const fixes = results.filter((r) => r.status !== 'PASS' && r.fix);
  if (fixes.length > 0) {
    process.stdout.write('\nTo fix:\n');
    for (const r of fixes) {
      process.stdout.write(`\n  ${r.name}\n    ${r.fix}\n`);
    }
  }

  process.stdout.write('\n' + '─'.repeat(60) + '\n');
  process.stdout.write(failed ? 'CP-0 FAILED — do not proceed until the above is resolved.\n\n' : 'CP-0 PASSED — safe to proceed.\n\n');
}

(async function main() {
  checkNode();
  const havePackages = checkPackages();
  checkPostgresTargetSafety();
  if (havePackages) await checkPostgresConnection();
  await checkMongoSource();

  report();
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write(`\nCP-0 crashed: ${err.stack}\n`);
  process.exit(1);
});
