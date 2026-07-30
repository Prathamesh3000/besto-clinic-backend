'use strict';

/**
 * Sync job portal features from Plan documents to Clinic documents.
 *
 * For every plan with jobPortalEnabled=true, finds clinics on that plan
 * whose features haven't been synced yet, enables the feature, creates
 * a credit wallet, and grants the plan's initial credits.
 *
 * Usage: node scripts/sync-job-portal-features.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function run() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);

  require('../src/models/platform/Clinic');
  require('../src/models/platform/CreditWallet');
  require('../src/models/platform/CreditTransaction');
  require('../src/models/platform/Plan');

  const Clinic = mongoose.model('Clinic');
  const CreditWallet = mongoose.model('CreditWallet');
  const CreditTransaction = mongoose.model('CreditTransaction');
  const Plan = mongoose.model('Plan');

  // 1. Get all plans with job portal enabled
  const enabledPlans = await Plan.find({ 'features.jobPortalEnabled': true })
    .select('slug features.jobPortalEnabled features.jobPostingCredits');

  console.log('Plans with Job Portal enabled:');
  const creditMap = {};
  for (const p of enabledPlans) {
    creditMap[p.slug] = p.features.jobPostingCredits;
    console.log(`  ${p.slug} — ${p.features.jobPostingCredits} credits/mo`);
  }

  const enabledSlugs = enabledPlans.map((p) => p.slug);

  // 2. Find clinics on those plans that DON'T have jobPortalEnabled yet
  const clinics = await Clinic.find({
    'subscription.plan': { $in: enabledSlugs },
    'features.jobPortalEnabled': { $ne: true },
  }).select('_id name slug subscription.plan features');

  console.log(`\nClinics to update: ${clinics.length}\n`);

  for (const clinic of clinics) {
    const credits = creditMap[clinic.subscription.plan] || 0;

    // Enable job portal on clinic
    await Clinic.updateOne(
      { _id: clinic._id },
      {
        $set: {
          'features.jobPortalEnabled': true,
          'features.jobPostingCredits': credits,
        },
      },
    );

    // Create wallet if needed, or top up existing
    let wallet = await CreditWallet.findOne({ clinic: clinic._id });
    if (!wallet) {
      wallet = await CreditWallet.create({
        clinic: clinic._id,
        balance: credits,
        totalPurchased: credits,
        totalConsumed: 0,
        lastTopUpAt: new Date(),
      });
    } else {
      wallet = await CreditWallet.findOneAndUpdate(
        { clinic: clinic._id },
        {
          $inc: { balance: credits, totalPurchased: credits },
          $set: { lastTopUpAt: new Date() },
        },
        { new: true },
      );
    }

    // Log transaction
    await CreditTransaction.create({
      wallet: wallet._id,
      clinic: clinic._id,
      type: 'plan_grant',
      amount: credits,
      balanceAfter: wallet.balance,
      action: 'admin_adjustment',
      description: `Initial job portal credits synced from ${clinic.subscription.plan} plan`,
      performedBy: 'system',
    });

    console.log(
      `  ✅ ${clinic.name} (${clinic.slug}) — plan: ${clinic.subscription.plan} | granted: ${credits} credits | balance: ${wallet.balance}`,
    );
  }

  // 3. Report: clinics on non-job-portal plans that have it manually enabled (e.g. free plan grants from earlier)
  const disabledPlans = await Plan.find({ 'features.jobPortalEnabled': { $ne: true } }).select('slug');
  const disabledSlugs = disabledPlans.map((p) => p.slug);

  const manuallyEnabled = await Clinic.find({
    'subscription.plan': { $in: disabledSlugs },
    'features.jobPortalEnabled': true,
  }).select('name slug subscription.plan features.jobPostingCredits');

  if (manuallyEnabled.length > 0) {
    console.log('\nNote: These clinics have job portal enabled via manual grant (not from plan):');
    for (const c of manuallyEnabled) {
      console.log(`  ℹ️  ${c.name} (${c.slug}) — plan: ${c.subscription.plan} | credits: ${c.features.jobPostingCredits}`);
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
