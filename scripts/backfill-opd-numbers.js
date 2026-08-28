'use strict';

/**
 * Backfill OPD numbers for patients registered before the field existed.
 *
 * Numbers are assigned in registration order (createdAt ascending), so the
 * clinic's oldest patient becomes OPD-000001 and the sequence matches the order
 * people actually joined the practice.
 *
 * The shared Counter document is advanced to the highest number issued, so
 * patients registered after this runs continue the same sequence rather than
 * restarting at 1 and colliding.
 *
 * Safe to re-run: patients that already have a number are skipped, so a second
 * run only fills gaps (for example, a record whose assignment failed at save).
 *
 * Usage:
 *   node scripts/backfill-opd-numbers.js --dry-run            # preview, no writes
 *   node scripts/backfill-opd-numbers.js                      # apply to every clinic
 *   node scripts/backfill-opd-numbers.js --slug=jathar-dental # apply to one clinic
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Keep in sync with server.js — resolvers that refuse SRV lookups fail this
// script with "querySrv ECONNREFUSED" before it reaches the database.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const DRY_RUN = process.argv.includes('--dry-run');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const ONLY_SLUG = slugArg ? slugArg.split('=')[1] : null;

const PAD = 6;
const format = (n) => `OPD-${String(n).padStart(PAD, '0')}`;

async function main() {
  const env = require('../src/config/env');
  const { connectRedis, disconnectRedis } = require('../src/config/redis');
  const { getTenantConnection, closeAllTenantConnections } = require('../src/db/tenantConnectionManager');

  await mongoose.connect(env.PLATFORM_DB_URI);
  // getTenantConnection resolves tenant URIs through the Redis cache.
  await connectRedis();

  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const filter = { deletedAt: null, ...(ONLY_SLUG ? { slug: ONLY_SLUG } : {}) };
  const clinics = await Clinic.find(filter).select('slug name').lean();

  console.log(`Found ${clinics.length} clinic(s)${DRY_RUN ? '  [DRY RUN — no writes]' : ''}\n`);

  const snapshot = [];
  let grandTotal = 0;

  for (const clinic of clinics) {
    let conn;
    try {
      conn = await getTenantConnection(clinic.slug);
    } catch (err) {
      console.log(`  ${clinic.slug}: SKIPPED — ${err.message}`);
      continue;
    }

    const Patient = conn.model('Patient');
    const { nextSequence } = require('../src/models/tenant/Counter');

    // Oldest first, so numbering follows the order patients actually joined.
    // .lean() to bypass the save hook — this script controls numbering itself.
    const missing = await Patient.find({ opdNumber: null, deletedAt: null })
      .sort({ createdAt: 1 })
      .select('_id name patientId createdAt')
      .lean();

    // Continue from whatever is already issued rather than assuming zero.
    const existing = await Patient.find({ opdNumber: { $ne: null } })
      .select('opdNumber').lean();
    const highest = existing.reduce((max, p) => {
      const n = parseInt(String(p.opdNumber).replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    console.log(`--- ${clinic.name} (${clinic.slug}) ---`);
    console.log(`  already numbered : ${existing.length} (highest ${highest || 'none'})`);
    console.log(`  to assign        : ${missing.length}`);

    if (!missing.length) { console.log(''); continue; }

    let n = highest;
    const assignments = missing.map((p) => {
      n += 1;
      return { _id: p._id, name: p.name, patientId: p.patientId, opdNumber: format(n) };
    });

    assignments.slice(0, 3).forEach((a) => console.log(`    ${a.opdNumber}  ${a.name}`));
    if (assignments.length > 3) {
      console.log(`    … ${assignments.length - 3} more, through ${assignments[assignments.length - 1].opdNumber}`);
    }

    if (!DRY_RUN) {
      await Patient.bulkWrite(
        assignments.map((a) => ({
          updateOne: { filter: { _id: a._id }, update: { $set: { opdNumber: a.opdNumber } } },
        })),
      );

      // Advance the shared counter past everything issued here, so the save hook
      // continues the sequence instead of restarting and colliding.
      const Counter = conn.model('Counter');
      await Counter.findByIdAndUpdate(
        'opd',
        { $max: { seq: n } },
        { upsert: true, setDefaultsOnInsert: true },
      );

      // Prove the counter is now ahead of every issued number.
      const check = await nextSequence(conn, 'opd');
      await Counter.findByIdAndUpdate('opd', { $set: { seq: check - 1 } }); // undo the probe
      console.log(`  counter advanced to ${n}; next issue would be ${format(check)}`);
    }

    snapshot.push({ slug: clinic.slug, assignments });
    grandTotal += assignments.length;
    console.log('');
  }

  if (!DRY_RUN && snapshot.length) {
    const dir = path.resolve(__dirname, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `opd-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), snapshot }, null, 2));
    console.log(`Snapshot written: ${file}`);
  }

  console.log(`\nDone. ${grandTotal} patient(s) numbered${DRY_RUN ? '  (DRY RUN — nothing written)' : ''}.`);

  await closeAllTenantConnections();
  await mongoose.disconnect();
  await disconnectRedis();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
