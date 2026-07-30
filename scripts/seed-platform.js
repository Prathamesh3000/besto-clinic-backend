'use strict';

/**
 * Seed script — creates a product_owner and a sample clinic in the platform DB.
 *
 * Usage: npm run seed:platform
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);

  // Register models
  require('../src/models/platform/Clinic');
  require('../src/models/platform/Subscription');
  require('../src/models/platform/PlatformUser');
  require('../src/models/platform/Plan');
  require('../src/models/platform/CreditWallet');
  require('../src/models/platform/CreditTransaction');

  const PlatformUser = mongoose.model('PlatformUser');
  const Clinic = mongoose.model('Clinic');
  const Plan = mongoose.model('Plan');
  const CreditWallet = mongoose.model('CreditWallet');

  // 1. Create product owner
  const existingOwner = await PlatformUser.findOne({ email: 'admin@bestoclinic.com' });
  if (!existingOwner) {
    await PlatformUser.create({
      name: 'Platform Admin',
      email: 'admin@bestoclinic.com',
      password: 'Admin@12345',
      role: 'product_owner',
    });
    // eslint-disable-next-line no-console
    console.log('✅ Product owner created: admin@bestoclinic.com / Admin@12345');
  } else {
    // eslint-disable-next-line no-console
    console.log('ℹ️  Product owner already exists');
  }

  // 2. Create a sample clinic
  const existingClinic = await Clinic.findOne({ slug: 'demo-clinic' });
  if (!existingClinic) {
    await Clinic.create({
      name: 'Demo Dental Clinic',
      slug: 'demo-clinic',
      email: 'demo@bestoclinic.com',
      phone: '9876543210',
      address: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'IN',
      },
      dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_demo_clinic?'),
      subscription: {
        plan: 'starter',
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
      features: {
        maxDoctors: 3,
        maxStaff: 10,
        smsEnabled: false,
      },
    });
    // eslint-disable-next-line no-console
    console.log('✅ Demo clinic created: demo-clinic');
  } else {
    // eslint-disable-next-line no-console
    console.log('ℹ️  Demo clinic already exists');
  }

  // 3. Ensure plans have jobPortal features
  const planUpdates = [
    { slug: 'starter', jobPortalEnabled: false, jobPostingCredits: 0 },
    { slug: 'professional', jobPortalEnabled: true, jobPostingCredits: 5 },
    { slug: 'enterprise', jobPortalEnabled: true, jobPostingCredits: 20 },
  ];
  for (const pu of planUpdates) {
    await Plan.updateOne(
      { slug: pu.slug },
      { $set: { 'features.jobPortalEnabled': pu.jobPortalEnabled, 'features.jobPostingCredits': pu.jobPostingCredits } },
    );
  }
  // eslint-disable-next-line no-console
  console.log('✅ Plan job portal features updated');

  // 4. Provision credit wallets for clinics with jobPortalEnabled
  const eligibleClinics = await Clinic.find({ 'features.jobPortalEnabled': true }).select('_id features');
  for (const clinic of eligibleClinics) {
    const existing = await CreditWallet.findOne({ clinic: clinic._id });
    if (!existing) {
      await CreditWallet.create({
        clinic: clinic._id,
        balance: clinic.features.jobPostingCredits || 0,
        totalPurchased: 0,
        totalConsumed: 0,
      });
      // eslint-disable-next-line no-console
      console.log(`✅ Credit wallet created for clinic ${clinic._id}`);
    }
  }

  await mongoose.disconnect();
  // eslint-disable-next-line no-console
  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
