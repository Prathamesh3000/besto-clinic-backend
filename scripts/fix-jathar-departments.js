'use strict';

/**
 * Fix: Assign department references to doctors in Jathar Dental Clinic.
 *
 * The seed script created departments and doctors separately but never set
 * the `department` field on doctor User documents. The booking flow queries
 * User.find({ department: <departmentId> }) which returns 0 results.
 *
 * This script:
 *   1. Finds all departments in the tenant DB
 *   2. Maps doctors to departments by matching specialization → department name
 *   3. Creates a "Cosmetic Dentistry" department if missing (for Dr. Patwardhan)
 *   4. Updates each doctor's `department` field
 *
 * Usage:  node scripts/fix-jathar-departments.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const SLUG = 'jathar-dental';

async function main() {
  const env = require('../src/config/env');

  // 1. Connect to platform DB
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  console.log('✅ Connected to Platform DB');

  // 2. Find clinic
  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic) {
    console.error('❌ Clinic not found for slug:', SLUG);
    process.exit(1);
  }
  console.log(`✅ Found clinic: ${clinic.name}`);

  // 3. Connect to tenant DB
  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 5,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`✅ Connected to tenant DB — ${Object.keys(tenantConn.models).length} models`);

  const User = tenantConn.model('User');
  const Department = tenantConn.model('Department');

  // 4. Get all departments
  const departments = await Department.find({ isActive: true }).lean();
  console.log(`\n📋 Departments (${departments.length}):`);
  for (const d of departments) {
    console.log(`   - ${d.name} (${d.code}) — ID: ${d._id}`);
  }

  // Build specialization → department mapping
  const specToDept = {};
  for (const d of departments) {
    specToDept[d.name.toLowerCase()] = d._id;
  }

  // 5. Check if Cosmetic Dentistry department exists, create if not
  if (!specToDept['cosmetic dentistry']) {
    // Find FC Road branch for the new department
    const Branch = tenantConn.model('Branch');
    const fcBranch = await Branch.findOne({ code: 'JDFC' }).lean();
    const cosmeticDoc = await Department.findOne({ specialization: 'Cosmetic Dentistry' });
    if (!cosmeticDoc) {
      const cosmeticDoctor = await User.findOne({ specialization: 'Cosmetic Dentistry', role: { $in: ['doctor', 'super_admin'] } }).lean();
      const newDept = await Department.create({
        name: 'Cosmetic Dentistry',
        code: 'COSM',
        branch: fcBranch ? fcBranch._id : null,
        headOfDepartment: cosmeticDoctor ? cosmeticDoctor._id : null,
        isActive: true,
      });
      specToDept['cosmetic dentistry'] = newDept._id;
      console.log(`\n✅ Created "Cosmetic Dentistry" department (${newDept._id})`);
    }
  }

  // 6. Get all doctors
  const doctors = await User.find({
    role: { $in: ['doctor', 'super_admin'] },
    isActive: true,
  }).lean();

  console.log(`\n👨‍⚕️ Doctors (${doctors.length}):`);

  let updated = 0;
  let skipped = 0;

  for (const doc of doctors) {
    const spec = (doc.specialization || '').toLowerCase();
    const deptId = specToDept[spec];

    if (!deptId) {
      console.log(`   ⚠️  ${doc.name} (${doc.specialization}) — no matching department, SKIPPED`);
      skipped++;
      continue;
    }

    if (doc.department && doc.department.toString() === deptId.toString()) {
      console.log(`   ✓  ${doc.name} (${doc.specialization}) — already assigned`);
      skipped++;
      continue;
    }

    await User.updateOne(
      { _id: doc._id },
      { $set: { department: deptId } }
    );
    console.log(`   ✅ ${doc.name} (${doc.specialization}) → department ${deptId}`);
    updated++;
  }

  console.log(`\n📊 Summary: ${updated} updated, ${skipped} skipped`);

  // 7. Verify
  console.log('\n🔍 Verification — doctors per department:');
  for (const d of [...departments, ...(specToDept['cosmetic dentistry'] ? [{ _id: specToDept['cosmetic dentistry'], name: 'Cosmetic Dentistry' }] : [])]) {
    const count = await User.countDocuments({
      department: d._id,
      role: { $in: ['doctor', 'super_admin'] },
      isActive: true,
    });
    console.log(`   ${d.name}: ${count} doctor(s)`);
  }

  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\n✅ Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
