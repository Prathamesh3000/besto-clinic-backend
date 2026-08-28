'use strict';

/**
 * One-time data fix — mark overdue appointments as no-show in jathar-dental.
 *
 * What it does:
 *   1. Finds past `confirmed` appointments (past grace period) → marks as no_show
 *   2. Finds past `requested` appointments (past grace period) → marks as cancelled
 *   3. Finds existing `no_show` appointments missing `noShowAt` → backfills timestamp
 *   4. Recalculates `patient.noShowCount` for all patients
 *
 * Usage:
 *   node scripts/fix-noshow-data.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const SLUG = 'jathar-dental';
const GRACE_PERIOD_MINUTES = 30;

async function fix() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB ──────────────────────────────────────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');
  console.log('Connected to Platform DB');

  // ── 2. Find clinic and connect to tenant DB ────────────────────────────
  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic) {
    console.error(`Clinic "${SLUG}" not found in platform DB`);
    process.exit(1);
  }
  console.log(`Found clinic: ${clinic.name} (${SLUG})`);

  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 5,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`Connected to tenant DB — ${Object.keys(tenantConn.models).length} models`);

  const Appointment = tenantConn.model('Appointment');
  const Patient = tenantConn.model('Patient');

  const now = new Date();
  const gracePeriodMs = GRACE_PERIOD_MINUTES * 60 * 1000;
  const cutoff = new Date(now.getTime() - gracePeriodMs);

  // Overdue expression: scheduledAt + duration (in ms) < cutoff
  const overdueExpr = {
    $expr: {
      $lt: [
        { $add: ['$scheduledAt', { $multiply: ['$duration', 60000] }] },
        cutoff,
      ],
    },
  };

  // ── 3. Fix stale CONFIRMED appointments → no_show ──────────────────────
  const staleConfirmed = await Appointment.find({
    status: 'confirmed',
    deletedAt: null,
    ...overdueExpr,
  }).select('_id patient scheduledAt duration').lean();

  console.log(`\nFound ${staleConfirmed.length} stale confirmed appointments to mark as no_show`);

  for (const appt of staleConfirmed) {
    const endTime = new Date(new Date(appt.scheduledAt).getTime() + (appt.duration || 30) * 60000);
    await Appointment.findByIdAndUpdate(appt._id, {
      status: 'no_show',
      noShowAt: endTime,
    });
  }
  if (staleConfirmed.length > 0) {
    console.log(`  -> Updated ${staleConfirmed.length} confirmed → no_show`);
  }

  // ── 4. Fix stale REQUESTED appointments → cancelled ────────────────────
  const staleRequested = await Appointment.find({
    status: 'requested',
    deletedAt: null,
    ...overdueExpr,
  }).select('_id scheduledAt duration').lean();

  console.log(`Found ${staleRequested.length} stale requested appointments to auto-cancel`);

  if (staleRequested.length > 0) {
    const staleIds = staleRequested.map((a) => a._id);
    await Appointment.updateMany(
      { _id: { $in: staleIds } },
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Auto-cancelled: unconfirmed past appointment',
      },
    );
    console.log(`  -> Updated ${staleRequested.length} requested → cancelled`);
  }

  // ── 5. Backfill noShowAt on existing no_show appointments ──────────────
  const missingNoShowAt = await Appointment.find({
    status: 'no_show',
    noShowAt: null,
    deletedAt: null,
  }).select('_id scheduledAt duration').lean();

  console.log(`Found ${missingNoShowAt.length} no_show appointments missing noShowAt`);

  for (const appt of missingNoShowAt) {
    const endTime = new Date(new Date(appt.scheduledAt).getTime() + (appt.duration || 30) * 60000);
    await Appointment.findByIdAndUpdate(appt._id, { noShowAt: endTime });
  }
  if (missingNoShowAt.length > 0) {
    console.log(`  -> Backfilled noShowAt on ${missingNoShowAt.length} appointments`);
  }

  // ── 6. Recalculate patient.noShowCount ─────────────────────────────────
  console.log('\nRecalculating patient noShowCount...');

  const noShowCounts = await Appointment.aggregate([
    { $match: { status: 'no_show', deletedAt: null } },
    { $group: { _id: '$patient', count: { $sum: 1 } } },
  ]);

  // Reset all patients to 0 first, then set actual counts
  await Patient.updateMany({ deletedAt: null }, { noShowCount: 0 });

  let patientsUpdated = 0;
  for (const { _id, count } of noShowCounts) {
    await Patient.findByIdAndUpdate(_id, { noShowCount: count });
    patientsUpdated += 1;
  }
  console.log(`  -> Updated noShowCount for ${patientsUpdated} patients`);

  // ── 7. Summary ─────────────────────────────────────────────────────────
  const totalNoShow = await Appointment.countDocuments({ status: 'no_show', deletedAt: null });
  const totalCancelled = await Appointment.countDocuments({ status: 'cancelled', deletedAt: null });
  const totalCompleted = await Appointment.countDocuments({ status: 'completed', deletedAt: null });
  const totalAll = await Appointment.countDocuments({ deletedAt: null });

  console.log('\n=== Summary ===');
  console.log(`Total appointments: ${totalAll}`);
  console.log(`  Completed: ${totalCompleted}`);
  console.log(`  Cancelled: ${totalCancelled}`);
  console.log(`  No-Show:   ${totalNoShow}`);
  console.log(`  No-Show Rate: ${totalAll > 0 ? ((totalNoShow / totalAll) * 100).toFixed(1) : 0}%`);

  // ── Cleanup ────────────────────────────────────────────────────────────
  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone.');
}

fix().catch((err) => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
