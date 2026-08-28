'use strict';

/**
 * Create a new tenant (clinic) — provisions the platform record and
 * sets up the tenant database with an admin user.
 *
 * Usage: npm run create:tenant
 *   (reads from CLI prompts or env vars)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function createTenant() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);

  require('../src/models/platform/Clinic');
  require('../src/models/platform/Subscription');
  require('../src/models/platform/PlatformUser');

  const Clinic = mongoose.model('Clinic');

  // eslint-disable-next-line no-console
  console.log('\n🏥 BestoClinic — New Tenant Setup\n');

  const name = await ask('Clinic name: ');
  const slug = await ask('Slug (lowercase, no spaces): ');
  const email = await ask('Admin email: ');
  const phone = await ask('Phone: ');

  // Check uniqueness
  const existing = await Clinic.findOne({ slug: slug.toLowerCase().trim() });
  if (existing) {
    // eslint-disable-next-line no-console
    console.error(`❌ Slug "${slug}" already exists`);
    process.exit(1);
  }

  // Generate tenant DB URI (same cluster, different database name)
  const tenantDbName = `bestoclinic_${slug.replace(/-/g, '_')}`;
  const dbUri = env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, `/${tenantDbName}?`);

  const clinic = await Clinic.create({
    name: name.trim(),
    slug: slug.toLowerCase().trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    dbUri,
    subscription: {
      plan: 'free',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
    features: {
      maxDoctors: 1,
      maxStaff: 5,
    },
  });

  // Create admin user in the tenant DB
  const tenantConn = await mongoose.createConnection(dbUri).asPromise();
  const tenantModels = require('../src/models/tenant');
  for (const [modelName, schema] of Object.entries(tenantModels)) {
    tenantConn.model(modelName, schema);
  }

  const User = tenantConn.model('User');
  await User.create({
    name: `${name} Admin`,
    email: email.toLowerCase().trim(),
    password: 'ChangeMe@123',
    role: 'super_admin',
    isEmailVerified: true,
  });

  await tenantConn.close();

  // eslint-disable-next-line no-console
  console.log('\n✅ Tenant created successfully!');
  // eslint-disable-next-line no-console
  console.log(`   Clinic ID: ${clinic._id}`);
  // eslint-disable-next-line no-console
  console.log(`   Slug: ${clinic.slug}`);
  // eslint-disable-next-line no-console
  console.log(`   Admin login: ${email} / ChangeMe@123`);
  // eslint-disable-next-line no-console
  console.log(`   X-Tenant-ID header: ${clinic.slug}\n`);

  rl.close();
  await mongoose.disconnect();
  process.exit(0);
}

createTenant().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
