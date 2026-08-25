#!/usr/bin/env node
'use strict';

/**
 * Full-population orphaned-reference audit across every tenant.
 *
 * The CP-1 profiler samples. That is right for field-shape statistics, but
 * wrong for a decision about deleting financial records: it reported "106
 * distinct patient ids, all missing" from a 500-row window and the figure was
 * then extrapolated to all 2,191 rows. This tool measures the whole population
 * instead, and it does it for every clinic — because a fault present in one
 * tenant is a local data problem, while the same fault in all 27 is a write bug
 * in the application, and those two findings have opposite remedies.
 *
 * Read-only. Uses distinct() plus a single counting query per reference, so the
 * cost is proportional to distinct values rather than to document count.
 *
 * Run:
 *   node scripts/sql/audit-orphans.js                    # all tenants, known suspects
 *   node scripts/sql/audit-orphans.js --tenant=<slug>    # one tenant
 *   node scripts/sql/audit-orphans.js --limit=5          # first N tenants
 *   node scripts/sql/audit-orphans.js --oid-timestamps   # also date the missing ids
 */

const mongoose = require('mongoose');
const { mongo, redact, looksLikeProduction } = require('../../sql/config');

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const has = (n) => argv.includes(`--${n}`);

const options = {
  tenantSlug: flag('tenant', null),
  limit: Number(flag('limit', 0)) || null,
  oidTimestamps: has('oid-timestamps'),
};

/** References flagged by CP-1, plus their siblings on the same records. */
const TENANT_REFS = [
  { collection: 'patientledgers', field: 'patient', target: 'patients' },
  { collection: 'patientledgers', field: 'createdBy', target: 'users' },
  { collection: 'patientledgers', field: 'branch', target: 'branches' },
  { collection: 'chatmessages', field: 'session', target: 'videosessions' },
  { collection: 'emergencysessions', field: 'videoSession', target: 'videosessions' },
];

const PLATFORM_REFS = [
  { collection: 'subscriptions', field: 'clinic', target: 'clinics' },
  { collection: 'tenantauditlogs', field: 'clinic', target: 'clinics' },
];

/**
 * ObjectIds embed their creation time in the first 4 bytes.
 *
 * If a missing reference's id carries a plausible timestamp close to the row
 * that points at it, the target document was really created and later removed.
 * A randomly fabricated or mis-assigned id would not correlate.
 */
function oidTimestamp(id) {
  const hex = String(id).slice(0, 8);
  if (!/^[0-9a-f]{8}$/i.test(hex)) return null;
  return new Date(parseInt(hex, 16) * 1000);
}

/** Audit one reference across a whole collection — no sampling. */
async function auditRef(db, { collection, field, target }) {
  const exists = await db.listCollections({ name: collection }).hasNext();
  if (!exists) return null;

  const total = await db.collection(collection).countDocuments();
  if (total === 0) return { collection, field, target, total, distinct: 0, missing: 0, skipped: 'empty' };

  const withRef = await db.collection(collection).countDocuments({ [field]: { $ne: null } });
  if (withRef === 0) return { collection, field, target, total, distinct: 0, missing: 0, skipped: 'never set' };

  // distinct() returns unique values only — cheap relative to a full fetch.
  const ids = (await db.collection(collection).distinct(field, { [field]: { $ne: null } })).filter(Boolean);
  const found = await db.collection(target).countDocuments({ _id: { $in: ids } });
  const missing = ids.length - found;

  // How many ROWS are affected, not just how many ids — this is the number
  // that matters when deciding whether to delete records.
  let affectedRows = 0;
  if (missing > 0) {
    const foundIds = await db.collection(target).distinct('_id', { _id: { $in: ids } });
    const foundSet = new Set(foundIds.map(String));
    const missingIds = ids.filter((id) => !foundSet.has(String(id)));
    affectedRows = await db.collection(collection).countDocuments({ [field]: { $in: missingIds } });

    if (options.oidTimestamps && missingIds.length > 0) {
      const stamps = missingIds.map(oidTimestamp).filter(Boolean).sort((a, b) => a - b);
      const rows = await db.collection(collection)
        .find({ [field]: { $in: missingIds.slice(0, 50) } }, { projection: { createdAt: 1 } })
        .limit(50).toArray();
      const rowStamps = rows.map((r) => r.createdAt).filter(Boolean).sort((a, b) => a - b);

      return {
        collection, field, target, total, withRef,
        distinct: ids.length, missing, affectedRows,
        missingIdCreated: stamps.length ? { first: stamps[0], last: stamps[stamps.length - 1] } : null,
        referencingRowCreated: rowStamps.length ? { first: rowStamps[0], last: rowStamps[rowStamps.length - 1] } : null,
      };
    }
  }

  return { collection, field, target, total, withRef, distinct: ids.length, missing, affectedRows };
}

function pct(n, d) {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;
}

(async function main() {
  if (looksLikeProduction(mongo.uri) && !mongo.allowProductionRead) {
    process.stderr.write('Refusing to read a live cluster. See sql/README.md.\n');
    process.exit(1);
  }

  process.stdout.write(`\nOrphaned-reference audit (full population, read-only)\nSource: ${redact(mongo.uri)}\n`);

  const platform = await mongoose
    .createConnection(mongo.uri, { readPreference: mongo.readPreference, serverSelectionTimeoutMS: 10000 })
    .asPromise();

  // ── Platform ──
  process.stdout.write('\nPLATFORM\n');
  for (const ref of PLATFORM_REFS) {
    const r = await auditRef(platform.db, ref);
    if (!r) continue;
    process.stdout.write(
      `  ${`${r.collection}.${r.field}`.padEnd(32)} ${String(r.missing).padStart(4)}/${String(r.distinct).padEnd(5)} ids missing` +
      `  → ${String(r.affectedRows || 0).padStart(5)} of ${r.total} rows (${pct(r.affectedRows || 0, r.total)})\n`,
    );
  }

  // ── Tenants ──
  let clinics = await platform.db
    .collection('clinics')
    .find({ deletedAt: null }, { projection: { slug: 1, dbUri: 1, status: 1, isActive: 1, 'subscription.status': 1 } })
    .toArray();

  if (options.tenantSlug) clinics = clinics.filter((c) => c.slug === options.tenantSlug);
  if (options.limit) clinics = clinics.slice(0, options.limit);

  const summary = [];

  for (const clinic of clinics) {
    if (!clinic.dbUri) continue;

    let conn;
    try {
      conn = await mongoose
        .createConnection(clinic.dbUri, { readPreference: mongo.readPreference, serverSelectionTimeoutMS: 10000 })
        .asPromise();
    } catch (err) {
      process.stdout.write(`\n${clinic.slug} — UNREACHABLE: ${err.message}\n`);
      continue;
    }

    const flags = `status=${clinic.status} active=${clinic.isActive} sub=${clinic.subscription?.status}`;
    process.stdout.write(`\n${clinic.slug}  [${flags}]\n`);

    let printed = false;
    for (const ref of TENANT_REFS) {
      const r = await auditRef(conn.db, ref);
      if (!r || r.skipped) continue;
      printed = true;

      summary.push({ slug: clinic.slug, ...r });
      const marker = r.missing === 0 ? '✓' : (r.missing === r.distinct ? '✗ ALL' : '⚠');
      process.stdout.write(
        `  ${marker} ${`${r.collection}.${r.field}`.padEnd(30)} ` +
        `${String(r.missing).padStart(4)}/${String(r.distinct).padEnd(5)} ids missing` +
        `  → ${String(r.affectedRows || 0).padStart(5)} of ${r.total} rows (${pct(r.affectedRows || 0, r.total)})\n`,
      );

      if (r.missingIdCreated) {
        process.stdout.write(
          `      missing ids created : ${r.missingIdCreated.first.toISOString()} … ${r.missingIdCreated.last.toISOString()}\n` +
          `      referencing rows    : ${r.referencingRowCreated?.first?.toISOString?.() || '?'} … ${r.referencingRowCreated?.last?.toISOString?.() || '?'}\n`,
        );
      }
    }
    if (!printed) process.stdout.write('  (no rows in any audited collection)\n');

    await conn.close();
  }

  await platform.close();

  // ── Verdict ──
  process.stdout.write('\n' + '─'.repeat(72) + '\n');
  const byRef = new Map();
  for (const s of summary) {
    const key = `${s.collection}.${s.field}`;
    const e = byRef.get(key) || { clinicsWithData: 0, clinicsFullyOrphaned: 0, clinicsClean: 0, rows: 0 };
    e.clinicsWithData += 1;
    if (r0(s)) e.clinicsFullyOrphaned += 1;
    if (s.missing === 0) e.clinicsClean += 1;
    e.rows += s.affectedRows || 0;
    byRef.set(key, e);
  }
  function r0(s) { return s.distinct > 0 && s.missing === s.distinct; }

  process.stdout.write('Reference                        clinics  all-orphaned  clean  affected rows\n');
  for (const [key, e] of byRef) {
    process.stdout.write(
      `${key.padEnd(32)} ${String(e.clinicsWithData).padStart(7)} ${String(e.clinicsFullyOrphaned).padStart(13)} ${String(e.clinicsClean).padStart(6)} ${String(e.rows).padStart(14)}\n`,
    );
  }

  process.stdout.write('\nReading: "all-orphaned" in every clinic points to an application write bug.\n');
  process.stdout.write('         Isolated to one clinic points to local data damage — a cleanup, not a code fix.\n\n');
  process.exit(0);
})().catch((err) => {
  process.stderr.write(`\naudit-orphans crashed: ${err.stack}\n`);
  process.exit(1);
});
