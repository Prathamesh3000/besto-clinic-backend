'use strict';

/**
 * Reclaim MongoDB Atlas collection quota by dropping EMPTY tenant collections.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  READ THIS FIRST — this script does NOT hold on its own.               │
 * │                                                                          │
 * │ tenantConnectionManager registers all ~50 tenant models on every tenant  │
 * │ connection. Mongoose then recreates every dropped collection, because:   │
 * │   • autoCreate (default true) issues createCollection() on compile       │
 * │   • autoIndex  (default true) builds indexes, which also creates them    │
 * │                                                                          │
 * │ Measured on momcare-hospital (pruned to 8 collections, then 50 models    │
 * │ registered):                                                             │
 * │   default ................................. 8 -> 49   (+41)              │
 * │   autoIndex:false ......................... 8 -> 48   (+40)              │
 * │   autoCreate:false ........................ 8 -> 49   (+41)              │
 * │   autoIndex:false + autoCreate:false ...... 8 ->  8   (+0)               │
 * │                                                                          │
 * │ So a lasting reduction requires BOTH disabled on tenant connections —    │
 * │ and that is NOT currently safe: 27 tenant models depend on unique        │
 * │ indexes (Patient.patientId, Invoice.invoiceNumber,                       │
 * │ CreditNote.creditNoteNumber, CalendarFeed.token, …). With autoIndex off, │
 * │ those constraints are never created for lazily-created collections,      │
 * │ which permits duplicate invoice numbers and duplicate feed tokens.       │
 * │                                                                          │
 * │ Doing this properly means: autoCreate:false + autoIndex:false on tenant  │
 * │ connections, PLUS an explicit ensure-indexes step for every collection   │
 * │ that holds data. Until that exists, prefer upgrading the Atlas tier.     │
 * │                                                                          │
 * │ This script remains useful for a ONE-OFF reclaim (e.g. to get back under │
 * │ quota during an incident), knowing it will refill as tenants are used.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Why this exists
 * ---------------
 * seedDefaultData() used to eagerly create a collection (and its indexes) for
 * every one of the ~50 registered tenant models, whether or not the clinic ever
 * used that feature. Each tenant therefore cost ~52 collections and ~310
 * indexes up front. On a shared Atlas tier (500-collection limit) that caps the
 * platform at ~9 tenants and eventually makes provisioning fail.
 *
 * seedDefaultData() has been changed to create only the required collections.
 * This script cleans up the tenants that were provisioned under the old
 * behaviour.
 *
 * Safety
 * ------
 *   - Only drops collections with a document count of exactly 0.
 *   - Never drops a protected collection (see PROTECTED below), even if empty.
 *   - Dropping an empty collection is non-destructive: Mongoose recreates it,
 *     with its indexes, the first time the feature is used.
 *   - Writes a JSON record of everything dropped to scripts/backups/.
 *
 * Usage
 *   node scripts/prune-empty-tenant-collections.js --dry-run           # preview all tenants
 *   node scripts/prune-empty-tenant-collections.js <slug> --dry-run    # preview one
 *   node scripts/prune-empty-tenant-collections.js <slug>              # apply to one
 *   node scripts/prune-empty-tenant-collections.js                     # apply to all
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const INCLUDE_LOCAL = args.includes('--include-local');
const SLUG = args.find((a) => !a.startsWith('--'));

/**
 * Only databases on the shared Atlas cluster consume the collection quota, so
 * those are the only ones worth pruning. Some tenants have localhost URIs left
 * over from the provisioning bug; their collections live on whichever machine
 * happens to be running mongod and are irrelevant to cluster capacity. Skipped
 * unless --include-local is passed.
 */
function isRemote(uri) {
  return /mongodb\+srv|mongodb\.net/.test(uri || '');
}

/** Must always exist, even when empty — the app and SRS expect them. */
const PROTECTED_MODELS = [
  'User', 'Patient', 'Appointment', 'TreatmentRecord',
  'Invoice', 'IntegrationCredential', 'SyncLog', 'Role',
];

async function main() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const tenantSchemas = require('../src/models/tenant');
  // Map model name -> collection name without opening a tenant connection.
  const protectedCollections = new Set(
    PROTECTED_MODELS
      .filter((m) => tenantSchemas[m])
      .map((m) => mongoose.pluralize()(m.toLowerCase())),
  );

  const query = SLUG ? { slug: SLUG } : {};
  const clinics = await Clinic.find(query).select('+dbUri slug name status').lean();
  if (!clinics.length) {
    console.error(SLUG ? `Tenant "${SLUG}" not found` : 'No clinics found');
    process.exit(1);
  }

  console.log(`Found ${clinics.length} clinic(s)${DRY_RUN ? '  —  DRY RUN, nothing will be dropped' : ''}`);
  console.log(`Protected (never dropped): ${[...protectedCollections].sort().join(', ')}\n`);

  const record = {};
  let grandDropped = 0;
  let grandKept = 0;

  for (const c of clinics) {
    if (!c.dbUri) {
      console.log(`[${c.slug}] skipped — no dbUri`);
      continue;
    }
    if (!isRemote(c.dbUri) && !INCLUDE_LOCAL) {
      console.log(`[${c.slug.padEnd(28)}] skipped — local dbUri, does not use cluster quota`);
      continue;
    }
    let conn;
    try {
      conn = await mongoose.createConnection(c.dbUri, { serverSelectionTimeoutMS: 8000 }).asPromise();
    } catch (err) {
      console.log(`[${c.slug}] skipped — cannot connect: ${err.message.slice(0, 70)}`);
      continue;
    }

    const colls = await conn.db.listCollections().toArray();
    const dropped = [];
    let kept = 0;

    for (const col of colls) {
      const name = col.name;
      if (protectedCollections.has(name)) { kept++; continue; }
      let count;
      try {
        count = await conn.db.collection(name).countDocuments({}, { limit: 1 });
      } catch {
        kept++;
        continue;
      }
      if (count > 0) { kept++; continue; }

      dropped.push(name);
      if (!DRY_RUN) {
        try {
          await conn.db.collection(name).drop();
        } catch (err) {
          // 26 = NamespaceNotFound
          if (err.code !== 26) console.log(`   ! could not drop ${name}: ${err.message.slice(0, 60)}`);
        }
      }
    }

    record[c.slug] = dropped;
    grandDropped += dropped.length;
    grandKept += kept;
    console.log(
      `[${c.slug.padEnd(28)}] ${String(colls.length).padStart(3)} collections -> ` +
      `dropped ${String(dropped.length).padStart(3)}, kept ${String(kept).padStart(3)}` +
      (dropped.length && dropped.length <= 6 ? `  (${dropped.join(', ')})` : ''),
    );

    await conn.close();
  }

  const dir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `pruned-collections-${stamp}${DRY_RUN ? '-dryrun' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log(`\nRecord written to: ${file}`);
  console.log(`Total: ${grandDropped} collection(s) ${DRY_RUN ? 'would be' : ''} reclaimed, ${grandKept} kept.`);
  if (DRY_RUN) console.log('DRY RUN — nothing was dropped.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
