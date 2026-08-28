'use strict';

/**
 * One-time fix — clean up stale checked_in appointments and orphaned queue entries.
 *
 * Finds checked_in appointments where checkedInAt is more than 4 hours ago
 * (they should have progressed to in_progress/completed by now).
 * Marks them as no_show with full side effects.
 *
 * Also cleans up orphaned waiting queue entries from past days.
 *
 * Usage: node scripts/fix-stale-checkins.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const SLUG = 'jathar-dental';
const STALE_THRESHOLD_HOURS = 4; // checked in more than 4 hours ago = stale

async function fix() {
  const env = require('../src/config/env');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic) { console.error('Clinic not found'); process.exit(1); }

  const tenantConn = await mongoose.createConnection(clinic.dbUri, { maxPoolSize: 5 }).asPromise();
  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log('Connected to', clinic.name);

  const Appointment = tenantConn.model('Appointment');
  const QueueEntry = tenantConn.model('QueueEntry');
  const Patient = tenantConn.model('Patient');

  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  // ── 1. Fix stale checked_in appointments ───────────────────────────────
  const staleCheckedIn = await Appointment.find({
    status: 'checked_in',
    checkedInAt: { $lt: staleCutoff },
    deletedAt: null,
  }).select('_id patient doctor branch scheduledAt checkedInAt duration').populate('patient', 'name').populate('doctor', 'name').lean();

  console.log(`\nFound ${staleCheckedIn.length} stale checked_in appointments (checked in > ${STALE_THRESHOLD_HOURS}h ago):`);
  for (const a of staleCheckedIn) {
    const waitMin = Math.round((Date.now() - new Date(a.checkedInAt).getTime()) / 60000);
    console.log(`  - ${a.patient?.name || '?'} / ${a.doctor?.name || '?'} / branch: ${a.branch || 'NULL'} / wait: ${waitMin}m`);
  }

  if (staleCheckedIn.length > 0) {
    const ids = staleCheckedIn.map((a) => a._id);
    const result = await Appointment.updateMany(
      { _id: { $in: ids } },
      {
        status: 'no_show',
        noShowAt: new Date(),
      },
    );
    console.log(`  -> Marked ${result.modifiedCount} checked_in appointments as no_show`);

    // Increment patient noShowCount
    const patientIds = [...new Set(staleCheckedIn.map((a) => a.patient?._id?.toString()).filter(Boolean))];
    for (const pid of patientIds) {
      const count = staleCheckedIn.filter((a) => a.patient?._id?.toString() === pid).length;
      await Patient.findByIdAndUpdate(pid, { $inc: { noShowCount: count } });
    }
    console.log(`  -> Incremented noShowCount for ${patientIds.length} patients`);
  }

  // ── 2. Fix orphaned waiting queue entries ──────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const staleQueueEntries = await QueueEntry.find({
    status: 'waiting',
    createdAt: { $lt: today }, // from previous days
  }).select('_id patient doctor branch checkedInAt createdAt').populate('patient', 'name').populate('doctor', 'name').lean();

  console.log(`\nFound ${staleQueueEntries.length} orphaned waiting queue entries from previous days:`);
  for (const q of staleQueueEntries) {
    console.log(`  - ${q.patient?.name || '?'} / ${q.doctor?.name || '?'} / branch: ${q.branch || 'NULL'}`);
  }

  if (staleQueueEntries.length > 0) {
    const queueIds = staleQueueEntries.map((q) => q._id);
    const result = await QueueEntry.updateMany(
      { _id: { $in: queueIds } },
      { status: 'no_show' },
    );
    console.log(`  -> Marked ${result.modifiedCount} queue entries as no_show`);
  }

  // Also clean up today's waiting entries that are stale (checked in > 4h ago)
  const staleTodayQueue = await QueueEntry.find({
    status: 'waiting',
    createdAt: { $gte: today },
    checkedInAt: { $lt: staleCutoff },
  }).select('_id patient doctor').populate('patient', 'name').lean();

  if (staleTodayQueue.length > 0) {
    console.log(`\nFound ${staleTodayQueue.length} stale today queue entries (checked in > ${STALE_THRESHOLD_HOURS}h ago):`);
    const sqIds = staleTodayQueue.map((q) => q._id);
    const result = await QueueEntry.updateMany(
      { _id: { $in: sqIds } },
      { status: 'no_show' },
    );
    console.log(`  -> Marked ${result.modifiedCount} as no_show`);
  }

  // ── 3. Summary ─────────────────────────────────────────────────────────
  const remainingWaiting = await QueueEntry.countDocuments({ status: 'waiting' });
  const remainingCheckedIn = await Appointment.countDocuments({ status: 'checked_in', deletedAt: null });
  console.log('\n=== After cleanup ===');
  console.log(`Remaining waiting queue entries: ${remainingWaiting}`);
  console.log(`Remaining checked_in appointments: ${remainingCheckedIn}`);

  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone.');
}

fix().catch((e) => { console.error(e); process.exit(1); });
