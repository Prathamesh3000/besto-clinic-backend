#!/usr/bin/env node
'use strict';

/**
 * One-off script: Fix the externalId index and create a Patient record
 * for an existing User who registered before the auto-create fix.
 *
 * Usage:  node scripts/fix-missing-patient.js
 */

require('dotenv').config();

const { connectPlatformDB } = require('../src/db/platformConnection');
const { connectRedis } = require('../src/config/redis');
const { getTenantConnection } = require('../src/db/tenantConnectionManager');

// Register platform models (needed for getTenantConnection to find Clinic)
require('../src/models/platform/Clinic');

const TENANT_SLUG = 'demo-clinic';
const USER_EMAIL = 'prasad.kumar@example.com';

async function main() {
  console.log('Connecting to Redis...');
  await connectRedis();
  console.log('Connecting to platform DB...');
  await connectPlatformDB();

  console.log(`Getting tenant connection for "${TENANT_SLUG}"...`);
  const conn = await getTenantConnection(TENANT_SLUG);

  const User = conn.model('User');
  const Patient = conn.model('Patient');

  // Step 1: Drop the old sparse unique index on externalId+externalSource
  // (it breaks when multiple patients have null externalId)
  console.log('Dropping stale externalId index...');
  try {
    await conn.collection('patients').dropIndex('externalId_1_externalSource_1');
    console.log('Old index dropped.');
  } catch (err) {
    if (err.codeName === 'IndexNotFound') {
      console.log('Index already gone, skipping.');
    } else {
      console.log('Index drop note:', err.message);
    }
  }

  // Step 2: Unset null externalId/externalSource on existing docs so they
  // don't interfere with the new partial index
  const unsetResult = await conn.collection('patients').updateMany(
    { externalId: null },
    { $unset: { externalId: '', externalSource: '', externalLastSyncAt: '' } },
  );
  console.log(`Cleaned null externalId from ${unsetResult.modifiedCount} docs.`);

  // Step 3: Sync indexes (creates the new partial index from schema)
  console.log('Syncing indexes...');
  await Patient.syncIndexes();
  console.log('Indexes synced.');

  // Step 4: Find the user
  const user = await User.findOne({ email: USER_EMAIL }).lean();
  if (!user) {
    console.error(`User with email "${USER_EMAIL}" not found.`);
    process.exit(1);
  }
  console.log(`Found user: ${user.name} (${user._id}) role=${user.role}`);

  // Step 5: Check if Patient already exists for this user
  const existing = await Patient.findOne({ user: user._id }).lean();
  if (existing) {
    console.log(`Patient record already exists: ${existing.patientId} (${existing._id})`);
    console.log('No action needed.');
    process.exit(0);
  }

  // Check if an unlinked Patient exists with same email
  const unlinked = await Patient.findOne({ email: USER_EMAIL, user: null }).lean();
  if (unlinked) {
    console.log(`Found unlinked Patient with same email: ${unlinked.patientId}. Linking to user...`);
    await Patient.findByIdAndUpdate(unlinked._id, { user: user._id });
    console.log('Done — Patient linked to User.');
    process.exit(0);
  }

  // Step 6: Create new Patient record
  console.log('Creating Patient record...');
  const patient = await Patient.create({
    user: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || 'N/A',
  });
  console.log(`Patient created: ${patient.patientId} (${patient._id})`);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
