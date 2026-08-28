'use strict';

/**
 * Read-only inspection of the platform Plan catalogue.
 *
 * Answers the question selfServe.getOverview() actually asks: which plans would
 * a clinic be offered? A plan reaches the picker only when it is isActive, not
 * isPublic:false, not custom-for-another-clinic, and not the 'free' slug (a
 * first-registration offer that is deliberately excluded).
 *
 * Usage:  node scripts/check-plans.js
 *
 * Reads only — issues no writes of any kind.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Matches the other scripts: the Atlas connection string is mongodb+srv, so it
// needs a DNS SRV lookup, and resolvers that refuse SRV queries fail with
// "querySrv ECONNREFUSED" before reaching the database.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

(async () => {
  const uri = process.env.PLATFORM_DB_URI;
  if (!uri) {
    console.error('PLATFORM_DB_URI is not set — run this from the project root.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const plans = await mongoose.connection.db
    .collection('plans')
    .find({}, { projection: { slug: 1, name: 1, tier: 1, isActive: 1, isPublic: 1, isCustom: 1 } })
    .sort({ tier: 1 })
    .toArray();

  console.log(`\n${plans.length} plan document(s) in the catalogue:`);
  if (plans.length) {
    console.table(plans.map((p) => ({
      slug: p.slug,
      name: p.name,
      tier: p.tier,
      isActive: p.isActive,
      isPublic: p.isPublic,
      isCustom: p.isCustom,
    })));
  }

  const offered = plans.filter((p) => (
    p.isActive === true
    && p.isPublic !== false
    && p.isCustom !== true
    && p.slug !== 'free'
  ));
  console.log(`\n→ ${offered.length} would appear in a clinic's plan picker: `
    + `${offered.map((p) => p.slug).join(', ') || '(none)'}`);

  // Which slugs are subscriptions actually pointing at? A slug with no Plan
  // document behind it is what makes the subscription page show a raw slug
  // instead of a plan name.
  const subSlugs = await mongoose.connection.db.collection('subscriptions').distinct('plan');
  const clinicSlugs = await mongoose.connection.db.collection('clinics').distinct('subscription.plan');
  const referenced = [...new Set([...subSlugs, ...clinicSlugs])].filter(Boolean);
  const known = new Set(plans.map((p) => p.slug));
  const dangling = referenced.filter((s) => !known.has(s));

  console.log(`\nPlan slugs referenced by clinics/subscriptions: ${referenced.join(', ') || '(none)'}`);
  console.log(`Referenced but with NO Plan document: ${dangling.join(', ') || '(none)'}`);

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('\nFailed:', err.message);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
