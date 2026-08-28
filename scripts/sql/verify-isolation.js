#!/usr/bin/env node
'use strict';

/**
 * CP-3 — Cross-tenant isolation.
 *
 * Tenant A's database role must not be able to read tenant B's schema, even with
 * a fully-qualified table name.
 *
 * PASSES ONLY ON `permission denied` (SQLSTATE 42501). An empty result set is a
 * FAILURE. That distinction is the entire value of this gate and the easiest
 * thing to get wrong when writing it: an empty result means the query was
 * *allowed* and merely found nothing, which is indistinguishable from a leak
 * against a clinic that happens to have no matching rows today. Every assertion
 * below checks the error code, never the row count.
 *
 * The gate also asserts the *positive* case — that the owner can read the same
 * table. Without it, a typo in a schema name would produce "permission denied"
 * for the wrong reason and the gate would pass while testing nothing.
 *
 * Scope, stated precisely. This is the guard tracker item C-01 never had, but it
 * would not have caught C-01: that was an *ordering* bug — six routers resolved
 * the tenant before authenticating, so `req.tenantSlug` became whatever the
 * caller put in the header, and the request was scoped correctly to the wrong
 * clinic. No storage layout prevents that; the router-order assertion does. What
 * per-tenant roles change is the blast radius of the *other* bug class — the
 * forgotten WHERE clause — and the failure mode when tenant identity is missing
 * entirely: a role without USAGE fails closed, a header-derived clinic_id fails
 * open.
 *
 * Run:  npm run sql:test:isolation
 */

const knexLib = require('knex');

const config = require('../../sql/config');
const ddl = require('../../sql/schema/ddl');
const { schemaFor, roleFor, passwordFor } = require('../../sql/tenant/naming');

/**
 * Two disposable clinics rather than the real ones.
 *
 * The gate must be runnable at any time without depending on which clinics have
 * been provisioned, and it must be able to *write* a row into each schema — an
 * isolation test against two empty tables cannot tell "permission denied" from
 * "nothing there", which is the exact confusion it exists to rule out.
 */
const A = 'isolation-probe-a';
const B = 'isolation-probe-b';

const PERMISSION_DENIED = '42501';
const UNDEFINED_TABLE = '42P01';

const write = (s) => process.stdout.write(s);
const results = [];

function record(ok, name, detail) {
  results.push({ ok, name, detail });
  write(`  ${ok ? 'pass' : 'FAIL'}  ${name}\n`);
  if (detail) write(`        ${detail}\n`);
}

function ownerKnex() {
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

function tenantKnex(slug) {
  return knexLib({
    client: 'pg',
    connection: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: roleFor(slug),
      password: passwordFor(slug, config.tenantRoleSecret),
    },
    pool: { min: 0, max: 2 },
  });
}

/** Build a probe schema with one table holding one row, plus its tenant role. */
async function setUp(owner, slug) {
  const schema = schemaFor(slug);
  const role = roleFor(slug);

  await owner.raw(`drop schema if exists ${ddl.ident(schema)} cascade;`);
  await owner.raw(`create schema ${ddl.ident(schema)};`);
  await owner.raw(`create table ${ddl.ident(schema)}.patients (id text primary key, name text);`);
  await owner.raw(`insert into ${ddl.ident(schema)}.patients values ('1', ${ddl.literal(`secret-of-${slug}`)});`);

  // The same statements provisioning uses, so this tests the real grant logic
  // rather than a simplified stand-in.
  for (const sql of ddl.createTenantRole(schema, role, passwordFor(slug, config.tenantRoleSecret))) {
    await owner.raw(sql);
  }
  return { schema, role };
}

async function tearDown(owner, slug) {
  const schema = schemaFor(slug);
  const role = roleFor(slug);
  for (const sql of ddl.dropTenantRole(schema, role)) {
    await owner.raw(sql).catch(() => { /* best effort */ });
  }
  await owner.raw(`drop schema if exists ${ddl.ident(schema)} cascade;`).catch(() => {});
}

(async function main() {
  if (!config.tenantRoleSecret) {
    process.stderr.write('\nSQL_TENANT_ROLE_SECRET is not set — tenant role passwords cannot be derived.\n\n');
    process.exit(1);
  }

  write('\nCP-3 — Cross-tenant isolation\n');
  write('-'.repeat(64) + '\n\n');

  const owner = ownerKnex();
  let aConn = null;

  try {
    const a = await setUp(owner, A);
    const b = await setUp(owner, B);
    write(`  probe schemas: ${a.schema} (role ${a.role}), ${b.schema} (role ${b.role})\n\n`);

    aConn = tenantKnex(A);

    /**
     * The positive control, first. If tenant A cannot read its *own* table then
     * every "permission denied" below proves nothing — the role would simply be
     * broken, and the gate would pass for the wrong reason.
     */
    try {
      const own = await aConn.raw(`select name from ${ddl.ident(a.schema)}.patients;`);
      record(
        own.rows.length === 1 && own.rows[0].name === `secret-of-${A}`,
        'tenant A can read its own schema (positive control)',
        `${own.rows.length} row(s)`
      );
    } catch (err) {
      record(false, 'tenant A can read its own schema (positive control)', `${err.code}: ${err.message}`);
    }

    /**
     * The assertion the gate exists for. Fully qualified, so the application's
     * idea of the current tenant is irrelevant — this is the server refusing.
     */
    try {
      const leak = await aConn.raw(`select name from ${ddl.ident(b.schema)}.patients;`);
      record(
        false,
        'tenant A is refused a fully-qualified read of tenant B',
        `LEAK: query was ALLOWED and returned ${leak.rows.length} row(s). `
        + 'An empty result would be equally a failure — the query must be refused, not merely fruitless.'
      );
    } catch (err) {
      record(
        err.code === PERMISSION_DENIED,
        'tenant A is refused a fully-qualified read of tenant B',
        err.code === PERMISSION_DENIED
          ? 'SQLSTATE 42501 insufficient_privilege'
          : `wrong failure mode — expected 42501, got ${err.code}: ${err.message}`
      );
    }

    // A refusal that only happens because the table is invisible is still a
    // refusal, but for a different reason. Writes must be refused too, or a
    // forgotten WHERE clause could still corrupt another clinic.
    for (const [label, sql] of [
      ['insert', `insert into ${ddl.ident(b.schema)}.patients values ('2','x');`],
      ['update', `update ${ddl.ident(b.schema)}.patients set name = 'x';`],
      ['delete', `delete from ${ddl.ident(b.schema)}.patients;`],
    ]) {
      try {
        await aConn.raw(sql);
        record(false, `tenant A is refused ${label} into tenant B`, 'LEAK: the write was allowed');
      } catch (err) {
        record(
          err.code === PERMISSION_DENIED || err.code === UNDEFINED_TABLE,
          `tenant A is refused ${label} into tenant B`,
          `${err.code}`
        );
      }
    }

    /**
     * Rule 3 of plan section 2.2. `search_path` is per-session state, and under
     * PgBouncer transaction pooling a connection is handed to the next request
     * mid-session. `SET LOCAL` scopes it to the transaction; plain `SET` does not,
     * and the leak it produces is a request served against the previous request's
     * tenant — silent, intermittent, and very hard to reproduce.
     *
     * Tested on the owner connection because it is the only role that can see
     * both schemas, which is what makes a leak observable at all.
     */
    await owner.transaction(async (trx) => {
      await trx.raw(`set local search_path to ${ddl.ident(schemaFor(B))};`);
      const inside = await trx.raw('show search_path;');
      record(
        inside.rows[0].search_path.includes(schemaFor(B)),
        'SET LOCAL search_path applies inside its transaction',
        inside.rows[0].search_path
      );
    });

    const after = await owner.raw('show search_path;');
    record(
      !after.rows[0].search_path.includes(schemaFor(B)),
      'SET LOCAL search_path does not survive the transaction',
      `after commit: ${after.rows[0].search_path}`
    );

    /**
     * If RLS is ever enabled, FORCE must be set: policies do not apply to the
     * table owner, and applications commonly connect as the owner — in which case
     * every policy is decorative. Asserted rather than left to code review.
     */
    const rls = await owner.raw(`
      select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relrowsecurity and not c.relforcerowsecurity
        and n.nspname not in ('pg_catalog','information_schema')
    `);
    record(
      rls.rows.length === 0,
      'no table has RLS enabled without FORCE',
      rls.rows.length === 0
        ? 'RLS not in use — schema-per-tenant relies on roles and GRANTs'
        : `${rls.rows.length} table(s) have RLS without FORCE, so the owner bypasses every policy`
    );
  } catch (err) {
    record(false, 'gate execution', `${err.code || ''} ${err.message}`);
  } finally {
    if (aConn) await aConn.destroy();
    await tearDown(owner, A);
    await tearDown(owner, B);
    await owner.destroy();
  }

  const failed = results.filter((r) => !r.ok);
  write(`\n${'-'.repeat(64)}\n`);
  write(`${results.length - failed.length} of ${results.length} assertions passed\n`);
  write(failed.length ? 'CP-3 FAILED\n\n' : 'CP-3 PASSED — cross-tenant reads are refused by the server.\n\n');
  process.exit(failed.length ? 1 : 0);
})();
