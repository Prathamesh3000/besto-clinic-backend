#!/usr/bin/env node

/**
 * One-time migration: Create PlatformPatient records for existing patients.
 *
 * For each unique patient/guardian email in UserDirectory (platform DB):
 *   1. Skip if PlatformPatient already exists
 *   2. Fetch tenant User from one clinic to get name, phone, password hash
 *   3. Create PlatformPatient (bypasses pre-save hook to avoid re-hashing)
 *   4. Populate connectedClinics from all UserDirectory entries
 *
 * Safe to re-run — skips existing PlatformPatient records.
 *
 * Usage:  node scripts/migrate-platform-patients.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const env = require('../src/config/env');
const { getTenantConnection } = require('../src/db/tenantConnectionManager');

// Register platform models
require('../src/models/platform/UserDirectory');
require('../src/models/platform/PlatformPatient');
require('../src/models/platform/Clinic');

async function migrate() {
  // eslint-disable-next-line no-console
  console.log('Connecting to platform DB...');
  await mongoose.connect(env.PLATFORM_DB_URI);

  const UserDirectory = mongoose.model('UserDirectory');
  const PlatformPatient = mongoose.model('PlatformPatient');
  const Clinic = mongoose.model('Clinic');

  // 1. Find all unique patient/guardian emails
  const patientEmails = await UserDirectory.distinct('email', {
    role: { $in: ['patient', 'guardian'] },
  });

  // eslint-disable-next-line no-console
  console.log(`Found ${patientEmails.length} unique patient/guardian emails in UserDirectory`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of patientEmails) {
    try {
      // 2. Check if PlatformPatient already exists
      const existing = await PlatformPatient.findOne({ email, deletedAt: null }).lean();
      if (existing) {
        skipped++;
        continue;
      }

      // 3. Get all UserDirectory entries for this email
      const entries = await UserDirectory.find({ email, role: { $in: ['patient', 'guardian'] } }).lean();
      if (entries.length === 0) {
        skipped++;
        continue;
      }

      // 4. Connect to the first tenant to fetch User data (password hash, name, phone)
      let userData = null;
      let tenantConn = null;

      for (const entry of entries) {
        try {
          tenantConn = await getTenantConnection(entry.tenantSlug);
          const TenantUser = tenantConn.model('User');
          userData = await TenantUser.findById(entry.userId).select('+password').lean();
          if (userData && userData.password) break;
        } catch {
          // Could not connect to this tenant — try next
          continue;
        }
      }

      if (!userData || !userData.password) {
        // eslint-disable-next-line no-console
        console.log(`  SKIP ${email}: no tenant User with password found`);
        skipped++;
        continue;
      }

      // 5. Build connectedClinics array
      const connectedClinics = [];
      for (const entry of entries) {
        const clinic = await Clinic.findById(entry.clinicId).lean();
        connectedClinics.push({
          clinicId: entry.clinicId,
          tenantSlug: entry.tenantSlug,
          clinicName: clinic?.name || entry.tenantSlug,
          clinicCode: clinic?.clinicCode || '',
          clinicLogo: clinic?.logo || null,
          tenantUserId: entry.userId,
          tenantPatientId: null, // Not easily resolvable without querying each tenant
          role: entry.role,
          connectedAt: entry.createdAt || new Date(),
        });
      }

      // 6. Insert PlatformPatient directly (bypass pre-save hook to avoid re-hashing)
      await PlatformPatient.collection.insertOne({
        email: email.toLowerCase().trim(),
        password: userData.password, // Already hashed
        name: userData.name || '',
        phone: userData.phone || '',
        connectedClinics,
        isActive: true,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      created++;
      if (created % 50 === 0) {
        // eslint-disable-next-line no-console
        console.log(`  Progress: ${created} created, ${skipped} skipped, ${failed} failed`);
      }
    } catch (err) {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${email}: ${err.message}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n--- Migration Complete ---');
  // eslint-disable-next-line no-console
  console.log(`  Created:  ${created}`);
  // eslint-disable-next-line no-console
  console.log(`  Skipped:  ${skipped}`);
  // eslint-disable-next-line no-console
  console.log(`  Failed:   ${failed}`);
  // eslint-disable-next-line no-console
  console.log(`  Total:    ${patientEmails.length}`);

  await mongoose.disconnect();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err);
    process.exit(1);
  });
