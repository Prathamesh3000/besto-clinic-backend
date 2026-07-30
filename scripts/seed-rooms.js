'use strict';

/**
 * Seed script — creates ConsultationRoom entries for all branches in a tenant.
 *
 * Usage:
 *   node scripts/seed-rooms.js <tenant-slug>
 *   e.g.  node scripts/seed-rooms.js smilecare-dental
 *
 * What it does:
 *   1. Connects to platform DB → finds clinic by slug
 *   2. Connects to tenant DB → loads existing branches
 *   3. Creates consultation rooms per branch (upserts — safe to re-run)
 *
 * Room plan per branch:
 *   - 3 consultation rooms (general dentist chairs)
 *   - 1 procedure room (surgeries, RCTs)
 *   - 1 emergency room
 *   - 1 general/triage room
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const SLUG = process.argv[2];
if (!SLUG) {
  console.error('Usage: node scripts/seed-rooms.js <tenant-slug>');
  process.exit(1);
}

// ── Room templates per branch ────────────────────────────
function buildRooms(branchCode) {
  const prefix = branchCode || 'BR';
  return [
    {
      name: 'Consultation Room 1',
      code: `${prefix}-C1`,
      type: 'consultation',
      floor: 'Ground',
    },
    {
      name: 'Consultation Room 2',
      code: `${prefix}-C2`,
      type: 'consultation',
      floor: 'Ground',
    },
    {
      name: 'Consultation Room 3',
      code: `${prefix}-C3`,
      type: 'consultation',
      floor: 'First',
    },
    {
      name: 'Procedure Room',
      code: `${prefix}-P1`,
      type: 'procedure',
      floor: 'First',
    },
    {
      name: 'Emergency Room',
      code: `${prefix}-E1`,
      type: 'emergency',
      floor: 'Ground',
    },
    {
      name: 'Triage / General Room',
      code: `${prefix}-G1`,
      type: 'general',
      floor: 'Ground',
    },
  ];
}

// ── Main ──────────────────────────────────────────────────
async function seed() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB & find clinic ───────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic || !clinic.dbUri) {
    console.error(`Tenant "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Found tenant: ${clinic.name} (${SLUG})\n`);

  // ── 2. Connect to tenant DB ───────────────────────────
  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 2,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`Connected to tenant DB (${Object.keys(tenantConn.models).length} models)\n`);

  const Branch = tenantConn.model('Branch');
  const ConsultationRoom = tenantConn.model('ConsultationRoom');

  // ── 3. Fetch existing branches ─────────────────────────
  const branches = await Branch.find({ deletedAt: null, isActive: true });

  if (branches.length === 0) {
    console.error('No active branches found!');
    await tenantConn.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found ${branches.length} branch(es):`);
  for (const b of branches) {
    console.log(`  • ${b.name} (${b.code || b._id})`);
  }

  // ── 4. Create/update ConsultationRoom entries ────────────
  console.log('\n--- Seeding Consultation Rooms ---');
  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    const branchCode = (branch.code || branch.name.replace(/\s+/g, '').slice(0, 4)).toUpperCase();
    const rooms = buildRooms(branchCode);

    console.log(`\n  Branch: ${branch.name} (${branchCode})`);

    for (const room of rooms) {
      // Upsert by branch + code (unique index)
      const filter = { branch: branch._id, code: room.code, deletedAt: null };
      const existing = await ConsultationRoom.findOne(filter);

      if (existing) {
        skipped++;
        console.log(`    ○ ${room.code} — ${room.name} (already exists, status: ${existing.status})`);
        continue;
      }

      await ConsultationRoom.create({
        branch: branch._id,
        name: room.name,
        code: room.code,
        type: room.type,
        floor: room.floor,
        status: 'available',
        isActive: true,
      });
      created++;
      console.log(`    + ${room.code} — ${room.name} (${room.type}, ${room.floor} floor)`);
    }
  }

  console.log(`\nRooms: ${created} created, ${skipped} skipped (already exist)`);

  // ── 5. Verification ──────────────────────────────────
  console.log('\n=== Verification ===');

  const totalRooms = await ConsultationRoom.countDocuments({ deletedAt: null, isActive: true });
  const byType = await ConsultationRoom.aggregate([
    { $match: { deletedAt: null, isActive: true } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const byBranch = await ConsultationRoom.aggregate([
    { $match: { deletedAt: null, isActive: true } },
    {
      $lookup: {
        from: 'branches',
        localField: 'branch',
        foreignField: '_id',
        as: 'branchInfo',
      },
    },
    { $unwind: '$branchInfo' },
    {
      $group: {
        _id: '$branch',
        branchName: { $first: '$branchInfo.name' },
        count: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
      },
    },
  ]);

  console.log(`  Total active rooms: ${totalRooms}`);
  console.log(`  By type: ${byType.map((t) => `${t._id}: ${t.count}`).join(', ')}`);
  console.log(`  By branch:`);
  for (const b of byBranch) {
    console.log(`    ${b.branchName}: ${b.count} rooms (${b.available} available)`);
  }

  // Print summary table
  console.log('\n  Room Summary:');
  console.log('  ┌────────────┬──────────────────────────┬──────────────┬──────────┬───────────┐');
  console.log('  │ Code       │ Name                     │ Type         │ Floor    │ Status    │');
  console.log('  ├────────────┼──────────────────────────┼──────────────┼──────────┼───────────┤');

  const allRooms = await ConsultationRoom.find({ deletedAt: null, isActive: true })
    .populate('branch', 'name code')
    .sort({ branch: 1, code: 1 })
    .lean();

  let lastBranch = '';
  for (const room of allRooms) {
    const branchName = room.branch?.name || 'Unknown';
    if (branchName !== lastBranch) {
      if (lastBranch) {
        console.log('  ├────────────┼──────────────────────────┼──────────────┼──────────┼───────────┤');
      }
      console.log(`  │ ${branchName.padEnd(78)} │`);
      console.log('  ├────────────┼──────────────────────────┼──────────────┼──────────┼───────────┤');
      lastBranch = branchName;
    }
    console.log(
      `  │ ${room.code.padEnd(10)} │ ${room.name.padEnd(24)} │ ${room.type.padEnd(12)} │ ${(room.floor || '—').padEnd(8)} │ ${room.status.padEnd(9)} │`,
    );
  }
  console.log('  └────────────┴──────────────────────────┴──────────────┴──────────┴───────────┘');

  // ── Cleanup ────────────────────────────────────────────
  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
