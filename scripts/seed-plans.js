'use strict';

/**
 * Seed the subscription plan catalogue — and nothing else.
 *
 * scripts/seed-platform-full.js also creates a platform admin and seven demo
 * clinics, which is not something you want to run against a shared database just
 * to fill in the plans. The four plan definitions here are lifted from it
 * verbatim, with the job-portal feature values seed-platform.js patches on
 * afterwards folded straight in.
 *
 * Usage:
 *   node scripts/seed-plans.js --dry-run   # report what would change
 *   node scripts/seed-plans.js             # create the missing plans
 *
 * Safe to re-run: a plan whose slug already exists is left completely untouched,
 * so hand-tuned pricing is never overwritten. Nothing is ever deleted.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Matches the other scripts: the Atlas connection string is mongodb+srv and so
// needs a DNS SRV lookup, which some local resolvers refuse outright.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const DRY_RUN = process.argv.includes('--dry-run');

const PLANS = [
  {
    name: 'Free Plan',
    slug: 'free',
    description: 'Perfect for solo practitioners getting started',
    tier: 0,
    pricing: { monthly: 0, yearly: 0, currency: 'INR' },
    features: {
      maxDoctors: 1,
      maxStaff: 2,
      maxBranches: 1,
      maxStorageMB: 250,
      maxSmsPerMonth: 0,
      smsEnabled: false,
      teleHealthEnabled: false,
      customBranding: false,
      apiAccess: false,
      prioritySupport: false,
      advancedReports: false,
      whiteLabeling: false,
      jobPortalEnabled: false,
      jobPostingCredits: 0,
    },
    trial: { enabled: false, durationDays: 0 },
    displayOrder: 1,
    isPublic: true,
    isActive: true,
    highlights: [
      '1 Doctor',
      '2 Staff Members',
      'Basic Patient Management',
      'Appointment Scheduling',
      '250 MB Storage',
    ],
  },
  {
    name: 'Starter',
    slug: 'starter',
    description: 'Ideal for small clinics with essential features',
    tier: 10,
    pricing: { monthly: 2999, yearly: 29990, currency: 'INR' },
    features: {
      maxDoctors: 3,
      maxStaff: 10,
      maxBranches: 1,
      maxStorageMB: 2048,
      maxSmsPerMonth: 500,
      smsEnabled: true,
      teleHealthEnabled: false,
      customBranding: false,
      apiAccess: false,
      prioritySupport: false,
      advancedReports: false,
      whiteLabeling: false,
      jobPortalEnabled: false,
      jobPostingCredits: 0,
    },
    trial: { enabled: true, durationDays: 14 },
    displayOrder: 2,
    isPublic: true,
    isActive: true,
    highlights: [
      'Up to 3 Doctors',
      '10 Staff Members',
      'SMS Notifications (500/month)',
      'Billing & Invoicing',
      '2 GB Storage',
      '14-day Free Trial',
    ],
    badge: 'Most Popular',
  },
  {
    name: 'Professional',
    slug: 'professional',
    description: 'Advanced features for growing multi-doctor clinics',
    tier: 20,
    pricing: { monthly: 7999, yearly: 79990, currency: 'INR' },
    features: {
      maxDoctors: 10,
      maxStaff: 30,
      maxBranches: 3,
      maxStorageMB: 10240,
      maxSmsPerMonth: 2000,
      smsEnabled: true,
      teleHealthEnabled: true,
      customBranding: true,
      apiAccess: false,
      prioritySupport: true,
      advancedReports: true,
      whiteLabeling: false,
      jobPortalEnabled: true,
      jobPostingCredits: 5,
    },
    addOns: {
      doctors: {
        enabled: true,
        pricePerDoctorMonthly: 500,
        pricePerDoctorYearly: 5000,
        maxAdditional: 20,
      },
      storage: {
        enabled: true,
        pricePerUnitMonthly: 300,
        pricePerUnitYearly: 3000,
        unitSizeMB: 1024,
        maxUnits: 50,
      },
    },
    trial: { enabled: true, durationDays: 14 },
    displayOrder: 3,
    isPublic: true,
    isActive: true,
    highlights: [
      'Up to 10 Doctors',
      '30 Staff Members',
      'Multi-Branch Support (3 branches)',
      'Telemedicine Integration',
      'SMS (2000/month)',
      'Advanced Analytics',
      'Priority Support',
      'Job Portal (5 credits/mo)',
      '10 GB Storage',
    ],
    badge: 'Best Value',
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    description: 'Complete solution for large healthcare networks',
    tier: 30,
    pricing: { monthly: 19999, yearly: 199990, currency: 'INR' },
    features: {
      maxDoctors: 50,
      maxStaff: 100,
      maxBranches: 10,
      maxStorageMB: 51200,
      maxSmsPerMonth: 10000,
      smsEnabled: true,
      teleHealthEnabled: true,
      customBranding: true,
      apiAccess: true,
      prioritySupport: true,
      advancedReports: true,
      whiteLabeling: true,
      jobPortalEnabled: true,
      jobPostingCredits: 20,
    },
    addOns: {
      doctors: {
        enabled: true,
        pricePerDoctorMonthly: 400,
        pricePerDoctorYearly: 4000,
        maxAdditional: 100,
      },
      storage: {
        enabled: true,
        pricePerUnitMonthly: 250,
        pricePerUnitYearly: 2500,
        unitSizeMB: 1024,
        maxUnits: 100,
      },
    },
    trial: { enabled: true, durationDays: 30 },
    displayOrder: 4,
    isPublic: true,
    isActive: true,
    highlights: [
      'Up to 50 Doctors',
      '100 Staff Members',
      'Multi-Branch Support (10 branches)',
      'Full Telemedicine Suite',
      'SMS (10,000/month)',
      'White-Label Solution',
      'API Access',
      'Job Portal (20 credits/mo)',
      'Dedicated Support',
      '50 GB Storage',
    ],
  },
];

(async () => {
  const uri = process.env.PLATFORM_DB_URI;
  if (!uri) {
    console.error('PLATFORM_DB_URI is not set — run this from the project root.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`✓ Connected${DRY_RUN ? ' (dry run — no writes)' : ''}`);

  require('../src/models/platform/Plan');
  require('../src/models/platform/PlatformUser');
  const Plan = mongoose.model('Plan');
  const PlatformUser = mongoose.model('PlatformUser');

  // Attribution only — the plans seed fine without a platform admin present.
  const admin = await PlatformUser.findOne({ role: 'product_owner' }).select('_id');

  let created = 0;
  let skipped = 0;

  for (const planData of PLANS) {
    const existing = await Plan.findOne({ slug: planData.slug }).select('_id');
    if (existing) {
      console.log(`ℹ️  exists, left untouched: ${planData.name} (${planData.slug})`);
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`would create: ${planData.name} (${planData.slug}) — tier ${planData.tier}`);
    } else {
      await Plan.create({ ...planData, ...(admin ? { createdBy: admin._id } : {}) });
      console.log(`✅ created: ${planData.name} (${planData.slug})`);
    }
    created += 1;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'} ${created}, left alone ${skipped}.`);
  console.log(
    'The picker shows every active, public, non-custom plan except "free", '
    + 'so expect Starter, Professional and Enterprise on the subscription page.',
  );

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('\nFailed:', err.message);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
