'use strict';

/**
 * One-time cleanup — removes self-view AccessLog entries across all tenant DBs.
 *
 * A "self-view" is an AccessLog entry where:
 *   accessType === 'view'  AND  accessedBy === patient.user
 *
 * These are noise in the audit trail; the patient doesn't need to see
 * that they viewed their own records.
 *
 * Safe to re-run (idempotent — only deletes matching records).
 *
 * Usage: node scripts/cleanup-self-view-logs.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectRedis } = require('../src/config/redis');

async function cleanup() {
  const env = require('../src/config/env');
  await connectRedis();
  await mongoose.connect(env.PLATFORM_DB_URI);

  // Register platform models
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const { getTenantConnection } = require('../src/db/tenantConnectionManager');

  const clinics = await Clinic.find({ status: 'active', deletedAt: null }).lean();
  console.log(`Found ${clinics.length} active clinics\n`);

  let grandTotal = 0;

  for (const clinic of clinics) {
    console.log(`--- ${clinic.name} (${clinic.slug}) ---`);

    const conn = await getTenantConnection(clinic.slug);

    const Patient = conn.model('Patient');
    const AccessLog = conn.model('AccessLog');

    // Find all patients that have a linked user account
    const patients = await Patient.find({ user: { $ne: null } }).select('_id user').lean();
    if (!patients.length) {
      console.log('  No linked patients, skipping.\n');
      continue;
    }

    let clinicTotal = 0;

    // Delete self-view logs in bulk per patient
    for (const pat of patients) {
      const result = await AccessLog.deleteMany({
        patient: pat._id,
        accessedBy: pat.user,
        accessType: 'view',
      });
      clinicTotal += result.deletedCount;
    }

    console.log(`  Removed ${clinicTotal} self-view entries (${patients.length} patients checked)`);
    grandTotal += clinicTotal;
  }

  console.log(`\nDone. Removed ${grandTotal} self-view entries across all clinics.`);
  await mongoose.disconnect();
  process.exit(0);
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
