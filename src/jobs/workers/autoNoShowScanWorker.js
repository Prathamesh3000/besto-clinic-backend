'use strict';

/**
 * Auto No-Show scan worker — repeatable job that detects overdue appointments.
 *
 * Runs every 30 minutes. For each active clinic:
 *   1. Finds `confirmed` appointments past grace period → marks as no_show
 *      (with full side effects: invoice cancel, payment fail,
 *       patient noShowCount increment, notifications, websocket broadcast)
 *   2. Finds `checked_in` appointments where consultation never started
 *      (checkedInAt > 4 hours ago) → marks as no_show + cleans up queue entries
 *   3. Finds `requested` appointments past grace period → auto-cancels
 *
 * Grace period = appointment end time (scheduledAt + duration) + 30 minutes.
 * Stale check-in threshold = 4 hours after check-in with no consultation start.
 */

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { APPOINTMENT_STATUS, INVOICE_STATUS, PAYMENT_STATUS } = require('../../config/constants');

/** Minutes after appointment end time before marking confirmed as no-show */
const GRACE_PERIOD_MINUTES = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_MINUTES * 60 * 1000;

/** Hours after check-in with no consultation start before marking as no-show */
const STALE_CHECKIN_HOURS = 4;
const STALE_CHECKIN_MS = STALE_CHECKIN_HOURS * 60 * 60 * 1000;

/**
 * Build a MongoDB $expr filter that matches appointments whose end time
 * (scheduledAt + duration in ms) is before the given cutoff date.
 */
function _overdueExpr(cutoff) {
  return {
    $expr: {
      $lt: [
        { $add: ['$scheduledAt', { $multiply: ['$duration', 60000] }] },
        cutoff,
      ],
    },
  };
}

/**
 * Handle all no-show side effects for a single appointment.
 * Mirrors the logic in appointment.service.js updateAppointment() for NO_SHOW.
 */
async function _processNoShow(conn, appointment, tenantSlug) {
  const id = appointment._id;

  // 1. Update appointment status
  await conn.model('Appointment').findByIdAndUpdate(id, {
    status: APPOINTMENT_STATUS.NO_SHOW,
    noShowAt: new Date(),
  });

  // 2. Cancel unpaid invoices
  try {
    const Invoice = conn.model('Invoice');
    await Invoice.updateMany(
      { appointment: id, status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] }, deletedAt: null },
      { status: INVOICE_STATUS.CANCELLED },
    );
  } catch (err) {
    logger.error('Auto no-show: failed to cancel invoices for %s: %s', id, err.message);
  }

  // 3. Fail pending payments on cancelled invoices
  try {
    const Invoice = conn.model('Invoice');
    const Payment = conn.model('Payment');
    const cancelledInvoices = await Invoice.find({
      appointment: id, status: INVOICE_STATUS.CANCELLED, deletedAt: null,
    }).select('_id').lean();
    if (cancelledInvoices.length > 0) {
      await Payment.updateMany(
        { invoice: { $in: cancelledInvoices.map((i) => i._id) }, status: PAYMENT_STATUS.PENDING, deletedAt: null },
        { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'patient_no_show' } } },
      );
    }
  } catch (err) {
    logger.error('Auto no-show: failed to fail payments for %s: %s', id, err.message);
  }

  // 4. Increment patient no-show count
  try {
    const Patient = conn.model('Patient');
    await Patient.findByIdAndUpdate(appointment.patient, { $inc: { noShowCount: 1 } });
  } catch (err) {
    logger.error('Auto no-show: failed to increment noShowCount for %s: %s', id, err.message);
  }

  // 5. Send notifications
  try {
    const { notifyAndEmit } = require('../../utils/notifyAndEmit');
    const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
    const Patient = conn.model('Patient');
    const patient = await Patient.findById(appointment.patient).select('user name').lean();
    const patientName = patient?.name || 'A patient';
    const dateStr = new Date(appointment.scheduledAt).toLocaleDateString();
    const meta = { appointmentId: id, status: APPOINTMENT_STATUS.NO_SHOW };

    // Notify doctor
    await notifyAndEmit({
      recipient: appointment.doctor,
      title: 'Patient No-Show (Auto-Detected)',
      message: `${patientName} did not show up for their appointment on ${dateStr}.`,
      type: 'appointment',
      metadata: meta,
    }, tenantSlug);

    // Notify patient
    if (patient?.user) {
      await notifyAndEmit({
        recipient: patient.user,
        title: 'Missed Appointment',
        message: `You missed your appointment on ${dateStr}. Please contact the clinic to reschedule.`,
        type: 'appointment',
        metadata: meta,
      }, tenantSlug);
    }

    // Notify front-desk
    await notifyFrontDesk(tenantSlug, {
      title: 'Patient No-Show (Auto-Detected)',
      message: `${patientName} did not show up for their ${dateStr} appointment.`,
      type: 'appointment',
      metadata: meta,
    });
  } catch (err) {
    logger.error('Auto no-show: failed to send notifications for %s: %s', id, err.message);
  }

  // 6. WebSocket broadcast
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'appointment:update', {
      appointmentId: id,
      status: APPOINTMENT_STATUS.NO_SHOW,
      branch: String(appointment.branch || ''),
    });
    const apptDate = new Date(appointment.scheduledAt).toISOString().slice(0, 10);
    emitToTenant(tenantSlug, 'availability:invalidated', {
      doctorId: String(appointment.doctor),
      date: apptDate,
      reason: 'appointment_status_changed',
    });
  } catch (_) { /* non-blocking */ }
}

function createAutoNoShowScanWorker() {
  const worker = new Worker(
    'autoNoShowScan',
    async (job) => {
      logger.info('Auto no-show scan: starting (job %s)', job.id);

      const Clinic = mongoose.model('Clinic');
      const clinics = await Clinic.find({ status: 'active' }).select('slug').lean();

      let totalNoShow = 0;
      let totalStaleCheckin = 0;
      let totalCancelled = 0;
      let totalQueueCleaned = 0;
      const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
      const checkinCutoff = new Date(Date.now() - STALE_CHECKIN_MS);

      for (const clinic of clinics) {
        try {
          const conn = await getTenantConnection(clinic.slug);
          const Appointment = conn.model('Appointment');

          // ── Mark overdue CONFIRMED appointments as no-show ──────────
          const overdueConfirmed = await Appointment.find({
            status: APPOINTMENT_STATUS.CONFIRMED,
            deletedAt: null,
            ..._overdueExpr(cutoff),
          }).select('_id patient doctor branch scheduledAt duration').lean();

          for (const appt of overdueConfirmed) {
            try {
              await _processNoShow(conn, appt, clinic.slug);
              totalNoShow += 1;
            } catch (err) {
              logger.error('Auto no-show scan: failed to process appointment %s in %s: %s', appt._id, clinic.slug, err.message);
            }
          }

          // ── Mark stale CHECKED_IN appointments as no-show ───────────
          // Patient checked in but consultation never started (> 4 hours)
          const staleCheckedIn = await Appointment.find({
            status: APPOINTMENT_STATUS.CHECKED_IN,
            checkedInAt: { $lt: checkinCutoff },
            deletedAt: null,
          }).select('_id patient doctor branch scheduledAt duration').lean();

          for (const appt of staleCheckedIn) {
            try {
              await _processNoShow(conn, appt, clinic.slug);
              totalStaleCheckin += 1;
            } catch (err) {
              logger.error('Auto no-show scan: failed to process stale check-in %s in %s: %s', appt._id, clinic.slug, err.message);
            }
          }

          // ── Clean up orphaned waiting queue entries ──────────────────
          // Queue entries from previous days still in 'waiting' status
          if (staleCheckedIn.length > 0) {
            try {
              const QueueEntry = conn.model('QueueEntry');
              const staleApptIds = staleCheckedIn.map((a) => a._id);
              const cleaned = await QueueEntry.updateMany(
                {
                  status: 'waiting',
                  $or: [
                    { appointment: { $in: staleApptIds } },
                    { checkedInAt: { $lt: checkinCutoff } },
                  ],
                },
                { status: 'no_show' },
              );
              totalQueueCleaned += cleaned.modifiedCount;
            } catch (err) {
              logger.error('Auto no-show scan: failed to clean queue entries in %s: %s', clinic.slug, err.message);
            }
          }

          // Also clean any orphaned queue entries from previous days
          try {
            const QueueEntry = conn.model('QueueEntry');
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const orphaned = await QueueEntry.updateMany(
              { status: 'waiting', createdAt: { $lt: todayStart } },
              { status: 'no_show' },
            );
            totalQueueCleaned += orphaned.modifiedCount;
          } catch (err) {
            logger.error('Auto no-show scan: failed to clean orphaned queue entries in %s: %s', clinic.slug, err.message);
          }

          // ── Auto-cancel stale REQUESTED appointments ────────────────
          const staleRequested = await Appointment.find({
            status: APPOINTMENT_STATUS.REQUESTED,
            deletedAt: null,
            ..._overdueExpr(cutoff),
          }).select('_id').lean();

          if (staleRequested.length > 0) {
            const staleIds = staleRequested.map((a) => a._id);
            await Appointment.updateMany(
              { _id: { $in: staleIds } },
              {
                status: APPOINTMENT_STATUS.CANCELLED,
                cancelledAt: new Date(),
                cancelReason: 'Auto-cancelled: unconfirmed and past due',
              },
            );
            totalCancelled += staleIds.length;
          }
        } catch (err) {
          logger.error('Auto no-show scan: error processing clinic %s: %s', clinic.slug, err.message);
        }
      }

      logger.info(
        'Auto no-show scan: complete — %d clinics, %d confirmed no-shows, %d stale check-ins, %d cancelled, %d queue entries cleaned',
        clinics.length, totalNoShow, totalStaleCheckin, totalCancelled, totalQueueCleaned,
      );
      return { clinicsScanned: clinics.length, noShows: totalNoShow, staleCheckins: totalStaleCheckin, cancelled: totalCancelled, queueCleaned: totalQueueCleaned };
    },
    {
      connection: getRedis(),
      concurrency: 1,
      drainDelay: 30_000,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Auto no-show scan: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createAutoNoShowScanWorker;
