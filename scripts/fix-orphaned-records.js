'use strict';

/**
 * fix-orphaned-records.js — One-time migration to clean up orphaned records.
 *
 * Finds and fixes records that were left orphaned because parent records
 * (appointments, invoices, patients) were cancelled/deleted before the
 * cascading cleanup logic was added.
 *
 * What it fixes:
 * 1. Invoices linked to deleted/cancelled appointments → cancelled
 * 2. Pending payments linked to cancelled/deleted invoices → failed
 * 3. VideoSessions linked to deleted/cancelled appointments → cancelled
 * 4. QueueEntries linked to deleted/cancelled appointments → cancelled
 * 5. PrescriptionTasks for deleted patients → deactivated
 * 6. CareReminders for deleted patients → cancelled
 *
 * Usage:
 *   node scripts/fix-orphaned-records.js [--dry-run] [--slug <tenant-slug>]
 *
 *   --dry-run   Show what would be changed without modifying data
 *   --slug      Run only for a specific tenant (default: all active tenants)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const SLUG_ARG_IDX = process.argv.indexOf('--slug');
const TARGET_SLUG = SLUG_ARG_IDX !== -1 ? process.argv[SLUG_ARG_IDX + 1] : null;

async function fixTenant(tenantConn, slug) {
  const Appointment = tenantConn.model('Appointment');
  const Invoice = tenantConn.model('Invoice');
  const Payment = tenantConn.model('Payment');
  const VideoSession = tenantConn.model('VideoSession');
  const QueueEntry = tenantConn.model('QueueEntry');
  const Patient = tenantConn.model('Patient');
  const PrescriptionTask = tenantConn.model('PrescriptionTask');
  const CareReminder = tenantConn.model('CareReminder');

  const stats = {
    invoicesCancelled: 0,
    paymentsFailed: 0,
    videoSessionsCancelled: 0,
    queueEntriesCancelled: 0,
    prescriptionTasksDeactivated: 0,
    careRemindersCancelled: 0,
  };

  // ── 1. Find deleted/cancelled appointments + invoices with missing appointments ──
  // Soft-deleted appointments (raw query to bypass Mongoose middleware)
  const deletedApptIds = await tenantConn.collection('appointments')
    .find({ deletedAt: { $ne: null } }, { projection: { _id: 1 } })
    .toArray();
  const deletedApptIdList = deletedApptIds.map(a => a._id);

  // Cancelled appointments
  const cancelledApptIds = await tenantConn.collection('appointments')
    .find({ status: 'cancelled', deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  const cancelledApptIdList = cancelledApptIds.map(a => a._id);

  const allOrphanApptIds = [...deletedApptIdList, ...cancelledApptIdList];

  // Also find invoices whose appointment was HARD-DELETED (no longer in DB at all)
  const invoicesWithAppt = await tenantConn.collection('invoices')
    .find(
      { appointment: { $ne: null }, status: { $in: ['draft', 'sent', 'overdue'] }, deletedAt: null },
      { projection: { _id: 1, appointment: 1 } },
    )
    .toArray();

  // Collect unique appointment IDs referenced by active invoices
  const referencedApptIds = [...new Set(invoicesWithAppt.map(i => i.appointment.toString()))];
  const existingApptIds = await tenantConn.collection('appointments')
    .find({ _id: { $in: referencedApptIds.map(id => new mongoose.Types.ObjectId(id)) } }, { projection: { _id: 1 } })
    .toArray();
  const existingApptIdSet = new Set(existingApptIds.map(a => a._id.toString()));

  // Invoices whose appointment is completely missing from DB
  const hardDeletedOrphanInvoiceIds = invoicesWithAppt
    .filter(i => !existingApptIdSet.has(i.appointment.toString()))
    .map(i => i._id);

  if (allOrphanApptIds.length > 0 || hardDeletedOrphanInvoiceIds.length > 0) {
    // 1a. Cancel orphaned invoices — both linked to deleted/cancelled AND hard-deleted appointments
    const orphanedInvoiceFilter = {
      $or: [
        { appointment: { $in: allOrphanApptIds }, status: { $in: ['draft', 'sent', 'overdue'] }, deletedAt: null },
        { _id: { $in: hardDeletedOrphanInvoiceIds } },
      ],
    };

    if (DRY_RUN) {
      const count = await Invoice.countDocuments(orphanedInvoiceFilter);
      stats.invoicesCancelled = count;
      console.log(`  [DRY-RUN] Would cancel ${count} orphaned invoices`);
    } else {
      const result = await Invoice.updateMany(
        orphanedInvoiceFilter,
        { $set: { status: 'cancelled' } },
      );
      stats.invoicesCancelled = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Cancelled ${result.modifiedCount} orphaned invoices`);
      }
    }

    // 1b. Cancel orphaned VideoSessions
    const orphanedVideoFilter = {
      appointment: { $in: allOrphanApptIds },
      status: { $in: ['requested', 'scheduled', 'waiting'] },
      deletedAt: null,
    };

    if (DRY_RUN) {
      const count = await VideoSession.countDocuments(orphanedVideoFilter);
      stats.videoSessionsCancelled = count;
      console.log(`  [DRY-RUN] Would cancel ${count} orphaned video sessions`);
    } else {
      const result = await VideoSession.updateMany(
        orphanedVideoFilter,
        { $set: { status: 'cancelled' } },
      );
      stats.videoSessionsCancelled = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Cancelled ${result.modifiedCount} orphaned video sessions`);
      }
    }

    // 1c. Cancel orphaned QueueEntries
    const orphanedQueueFilter = {
      appointment: { $in: allOrphanApptIds },
      status: 'waiting',
    };

    if (DRY_RUN) {
      const count = await QueueEntry.countDocuments(orphanedQueueFilter);
      stats.queueEntriesCancelled = count;
      console.log(`  [DRY-RUN] Would cancel ${count} orphaned queue entries`);
    } else {
      const result = await QueueEntry.updateMany(
        orphanedQueueFilter,
        { $set: { status: 'cancelled' } },
      );
      stats.queueEntriesCancelled = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Cancelled ${result.modifiedCount} orphaned queue entries`);
      }
    }
  }

  // ── 2. Fail pending payments for cancelled/deleted invoices ────────────
  // Find all cancelled or deleted invoices
  const cancelledInvoiceIds = await tenantConn.collection('invoices')
    .find(
      { $or: [{ status: 'cancelled' }, { deletedAt: { $ne: null } }] },
      { projection: { _id: 1 } },
    )
    .toArray();
  const cancelledInvIdList = cancelledInvoiceIds.map(i => i._id);

  if (cancelledInvIdList.length > 0) {
    const orphanedPaymentFilter = {
      invoice: { $in: cancelledInvIdList },
      status: 'pending',
      deletedAt: null,
    };

    if (DRY_RUN) {
      const count = await Payment.countDocuments(orphanedPaymentFilter);
      stats.paymentsFailed = count;
      console.log(`  [DRY-RUN] Would fail ${count} orphaned pending payments`);
    } else {
      const result = await Payment.updateMany(
        orphanedPaymentFilter,
        { $set: { status: 'failed', 'metadata.failureReason': 'orphan_cleanup_migration' } },
      );
      stats.paymentsFailed = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Failed ${result.modifiedCount} orphaned pending payments`);
      }
    }
  }

  // ── 3. Clean up records for deleted patients ──────────────────────────
  const deletedPatientIds = await tenantConn.collection('patients')
    .find({ deletedAt: { $ne: null } }, { projection: { _id: 1 } })
    .toArray();
  const deletedPatIdList = deletedPatientIds.map(p => p._id);

  if (deletedPatIdList.length > 0) {
    // 3a. Deactivate PrescriptionTasks
    const taskFilter = { patient: { $in: deletedPatIdList }, isActive: true };
    if (DRY_RUN) {
      const count = await PrescriptionTask.countDocuments(taskFilter);
      stats.prescriptionTasksDeactivated = count;
      console.log(`  [DRY-RUN] Would deactivate ${count} prescription tasks for deleted patients`);
    } else {
      const result = await PrescriptionTask.updateMany(
        taskFilter,
        { $set: { isActive: false, deactivatedAt: new Date() } },
      );
      stats.prescriptionTasksDeactivated = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Deactivated ${result.modifiedCount} prescription tasks`);
      }
    }

    // 3b. Cancel pending CareReminders
    const reminderFilter = {
      patient: { $in: deletedPatIdList },
      status: { $in: ['pending', 'sent'] },
    };
    if (DRY_RUN) {
      const count = await CareReminder.countDocuments(reminderFilter);
      stats.careRemindersCancelled = count;
      console.log(`  [DRY-RUN] Would cancel ${count} care reminders for deleted patients`);
    } else {
      const result = await CareReminder.updateMany(
        reminderFilter,
        { $set: { status: 'cancelled' } },
      );
      stats.careRemindersCancelled = result.modifiedCount;
      if (result.modifiedCount > 0) {
        console.log(`  ✅ Cancelled ${result.modifiedCount} care reminders`);
      }
    }
  }

  return stats;
}

async function main() {
  const env = require('../src/config/env');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Orphaned Records Cleanup Migration`);
  console.log(`  ${DRY_RUN ? '🔍 DRY RUN — no changes will be made' : '🔧 LIVE RUN — records will be updated'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Connect to platform DB ─────────────────────────────────────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  console.log('✅ Connected to Platform DB\n');

  // ── Find target clinics ────────────────────────────────────────────
  const clinicFilter = { status: 'active' };
  if (TARGET_SLUG) clinicFilter.slug = TARGET_SLUG;

  const clinics = await Clinic.find(clinicFilter).select('+dbUri slug name').lean();

  if (clinics.length === 0) {
    console.log('⚠️  No clinics found matching criteria.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${clinics.length} clinic(s) to process:\n`);

  const tenantModels = require('../src/models/tenant');
  const grandTotals = {
    invoicesCancelled: 0,
    paymentsFailed: 0,
    videoSessionsCancelled: 0,
    queueEntriesCancelled: 0,
    prescriptionTasksDeactivated: 0,
    careRemindersCancelled: 0,
  };

  for (const clinic of clinics) {
    console.log(`── ${clinic.name} (${clinic.slug}) ${'─'.repeat(40)}`);

    if (!clinic.dbUri) {
      console.log('  ⚠️  No dbUri — skipping\n');
      continue;
    }

    let tenantConn;
    try {
      tenantConn = await mongoose.createConnection(clinic.dbUri, {
        maxPoolSize: 2,
      }).asPromise();

      for (const [name, schema] of Object.entries(tenantModels)) {
        if (!tenantConn.models[name]) tenantConn.model(name, schema);
      }

      const stats = await fixTenant(tenantConn, clinic.slug);

      // Accumulate
      for (const key of Object.keys(grandTotals)) {
        grandTotals[key] += stats[key];
      }

      const totalChanges = Object.values(stats).reduce((s, v) => s + v, 0);
      if (totalChanges === 0) {
        console.log('  ✅ No orphaned records found');
      }
    } catch (err) {
      console.error(`  ❌ Error processing ${clinic.slug}: ${err.message}`);
    } finally {
      if (tenantConn) await tenantConn.close();
    }
    console.log('');
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Invoices cancelled:           ${grandTotals.invoicesCancelled}`);
  console.log(`  Payments failed:              ${grandTotals.paymentsFailed}`);
  console.log(`  Video sessions cancelled:     ${grandTotals.videoSessionsCancelled}`);
  console.log(`  Queue entries cancelled:       ${grandTotals.queueEntriesCancelled}`);
  console.log(`  Prescription tasks deactivated: ${grandTotals.prescriptionTasksDeactivated}`);
  console.log(`  Care reminders cancelled:      ${grandTotals.careRemindersCancelled}`);
  console.log(`${'═'.repeat(60)}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
