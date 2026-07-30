'use strict';

/**
 * Migration: Backfill job posting locations from verified clinic data.
 *
 * Problem:
 * - Old jobs were created with free-text city/state fields (unverified).
 * - The new architecture uses branch-picker so `location` is always verified.
 * - Existing records may have empty, inconsistent, or unverified location data.
 *
 * What this script does:
 * 1. Finds all job postings (active, draft, closed)
 * 2. For each, ensures `location.city/state` is populated from verified `clinicLocation`
 *    (which was set server-side from `clinic.address` at creation time)
 * 3. Also ensures `clinicLocation` itself is populated (backfills from Clinic.address if missing)
 * 4. Logs all changes for audit
 *
 * Safe to re-run — idempotent (only updates records that need fixing).
 *
 * Usage: node scripts/migrate-job-locations.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function migrate() {
  const env = require('../src/config/env');

  try {
    await mongoose.connect(env.PLATFORM_DB_URI);
    console.log('Connected to platform DB\n');

    // Register models
    require('../src/models/platform/Clinic');
    require('../src/models/platform/JobPosting');

    const Clinic = mongoose.model('Clinic');
    const JobPosting = mongoose.model('JobPosting');

    // ═══════════════════════════════════════════════════════
    // STEP 1: Build clinic address lookup
    // ═══════════════════════════════════════════════════════

    console.log('--- Step 1: Loading clinic addresses ---');

    const clinics = await Clinic.find({ deletedAt: null })
      .select('_id name slug address')
      .lean();

    const clinicMap = new Map();
    for (const c of clinics) {
      clinicMap.set(c._id.toString(), c);
    }

    console.log(`  Loaded ${clinics.length} clinic(s)\n`);

    // ═══════════════════════════════════════════════════════
    // STEP 2: Audit & fix all job postings
    // ═══════════════════════════════════════════════════════

    console.log('--- Step 2: Auditing job posting locations ---');

    // Get ALL jobs including soft-deleted to audit everything
    const allJobs = await JobPosting.find({})
      .setOptions({ skipSoftDelete: true })
      .select('title slug clinic clinicName clinicLocation location status')
      .lean();

    console.log(`  Found ${allJobs.length} total job posting(s)\n`);

    let fixedClinicLocation = 0;
    let fixedLocation = 0;
    let alreadyOk = 0;
    let orphaned = 0;

    for (const job of allJobs) {
      const clinic = clinicMap.get(job.clinic?.toString());
      if (!clinic) {
        console.log(`  ORPHAN  "${job.title}" (${job.slug}) — clinic ${job.clinic} not found`);
        orphaned++;
        continue;
      }

      const updates = {};
      let reasons = [];

      // --- Fix clinicLocation if missing or incomplete ---
      const hasClinicLocation = job.clinicLocation?.city;
      if (!hasClinicLocation && clinic.address?.city) {
        updates['clinicLocation.city'] = clinic.address.city;
        updates['clinicLocation.state'] = clinic.address.state || '';
        updates['clinicLocation.country'] = clinic.address.country || 'IN';
        reasons.push('clinicLocation was empty → set from clinic.address');
        fixedClinicLocation++;
      }

      // --- Fix location.city/state ---
      const hasLocationCity = job.location?.city?.trim();
      const verifiedCity = clinic.address?.city || job.clinicLocation?.city || '';
      const verifiedState = clinic.address?.state || job.clinicLocation?.state || '';

      if (!hasLocationCity && verifiedCity) {
        // Empty location → fill from verified data
        updates['location.city'] = verifiedCity;
        updates['location.state'] = verifiedState;
        reasons.push(`location.city was empty → set to "${verifiedCity}"`);
        fixedLocation++;
      } else if (hasLocationCity) {
        // Location exists — check if it matches clinicLocation
        const clinicCity = (clinic.address?.city || '').toLowerCase().trim();
        const jobCity = (job.location.city || '').toLowerCase().trim();

        if (clinicCity && jobCity !== clinicCity) {
          // Mismatch — could be a different branch or free-text fraud
          // Update to clinic's verified address (safe default)
          updates['location.city'] = clinic.address.city;
          updates['location.state'] = clinic.address.state || '';
          reasons.push(`location.city "${job.location.city}" didn't match verified "${clinic.address.city}" → updated`);
          fixedLocation++;
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await JobPosting.updateOne({ _id: job._id }, { $set: updates });
        console.log(`  FIXED   [${job.status}] "${job.title}" at ${clinic.name}`);
        for (const r of reasons) {
          console.log(`          → ${r}`);
        }
      } else {
        alreadyOk++;
      }
    }

    // ═══════════════════════════════════════════════════════
    // STEP 3: Ensure location.type defaults
    // ═══════════════════════════════════════════════════════

    console.log('\n--- Step 3: Fixing missing location types ---');

    const missingType = await JobPosting.updateMany(
      { 'location.type': { $exists: false } },
      { $set: { 'location.type': 'on_site' } },
    );

    if (missingType.modifiedCount > 0) {
      console.log(`  Set location.type = "on_site" for ${missingType.modifiedCount} job(s)`);
    } else {
      console.log('  All jobs have location.type set');
    }

    // ═══════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════

    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n  Total jobs scanned:     ${allJobs.length}`);
    console.log(`  clinicLocation fixed:   ${fixedClinicLocation}`);
    console.log(`  location fixed:         ${fixedLocation}`);
    console.log(`  Already OK:             ${alreadyOk}`);
    console.log(`  Orphaned (no clinic):   ${orphaned}`);

    // Verification pass
    console.log('\n--- Verification ---');
    const emptyLocationCity = await JobPosting.countDocuments({
      'location.city': { $in: ['', null] },
      'location.type': { $ne: 'remote' },
      deletedAt: null,
    });
    const emptyClinicLocation = await JobPosting.countDocuments({
      'clinicLocation.city': { $in: ['', null] },
      deletedAt: null,
    });

    console.log(`  Jobs with empty location.city (non-remote): ${emptyLocationCity}`);
    console.log(`  Jobs with empty clinicLocation.city: ${emptyClinicLocation}`);

    if (emptyLocationCity === 0 && emptyClinicLocation === 0) {
      console.log('\n  All location data is verified and consistent.');
    } else {
      console.log('\n  Some jobs still have empty location data (likely remote roles or clinics without addresses).');
    }

    console.log('\n' + '='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

migrate();
