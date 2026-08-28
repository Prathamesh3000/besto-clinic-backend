'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { APPOINTMENT_STATUS, APPOINTMENT_TRANSITIONS, INVOICE_STATUS, PAYMENT_STATUS, VIDEO_SESSION_STATUS } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
const logger = require('../../utils/logger');
const { resolveBookingPolicy } = require('../../utils/resolveBookingPolicy');
const { logAccess } = require('../../utils/logAccess');

function _hasFullAccess(user, permission) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

/**
 * Resolve the Patient._id linked to this user (for self-scope filtering).
 * Returns null if no linked patient record exists.
 */
async function _getLinkedPatientId(userId, conn) {
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

async function listAppointments(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.doctor) filter.doctor = query.doctor;
  if (query.patient) filter.patient = query.patient;
  if (query.branch) filter.branch = query.branch;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.scheduledAt = {};
    if (query.from) filter.scheduledAt.$gte = new Date(query.from);
    if (query.to) {
      const toDate = new Date(query.to);
      // Date-only strings (no 'T') parse as midnight UTC — set to end of day
      if (typeof query.to === 'string' && !query.to.includes('T')) {
        toDate.setUTCHours(23, 59, 59, 999);
      }
      filter.scheduledAt.$lte = toDate;
    }
  }

  // Self-scope: doctors see only their own appointments
  if (user.role === 'doctor') {
    filter.doctor = user.userId;
  } else if (!_hasFullAccess(user, PERMISSIONS.APPOINTMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      // No linked patient record — return empty
      return { items: [], total: 0, page: 1, limit };
    }
  }

  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name specialization'),
    Appointment.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getAppointmentById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization');
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.APPOINTMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(appointment.patient._id || appointment.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own appointments');
    }
  }

  logAccess(conn, {
    patient: appointment.patient._id || appointment.patient,
    accessedBy: user.userId,
    accessType: 'view',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `${user.role} viewed appointment details`,
  });

  return appointment;
}

async function createAppointment(data, user, tenantSlug) {
  const createdBy = user.userId;
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  // Resolve clinic booking policy for auto-confirm + type duration defaults
  const policy = await resolveBookingPolicy(tenantSlug);

  // Resolve duration from policy type defaults if not explicitly provided
  const duration = data.duration
    ?? (policy.appointmentTypeDurations ? policy.appointmentTypeDurations[data.type || 'consultation'] : null)
    ?? policy.slotDuration;

  // Validate against doctor schedule, leaves, and branch hours
  const { validateBookingTime } = require('../../services/availability.service');
  await validateBookingTime(data.doctor, data.scheduledAt, duration, tenantSlug, data.branch);

  // Check for scheduling conflicts (include branch for multi-branch isolation)
  const conflictFilter = {
    doctor: data.doctor,
    status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
    scheduledAt: {
      $gte: new Date(data.scheduledAt),
      $lt: new Date(new Date(data.scheduledAt).getTime() + duration * 60000),
    },
  };

  const conflict = await Appointment.findOne(conflictFilter);

  if (conflict) {
    throw ApiError.conflict('Doctor has a conflicting appointment at this time');
  }

  // Resolve reminder timings: request body → doctor's defaults → clinic policy → fallback
  let reminderTimings = data.reminderTimings;
  if (!reminderTimings || reminderTimings.length === 0) {
    const User = conn.model('User');
    const doctor = await User.findById(data.doctor).select('defaultReminderTimings').lean();
    reminderTimings = (doctor?.defaultReminderTimings && doctor.defaultReminderTimings.length > 0)
      ? doctor.defaultReminderTimings
      : policy.defaultReminderTimings;
  }

  // Determine initial status based on clinic auto-confirm policy
  const initialStatus = policy.autoConfirm
    ? APPOINTMENT_STATUS.CONFIRMED
    : APPOINTMENT_STATUS.REQUESTED;

  const appointment = await Appointment.create({
    ...data,
    duration,
    createdBy,
    status: initialStatus,
    source: data.source || 'general',
    reminderTimings,
  });

  // Auto-create a VideoSession for staff-booked teleconsult appointments so the
  // patient/doctor have a room to join. Mirrors patientPortal.service.bookAppointment.
  if (appointment.type === 'teleconsult') {
    try {
      const VideoSession = conn.model('VideoSession');
      const roomTokenService = require('../telemedicine/roomToken.service');
      const roomId = roomTokenService.generateRoomId(tenantSlug);
      const scheduledAt = new Date(data.scheduledAt);
      await VideoSession.create({
        type: 'scheduled',
        status: 'scheduled',
        patient: data.patient,
        doctor: data.doctor,
        branch: data.branch,
        appointment: appointment._id,
        scheduledAt,
        roomId,
        // Keep room valid up to 24h past the appointment time
        expiresAt: new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000),
        createdBy,
      });
    } catch (vsErr) {
      logger.error(
        'Failed to auto-create VideoSession for staff-booked appointment %s: %s',
        appointment._id, vsErr.message,
      );
      // Non-blocking — appointment is still valid; doctor can start manually
    }
  }

  // Schedule reminders for all configured timings
  const { scheduleReminders } = require('../../utils/reminderScheduler');
  const reminderEntries = await scheduleReminders(appointment._id.toString(), tenantSlug, data.scheduledAt, reminderTimings);
  if (reminderEntries.length > 0) {
    appointment.reminders = reminderEntries;
    appointment.reminderJobId = reminderEntries[0].jobId; // backward compat
    await appointment.save();
  }

  // Notify the doctor about the new appointment
  try {
    const Patient = conn.model('Patient');
    const patient = await Patient.findById(data.patient).select('name').lean();
    const patientName = patient?.name || 'A patient';
    const dateStr = new Date(data.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    await notifyAndEmit({
      recipient: data.doctor,
      title: 'New Appointment Scheduled',
      message: `${patientName} has been scheduled for an appointment on ${dateStr}.`,
      type: 'appointment',
      metadata: { appointmentId: appointment._id, status: 'confirmed' },
    }, tenantSlug);
  } catch (err) {
    logger.error('Failed to notify doctor for appointment %s: %s', appointment._id, err.message);
  }

  // Notify front-desk staff about the new appointment
  try {
    const Patient = conn.model('Patient');
    const pat = await Patient.findById(data.patient).select('name').lean();
    const User = conn.model('User');
    const doc = await User.findById(data.doctor).select('name').lean();
    const dateStr = new Date(data.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    await notifyFrontDesk(tenantSlug, {
      title: 'New Appointment',
      message: `${pat?.name || 'A patient'} scheduled with Dr. ${doc?.name || 'a doctor'} on ${dateStr}.`,
      type: 'appointment',
      metadata: { appointmentId: appointment._id, status: 'confirmed' },
    }, { excludeUserId: createdBy });
  } catch (err) {
    logger.error('Failed to notify front-desk for appointment %s: %s', appointment._id, err.message);
  }

  logAccess(conn, {
    patient: data.patient,
    accessedBy: user.userId,
    accessType: 'create',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `${user.role} created appointment`,
  });

  return appointment;
}

async function updateAppointment(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  // ── Status transition validation ──────────────────────────
  let _existingAppointment = null;
  if (data.status) {
    _existingAppointment = await Appointment.findById(id).select('status patient doctor branch').lean();
    if (!_existingAppointment) throw ApiError.notFound('Appointment not found');
    const allowed = APPOINTMENT_TRANSITIONS[_existingAppointment.status];
    if (!allowed || !allowed.includes(data.status)) {
      throw ApiError.badRequest(
        `Invalid status transition from "${_existingAppointment.status}" to "${data.status}"`,
      );
    }
  }

  // Cancel all scheduled reminders if appointment is being cancelled
  if (data.status === APPOINTMENT_STATUS.CANCELLED) {
    const { cancelReminders } = require('../../utils/reminderScheduler');
    const existing = await Appointment.findById(id).select('reminders reminderJobId').lean();
    if (existing?.reminders && existing.reminders.length > 0) {
      await cancelReminders(existing.reminders);
    } else if (existing?.reminderJobId) {
      // Backward compat: old appointments with single reminderJobId
      const { cancelSingleReminder } = require('../../utils/reminderScheduler');
      await cancelSingleReminder(existing.reminderJobId);
    }
  }

  // Cascade cancellation to linked invoices (cancel unpaid draft/sent invoices)
  if (data.status === APPOINTMENT_STATUS.CANCELLED) {
    try {
      const Invoice = conn.model('Invoice');
      const cancelledInvoices = await Invoice.updateMany(
        {
          appointment: id,
          status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] },
          deletedAt: null,
        },
        { status: INVOICE_STATUS.CANCELLED },
      );
      if (cancelledInvoices.modifiedCount > 0) {
        logger.info('Cancelled %d linked invoice(s) for appointment %s', cancelledInvoices.modifiedCount, id);
      }
    } catch (err) {
      logger.error('Failed to cancel linked invoices for appointment %s: %s', id, err.message);
    }

    // Cascade: fail PENDING payments for cancelled invoices
    try {
      const Payment = conn.model('Payment');
      const Invoice = conn.model('Invoice');
      const cancelledInvoiceIds = await Invoice.find({
        appointment: id,
        status: INVOICE_STATUS.CANCELLED,
        deletedAt: null,
      }).select('_id').lean();
      if (cancelledInvoiceIds.length > 0) {
        const ids = cancelledInvoiceIds.map(i => i._id);
        const payResult = await Payment.updateMany(
          { invoice: { $in: ids }, status: PAYMENT_STATUS.PENDING, deletedAt: null },
          { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'appointment_cancelled' } } },
        );
        if (payResult.modifiedCount > 0) {
          logger.info('Failed %d pending payment(s) for cancelled appointment %s', payResult.modifiedCount, id);
        }
      }
    } catch (err) {
      logger.error('Failed to cancel pending payments for appointment %s: %s', id, err.message);
    }

    // Cascade: cancel waiting/scheduled VideoSessions
    try {
      const VideoSession = conn.model('VideoSession');
      await VideoSession.updateMany(
        { appointment: id, status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.SCHEDULED, VIDEO_SESSION_STATUS.WAITING] }, deletedAt: null },
        { $set: { status: VIDEO_SESSION_STATUS.CANCELLED } },
      );
    } catch (err) {
      logger.error('Failed to cancel video sessions for appointment %s: %s', id, err.message);
    }

    // Cascade: cancel waiting QueueEntry
    try {
      const QueueEntry = conn.model('QueueEntry');
      await QueueEntry.updateMany(
        { appointment: id, status: 'waiting' },
        { $set: { status: 'cancelled' } },
      );
    } catch (err) {
      logger.error('Failed to cancel queue entries for appointment %s: %s', id, err.message);
    }
  }

  // Handle no-show: cancel invoices, increment patient flag, notify staff
  if (data.status === APPOINTMENT_STATUS.NO_SHOW) {
    data.noShowAt = new Date();

    // Cancel unpaid invoices
    try {
      const Invoice = conn.model('Invoice');
      await Invoice.updateMany(
        { appointment: id, status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] }, deletedAt: null },
        { status: INVOICE_STATUS.CANCELLED },
      );
    } catch (err) {
      logger.error('Failed to cancel invoices on no-show for appointment %s: %s', id, err.message);
    }

    // Cascade: fail PENDING payments for cancelled invoices on no-show
    try {
      const Payment = conn.model('Payment');
      const Invoice = conn.model('Invoice');
      const cancelledInvoices = await Invoice.find({
        appointment: id, status: INVOICE_STATUS.CANCELLED, deletedAt: null,
      }).select('_id').lean();
      if (cancelledInvoices.length > 0) {
        await Payment.updateMany(
          { invoice: { $in: cancelledInvoices.map(i => i._id) }, status: PAYMENT_STATUS.PENDING, deletedAt: null },
          { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'patient_no_show' } } },
        );
      }
    } catch (err) {
      logger.error('Failed to cancel pending payments on no-show for appointment %s: %s', id, err.message);
    }

    // Increment no-show count on the patient record
    try {
      const Patient = conn.model('Patient');
      await Patient.findByIdAndUpdate(
        _existingAppointment?.patient,
        { $inc: { noShowCount: 1 } },
      );
    } catch (err) {
      logger.error('Failed to increment no-show count for appointment %s: %s', id, err.message);
    }
  }

  // Handle status transitions
  if (data.status === APPOINTMENT_STATUS.CANCELLED) {
    data.cancelledAt = new Date();
  } else if (data.status === APPOINTMENT_STATUS.CHECKED_IN) {
    data.checkedInAt = new Date();
  } else if (data.status === APPOINTMENT_STATUS.IN_PROGRESS) {
    data.startedAt = new Date();
  } else if (data.status === APPOINTMENT_STATUS.COMPLETED) {
    data.completedAt = new Date();
  }

  // ── Auto-queue on check-in ────────────────────────────────
  let _queueEntry = null;
  if (data.status === APPOINTMENT_STATUS.CHECKED_IN && _existingAppointment?.branch) {
    try {
      const queueService = require('../queue/queue.service');
      const entry = await queueService.addToQueue({
        patient: _existingAppointment.patient,
        doctor: _existingAppointment.doctor,
        branch: _existingAppointment.branch,
        appointment: id,
        priority: 'normal',
      }, tenantSlug);
      _queueEntry = { id: entry._id, tokenNumber: entry.tokenNumber };
    } catch (err) {
      logger.warn('Auto-queue on check-in failed for appointment %s: %s', id, err.message);
    }
  }

  const appointment = await Appointment.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // Send notifications on status changes
  if (data.status) {
    const Patient = conn.model('Patient');
    const User = conn.model('User');
    const patient = await Patient.findById(appointment.patient).select('user name').lean();
    const doctor = await User.findById(appointment.doctor).select('name').lean();
    const doctorName = doctor?.name || 'your doctor';
    const patientName = patient?.name || 'A patient';
    const dateStr = appointment.scheduledAt
      ? new Date(appointment.scheduledAt).toLocaleDateString()
      : '';
    const meta = { appointmentId: appointment._id, status: data.status };

    const statusNotifications = {
      [APPOINTMENT_STATUS.CONFIRMED]: {
        recipients: patient?.user ? [{ id: patient.user, title: 'Appointment Confirmed', message: `Your appointment with Dr. ${doctorName} on ${dateStr} has been confirmed.` }] : [],
      },
      [APPOINTMENT_STATUS.CHECKED_IN]: {
        recipients: [{ id: appointment.doctor, title: 'Patient Checked In', message: `${patientName} has checked in for their appointment.` }],
      },
      [APPOINTMENT_STATUS.IN_PROGRESS]: {
        recipients: patient?.user ? [{ id: patient.user, title: 'Consultation Started', message: `Your consultation with Dr. ${doctorName} has started.` }] : [],
      },
      [APPOINTMENT_STATUS.COMPLETED]: {
        recipients: patient?.user ? [{ id: patient.user, title: 'Appointment Completed', message: `Your appointment with Dr. ${doctorName} has been completed.` }] : [],
      },
      [APPOINTMENT_STATUS.CANCELLED]: {
        recipients: [
          ...(patient?.user ? [{ id: patient.user, title: 'Appointment Cancelled', message: `Your appointment on ${dateStr} has been cancelled.` }] : []),
          { id: appointment.doctor, title: 'Appointment Cancelled', message: `The appointment with ${patientName} on ${dateStr} has been cancelled.` },
        ],
      },
      [APPOINTMENT_STATUS.NO_SHOW]: {
        recipients: [
          { id: appointment.doctor, title: 'Patient No-Show', message: `${patientName} did not show up for their appointment on ${dateStr}.` },
          ...(patient?.user ? [{ id: patient.user, title: 'Missed Appointment', message: `You missed your appointment on ${dateStr}. Please contact the clinic to reschedule.` }] : []),
        ],
      },
    };

    const entry = statusNotifications[data.status];
    if (entry) {
      for (const r of entry.recipients) {
        await notifyAndEmit({ recipient: r.id, title: r.title, message: r.message, type: 'appointment', metadata: meta }, tenantSlug);
      }
    }

    // Notify front-desk on key status changes
    const frontDeskMessages = {
      [APPOINTMENT_STATUS.CONFIRMED]: `${patientName}'s appointment on ${dateStr} has been confirmed.`,
      [APPOINTMENT_STATUS.CANCELLED]: `${patientName}'s appointment on ${dateStr} was cancelled.`,
      [APPOINTMENT_STATUS.NO_SHOW]: `${patientName} did not show up for their ${dateStr} appointment.`,
      [APPOINTMENT_STATUS.COMPLETED]: `${patientName}'s appointment with Dr. ${doctorName} is complete.`,
    };
    const frontDeskTitles = {
      [APPOINTMENT_STATUS.CONFIRMED]: 'Appointment Confirmed',
      [APPOINTMENT_STATUS.CANCELLED]: 'Appointment Cancelled',
      [APPOINTMENT_STATUS.NO_SHOW]: 'Patient No-Show',
      [APPOINTMENT_STATUS.COMPLETED]: 'Appointment Completed',
    };
    if (frontDeskMessages[data.status]) {
      notifyFrontDesk(tenantSlug, {
        title: frontDeskTitles[data.status],
        message: frontDeskMessages[data.status],
        type: 'appointment',
        metadata: meta,
      }).catch(() => {}); // fire-and-forget
    }
  }

  // ── WebSocket broadcast ───────────────────────────────────
  if (data.status) {
    try {
      const { emitToTenant } = require('../../websocket');
      emitToTenant(tenantSlug, 'appointment:update', {
        appointmentId: appointment._id,
        status: data.status,
        branch: String(appointment.branch || ''),
      });
      // Also broadcast availability change for slot refresh on booking UIs
      const apptDate = appointment.scheduledAt
        ? new Date(appointment.scheduledAt).toISOString().slice(0, 10)
        : '';
      if (apptDate) {
        emitToTenant(tenantSlug, 'availability:invalidated', {
          doctorId: String(appointment.doctor),
          date: apptDate,
          reason: 'appointment_status_changed',
        });
      }
    } catch (_) { /* non-blocking */ }
  }

  logAccess(conn, {
    patient: appointment.patient,
    accessedBy: user.userId,
    accessType: 'update',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `${user.role} updated appointment`,
  });

  // Attach queue entry info if auto-created on check-in
  if (_queueEntry) {
    const result = appointment.toObject ? appointment.toObject() : appointment;
    result._queueEntry = _queueEntry;
    return result;
  }

  return appointment;
}

async function deleteAppointment(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  // Self-scope check for CANCEL_OWN
  if (!_hasFullAccess(user, PERMISSIONS.APPOINTMENT_CANCEL)) {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(appointment.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only cancel your own appointments');
    }
  }

  const appointment = await Appointment.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // Notify patient + doctor (skip the person who performed the delete)
  const Patient = conn.model('Patient');
  const User = conn.model('User');
  const patient = await Patient.findById(appointment.patient).select('user name').lean();
  const doctor = await User.findById(appointment.doctor).select('name').lean();
  const dateStr = appointment.scheduledAt
    ? new Date(appointment.scheduledAt).toLocaleDateString()
    : '';
  const meta = { appointmentId: appointment._id, cancelledBy: user.userId };

  if (patient?.user && String(patient.user) !== String(user.userId)) {
    await notifyAndEmit({ recipient: patient.user, title: 'Appointment Cancelled', message: `Your appointment on ${dateStr} has been cancelled.`, type: 'appointment', metadata: meta }, tenantSlug);
  }
  if (String(appointment.doctor) !== String(user.userId)) {
    await notifyAndEmit({ recipient: appointment.doctor, title: 'Appointment Cancelled', message: `The appointment with ${patient?.name || 'a patient'} on ${dateStr} has been cancelled.`, type: 'appointment', metadata: meta }, tenantSlug);
  }

  logAccess(conn, {
    patient: appointment.patient,
    accessedBy: user.userId,
    accessType: 'cancel',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `${user.role} cancelled appointment`,
  });

  // ── Cascade cleanup for deleted appointment ──

  // Cancel DRAFT/SENT invoices
  try {
    const Invoice = conn.model('Invoice');
    await Invoice.updateMany(
      { appointment: id, status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] }, deletedAt: null },
      { $set: { status: INVOICE_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.error('deleteAppointment: failed to cancel invoices for %s: %s', id, err.message);
  }

  // Fail PENDING payments for this appointment's invoices
  try {
    const Invoice = conn.model('Invoice');
    const Payment = conn.model('Payment');
    const invoiceIds = await Invoice.find({ appointment: id, deletedAt: null }).select('_id').lean();
    if (invoiceIds.length > 0) {
      await Payment.updateMany(
        { invoice: { $in: invoiceIds.map(i => i._id) }, status: PAYMENT_STATUS.PENDING, deletedAt: null },
        { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'appointment_deleted' } } },
      );
    }
  } catch (err) {
    logger.error('deleteAppointment: failed to cancel payments for %s: %s', id, err.message);
  }

  // Cancel waiting/scheduled VideoSessions
  try {
    const VideoSession = conn.model('VideoSession');
    await VideoSession.updateMany(
      { appointment: id, status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.SCHEDULED, VIDEO_SESSION_STATUS.WAITING] }, deletedAt: null },
      { $set: { status: VIDEO_SESSION_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.error('deleteAppointment: failed to cancel video sessions for %s: %s', id, err.message);
  }

  // Cancel waiting QueueEntries
  try {
    const QueueEntry = conn.model('QueueEntry');
    await QueueEntry.updateMany(
      { appointment: id, status: 'waiting' },
      { $set: { status: 'cancelled' } },
    );
  } catch (err) {
    logger.error('deleteAppointment: failed to cancel queue entries for %s: %s', id, err.message);
  }

  // Cancel scheduled BullMQ reminders
  try {
    if (appointment.reminders && appointment.reminders.length > 0) {
      const { cancelReminders } = require('../../utils/reminderScheduler');
      await cancelReminders(appointment.reminders);
    } else if (appointment.reminderJobId) {
      const { cancelSingleReminder } = require('../../utils/reminderScheduler');
      await cancelSingleReminder(appointment.reminderJobId);
    }
  } catch (err) {
    logger.error('deleteAppointment: failed to cancel reminders for %s: %s', id, err.message);
  }

  // Remove stale notifications referencing this appointment
  try {
    const Notification = conn.model('Notification');
    await Notification.updateMany(
      { 'metadata.appointmentId': { $in: [id, appointment._id] }, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  } catch (err) {
    logger.error('deleteAppointment: failed to clean notifications for %s: %s', id, err.message);
  }

  return appointment;
}

async function getDoctorAvailability(doctorId, date, tenantSlug, branchId) {
  const availabilityService = require('../../services/availability.service');
  return availabilityService.getDoctorAvailability(doctorId, date, tenantSlug, branchId);
}

module.exports = {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getDoctorAvailability,
};
