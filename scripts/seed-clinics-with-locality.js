'use strict';

/**
 * One-time script to add address.locality to existing seed clinics.
 * Run: node scripts/seed-clinics-with-locality.js
 *
 * Maps each seed clinic's street address to its neighbourhood/locality.
 * In production, clinics set locality during registration or profile editing.
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');

const LOCALITY_MAP = [
  { slug: 'smilecare-dental', locality: 'Santacruz West' },
  { slug: 'healthplus-hospital', locality: 'Ashok Nagar' },
  { slug: 'vision-eyecare', locality: 'Sector 18' },
  { slug: 'little-angels-pediatric', locality: 'Deccan Gymkhana' },
  { slug: 'ortholife-clinic', locality: 'Park Street' },
  { slug: 'skin-and-you-derma', locality: 'Banjara Hills' },
  { slug: 'wellness-family-clinic', locality: 'MG Road' },
  { slug: 'cardiocare-heart', locality: 'Arera Hills' },
  { slug: 'neurohealth-clinic', locality: 'Sector 17' },
  { slug: 'momcare-hospital', locality: 'Christian Basti' },
  { slug: 'demo-clinic', locality: 'Fort' },
];

async function run() {
  const uri = env.PLATFORM_DB_URI;
  if (!uri) {
    console.error('No PLATFORM_DB_URI found in env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to platform DB');

  const Clinic = require('../src/models/platform/Clinic');

  for (const { slug, locality } of LOCALITY_MAP) {
    const result = await Clinic.updateOne(
      { slug, deletedAt: null },
      { $set: { 'address.locality': locality } },
    );

    if (result.matchedCount > 0) {
      console.log(`  Updated ${slug} → locality: "${locality}"`);
    } else {
      console.log(`  Skipped ${slug} (not found)`);
    }
  }

  console.log('\nDone. Locality data applied to seed clinics.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
