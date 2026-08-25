#!/usr/bin/env node
'use strict';

/**
 * Create one clinic's PostgreSQL schema, run its migrations, and create the role
 * that is allowed to read it — Phase 0, deliverable 4.
 *
 * This is the loop that plan section 2.2 refers to when it says the per-schema
 * migration cost at 27 clinics is "a loop". It is idempotent: running it twice
 * creates nothing twice and re-grants what already exists, so it can be re-run
 * after a partial failure without a cleanup step.
 *
 * Usage:
 *   node sql/tenant/provision.js --slug=jathar-dental
 *   node sql/tenant/provision.js --all              # every clinic in the platform DB
 *   node sql/tenant/provision.js --slug=x --rollback
 *   node sql/tenant/provision.js --list
 */

const knexLib = require('knex');

const config = require('../config');
const knexfile = require('../../knexfile');
const ddl = require('../schema/ddl');
const manifest = require('../schema/manifest.json');
const { schemaFor, roleFor, passwordFor } = require('./naming');

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const ROLE_SECRET = config.tenantRoleSecret;

/* ── Clinic discovery ──────────────────────────────────────── */

/**
 * The clinic list comes from the platform MongoDB, which is still the system of
 * record during the migration. Reading it from PostgreSQL instead would only
 * work after the platform ETL has run, making the order of operations circular.
 */
async function listClinicSlugs() {
  const { MongoClient } = require('mongodb');
  if (!config.mongo.uri) throw new Error('No Mongo source configured — set SQL_SOURCE_MONGO_URI or PLATFORM_DB_URI.');

  const client = new MongoClient(config.mongo.uri, { readPreference: config.mongo.readPreference });
  await client.connect();
  try {
    const docs = await client.db().collection('clinics')
      .find({}, { projection: { slug: 1 } })
      .toArray();
    return docs.map((d) => d.slug).filter(Boolean);
  } finally {
    await client.close();
  }
}

/* ── Provisioning ──────────────────────────────────────────── */

function tenantKnex(schema) {
  const cfg = JSON.parse(JSON.stringify(knexfile.tenantTemplate));
  // The schema this clinic's tables go into.
  cfg.tenantSchema = schema;

  // Tracking stays in the shared `migrations` schema, one table per clinic, so
  // rolling one clinic back does not destroy the record of what the others applied.
  cfg.migrations.tableName = `tenant_${schema}`;

  // Knex resolves the migration directory relative to cwd; make it absolute so
  // provisioning works regardless of where the command was run from.
  cfg.migrations.directory = require('path').resolve(__dirname, '../migrations/tenant');
  return knexLib(cfg);
}

async function provision(slug) {
  const schema = schemaFor(slug);
  const role = roleFor(slug);
  const knex = tenantKnex(schema);

  try {
    // Knex writes its tracking table into `migrations.schemaName` before running
    // anything, and it creates no schemas itself. Both must exist first: the
    // shared tracking schema for Knex, and this clinic's schema for the migration.
    await knex.raw(`create schema if not exists ${ddl.ident(knexfile.MIGRATION_SCHEMA)};`);
    await knex.raw(`create schema if not exists ${ddl.ident(schema)};`);

    const [, applied] = await knex.migrate.latest();
    const migrationsRun = applied.length;

    /**
     * The role is created after the tables, not before.
     *
     * `GRANT ... ON ALL TABLES IN SCHEMA` applies to tables that exist at the
     * moment it runs. Creating the role first would grant it nothing and the
     * failure would appear later as a permission error on a working schema.
     * (The ALTER DEFAULT PRIVILEGES in ddl.js covers tables added afterwards.)
     */
    for (const sql of ddl.createTenantRole(schema, role, passwordFor(slug, ROLE_SECRET))) {
      await knex.raw(sql);
    }

    // F-4: withhold the columns holding plaintext credentials from the tenant role.
    for (const table of manifest.tables.filter((t) => t.scope === 'tenant')) {
      for (const sql of ddl.revokeSensitiveColumns(schema, table.table, table.columns, role)) {
        await knex.raw(sql);
      }
    }

    const { rows } = await knex.raw(
      'select count(*)::int as n from information_schema.tables where table_schema = ?',
      [schema]
    );

    return { slug, schema, role, migrationsRun, tables: rows[0].n };
  } finally {
    await knex.destroy();
  }
}

async function rollback(slug) {
  const schema = schemaFor(slug);
  const role = roleFor(slug);
  const knex = tenantKnex(schema);
  try {
    // Revoke before dropping the schema: a role still holding privileges on
    // objects cannot be dropped, and the error at that point is opaque.
    for (const sql of ddl.dropTenantRole(schema, role)) {
      await knex.raw(sql).catch(() => { /* already gone — rollback stays idempotent */ });
    }
    await knex.migrate.rollback(undefined, true);
    await knex.raw(`drop schema if exists ${ddl.ident(schema)} cascade;`);
    return { slug, schema, role };
  } finally {
    await knex.destroy();
  }
}

/* ── CLI ───────────────────────────────────────────────────── */

(async function main() {
  const write = (s) => process.stdout.write(s);

  try {
    if (flag('list')) {
      const slugs = await listClinicSlugs();
      write(`\n${slugs.length} clinics in the platform database\n${'-'.repeat(56)}\n`);
      for (const s of slugs) write(`  ${s.padEnd(28)} -> ${schemaFor(s).padEnd(24)} ${roleFor(s)}\n`);
      write('\n');
      return;
    }

    if (!ROLE_SECRET) {
      process.stderr.write(
        '\nSQL_TENANT_ROLE_SECRET is not set.\n\n'
        + '  Per-tenant role passwords are derived from it, so provisioning without one\n'
        + '  would either use a predictable password or a different password on every run.\n\n'
        + '  Add to .env:  SQL_TENANT_ROLE_SECRET=<a long random string>\n\n'
      );
      process.exit(1);
    }

    const slugs = flag('all')
      ? await listClinicSlugs()
      : [flag('slug')].filter(Boolean);

    if (!slugs.length) {
      process.stderr.write('\nNothing to do. Pass --slug=<clinic> or --all (or --list).\n\n');
      process.exit(1);
    }

    const doRollback = Boolean(flag('rollback'));
    write(`\n${doRollback ? 'Rolling back' : 'Provisioning'} ${slugs.length} clinic schema(s)\n`);
    write('-'.repeat(64) + '\n');

    const failures = [];
    for (const slug of slugs) {
      try {
        if (doRollback) {
          const r = await rollback(slug);
          write(`  dropped   ${r.slug.padEnd(26)} schema ${r.schema}\n`);
        } else {
          const r = await provision(slug);
          write(`  ok        ${r.slug.padEnd(26)} schema ${r.schema.padEnd(22)} ${r.tables} tables, role ${r.role}\n`);
        }
      } catch (err) {
        failures.push({ slug, error: err.message });
        write(`  FAILED    ${slug.padEnd(26)} ${err.message}\n`);
      }
    }

    write('-'.repeat(64) + '\n');
    write(`${slugs.length - failures.length} of ${slugs.length} succeeded\n\n`);
    process.exit(failures.length ? 1 : 0);
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    process.exit(1);
  }
})();
