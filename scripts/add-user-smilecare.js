'use strict';

/**
 * Add patient user to SmileCare Dental tenant database.
 * Creates both User + linked Patient record.
 * Usage: node scripts/add-user-smilecare.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Direct connection (same pattern as create-patient-user.js)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const PLATFORM_URI = process.env.PLATFORM_DB_URI;
const TENANT_SLUG = 'smilecare-dental';

const USER_DATA = {
  name: 'Vinayak Mehta',
  email: 'vinayak.mehta@smilecare.clinic',
  password: 'Vinayak@2025',
  phone: '9876543210',
};

async function main() {
  try {
    // 1. Connect to platform DB
    console.log('Connecting to platform DB...');
    const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();
    console.log('✓ Connected to platform DB');

    // 2. Verify clinic exists
    const Clinic = platformConn.model('Clinic', new mongoose.Schema({}, { strict: false }), 'clinics');
    const clinic = await Clinic.findOne({ slug: TENANT_SLUG, deletedAt: null }).lean();

    if (!clinic) {
      console.error(`❌ Clinic "${TENANT_SLUG}" not found`);
      process.exit(1);
    }
    console.log(`✓ Found clinic: ${clinic.name} (${clinic.slug})`);

    // 3. Connect to tenant DB
    const tenantDbUri = PLATFORM_URI.replace(
      /\/[^/]+\?/,
      `/bestoclinic_${TENANT_SLUG}?`
    );

    const tenantConn = await mongoose.createConnection(tenantDbUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    }).asPromise();
    console.log(`✓ Connected to tenant DB: bestoclinic_${TENANT_SLUG}`);

    // 4. Use flexible schemas
    const User = tenantConn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Patient = tenantConn.model('Patient', new mongoose.Schema({}, { strict: false }), 'patients');

    // 5. Check if user already exists
    const existing = await User.findOne({ email: USER_DATA.email }).lean();
    if (existing) {
      console.log(`\n⚠️  User already exists: ${USER_DATA.email} (role: ${existing.role})`);
      await tenantConn.close();
      await platformConn.close();
      process.exit(0);
    }

    // 6. Create User
    const hashedPassword = await bcrypt.hash(USER_DATA.password, 12);

    const user = await User.create({
      name: USER_DATA.name,
      email: USER_DATA.email,
      phone: USER_DATA.phone,
      password: hashedPassword,
      role: 'patient',
      isActive: true,
      isEmailVerified: true,
      consentGiven: false,
      deletedAt: null,
    });
    console.log(`✓ User created: ${user._id}`);

    // 7. Create linked Patient record
    const patient = await Patient.create({
      user: user._id,
      name: USER_DATA.name,
      email: USER_DATA.email,
      phone: USER_DATA.phone,
      gender: 'male',
      isActive: true,
      deletedAt: null,
    });
    console.log(`✓ Patient record created: ${patient._id}`);

    // 8. Create UserDirectory entry in platform DB (needed for email lookup login)
    const UserDirectory = platformConn.model(
      'UserDirectory',
      new mongoose.Schema({}, { strict: false }),
      'userdirectories',
    );
    await UserDirectory.findOneAndUpdate(
      { email: USER_DATA.email.toLowerCase(), tenantSlug: TENANT_SLUG },
      {
        email: USER_DATA.email.toLowerCase(),
        tenantSlug: TENANT_SLUG,
        clinicId: clinic._id,
        clinicName: clinic.name,
        clinicLogo: clinic.logo || null,
        clinicCode: clinic.clinicCode,
        userId: user._id.toString(),
        role: 'patient',
      },
      { upsert: true },
    );
    console.log('✓ UserDirectory entry created (platform DB)');

    // 9. Print credentials
    console.log('\n' + '='.repeat(50));
    console.log('  LOGIN CREDENTIALS');
    console.log('='.repeat(50));
    console.log(`  Name:     ${USER_DATA.name}`);
    console.log(`  Email:    ${USER_DATA.email}`);
    console.log(`  Password: ${USER_DATA.password}`);
    console.log(`  Role:     patient`);
    console.log(`  Clinic:   ${clinic.name}`);
    console.log(`  Tenant:   ${TENANT_SLUG}`);
    console.log(`  User ID:  ${user._id}`);
    console.log('='.repeat(50));

    await tenantConn.close();
    await platformConn.close();
    console.log('\n✓ Done — connections closed.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
