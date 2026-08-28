'use strict';

/**
 * Recovery script — rebuild the platform registry for an existing tenant DB.
 *
 * Background
 * ----------
 * The platform database (PLATFORM_DB_URI) was found completely empty — all 20
 * collections at 0 documents — while the tenant database still held its full
 * dataset (159 users, 137 patients, 603 appointments, 455 invoices, …).
 *
 * In this DB-per-tenant architecture the platform DB is the only thing that maps
 * clinicCode/slug -> the tenant's dbUri. With `clinics` empty, every lookup fails:
 * POST /api/v1/public/login answers 404 "Clinic not found"
 * (src/modules/public/public.routes.js:566), and no authenticated tenant route can
 * resolve a connection at all.
 *
 * This script re-creates ONLY the platform-side records needed to reach the
 * surviving tenant data. It never writes to the tenant DB.
 *
 * What it writes (all upserts, safe to re-run):
 *   1. clinics       — one record pointing at the existing tenant database
 *   2. platformusers — a product_owner so the platform admin console is reachable
 *
 * Feature limits are set from the tenant's ACTUAL usage. The schema defaults
 * (maxDoctors 1, maxStaff 2, maxBranches 1) would gate a clinic this size
 * immediately, so they are raised with headroom.
 *
 * Usage
 *   node scripts/repair-platform-registry.js --dry-run   # preview, writes nothing
 *   node scripts/repair-platform-registry.js             # apply
 *
 * Required env (.env): PLATFORM_DB_URI
 * Required flag:       --clinic-code=XXXX9999   (3-6 uppercase letters + 4 digits)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Mirrors server.js — the default resolver refuses the Atlas SRV lookup on some hosts.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const DRY_RUN = process.argv.includes('--dry-run');
const codeArg = process.argv.find((a) => a.startsWith('--clinic-code='));
const CLINIC_CODE = codeArg ? codeArg.split('=')[1].toUpperCase().trim() : null;

// ─── Facts derived from the surviving tenant DB ────────────────────────
const TENANT_DB = 'bestoclinic_jathar_dental';
const SLUG = 'jathar-dental';        // per BUGFIX_HANDOFF.md; must not change
const CLINIC_NAME = 'Jathar Clinic {Dental}';
const OWNER_EMAIL = 'dr.sandeep@jathardental.in';
const OWNER_NAME = 'Dr. Sandeep';
const OWNER_PHONE = '9822345678';

// Platform console login. Change the password immediately after first sign-in.
const PLATFORM_ADMIN_EMAIL = 'admin@bestoclinic.com';
const PLATFORM_ADMIN_PASSWORD = 'Admin@12345';

function log(...a) { console.log(...a); }

/** Build the tenant dbUri from PLATFORM_DB_URI, swapping only the database name. */
function buildTenantUri(platformUri, dbName) {
  const [base, query] = platformUri.split('?');
  const withoutDb = base.replace(/\/[^/]*$/, '');
  return `${withoutDb}/${dbName}${query ? `?${query}` : ''}`;
}

async function main() {
  if (!CLINIC_CODE) {
    console.error('ERROR: --clinic-code=XXXX9999 is required (3-6 uppercase letters + 4 digits).');
    process.exit(1);
  }
  if (!/^[A-Z]{3,6}\d{4}$/.test(CLINIC_CODE)) {
    console.error(`ERROR: clinicCode "${CLINIC_CODE}" fails the schema pattern /^[A-Z]{3,6}\\d{4}$/.`);
    process.exit(1);
  }

  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  log(`connected: ${mongoose.connection.db.databaseName}${DRY_RUN ? '  [DRY RUN — no writes]' : ''}`);

  require('../src/models/platform/Clinic');
  require('../src/models/platform/PlatformUser');
  const Clinic = mongoose.model('Clinic');
  const PlatformUser = mongoose.model('PlatformUser');

  const client = mongoose.connection.client;

  // ── Guard 1: the tenant DB must actually exist and hold data ──────────
  const dbs = (await client.db().admin().listDatabases()).databases.map((d) => d.name);
  if (!dbs.includes(TENANT_DB)) {
    throw new Error(`tenant database "${TENANT_DB}" not found on this cluster — aborting.`);
  }
  const tenant = client.db(TENANT_DB);
  const userCount = await tenant.collection('users').countDocuments();
  if (userCount === 0) {
    throw new Error(`tenant "${TENANT_DB}" has 0 users — wrong cluster or wrong DB name. Aborting.`);
  }

  // ── Guard 2: never clobber a registry that is already populated ───────
  const existing = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (existing) {
    log(`\nNOTE: a clinic with slug "${SLUG}" already exists (_id=${existing._id}).`);
    log('      This run will update it in place rather than insert a duplicate.');
  }

  // ── Size the plan from real usage ─────────────────────────────────────
  const byRole = await tenant.collection('users').aggregate([
    { $group: { _id: '$role', n: { $sum: 1 } } },
  ]).toArray();
  const roleCount = Object.fromEntries(byRole.map((r) => [r._id, r.n]));
  const doctors = roleCount.doctor || 0;
  const patientUsers = (roleCount.patient || 0) + (roleCount.guardian || 0);
  const staff = byRole.reduce((s, r) => s + r.n, 0) - doctors - patientUsers;

  const branchesCount = await tenant.collection('branches').countDocuments();
  const patientsCount = await tenant.collection('patients').countDocuments();

  // Headroom so the clinic is not gated the moment someone adds a record.
  const pad = (n, floor) => Math.max(floor, Math.ceil(n * 1.5));

  const features = {
    maxDoctors: pad(doctors, 25),
    maxStaff: pad(staff, 40),
    maxBranches: pad(branchesCount, 15),
    maxStorageMB: 20480,
    maxSmsPerMonth: 5000,
    smsEnabled: true,
    teleHealthEnabled: true,   // tenant has consultationrooms + chatmessages in use
    customBranding: true,
    apiAccess: true,
    prioritySupport: true,
    advancedReports: true,
    whiteLabeling: false,
    jobPortalEnabled: true,
    jobPostingCredits: 10,
  };

  const owner = await tenant.collection('users').findOne(
    { role: 'super_admin' },
    { projection: { _id: 1, name: 1, email: 1, phone: 1 } },
  );

  const mainBranch = await tenant.collection('branches').findOne({ isMain: true })
    || await tenant.collection('branches').findOne({});

  const dbUri = buildTenantUri(env.PLATFORM_DB_URI, TENANT_DB);

  const doc = {
    name: CLINIC_NAME,
    slug: SLUG,
    email: OWNER_EMAIL,
    phone: OWNER_PHONE,
    address: mainBranch?.address || { city: 'Pune', state: 'Maharashtra', country: 'IN' },
    clinicCode: CLINIC_CODE,
    subdomain: SLUG,
    dbUri,
    registrationSource: 'platform_admin',
    status: 'active',
    activatedAt: new Date(),
    isActive: true,
    deletedAt: null,
    superAdmin: {
      userId: owner ? String(owner._id) : undefined,
      name: owner?.name || OWNER_NAME,
      email: owner?.email || OWNER_EMAIL,
      phone: owner?.phone || OWNER_PHONE,
      provisionedAt: new Date(),
    },
    subscription: { plan: 'enterprise', status: 'active' },
    features,
    usage: {
      doctorsCount: doctors,
      staffCount: staff,
      branchesCount,
      patientsCount,
      lastSyncedAt: new Date(),
    },
  };

  log('\n── clinic record ──────────────────────────────');
  log(JSON.stringify({ ...doc, dbUri: dbUri.replace(/:\/\/[^@]+@/, '://***:***@') }, null, 2));
  log(`\nderived usage: ${doctors} doctors, ${staff} staff, ${branchesCount} branches, ${patientsCount} patients`);

  if (DRY_RUN) {
    log('\nDRY RUN — nothing written. Re-run without --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  // Snapshot before writing, consistent with the other scripts in this folder.
  const backupDir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(backupDir, `platform-registry-${stamp}.json`);
  fs.writeFileSync(snapshot, JSON.stringify({
    takenAt: new Date().toISOString(),
    clinicsBefore: await Clinic.find({}).lean(),
    platformUsersBefore: await PlatformUser.find({}).lean(),
  }, null, 2));
  log(`\nsnapshot written: ${snapshot}`);

  const saved = await Clinic.findOneAndUpdate(
    { slug: SLUG },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  log(`clinic upserted: _id=${saved._id}  slug=${saved.slug}  clinicCode=${saved.clinicCode}`);

  if (!(await PlatformUser.findOne({ email: PLATFORM_ADMIN_EMAIL }))) {
    // Password hashing is handled by the PlatformUser pre-save hook.
    await PlatformUser.create({
      name: 'Platform Admin',
      email: PLATFORM_ADMIN_EMAIL,
      password: PLATFORM_ADMIN_PASSWORD,
      role: 'product_owner',
    });
    log(`product_owner created: ${PLATFORM_ADMIN_EMAIL} — CHANGE THIS PASSWORD NOW`);
  } else {
    log(`product_owner already present: ${PLATFORM_ADMIN_EMAIL} (left untouched)`);
  }

  log('\nDone. Next:');
  log('  1. Restart the API (tenant URI + feature caches are held in Redis for 5 min).');
  log('  2. node scripts/backfill-user-directory.js --dry-run   # then without the flag');
  log('     -> repopulates userdirectories so email-only login resolves again.');
  log('  3. node scripts/seed-roles-existing-tenants.js --dry-run');

  await mongoose.disconnect();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
