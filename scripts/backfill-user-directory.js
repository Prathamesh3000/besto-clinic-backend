'use strict';

/**
 * Backfill script — populates UserDirectory and generates clinicCodes
 * for all existing clinics and users.
 *
 * Why it matters: /public/lookup-email resolves an email to its clinic(s) purely
 * from UserDirectory. Users inserted straight into a tenant DB by a seed script
 * bypass the service layer that maintains it, so they cannot sign in with email
 * alone and are forced to supply a clinic code.
 *
 * Safe to re-run (idempotent via upsert).
 *
 * Usage:
 *   node scripts/backfill-user-directory.js --dry-run   # preview, no writes
 *   node scripts/backfill-user-directory.js             # apply
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Keep in sync with server.js. The Atlas connection string is mongodb+srv, so it
// needs a DNS SRV lookup; resolvers that refuse SRV queries fail this script with
// "querySrv ECONNREFUSED" before it reaches the database.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const DRY_RUN = process.argv.includes('--dry-run');

async function backfill() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);

  // getTenantConnection() reads the encrypted tenant URI through the Redis cache,
  // so Redis must be up before the first tenant connection. Without this the
  // script silently skips every clinic with "Redis not initialized" and reports
  // 0 synced entries while exiting successfully.
  const { connectRedis } = require('../src/config/redis');
  await connectRedis();

  // Register platform models
  require('../src/models/platform/Clinic');
  require('../src/models/platform/UserDirectory');

  const Clinic = mongoose.model('Clinic');
  const UserDirectory = mongoose.model('UserDirectory');

  const { getTenantConnection } = require('../src/db/tenantConnectionManager');

  const clinics = await Clinic.find({ status: 'active', deletedAt: null }).lean();
  console.log(`Found ${clinics.length} active clinics\n`);

  let totalUsers = 0;
  let totalCodes = 0;

  for (const clinic of clinics) {
    console.log(`--- ${clinic.name} (${clinic.slug}) ---`);

    // 1. Generate clinicCode if missing
    if (!clinic.clinicCode) {
      const code = await generateClinicCode(Clinic, clinic);
      if (!DRY_RUN) await Clinic.findByIdAndUpdate(clinic._id, { clinicCode: code });
      clinic.clinicCode = code;
      console.log(`  Generated clinicCode: ${code}`);
      totalCodes++;
    } else {
      console.log(`  clinicCode: ${clinic.clinicCode} (already set)`);
    }

    // 2. Connect to tenant DB and read all non-deleted users
    let conn;
    try {
      conn = await getTenantConnection(clinic.slug);
    } catch (err) {
      console.log(`  SKIP: could not connect to tenant DB — ${err.message}`);
      continue;
    }

    const User = conn.model('User');
    const users = await User.find({ deletedAt: null }).select('email role').lean();
    console.log(`  Users: ${users.length}`);

    // 3. Upsert each user into UserDirectory
    let added = 0;
    for (const user of users) {
      if (!user.email) continue;
      const key = { email: user.email.toLowerCase(), tenantSlug: clinic.slug };
      const existed = await UserDirectory.exists(key);
      if (!existed) added++;

      if (!DRY_RUN) {
        await UserDirectory.findOneAndUpdate(
          key,
          {
            email: user.email.toLowerCase(),
            tenantSlug: clinic.slug,
            clinicId: clinic._id,
            clinicName: clinic.name,
            clinicLogo: clinic.logo || null,
            clinicCode: clinic.clinicCode,
            userId: user._id.toString(),
            role: user.role,
          },
          { upsert: true },
        );
      }
      totalUsers++;
    }
    console.log(`  ${added} new directory entr${added === 1 ? 'y' : 'ies'} (${users.length - added} already present)`);
  }

  console.log(`\nDone. Generated ${totalCodes} clinic codes, synced ${totalUsers} user directory entries.${DRY_RUN ? '  (DRY RUN — nothing was written)' : ''}`);

  const { closeAllTenantConnections } = require('../src/db/tenantConnectionManager');
  const { disconnectRedis } = require('../src/config/redis');
  await closeAllTenantConnections();
  await mongoose.disconnect();
  await disconnectRedis();
  process.exit(0);
}

// Must match the Clinic.clinicCode schema pattern: 3-6 letters + 4 digits.
const CLINIC_CODE_RE = /^[A-Z]{3,6}\d{4}$/;

async function generateClinicCode(ClinicModel, clinic) {
  // Names shorter than 3 letters ("JJ", "hh") are padded — a 2-letter prefix
  // fails the schema pattern, which is what broke tenant provisioning.
  const letters = String(clinic.name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = letters.length >= 3 ? letters.substring(0, 5) : (letters + 'CLINIC').substring(0, 3);

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = attempt < 9
      ? Math.floor(1000 + Math.random() * 9000)
      : (parseInt(clinic._id.toString().slice(-6), 16) % 9000) + 1000;
    const code = `${prefix}${suffix}`;
    if (!CLINIC_CODE_RE.test(code)) continue;
    const exists = await ClinicModel.findOne({ clinicCode: code });
    if (!exists) return code;
  }

  throw new Error(`Could not generate a unique clinic code for "${clinic.name}" (prefix ${prefix})`);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
