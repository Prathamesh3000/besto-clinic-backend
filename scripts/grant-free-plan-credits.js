'use strict';

/**
 * One-time script — grants 3 job portal credits to all clinics on the Free plan.
 *
 * What it does:
 *  1. Finds all clinics where subscription.plan === 'free'
 *  2. Enables jobPortalEnabled + sets jobPostingCredits = 3 on each
 *  3. Creates a CreditWallet (or tops up existing) with 3 credits
 *  4. Logs a CreditTransaction for the grant
 *
 * Usage: node scripts/grant-free-plan-credits.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function run() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);

  // Register models
  require('../src/models/platform/Clinic');
  require('../src/models/platform/CreditWallet');
  require('../src/models/platform/CreditTransaction');

  const Clinic = mongoose.model('Clinic');
  const CreditWallet = mongoose.model('CreditWallet');
  const CreditTransaction = mongoose.model('CreditTransaction');

  const GRANT_AMOUNT = 3;

  // Find all clinics on the free plan
  const freeClinics = await Clinic.find({ 'subscription.plan': 'free' }).select(
    '_id name slug features',
  );

  console.log(`Found ${freeClinics.length} clinic(s) on the Free plan.\n`);

  if (freeClinics.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let granted = 0;

  for (const clinic of freeClinics) {
    // 1. Enable job portal features on the clinic
    await Clinic.updateOne(
      { _id: clinic._id },
      {
        $set: {
          'features.jobPortalEnabled': true,
          'features.jobPostingCredits': GRANT_AMOUNT,
        },
      },
    );

    // 2. Create or top-up the credit wallet
    let wallet = await CreditWallet.findOne({ clinic: clinic._id });

    if (!wallet) {
      wallet = await CreditWallet.create({
        clinic: clinic._id,
        balance: GRANT_AMOUNT,
        totalPurchased: GRANT_AMOUNT,
        totalConsumed: 0,
        lastTopUpAt: new Date(),
      });
    } else {
      wallet = await CreditWallet.findOneAndUpdate(
        { clinic: clinic._id },
        {
          $inc: { balance: GRANT_AMOUNT, totalPurchased: GRANT_AMOUNT },
          $set: { lastTopUpAt: new Date() },
        },
        { new: true },
      );
    }

    // 3. Record the transaction
    await CreditTransaction.create({
      wallet: wallet._id,
      clinic: clinic._id,
      type: 'plan_grant',
      amount: GRANT_AMOUNT,
      balanceAfter: wallet.balance,
      action: 'admin_adjustment',
      description: 'Free plan — 3 complimentary job portal credits',
      performedBy: 'system',
    });

    granted++;
    console.log(
      `  ✅ ${clinic.name} (${clinic.slug}) — granted ${GRANT_AMOUNT} credits (balance: ${wallet.balance})`,
    );
  }

  console.log(`\nDone. Granted credits to ${granted} clinic(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
