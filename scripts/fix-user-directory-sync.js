'use strict';

/**
 * Fix missing UserDirectory entries for existing tenant users.
 * This is needed when users were created directly in tenant DB
 * without going through the auth.service.register() flow.
 *
 * Usage: node scripts/fix-user-directory-sync.js
 */

const mongoose = require('mongoose');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const PLATFORM_URI = process.env.PLATFORM_DB_URI;
const TENANT_SLUG = 'smilecare-dental';

// Users to sync (add more as needed)
const USERS_TO_SYNC = [
  { email: 'vinayak.mehta@smilecare.clinic', role: 'patient' },
];

async function main() {
  try {
    console.log('Connecting to platform DB...');
    const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();
    console.log('✓ Connected to platform DB');

    // Get clinic info
    const Clinic = platformConn.model('Clinic', new mongoose.Schema({}, { strict: false }), 'clinics');
    const clinic = await Clinic.findOne({ slug: TENANT_SLUG, deletedAt: null }).lean();
    if (!clinic) {
      console.error(`❌ Clinic "${TENANT_SLUG}" not found`);
      process.exit(1);
    }
    console.log(`✓ Clinic: ${clinic.name} (code: ${clinic.clinicCode})`);

    // Connect to tenant DB
    const tenantDbUri = PLATFORM_URI.replace(/\/[^/]+\?/, `/bestoclinic_${TENANT_SLUG}?`);
    const tenantConn = await mongoose.createConnection(tenantDbUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    }).asPromise();
    console.log(`✓ Connected to tenant DB`);

    const User = tenantConn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const UserDirectory = platformConn.model('UserDirectory', new mongoose.Schema({}, { strict: false }), 'userdirectories');

    for (const entry of USERS_TO_SYNC) {
      const user = await User.findOne({ email: entry.email }).lean();
      if (!user) {
        console.log(`⚠️  User not found in tenant DB: ${entry.email}`);
        continue;
      }

      const existing = await UserDirectory.findOne({ email: entry.email, tenantSlug: TENANT_SLUG }).lean();
      if (existing) {
        console.log(`⚠️  UserDirectory entry already exists for: ${entry.email}`);
        continue;
      }

      await UserDirectory.create({
        email: entry.email.toLowerCase(),
        tenantSlug: TENANT_SLUG,
        clinicId: clinic._id,
        clinicName: clinic.name,
        clinicLogo: clinic.logo || null,
        clinicCode: clinic.clinicCode,
        userId: user._id.toString(),
        role: entry.role || user.role || 'patient',
      });
      console.log(`✓ UserDirectory entry created for: ${entry.email}`);
    }

    await tenantConn.close();
    await platformConn.close();
    console.log('\n✓ Done — connections closed.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
