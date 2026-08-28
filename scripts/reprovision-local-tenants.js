'use strict';

/**
 * Re-point tenants whose database was created on localhost back onto the shared
 * Atlas cluster, so provisioning can be retried and they become real, deployable
 * tenants.
 *
 * Background
 * ----------
 * _generateDbUri() in tenant.service.js used to default to `localhost:27017`
 * whenever TENANT_DB_HOST was unset, which is every Atlas deployment. Clinics
 * onboarded through the product were therefore assigned an unreachable database
 * address and stalled at the `creating_db` provisioning step.
 *
 * If a mongod later happened to be running on the developer's machine, those
 * databases got created *locally*. Such clinics look populated on that laptop
 * and are completely absent on any real server — the most confusing possible
 * failure mode. This script clears that bad address so the (now fixed)
 * generator produces a correct Atlas URI on retry.
 *
 * What it does
 * ------------
 *   1. Finds clinics whose stored dbUri points at localhost/127.0.0.1.
 *   2. Checks there is enough Atlas collection quota to hold them.
 *   3. Unsets the bad dbUri and resets ProvisioningStatus so the retry path in
 *      registration.service.js will run provisioning again from the start.
 *
 * It does NOT copy data. Those local databases contain no real records (all 9
 * observed had 0 users / 0 patients / 0 appointments) — they are empty shells
 * created by index building, not actual clinic data. Verify before running if
 * your situation differs.
 *
 * Usage
 *   node scripts/reprovision-local-tenants.js --dry-run          # preview
 *   node scripts/reprovision-local-tenants.js --dry-run <slug>   # preview one
 *   node scripts/reprovision-local-tenants.js <slug>             # apply to one
 *   node scripts/reprovision-local-tenants.js                    # apply to all
 *   node scripts/reprovision-local-tenants.js --skip-capacity-check
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_CAPACITY = args.includes('--skip-capacity-check');
const SLUG = args.find((a) => !a.startsWith('--'));

/** Collections a tenant occupies once its models have been registered. */
const COLLECTIONS_PER_TENANT = 50;
/** Shared Atlas tiers (M0/M2/M5) cap the cluster at 500 collections. */
const SHARED_TIER_COLLECTION_LIMIT = 500;

const isLocal = (uri) => /localhost|127\.0\.0\.1/.test(uri || '');

async function countClusterCollections() {
  const { databases } = await mongoose.connection.db.admin().listDatabases();
  let total = 0;
  for (const d of databases) {
    if (['admin', 'local', 'config'].includes(d.name)) continue;
    const c = mongoose.connection.useDb(d.name, { useCache: false });
    total += (await c.db.listCollections().toArray()).length;
  }
  return total;
}

async function main() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  require('../src/models/platform/ProvisioningStatus');
  const Clinic = mongoose.model('Clinic');
  const Prov = mongoose.model('ProvisioningStatus');

  const query = SLUG ? { slug: SLUG } : {};
  const all = await Clinic.find(query).select('+dbUri slug name status').lean();
  const targets = all.filter((c) => isLocal(c.dbUri));

  if (!targets.length) {
    console.log(SLUG
      ? `Tenant "${SLUG}" does not have a local dbUri — nothing to do.`
      : 'No tenants with local dbUri found — nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Tenants pointing at a local database: ${targets.length}`);
  targets.forEach((c) => console.log(`   ${c.slug.padEnd(28)} ${c.status}`));

  // ── Capacity guard ─────────────────────────────────────────────────────────
  const current = await countClusterCollections();
  const projected = current + targets.length * COLLECTIONS_PER_TENANT;
  console.log(`\nAtlas collections : ${current} / ${SHARED_TIER_COLLECTION_LIMIT}`);
  console.log(`After re-provision: ${projected} (each tenant costs ~${COLLECTIONS_PER_TENANT})`);

  if (projected > SHARED_TIER_COLLECTION_LIMIT && !SKIP_CAPACITY) {
    console.error(`
╭──────────────────────────────────────────────────────────────────────╮
│ ABORTED — not enough collection quota.                                │
│                                                                      │
│ Re-provisioning these tenants needs ${String(projected).padEnd(4)} collections but a shared  │
│ Atlas tier allows ${String(SHARED_TIER_COLLECTION_LIMIT).padEnd(4)}. Provisioning would fail again, this      │
│ time while creating collections instead of connecting.               │
│                                                                      │
│ Options:                                                             │
│   • Upgrade the cluster to M10+ (≈10,000 collection limit)            │
│   • Delete tenants you do not need, then re-run                      │
│   • Re-run with --skip-capacity-check if you know better              │
╰──────────────────────────────────────────────────────────────────────╯`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  const record = [];
  for (const c of targets) {
    record.push({ slug: c.slug, previousDbUri: c.dbUri, status: c.status });
    console.log(`\n[${c.slug}]`);
    console.log(`   clearing dbUri : ${c.dbUri}`);
    console.log(`   resetting provisioning status so retry starts from the beginning`);
    if (!DRY_RUN) {
      await Clinic.updateOne({ _id: c._id }, { $unset: { dbUri: '' }, $set: { status: 'pending' } });
      await Prov.deleteMany({ clinic: c._id });
    }
  }

  const dir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `reprovision-${stamp}${DRY_RUN ? '-dryrun' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log(`\nPrevious values saved to: ${file}`);
  console.log(DRY_RUN
    ? 'DRY RUN — nothing was changed.'
    : `Done. ${targets.length} tenant(s) reset. Trigger provisioning again from the platform admin, then confirm all five steps complete.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
