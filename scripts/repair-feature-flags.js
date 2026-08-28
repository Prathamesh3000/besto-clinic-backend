'use strict';

/**
 * Recovery script — restore the platform `featureflags` collection.
 *
 * Background
 * ----------
 * The platform DB was found empty (see scripts/repair-platform-registry.js).
 * `featureflags` was one of the wiped collections, and its absence fails closed:
 *
 *   featureGuard('advancedReports')                    middleware/featureGuard.js:54
 *     -> featureFlagService.resolveFlag(key, slug)
 *          -> FeatureFlag.findOne({ key, isActive: true })   -> null
 *          -> `if (!flag) return false`                      services/featureFlag.service.js:44
 *     -> resolved === false -> 403 "Feature ... not available on your current plan"
 *
 * Every featureGuard-protected route therefore answers 403 for every role,
 * including super_admin — the guard never consults roles or permissions.
 *
 * Note this is a DIFFERENT mechanism from subscriptionGuard, which reads
 * `clinic.features` off the Clinic document. Setting clinic.features has no
 * effect on featureGuard; only FeatureFlag documents matter here.
 *
 * Design
 * ------
 * defaultValue is false for the paid gates, so a future clinic does not silently
 * inherit paid features. This clinic's access is granted through tenantOverrides,
 * mirroring the values already recorded on its Clinic.features block.
 *
 * Usage
 *   node scripts/repair-feature-flags.js --dry-run   # preview, writes nothing
 *   node scripts/repair-feature-flags.js             # apply
 *   node scripts/repair-feature-flags.js --slug=other-clinic
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Keep in sync with server.js — see repair-platform-registry.js for why.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const DRY_RUN = process.argv.includes('--dry-run');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const SLUG = slugArg ? slugArg.split('=')[1] : 'jathar-dental';

/**
 * The four keys featureGuard actually enforces today are marked (guarded).
 * The rest are seeded so the flag list is complete for any admin UI that calls
 * resolveAllFlags(), and so future guards have a definition to resolve.
 */
const FLAGS = [
  { key: 'advancedReports', name: 'Advanced Reports', category: 'core', guarded: true,
    description: 'Revenue, appointment, doctor and patient analytics endpoints.' },
  { key: 'teleHealthEnabled', name: 'Telemedicine', category: 'clinical', guarded: true,
    description: 'Video consultations and session chat.' },
  { key: 'customBranding', name: 'Custom Branding', category: 'ui', guarded: true,
    description: 'Clinic logo and branding overrides.' },
  { key: 'apiAccess', name: 'API Access', category: 'integration', guarded: true,
    description: 'Third-party integration endpoints.' },
  { key: 'smsEnabled', name: 'SMS Notifications', category: 'communication' },
  { key: 'prioritySupport', name: 'Priority Support', category: 'core' },
  { key: 'jobPortalEnabled', name: 'Job Portal', category: 'core' },
  { key: 'whiteLabeling', name: 'White Labeling', category: 'ui' },
];

async function main() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  console.log(`connected: ${mongoose.connection.db.databaseName}${DRY_RUN ? '  [DRY RUN — no writes]' : ''}`);

  require('../src/models/platform/Clinic');
  require('../src/models/platform/FeatureFlag');
  const Clinic = mongoose.model('Clinic');
  const FeatureFlag = mongoose.model('FeatureFlag');

  const clinic = await Clinic.findOne({ slug: SLUG, deletedAt: null }).lean();
  if (!clinic) throw new Error(`clinic "${SLUG}" not found — run repair-platform-registry.js first.`);

  // Source of truth for this tenant's entitlements is the Clinic.features block
  // written during the registry repair, so the two cannot disagree.
  const features = clinic.features || {};
  console.log(`\nclinic: ${clinic.name} (${SLUG})`);

  const rows = FLAGS.map((f) => ({
    ...f,
    tenantValue: features[f.key] === true,
  }));

  console.log('\nkey                  guarded  tenantOverride  default');
  console.log('─'.repeat(58));
  rows.forEach((r) => console.log(
    `${r.key.padEnd(20)} ${(r.guarded ? 'yes' : '-').padEnd(8)} ${String(r.tenantValue).padEnd(15)} false`,
  ));

  if (DRY_RUN) {
    console.log('\nDRY RUN — nothing written. Re-run without --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  const backupDir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(backupDir, `feature-flags-${stamp}.json`);
  fs.writeFileSync(snapshot, JSON.stringify({
    takenAt: new Date().toISOString(),
    before: await FeatureFlag.find({}).lean(),
  }, null, 2));
  console.log(`\nsnapshot written: ${snapshot}`);

  for (const r of rows) {
    // $set only the definition; tenantOverrides is set per-key so re-running for a
    // second clinic does not wipe the first clinic's entitlements.
    await FeatureFlag.findOneAndUpdate(
      { key: r.key },
      {
        $set: {
          name: r.name,
          description: r.description || r.name,
          valueType: 'boolean',
          defaultValue: false,
          category: r.category,
          isActive: true,
          [`tenantOverrides.${SLUG}`]: r.tenantValue,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    console.log(`  upserted ${r.key.padEnd(20)} ${SLUG} -> ${r.tenantValue}`);
  }

  console.log(`\nDone. ${rows.length} flags restored.`);
  console.log('\nNo cache flush needed — featureFlag.service.js returns the "missing flag"');
  console.log('false WITHOUT caching it (line 44 returns before the redis.set on line 49),');
  console.log('so the next request resolves the new documents immediately.');

  await mongoose.disconnect();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
