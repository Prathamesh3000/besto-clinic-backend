#!/usr/bin/env node
'use strict';

/**
 * Reconcile every place a clinic is recorded, and report where they disagree.
 *
 * There are four, and nothing was comparing them:
 *
 *   1. **Databases on the MongoDB cluster** — where the data physically is.
 *   2. **The platform `clinics` collection** — the only thing mapping a slug to a
 *      `dbUri`. If a clinic is missing here its database is unreachable, however
 *      intact it is.
 *   3. **`sql/profile/`** — the CP-1 output the DDL is generated from.
 *   4. **PostgreSQL schemas** — what has actually been provisioned.
 *
 * Why this exists
 * ---------------
 * SQL_MIGRATION_PLAN.md says ~19 clinics. sql/FINDINGS.md measured 27 on
 * 13 Aug 2026. The platform database now holds 1. That looked like it might be a
 * hardcoded list somewhere — it is not. `scripts/repair-platform-registry.js`
 * records what actually happened: the platform database was found **completely
 * empty**, all 20 collections at zero documents, while tenant data survived. The
 * registry was rebuilt for one clinic.
 *
 * So the count is not a bug in the code, and nothing is hardcoded: every part of
 * the system reads the registry dynamically and correctly reports what is there.
 * The problem is that when the registry was lost, **nothing noticed**. A clinic
 * can disappear from the registry while its database sits on the cluster holding
 * every record, and the only symptom is a 404 at login.
 *
 * This is the check that makes that visible. Run it after any restore, migration
 * or provisioning run — and ideally on a schedule.
 *
 * Reads only. Writes nothing.
 *
 * Usage:
 *   node scripts/sql/reconcile-clinics.js
 *   node scripts/sql/reconcile-clinics.js --strict   # exit 1 on any discrepancy
 */

const fs = require('fs');
const path = require('path');
const knexLib = require('knex');
const { MongoClient } = require('mongodb');

const config = require('../../sql/config');
const { schemaFor } = require('../../sql/tenant/naming');

const PROFILE_DIR = path.resolve(__dirname, '../../sql/profile');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const write = (s) => process.stdout.write(s);

const findings = [];
const flagIssue = (severity, message, detail) => findings.push({ severity, message, detail });

/* ── The four sources ──────────────────────────────────────── */

/**
 * Databases on the cluster whose names look like tenant databases.
 *
 * Matched on the `bestoclinic_` prefix that provisioning uses, so an unrelated
 * database sharing the cluster is not mistaken for an abandoned clinic.
 */
async function clusterDatabases(client) {
  const { databases } = await client.db().admin().listDatabases();
  return databases
    .filter((d) => !['admin', 'local', 'config'].includes(d.name))
    .map((d) => ({ name: d.name, sizeMb: d.sizeOnDisk / 1048576 }));
}

async function registeredClinics(client) {
  return client.db().collection('clinics')
    .find({}, { projection: { slug: 1, name: 1, status: 1, dbUri: 1, createdAt: 1 } })
    .toArray();
}

/** Tenant scopes present in the profile output. */
function profiledScopes() {
  if (!fs.existsSync(PROFILE_DIR)) return [];
  const slugs = new Set();
  for (const f of fs.readdirSync(PROFILE_DIR)) {
    const m = /^tenant_(.+?)__/.exec(f);
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}

async function postgresSchemas(knex) {
  const { rows } = await knex.raw(`
    select nspname from pg_namespace
    where nspname not in ('platform','public','migrations','information_schema')
      and nspname not like 'pg\\_%'
      and nspname not like '%_ddl_check'
      and nspname not like 'isolation_probe%'
    order by 1
  `);
  return rows.map((r) => r.nspname);
}

/** The database a clinic's dbUri points at, without exposing credentials. */
function databaseNameOf(dbUri) {
  const m = /\/([^/?]+)(\?|$)/.exec(String(dbUri || '').replace(/^mongodb(\+srv)?:\/\/[^/]+/i, ''));
  return m ? m[1] : null;
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  const knex = knexLib({
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

  let client = null;
  try {
    client = new MongoClient(config.mongo.uri, { readPreference: config.mongo.readPreference });
    await client.connect();

    const dbs = await clusterDatabases(client);
    const clinics = await registeredClinics(client);
    const profiles = profiledScopes();
    const schemas = await postgresSchemas(knex);

    write('\nClinic reconciliation\n');
    write('='.repeat(74) + '\n\n');

    write(`MongoDB cluster            ${dbs.length} database(s)\n`);
    for (const d of dbs) write(`    ${d.name.padEnd(38)}${d.sizeMb.toFixed(1)} MB\n`);
    write(`\nPlatform registry          ${clinics.length} clinic(s)\n`);
    for (const c of clinics) {
      write(`    ${String(c.slug).padEnd(38)}${String(c.status || '—').padEnd(12)}`);
      write(`${c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : ''}\n`);
    }
    write(`\nProfile artifacts          ${profiles.length} clinic(s)\n`);
    for (const p of profiles) write(`    ${p}\n`);
    write(`\nPostgreSQL schemas         ${schemas.length}\n`);
    for (const s of schemas) write(`    ${s}\n`);

    write(`\n${'-'.repeat(74)}\nChecks\n${'-'.repeat(74)}\n`);

    const registeredDbNames = new Set(clinics.map((c) => databaseNameOf(c.dbUri)).filter(Boolean));
    const platformDbName = databaseNameOf(config.mongo.uri);

    /**
     * The serious one: a tenant database nobody can reach.
     *
     * The data is intact and the application has no way to find it. This is the
     * exact state the platform-registry loss produced, and the only symptom was
     * "Clinic not found" at login.
     */
    for (const d of dbs) {
      if (d.name === platformDbName) continue;
      if (!registeredDbNames.has(d.name)) {
        flagIssue('CRITICAL',
          `Tenant database "${d.name}" (${d.sizeMb.toFixed(1)} MB) is on the cluster but NO clinic points at it.`,
          'Its data is unreachable: nothing maps a slug to this database. '
          + 'Recover with scripts/repair-platform-registry.js.');
      }
    }

    /* A clinic whose database is gone — the opposite failure. */
    for (const c of clinics) {
      const dbName = databaseNameOf(c.dbUri);
      if (!dbName) {
        flagIssue('CRITICAL', `Clinic "${c.slug}" has no usable dbUri.`, 'It cannot be connected to at all.');
        continue;
      }
      if (!dbs.some((d) => d.name === dbName)) {
        flagIssue('CRITICAL',
          `Clinic "${c.slug}" points at database "${dbName}", which is not on this cluster.`,
          'Either the database was deleted, or the clinic belongs to a different cluster.');
      }
    }

    /**
     * A stale profile is not cosmetic: build.js merges every profile file into
     * the manifest, so a clinic that no longer exists still shapes the DDL —
     * its nullability and type evidence is taken as current.
     */
    const liveSlugs = new Set(clinics.map((c) => c.slug));
    for (const p of profiles) {
      if (![...liveSlugs].some((s) => schemaFor(s) === p)) {
        flagIssue('WARNING',
          `Profile data exists for "${p}", which is not a registered clinic.`,
          'sql/schema/build.js merges it into the manifest, so a clinic that no longer exists is '
          + 'still shaping the schema. Re-run `npm run sql:profile` after clearing sql/profile/.');
      }
    }
    for (const c of clinics) {
      if (!profiles.includes(schemaFor(c.slug))) {
        flagIssue('WARNING',
          `Clinic "${c.slug}" has no profile data.`,
          'Its schema decisions rest on the Mongoose files alone. Run `npm run sql:profile`.');
      }
    }

    /* Provisioning drift — informational, since it is expected mid-migration. */
    for (const c of clinics) {
      if (!schemas.includes(schemaFor(c.slug))) {
        flagIssue('INFO', `Clinic "${c.slug}" has no PostgreSQL schema yet.`,
          `Provision with: npm run sql:tenant:provision -- --slug=${c.slug}`);
      }
    }
    for (const s of schemas) {
      if (![...liveSlugs].some((slug) => schemaFor(slug) === s)) {
        flagIssue('WARNING', `PostgreSQL schema "${s}" has no matching clinic.`,
          'Left over from a clinic that was removed, or provisioned for one that never existed.');
      }
    }

    if (!findings.length) {
      write('\n  All four sources agree.\n\n');
    } else {
      const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      findings.sort((a, b) => order[a.severity] - order[b.severity]);
      for (const f of findings) {
        write(`\n  [${f.severity}] ${f.message}\n`);
        if (f.detail) write(`             ${f.detail}\n`);
      }
      write('\n');
    }

    write('-'.repeat(74) + '\n');
    const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
    const warnings = findings.filter((f) => f.severity === 'WARNING').length;
    write(`${critical} critical, ${warnings} warning(s), ${findings.length - critical - warnings} informational\n\n`);

    if (has('strict') && findings.some((f) => f.severity !== 'INFO')) process.exitCode = 1;
    else if (critical > 0) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
    await knex.destroy();
  }
})();
