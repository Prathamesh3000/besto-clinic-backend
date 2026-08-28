'use strict';

const ApiError = require('../../utils/ApiError');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
const { cancelReminders, cancelSingleReminder, scheduleReminders } = require('../../utils/reminderScheduler');
const logger = require('../../utils/logger');
const {
  APPOINTMENT_STATUS,
  CONFLICT_RESOLUTION_STATUS,
  NOTIFICATION_TYPE,
  PAYMENT_STATUS,
  INVOICE_STATUS,
  LEDGER_ENTRY_TYPE,
  LEDGER_SOURCE,
  VIDEO_SESSION_STATUS,
  QUEUE_STATUS,
} = require('../../config/constants');

/* ────────────────────────────────────────────────────────────────
 * ACTIVE_STATUSES — only these appointment statuses are "in play"
 * and can be affected by schedule conflicts.
 * ──────────────────────────────────────────────────────────────── */
const ACTIVE_STATUSES = [
  APPOINTMENT_STATUS.REQUESTED,
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.CHECKED_IN,
];

/* ─────────────────── helpers ─────────────────── */

function _round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Cancellation cascading cleanup — mirrors appointment.service.js updateAppointment logic.
 * Cancels invoices, payments, video sessions, queue entries, reminders.
 */
async function _cascadeCancel(conn, appointment) {
  const appointmentId = appointment._id;

  // 1. Cancel reminders
  try {
    if (appointment.reminders && appointment.reminders.length > 0) {
      await cancelReminders(appointment.reminders);
    } else if (appointment.reminderJobId) {
      await cancelSingleReminder(appointment.reminderJobId);
    }
  } catch (err) {
    logger.warn('conflictResolution: failed to cancel reminders for %s — %s', appointmentId, err.message);
  }

  // 2. Cancel draft/sent invoices
  try {
    const Invoice = conn.model('Invoice');
    await Invoice.updateMany(
      { appointment: appointmentId, status: { $in: ['draft', 'sent'] } },
      { $set: { status: INVOICE_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.warn('conflictResolution: failed to cancel invoices for %s — %s', appointmentId, err.message);
  }

  // 3. Fail pending payments
  try {
    const Payment = conn.model('Payment');
    await Payment.updateMany(
      { appointment: appointmentId, status: PAYMENT_STATUS.PENDING },
      { $set: { status: PAYMENT_STATUS.FAILED } },
    );
  } catch (err) {
    logger.warn('conflictResolution: failed to fail payments for %s — %s', appointmentId, err.message);
  }

  // 4. Cancel video sessions
  try {
    const VideoSession = conn.model('VideoSession');
    await VideoSession.updateMany(
      { appointment: appointmentId, status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.SCHEDULED, VIDEO_SESSION_STATUS.WAITING] } },
      { $set: { status: VIDEO_SESSION_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.warn('conflictResolution: failed to cancel video sessions for %s — %s', appointmentId, err.message);
  }

  // 5. Cancel queue entries
  try {
    const Queue = conn.model('Queue');
    await Queue.updateMany(
      { appointment: appointmentId, status: QUEUE_STATUS.WAITING },
      { $set: { status: QUEUE_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.warn('conflictResolution: failed to cancel queue entries for %s — %s', appointmentId, err.message);
  }
}

/* ─────────────────── 1. detectConflicts ─────────────────── */

/**
 * Detect appointments that conflict with a schedule override.
 *
 * @param {string} tenantSlug
 * @param {ObjectId|string} doctorId
 * @param {Date|string} date        — the override date
 * @param {string} overrideType     — 'day_off' | 'custom_hours' | 'extra_day'
 * @param {Array}  overrideSlots    — slots array for custom_hours (used to find gaps)
 * @param {ObjectId|string} overrideId
 * @returns {Promise<Array>} affected appointments with patient + invoice populated
 */
async function detectConflicts(tenantSlug, doctorId, date, overrideType, overrideSlots, overrideId) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  const dateObj = new Date(date);
  const dayStart = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // For day_off: ALL appointments on that day are conflicting
  // For custom_hours: appointments OUTSIDE the new slots are conflicting
  // For extra_day: no conflicts (adding availability)
  if (overrideType === 'extra_day') return [];

  const filter = {
    doctor: doctorId,
    scheduledAt: { $gte: dayStart, $lt: dayEnd },
    status: { $in: ACTIVE_STATUSES },
    deletedAt: null,
  };

  let appointments = await Appointment.find(filter)
    .populate('patient', 'name phone email dateOfBirth gender')
    .populate('invoice')
    .populate('doctor', 'name specialization')
    .sort({ scheduledAt: 1 })
    .lean();

  // For custom_hours: only keep appointments that fall OUTSIDE the new slot windows
  if (overrideType === 'custom_hours' && overrideSlots && overrideSlots.length > 0) {
    appointments = appointments.filter((appt) => {
      const apptTime = new Date(appt.scheduledAt);
      const apptH = apptTime.getUTCHours();
      const apptM = apptTime.getUTCMinutes();
      const apptMinutes = apptH * 60 + apptM;

      // Check if appointment falls within ANY of the new slots
      return !overrideSlots.some((slot) => {
        const [sH, sM] = slot.startTime.split(':').map(Number);
        const [eH, eM] = slot.endTime.split(':').map(Number);
        return apptMinutes >= (sH * 60 + sM) && apptMinutes < (eH * 60 + eM);
      });
    });
  }

  // Enrich with payment info for frontend
  if (appointments.length > 0) {
    const Payment = conn.model('Payment');
    const apptIds = appointments.map((a) => a._id);
    const payments = await Payment.find({
      appointment: { $in: apptIds },
      status: PAYMENT_STATUS.COMPLETED,
    }).lean();

    const paymentMap = {};
    for (const p of payments) paymentMap[String(p.appointment)] = p;

    for (const appt of appointments) {
      appt.payment = paymentMap[String(appt._id)] || null;
    }
  }

  return appointments;
}

/* ─────────────────── 2. detectLeaveConflicts ─────────────────── */

/**
 * Detect appointments that conflict with a doctor leave period.
 */
async function detectLeaveConflicts(tenantSlug, doctorId, startDate, endDate, leaveId) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  const start = new Date(startDate);
  const end = new Date(endDate);
  const rangeStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const rangeEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + 24 * 60 * 60 * 1000);

  const filter = {
    doctor: doctorId,
    scheduledAt: { $gte: rangeStart, $lt: rangeEnd },
    status: { $in: ACTIVE_STATUSES },
    deletedAt: null,
  };

  const appointments = await Appointment.find(filter)
    .populate('patient', 'name phone email dateOfBirth gender')
    .populate('invoice')
    .populate('doctor', 'name specialization')
    .sort({ scheduledAt: 1 })
    .lean();

  // Enrich with payment info
  if (appointments.length > 0) {
    const Payment = conn.model('Payment');
    const apptIds = appointments.map((a) => a._id);
    const payments = await Payment.find({
      appointment: { $in: apptIds },
      status: PAYMENT_STATUS.COMPLETED,
    }).lean();

    const paymentMap = {};
    for (const p of payments) paymentMap[String(p.appointment)] = p;
    for (const appt of appointments) {
      appt.payment = paymentMap[String(appt._id)] || null;
    }
  }

  return appointments;
}

/* ─────────────────── 3. getNextAvailableSlots ─────────────────── */

/**
 * Find next N available appointment slots for a doctor (after a given date).
 * Considers weekly schedule template, overrides, leaves, and existing bookings.
 */
async function getNextAvailableSlots(tenantSlug, doctorId, branchId, afterDate, limit = 5) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorSchedule = conn.model('DoctorSchedule');
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const DoctorLeave = conn.model('DoctorLeave');
  const Appointment = conn.model('Appointment');

  // Get schedule template
  const schedule = await DoctorSchedule.findOne({
    doctor: doctorId,
    branch: branchId,
    isActive: true,
    deletedAt: null,
  }).lean();

  if (!schedule) return [];

  const slotDuration = schedule.slotDuration || 30;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const slots = [];
  const startDate = new Date(afterDate);
  startDate.setUTCHours(0, 0, 0, 0);

  // Look up to 30 days ahead
  for (let dayOffset = 0; dayOffset < 30 && slots.length < limit; dayOffset++) {
    const currentDate = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayName = dayNames[currentDate.getUTCDay()];
    const dateNorm = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate()));

    // Check for leave
    const leave = await DoctorLeave.findOne({
      doctor: doctorId,
      status: 'approved',
      startDate: { $lte: dateNorm },
      endDate: { $gte: dateNorm },
    }).lean();
    if (leave) continue;

    // Check for override
    const override = await DoctorScheduleOverride.findOne({
      doctor: doctorId,
      branch: branchId,
      date: dateNorm,
      deletedAt: null,
    }).lean();

    let daySlots = [];

    if (override) {
      if (override.type === 'day_off') continue; // No availability
      // Use override slots
      daySlots = override.slots || [];
      if (!daySlots.length && override.startTime && override.endTime) {
        daySlots = [{ startTime: override.startTime, endTime: override.endTime }];
      }
    } else {
      // Use weekly schedule template
      const dayConfig = schedule.weeklySchedule?.find((d) => d.day === dayName);
      if (!dayConfig || !dayConfig.isWorking) continue;
      daySlots = dayConfig.slots || [];
      if (!daySlots.length && dayConfig.startTime && dayConfig.endTime) {
        daySlots = [{ startTime: dayConfig.startTime, endTime: dayConfig.endTime }];
      }
    }

    // Generate time slots within each working window
    for (const window of daySlots) {
      const [sH, sM] = window.startTime.split(':').map(Number);
      const [eH, eM] = window.endTime.split(':').map(Number);
      const windowStart = sH * 60 + sM;
      const windowEnd = eH * 60 + eM;

      for (let t = windowStart; t + slotDuration <= windowEnd && slots.length < limit; t += slotDuration) {
        const slotDate = new Date(dateNorm);
        slotDate.setUTCHours(Math.floor(t / 60), t % 60, 0, 0);

        // Skip past slots
        if (slotDate <= new Date()) continue;

        // Check if already booked
        const slotEnd = new Date(slotDate.getTime() + slotDuration * 60 * 1000);
        const existing = await Appointment.findOne({
          doctor: doctorId,
          scheduledAt: { $gte: slotDate, $lt: slotEnd },
          status: { $in: ACTIVE_STATUSES },
          deletedAt: null,
        }).lean();

        if (!existing) {
          slots.push({
            date: dateNorm.toISOString().split('T')[0],
            startTime: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
            endTime: `${String(Math.floor((t + slotDuration) / 60)).padStart(2, '0')}:${String((t + slotDuration) % 60).padStart(2, '0')}`,
            scheduledAt: slotDate.toISOString(),
          });
        }
      }
    }
  }

  return slots;
}

/* ─────────────────── 4. rescheduleAppointment ─────────────────── */

/**
 * Admin-reschedule: move an appointment to a new time slot due to schedule conflict.
 */
async function rescheduleAppointment(tenantSlug, appointmentId, newScheduledAt, userId, reason) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  // CAS: only update if still active
  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: { $in: ACTIVE_STATUSES }, deletedAt: null },
    {
      $set: {
        previousScheduledAt: undefined, // placeholder — set below via save
        scheduledAt: new Date(newScheduledAt),
        scheduleChangeReason: reason,
        'conflictResolution.status': CONFLICT_RESOLUTION_STATUS.RESCHEDULED,
        'conflictResolution.resolvedAt': new Date(),
        'conflictResolution.resolvedBy': userId,
        'conflictResolution.reason': reason,
      },
      $inc: { rescheduleCount: 1 },
    },
    { new: false }, // return OLD doc so we can read previousScheduledAt
  );

  if (!appointment) {
    throw ApiError.badRequest('Appointment not found, already resolved, or status changed');
  }

  // Set previousScheduledAt from old value
  await Appointment.updateOne(
    { _id: appointmentId },
    { $set: { previousScheduledAt: appointment.scheduledAt } },
  );

  // Cancel old reminders, schedule new ones
  try {
    if (appointment.reminders && appointment.reminders.length > 0) {
      await cancelReminders(appointment.reminders);
    } else if (appointment.reminderJobId) {
      await cancelSingleReminder(appointment.reminderJobId);
    }
    const newReminders = await scheduleReminders(
      appointmentId,
      tenantSlug,
      new Date(newScheduledAt),
      appointment.reminderTimings || [1440],
    );
    await Appointment.updateOne(
      { _id: appointmentId },
      { $set: { reminders: newReminders } },
    );
  } catch (err) {
    logger.warn('conflictResolution: reschedule reminder update failed for %s — %s', appointmentId, err.message);
  }

  // Notify patient
  const updated = await Appointment.findById(appointmentId)
    .populate('patient', 'name phone email user guardian')
    .populate('doctor', 'name')
    .lean();

  if (updated?.patient) {
    await notifyAndEmit({
      // Notification.recipient is a User id. Passing the Patient id addressed
      // these to nobody, so rescheduling and cancellation notices were never
      // delivered. Dependents have no login, so their guardian is notified.
      recipient: updated.patient.user || updated.patient.guardian,
      title: 'Appointment Rescheduled',
      message: `Your appointment with Dr. ${updated.doctor?.name || 'your doctor'} has been rescheduled. Reason: ${reason}`,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      metadata: { appointmentId, action: 'rescheduled' },
    }, tenantSlug);
  }

  // Notify front desk
  await notifyFrontDesk(tenantSlug, {
    title: 'Appointment Rescheduled',
    message: `${updated?.patient?.name || 'Patient'}'s appointment rescheduled due to schedule change`,
    type: NOTIFICATION_TYPE.APPOINTMENT,
    metadata: { appointmentId, action: 'conflict_rescheduled' },
  });

  return updated;
}

/* ─────────────────── 5. cancelWithRefund ─────────────────── */

/**
 * Cancel appointment and process Razorpay refund.
 */
async function cancelWithRefund(tenantSlug, appointmentId, userId, reason) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const Payment = conn.model('Payment');

  // CAS: only update if still active
  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: { $in: ACTIVE_STATUSES }, deletedAt: null },
    {
      $set: {
        status: APPOINTMENT_STATUS.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
        scheduleChangeReason: reason,
        'conflictResolution.status': CONFLICT_RESOLUTION_STATUS.REFUNDED,
        'conflictResolution.resolvedAt': new Date(),
        'conflictResolution.resolvedBy': userId,
        'conflictResolution.reason': reason,
      },
    },
    { new: true },
  ).populate('patient', 'name phone email user guardian').populate('doctor', 'name');

  if (!appointment) {
    throw ApiError.badRequest('Appointment not found, already resolved, or status changed');
  }

  // Cascading cleanup
  await _cascadeCancel(conn, appointment);

  // Process refund for completed payment
  let refundResult = null;
  const payment = await Payment.findOne({
    appointment: appointmentId,
    status: PAYMENT_STATUS.COMPLETED,
  });

  if (payment) {
    try {
      // Use the existing processRefund from payment service
      const paymentService = require('../payment/payment.service');
      refundResult = await paymentService.processRefund(
        payment._id,
        payment.amount,
        reason,
        { userId, role: 'admin' },
        tenantSlug,
      );

      // Track refund amount on conflict resolution
      await Appointment.updateOne(
        { _id: appointmentId },
        { $set: { 'conflictResolution.refundAmount': payment.amount } },
      );
    } catch (err) {
      logger.error('conflictResolution: refund failed for appointment %s — %s', appointmentId, err.message);
      throw ApiError.badRequest(`Refund failed: ${err.message}`);
    }
  }

  // Notify patient
  if (appointment.patient) {
    const amountText = payment ? ` Refund of ₹${payment.amount} initiated.` : '';
    await notifyAndEmit({
      // User id, not Patient id — see the note above. Dependents route to their guardian.
      recipient: appointment.patient.user || appointment.patient.guardian,
      title: 'Appointment Cancelled',
      message: `Your appointment with Dr. ${appointment.doctor?.name || 'your doctor'} has been cancelled due to a schedule change.${amountText}`,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      metadata: { appointmentId, action: 'cancelled_refund' },
    }, tenantSlug);
  }

  await notifyFrontDesk(tenantSlug, {
    title: 'Appointment Cancelled & Refunded',
    message: `${appointment.patient?.name || 'Patient'}'s appointment cancelled and refund initiated`,
    type: NOTIFICATION_TYPE.APPOINTMENT,
    metadata: { appointmentId, action: 'conflict_cancelled_refund' },
  });

  return { appointment, refund: refundResult };
}

/* ─────────────────── 6. cancelWithCredit ─────────────────── */

/**
 * Cancel appointment and credit amount to patient's wallet.
 */
async function cancelWithCredit(tenantSlug, appointmentId, userId, reason) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const Payment = conn.model('Payment');

  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: { $in: ACTIVE_STATUSES }, deletedAt: null },
    {
      $set: {
        status: APPOINTMENT_STATUS.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
        scheduleChangeReason: reason,
        'conflictResolution.status': CONFLICT_RESOLUTION_STATUS.CREDITED,
        'conflictResolution.resolvedAt': new Date(),
        'conflictResolution.resolvedBy': userId,
        'conflictResolution.reason': reason,
      },
    },
    { new: true },
  ).populate('patient', 'name phone email user guardian').populate('doctor', 'name');

  if (!appointment) {
    throw ApiError.badRequest('Appointment not found, already resolved, or status changed');
  }

  await _cascadeCancel(conn, appointment);

  // Credit to patient wallet
  let creditAmount = 0;
  const payment = await Payment.findOne({
    appointment: appointmentId,
    status: PAYMENT_STATUS.COMPLETED,
  });

  if (payment) {
    creditAmount = payment.amount;

    try {
      // Create ledger credit entry (debit in ledger = clinic owes patient)
      const PatientLedger = conn.model('PatientLedger');
      const session = await conn.startSession();
      try {
        await session.withTransaction(async () => {
          const lastEntry = await PatientLedger.findOne({ patient: appointment.patient._id })
            .sort({ createdAt: -1 })
            .select('balance')
            .session(session)
            .lean();

          const previousBalance = lastEntry ? lastEntry.balance : 0;
          const balance = previousBalance + creditAmount; // debit → increases balance (clinic owes patient)

          await PatientLedger.create([{
            patient: appointment.patient._id,
            type: LEDGER_ENTRY_TYPE.DEBIT,
            amount: creditAmount,
            balance,
            source: LEDGER_SOURCE.CREDIT_NOTE,
            reference: payment._id,
            referenceModel: 'Payment',
            description: `Schedule change credit — appointment cancelled. ₹${creditAmount} credited to wallet.`,
            createdBy: userId,
            branch: appointment.branch,
          }], { session });
        });
      } finally {
        await session.endSession();
      }

      // Track credit amount
      await Appointment.updateOne(
        { _id: appointmentId },
        { $set: { 'conflictResolution.creditAmount': creditAmount } },
      );
    } catch (err) {
      logger.error('conflictResolution: wallet credit failed for %s — %s', appointmentId, err.message);
      throw ApiError.badRequest(`Wallet credit failed: ${err.message}`);
    }
  }

  // Notify patient
  if (appointment.patient) {
    const creditText = creditAmount > 0 ? ` ₹${creditAmount} has been credited to your clinic wallet.` : '';
    await notifyAndEmit({
      // User id, not Patient id — see the note above. Dependents route to their guardian.
      recipient: appointment.patient.user || appointment.patient.guardian,
      title: 'Appointment Cancelled — Wallet Credited',
      message: `Your appointment with Dr. ${appointment.doctor?.name || 'your doctor'} has been cancelled due to a schedule change.${creditText}`,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      metadata: { appointmentId, action: 'cancelled_credit' },
    }, tenantSlug);
  }

  await notifyFrontDesk(tenantSlug, {
    title: 'Appointment Cancelled — Wallet Credited',
    message: `${appointment.patient?.name || 'Patient'}'s appointment cancelled, ₹${creditAmount} credited to wallet`,
    type: NOTIFICATION_TYPE.APPOINTMENT,
    metadata: { appointmentId, action: 'conflict_cancelled_credit' },
  });

  return { appointment, creditAmount };
}

/* ─────────────────── 7. cancelUnpaid ─────────────────── */

/**
 * Cancel an unpaid appointment (no financial action needed).
 */
async function cancelUnpaid(tenantSlug, appointmentId, userId, reason) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: { $in: ACTIVE_STATUSES }, deletedAt: null },
    {
      $set: {
        status: APPOINTMENT_STATUS.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
        scheduleChangeReason: reason,
        'conflictResolution.status': CONFLICT_RESOLUTION_STATUS.REFUNDED, // no money involved, just cancelled
        'conflictResolution.resolvedAt': new Date(),
        'conflictResolution.resolvedBy': userId,
        'conflictResolution.reason': reason,
      },
    },
    { new: true },
  ).populate('patient', 'name phone email user guardian').populate('doctor', 'name');

  if (!appointment) {
    throw ApiError.badRequest('Appointment not found, already resolved, or status changed');
  }

  await _cascadeCancel(conn, appointment);

  if (appointment.patient) {
    await notifyAndEmit({
      // User id, not Patient id — see the note above. Dependents route to their guardian.
      recipient: appointment.patient.user || appointment.patient.guardian,
      title: 'Appointment Cancelled',
      message: `Your appointment with Dr. ${appointment.doctor?.name || 'your doctor'} has been cancelled due to a schedule change.`,
      type: NOTIFICATION_TYPE.APPOINTMENT,
      metadata: { appointmentId, action: 'cancelled_schedule_change' },
    }, tenantSlug);
  }

  return { appointment };
}

/* ─────────────────── 8. markContacted ─────────────────── */

/**
 * Mark an appointment as "contacted" — staff is handling manually.
 * Does NOT cancel or reschedule.
 */
async function markContacted(tenantSlug, appointmentId, userId, notes) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  const appointment = await Appointment.findOneAndUpdate(
    { _id: appointmentId, status: { $in: ACTIVE_STATUSES }, deletedAt: null },
    {
      $set: {
        'conflictResolution.status': CONFLICT_RESOLUTION_STATUS.CONTACTED,
        'conflictResolution.resolvedAt': new Date(),
        'conflictResolution.resolvedBy': userId,
        'conflictResolution.reason': notes || 'Patient contacted by staff',
      },
    },
    { new: true },
  ).populate('patient', 'name phone email user guardian').populate('doctor', 'name');

  if (!appointment) {
    throw ApiError.badRequest('Appointment not found or status changed');
  }

  return { appointment };
}

/* ─────────────────── 9. bulkCancelRefund ─────────────────── */

/**
 * Bulk cancel + refund multiple appointments.
 */
async function bulkCancelRefund(tenantSlug, appointmentIds, userId, reason) {
  const results = { succeeded: [], failed: [] };

  for (const id of appointmentIds) {
    try {
      const result = await cancelWithRefund(tenantSlug, id, userId, reason);
      results.succeeded.push({ appointmentId: id, refundAmount: result.refund?.refundAmount || 0 });
    } catch (err) {
      results.failed.push({ appointmentId: id, error: err.message });
    }
  }

  return results;
}

module.exports = {
  detectConflicts,
  detectLeaveConflicts,
  getNextAvailableSlots,
  rescheduleAppointment,
  cancelWithRefund,
  cancelWithCredit,
  cancelUnpaid,
  markContacted,
  bulkCancelRefund,
};
