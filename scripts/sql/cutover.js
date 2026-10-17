'use strict';

/**
 * Cut one clinic over to PostgreSQL, or roll it back — Phase 7.
 *
 * > **Dual-run & cutover** — shadow reads against both databases, comparison
 * > harness, **per-clinic cutover, rehearsed rollback**
 *
 * Per-clinic is the point. Moving every clinic at once means a defect found
 * afterwards affects all of them, and the only remedy is a deploy. Moving one
 * means the blast radius is one clinic and the remedy is this script with
 * `--rollback`, which takes effect on the next request.
 *
 * ── What this does not do ─────────────────────────────
 *
 * It does not copy data. The ETL does that, and this refuses to run until the
 * ETL has, because pointing a clinic at an empty schema is not a cutover — it
 * is an outage that looks like data loss to whoever is using it.
 *
 * ── Rollback ──────────────────────────────────────────
 *
 * Reversible by design, with one caveat stated plainly: writes made while on
 * PostgreSQL stay in PostgreSQL. Rolling back returns reads to Mongo, which no
 * longer has them. That is why `--rollback` reports how many rows were written
 * after the cutover rather than reverting silently — the number is the size of
 * the problem, and it is better seen than discovered.
 *
 * Usage:
 *   node scripts/sql/cutover.js --slug=jathar-dental --entities=Department,Role
 *   node scripts/sql/cutover.js --slug=jathar-dental --status
 *   node scripts/sql/cutover.js --slug=jathar-dental --rollback --reason="..."
 *   node scripts/sql/cutover.js --list
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const knex = require('knex')(require('../../knexfile').platform);

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};

const SLUG = arg('slug');
const ENTITIES = arg('entities');
const ROLLBACK = arg('rollback');
const STATUS = arg('status');
const LIST = arg('list');
const REASON = arg('reason');
const FORCE = arg('force');

const { schemaFor } = require('../../sql/tenant/naming');

/** Mongoose model name → its manifest entry: scope, table, existence. */
function entry(modelName) {
  const manifest = require('../../sql/schema/manifest.json');
  return manifest.tables.find((x) => x.model === modelName) || null;
}

/**
 * Where an entity's rows live: one schema per clinic, or the shared `platform`.
 *
 * Platform-scoped entities cannot be cut over per clinic, and the script says so
 * rather than half-doing it. `Plan`, `Clinic` and `Subscription` are one set of
 * rows shared by every clinic; moving one clinic's reads to PostgreSQL while the
 * others still write to Mongo means the two stores diverge on data that is meant
 * to be common — the cut-over clinic stops seeing plans created after it moved.
 *
 * Those belong to the global `SQL_ENTITIES` switch, which moves everyone at once
 * because there is only one copy to move.
 */
function placement(modelName) {
  const t = entry(modelName);
  if (!t) return { ok: false, reason: 'no table in the schema manifest' };
  if (t.scope === 'platform') {
    return {
      ok: false,
      reason: 'platform-scoped — shared by every clinic, so it cannot be cut'
        + ' over for one; use SQL_ENTITIES',
    };
  }
  return { ok: true, table: t.table };
}

/**
 * Refuse to cut over an entity whose table has fewer rows than Mongo.
 *
 * The failure this prevents is the expensive one: a clinic pointed at a schema
 * the ETL has not filled, where every list comes back empty and the staff
 * conclude their records are gone.
 */
async function readiness(slug, entities, conn) {
  const schema = schemaFor(slug);
  const checks = [];

  for (const model of entities) {
    const place = placement(model);
    if (!place.ok) {
      checks.push({ model, ok: false, detail: place.reason });
      continue;
    }

    let mongoCount = null;
    try {
      mongoCount = await conn.model(model).countDocuments({});
    } catch {
      checks.push({ model, ok: false, detail: 'model not registered on the tenant connection' });
      continue;
    }

    const { rows } = await knex.raw(
      `select count(*)::int as n from ${schema}.${place.table}`,
    ).catch(() => ({ rows: [{ n: -1 }] }));
    const pgCount = rows[0].n;

    if (pgCount < 0) {
      checks.push({ model, ok: false, detail: `${schema}.${place.table} does not exist` });
    } else if (pgCount < mongoCount) {
      checks.push({
        model, ok: false, mongoCount, pgCount,
        detail: `postgres has ${pgCount} of ${mongoCount} rows — run the ETL first`,
      });
    } else {
      checks.push({
        model, ok: true, mongoCount, pgCount,
        detail: `${pgCount} rows${pgCount > mongoCount ? ` (mongo has ${mongoCount})` : ''}`,
      });
    }
  }
  return checks;
}

/** Rows written to PostgreSQL since the cutover — what a rollback would strand. */
async function writtenSinceCutover(slug, entities, since) {
  if (!since) return [];
  const schema = schemaFor(slug);
  const out = [];
  for (const model of entities) {
    const place = placement(model);
    if (!place.ok) continue;
    try {
      const { rows } = await knex.raw(
        `select count(*)::int as n from ${schema}.${place.table} where created_at > ?`, [since],
      );
      if (rows[0].n > 0) out.push({ model, rows: rows[0].n });
    } catch {
      // table may have no created_at; not every one does
    }
  }
  return out;
}

async function main() {
  const env = require('../../src/config/env');
  const { connectRedis } = require('../../src/config/redis');
  await mongoose.connect(env.PLATFORM_DB_URI);
  await connectRedis();
  require('../../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const { clearCutoverCache } = require('../../src/db/repository/cutover');

  if (LIST) {
    const clinics = await Clinic.find({ deletedAt: null })
      .select('slug name migration').lean();
    process.stdout.write('\nCutover state\n');
    process.stdout.write('─'.repeat(72) + '\n');
    clinics.forEach((c) => {
      const e = c.migration?.sqlEntities || [];
      const when = c.migration?.cutoverAt
        ? new Date(c.migration.cutoverAt).toISOString().slice(0, 10) : '';
      const back = c.migration?.rolledBackAt
        ? ` (rolled back ${new Date(c.migration.rolledBackAt).toISOString().slice(0, 10)})` : '';
      process.stdout.write(
        `  ${c.slug.padEnd(24)} ${e.length ? `${e.length} entit${e.length === 1 ? 'y' : 'ies'} on SQL` : 'all on Mongo'}`
        + `${when ? `  since ${when}` : ''}${back}\n`,
      );
      if (e.length) process.stdout.write(`  ${''.padEnd(24)} ${e.join(', ')}\n`);
    });
    process.stdout.write('\n');
    return 0;
  }

  if (!SLUG) {
    process.stderr.write('\nPass --slug=<clinic>, or --list.\n\n');
    return 1;
  }

  const clinic = await Clinic.findOne({ slug: SLUG, deletedAt: null });
  if (!clinic) {
    process.stderr.write(`\nNo clinic with slug "${SLUG}".\n\n`);
    return 1;
  }

  const current = clinic.migration?.sqlEntities || [];

  if (STATUS) {
    process.stdout.write(`\n${clinic.name}\n`);
    process.stdout.write('─'.repeat(72) + '\n');
    process.stdout.write(`  reading from PostgreSQL : ${current.length ? current.join(', ') : 'nothing'}\n`);
    process.stdout.write(`  cut over at             : ${clinic.migration?.cutoverAt || 'never'}\n`);
    process.stdout.write(`  rolled back at          : ${clinic.migration?.rolledBackAt || 'never'}\n`);
    if (clinic.migration?.rollbackReason) {
      process.stdout.write(`  rollback reason         : ${clinic.migration.rollbackReason}\n`);
    }
    process.stdout.write('\n');
    return 0;
  }

  if (ROLLBACK) {
    if (!current.length) {
      process.stdout.write(`\n${SLUG} is already reading everything from Mongo. Nothing to roll back.\n\n`);
      return 0;
    }

    const stranded = await writtenSinceCutover(SLUG, current, clinic.migration?.cutoverAt);

    process.stdout.write(`\nRolling ${SLUG} back to MongoDB\n`);
    process.stdout.write('─'.repeat(72) + '\n');
    process.stdout.write(`  was reading from SQL: ${current.join(', ')}\n`);

    if (stranded.length) {
      const total = stranded.reduce((n, s) => n + s.rows, 0);
      process.stdout.write(`\n  ${total} row(s) were written to PostgreSQL since the cutover:\n`);
      stranded.forEach((s) => process.stdout.write(`    ${s.model.padEnd(24)} ${s.rows}\n`));
      process.stdout.write(
        '\n  Rolling back returns reads to MongoDB, which does not have them.\n'
        + '  They are not deleted — they stay in PostgreSQL — but the application\n'
        + '  will stop seeing them until they are migrated back.\n',
      );
      if (!FORCE) {
        process.stdout.write('\n  Refusing. Re-run with --force once that is understood.\n\n');
        return 1;
      }
      process.stdout.write('\n  --force given; proceeding.\n');
    }

    clinic.migration.sqlEntities = [];
    clinic.migration.rolledBackAt = new Date();
    clinic.migration.rollbackReason = typeof REASON === 'string' ? REASON : undefined;
    await clinic.save();
    await clearCutoverCache(SLUG);

    process.stdout.write('\n  Rolled back. Reads return to MongoDB on the next request.\n\n');
    return 0;
  }

  if (!ENTITIES || ENTITIES === true) {
    process.stderr.write('\nPass --entities=Model,Model to cut over, or --rollback / --status.\n\n');
    return 1;
  }

  const wanted = String(ENTITIES).split(',').map((e) => e.trim()).filter(Boolean);

  const { getTenantConnection, closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');
  const conn = await getTenantConnection(SLUG);

  process.stdout.write(`\nCutting ${clinic.name} over to PostgreSQL\n`);
  process.stdout.write('─'.repeat(72) + '\n');

  const checks = await readiness(SLUG, wanted, conn);
  checks.forEach((c) => process.stdout.write(
    `  ${c.ok ? 'ready ' : 'BLOCK '} ${c.model.padEnd(24)} ${c.detail}\n`,
  ));

  const incoherent = checks.filter((c) => !c.ok && c.detail.startsWith('platform-scoped'));
  if (incoherent.length) {
    process.stdout.write(
      '\n  Refusing, and --force will not help: a shared entity cut over for one\n'
      + '  clinic diverges from the clinics still on Mongo.\n\n',
    );
    await closeAllTenantConnections();
    return 1;
  }

  const blocked = checks.filter((c) => !c.ok);
  if (blocked.length && !FORCE) {
    process.stdout.write(
      `\n  ${blocked.length} entit${blocked.length === 1 ? 'y is' : 'ies are'} not ready. `
      + 'Refusing — a clinic pointed at an unfilled schema looks like data loss to\n'
      + '  the people using it. Run the ETL, or --force if you know better.\n\n',
    );
    await closeAllTenantConnections();
    return 1;
  }

  clinic.migration.sqlEntities = wanted;
  clinic.migration.cutoverAt = new Date();
  clinic.migration.rolledBackAt = null;
  clinic.migration.rollbackReason = undefined;
  clinic.migration.lastVerifiedAt = new Date();
  await clinic.save();
  await clearCutoverCache(SLUG);

  process.stdout.write(`\n  Cut over: ${wanted.join(', ')}\n`);
  process.stdout.write('  Takes effect on the next request.\n');
  process.stdout.write(`  Roll back with: node scripts/sql/cutover.js --slug=${SLUG} --rollback\n\n`);

  await closeAllTenantConnections();
  return 0;
}

main()
  .then(async (code) => {
    await mongoose.disconnect().catch(() => {});
    await require('../../src/config/redis').disconnectRedis().catch(() => {});
    await knex.destroy();
    process.exit(code);
  })
  .catch(async (err) => {
    process.stderr.write(`\nFAILED: ${err.message}\n\n`);
    await mongoose.disconnect().catch(() => {});
    await knex.destroy().catch(() => {});
    process.exit(1);
  });
