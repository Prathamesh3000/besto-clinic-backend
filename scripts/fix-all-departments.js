'use strict';

/**
 * Fix: Assign department references to doctors across ALL tenant clinics.
 *
 * Maps doctors to departments by matching specialization name → department name.
 * Also creates missing departments for unmatched specializations.
 *
 * Usage:  node scripts/fix-all-departments.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  const clinics = await Clinic.find({ deletedAt: null }).select('+dbUri slug name status').lean();
  console.log(`Found ${clinics.length} clinic(s)\n`);

  for (const clinic of clinics) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`${clinic.name} (${clinic.slug}) — status: ${clinic.status}`);
    console.log('─'.repeat(60));

    if (!clinic.dbUri) {
      console.log('  ⏭  No dbUri, skipping\n');
      continue;
    }

    let tenantConn;
    try {
      tenantConn = await mongoose.createConnection(clinic.dbUri, { maxPoolSize: 2 }).asPromise();
    } catch (err) {
      console.log(`  ⏭  Connection failed: ${err.message}\n`);
      continue;
    }

    const tenantModels = require('../src/models/tenant');
    for (const [name, schema] of Object.entries(tenantModels)) {
      if (!tenantConn.models[name]) tenantConn.model(name, schema);
    }

    const Department = tenantConn.model('Department');
    const User = tenantConn.model('User');
    const Branch = tenantConn.model('Branch');

    const departments = await Department.find({ isActive: true }).lean();
    const doctors = await User.find({
      role: { $in: ['doctor', 'super_admin'] },
      isActive: true,
      deletedAt: null,
    }).lean();

    if (departments.length === 0 || doctors.length === 0) {
      console.log(`  ⏭  ${departments.length} depts, ${doctors.length} doctors — skipping\n`);
      await tenantConn.close();
      continue;
    }

    // Build specialization → department mapping (case-insensitive)
    const specToDept = {};
    for (const d of departments) {
      specToDept[d.name.toLowerCase()] = d._id;
    }

    // Find default branch for creating new departments
    const defaultBranch = await Branch.findOne({ isActive: true }).lean();

    let updated = 0;
    let created = 0;

    for (const doc of doctors) {
      const spec = (doc.specialization || '').trim();
      if (!spec) continue;

      let deptId = specToDept[spec.toLowerCase()];

      // If no matching department exists, create one
      if (!deptId) {
        const code = spec.substring(0, 4).toUpperCase().replace(/\s/g, '');
        const newDept = await Department.create({
          name: spec,
          code,
          branch: defaultBranch ? defaultBranch._id : null,
          headOfDepartment: doc._id,
          isActive: true,
        });
        deptId = newDept._id;
        specToDept[spec.toLowerCase()] = deptId;
        console.log(`  ✚ Created dept "${spec}" (${code})`);
        created++;
      }

      // Skip if already assigned correctly
      if (doc.department && doc.department.toString() === deptId.toString()) {
        continue;
      }

      await User.updateOne({ _id: doc._id }, { $set: { department: deptId } });
      console.log(`  ✅ ${doc.name} → ${spec}`);
      updated++;
    }

    // Verify — show departments with 0 doctors still
    const depsAfter = await Department.find({ isActive: true }).lean();
    let empty = 0;
    for (const d of depsAfter) {
      const count = await User.countDocuments({
        role: { $in: ['doctor', 'super_admin'] },
        isActive: true,
        department: d._id,
      });
      if (count === 0) {
        console.log(`  ⚠️  "${d.name}" still has 0 doctors`);
        empty++;
      }
    }

    console.log(`  📊 ${updated} updated, ${created} depts created, ${empty} empty depts remaining\n`);
    await tenantConn.close();
  }

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
