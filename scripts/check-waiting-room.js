'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function check() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: 'jathar-dental' }).select('+dbUri').lean();

  const tenantConn = await mongoose.createConnection(clinic.dbUri, { maxPoolSize: 5 }).asPromise();
  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }

  // Check for waiting queue entries
  const QueueEntry = tenantConn.model('QueueEntry');
  const waitingEntries = await QueueEntry.find({ status: 'waiting' })
    .populate('patient', 'name')
    .populate('doctor', 'name')
    .populate('branch', 'name')
    .lean();
  console.log('=== WAITING QUEUE ENTRIES ===');
  console.log('Count:', waitingEntries.length);
  for (const e of waitingEntries) {
    console.log(JSON.stringify({
      id: e._id.toString(),
      patient: e.patient?.name,
      doctor: e.doctor?.name,
      branch: e.branch?.name || 'NULL',
      branchId: e.branch ? e.branch._id.toString() : String(e.branch || 'null'),
      checkedInAt: e.checkedInAt,
      createdAt: e.createdAt,
      tokenNumber: e.tokenNumber,
    }, null, 2));
  }

  // Check for checked_in appointments
  const Appointment = tenantConn.model('Appointment');
  const checkedIn = await Appointment.find({ status: 'checked_in', deletedAt: null })
    .populate('patient', 'name')
    .populate('doctor', 'name')
    .populate('branch', 'name')
    .lean();
  console.log('\n=== CHECKED_IN APPOINTMENTS ===');
  console.log('Count:', checkedIn.length);
  for (const a of checkedIn) {
    console.log(JSON.stringify({
      id: a._id.toString(),
      patient: a.patient?.name,
      doctor: a.doctor?.name,
      branch: a.branch?.name || 'NULL',
      branchId: a.branch ? a.branch._id.toString() : String(a.branch || 'null'),
      scheduledAt: a.scheduledAt,
      checkedInAt: a.checkedInAt,
    }, null, 2));
  }

  // Also list all branches
  const Branch = tenantConn.model('Branch');
  const branches = await Branch.find({ deletedAt: null }).select('name code').lean();
  console.log('\n=== ALL BRANCHES ===');
  for (const b of branches) {
    console.log(b._id.toString(), '-', b.name, '(' + (b.code || 'no code') + ')');
  }

  await tenantConn.close();
  await mongoose.disconnect();
}

check().catch((e) => { console.error(e); process.exit(1); });
