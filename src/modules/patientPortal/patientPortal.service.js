'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { uploadFile } = require('../../services/storage.service');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { logAccess } = require('../../utils/logAccess');
const { resolveBookingPolicy } = require('../../utils/resolveBookingPolicy');
const Clinic = require('../../models/platform/Clinic');

// ── Helpers ─────────────────────────────────────────────────────────

async function _resolvePatientAccess(userId, patientId, conn) {
  const Patient = conn.model('Patient');
  const filter = { $or: [{ user: userId }, { guardian: userId }] };
  if (patientId) filter._id = patientId;
  const patient = await Patient.findOne(filter).lean();
  if (!patient) throw ApiError.forbidden('Access denied to this patient record');
  return patient;
}

// ── Service methods ─────────────────────────────────────────────────

async function getPatientProfiles(userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  let profiles = await Patient.find({ $or: [{ user: userId }, { guardian: userId }] })
    .populate('primaryDoctor', 'name')
    .lean();

  // Auto-create Patient record for registered users who don't have one yet
  if (profiles.length === 0) {
    const User = conn.model('User');
    const user = await User.findById(userId).lean();
    if (user && (user.role === 'patient' || user.role === 'guardian')) {
      // Check if an unlinked Patient exists with same email — link it
      let patient = user.email
        ? await Patient.findOneAndUpdate(
            { email: user.email, user: null },
            { user: userId },
            { new: true },
          ).lean()
        : null;

      if (!patient) {
        try {
          const created = await Patient.create({
            user: userId,
            name: user.name,
            email: user.email,
            phone: user.phone || 'N/A',
          });
          patient = created.toJSON();
        } catch (err) {
          // If creation fails (e.g. duplicate), re-query in case a record now exists
          profiles = await Patient.find({ $or: [{ user: userId }, { guardian: userId }] })
            .populate('primaryDoctor', 'name')
            .lean();
          return profiles;
        }
      }

      if (patient) profiles = [patient];
    }
  }

  return profiles;
}

async function getPatientProfile(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);
  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'profile',
    resourceId: patient._id,
    description: `Viewed patient profile`,
    metadata: { patientName: patient.name, patientId: patient.patientId },
  });
  return patient;
}

async function getPortalDashboard(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const Prescription = conn.model('Prescription');
  const Invoice = conn.model('Invoice');
  const Notification = conn.model('Notification');

  const now = new Date();

  const [
    upcomingAppointments,
    nextAppointment,
    activePrescriptions,
    pendingPaymentsResult,
    unreadNotifications,
  ] = await Promise.all([
    Appointment.countDocuments({
      patient: patient._id,
      deletedAt: null,
      status: { $in: ['requested', 'confirmed', 'checked_in'] },
      scheduledAt: { $gte: now },
    }),
    Appointment.findOne({
      patient: patient._id,
      status: { $in: ['requested', 'confirmed', 'checked_in'] },
      scheduledAt: { $gte: now },
    })
      .sort({ scheduledAt: 1 })
      .populate('doctor', 'name specialization')
      .lean(),
    Prescription.countDocuments({ patient: patient._id, deletedAt: null, status: 'active' }),
    Invoice.aggregate([
      {
        $match: {
          patient: new mongoose.Types.ObjectId(patient._id),
          deletedAt: null,
          status: { $in: ['sent', 'overdue'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  const pendingPayments = pendingPaymentsResult.length > 0
    ? { count: pendingPaymentsResult[0].count, total: pendingPaymentsResult[0].total }
    : { count: 0, total: 0 };

  return {
    upcomingAppointments,
    nextAppointment,
    activePrescriptions,
    pendingPayments,
    unreadNotifications,
  };
}

async function listPatientAppointments(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.statusNin) {
    const excluded = query.statusNin.split(',').map((s) => s.trim());
    filter.status = { ...(filter.status && typeof filter.status === 'string' ? { $eq: filter.status } : filter.status || {}), $nin: excluded };
  }
  if (query.from || query.to) {
    filter.scheduledAt = {};
    if (query.from) filter.scheduledAt.$gte = new Date(query.from);
    if (query.to) filter.scheduledAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('doctor', 'name specialization')
      .populate('branch', 'name'),
    Appointment.countDocuments(filter),
  ]);

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'appointment',
    description: `Viewed appointments list (${total} records${query.status ? ', status: ' + query.status : ''})`,
    metadata: { totalRecords: total, statusFilter: query.status || null },
  });

  return { items, total, page, limit };
}

async function getAppointmentById(appointmentId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const Appointment = conn.model('Appointment');

  // Find all patient records the user has access to
  const patients = await Patient.find({ $or: [{ user: userId }, { guardian: userId }] }).select('_id').lean();
  if (!patients.length) throw ApiError.forbidden('Access denied');

  const appointment = await Appointment.findById(appointmentId)
    .populate('doctor', 'name specialization consultationFee')
    .populate('branch', 'name address')
    .populate('patient', 'name patientId');
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // Verify the appointment belongs to one of this user's patient records
  const patientIds = patients.map((p) => String(p._id));
  if (!patientIds.includes(String(appointment.patient?._id || appointment.patient))) {
    throw ApiError.forbidden('Access denied to this appointment');
  }

  const doctorName = appointment.doctor?.name;
  const apptDate = appointment.scheduledAt ? new Date(appointment.scheduledAt).toLocaleDateString('en-IN') : '';
  logAccess(conn, {
    patient: appointment.patient?._id || appointment.patient,
    accessedBy: userId,
    accessType: 'view',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `Viewed ${appointment.type || 'appointment'} with Dr. ${doctorName || 'Unknown'} on ${apptDate}`,
    metadata: { doctorName, appointmentType: appointment.type, scheduledAt: appointment.scheduledAt, status: appointment.status },
  });

  return appointment;
}

async function bookAppointment(data, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const scheduledAt = new Date(data.scheduledAt);

  // Resolve clinic booking policy
  const policy = await resolveBookingPolicy(tenantSlug);

  // No-show block: prevent patients with too many no-shows from booking
  if (policy.noShowBlockThreshold != null && patient.noShowCount >= policy.noShowBlockThreshold) {
    throw ApiError.badRequest(
      'Booking restricted due to previous no-shows. Please contact the clinic.',
    );
  }

  // Resolve duration from policy type defaults if not explicitly provided
  const duration = data.duration
    ?? (policy.appointmentTypeDurations ? policy.appointmentTypeDurations[data.type || 'consultation'] : null)
    ?? policy.slotDuration;
  const endTime = new Date(scheduledAt.getTime() + duration * 60000);

  // Validate against doctor schedule, leaves, and branch hours
  const { validateBookingTime } = require('../../services/availability.service');
  await validateBookingTime(data.doctor, data.scheduledAt, duration, tenantSlug, data.branch);

  const conflict = await Appointment.findOne({
    doctor: data.doctor,
    status: { $nin: ['cancelled', 'no_show'] },
    scheduledAt: { $gte: scheduledAt, $lt: endTime },
  });
  if (conflict) {
    throw ApiError.conflict('Doctor has a conflicting appointment at this time');
  }

  // Determine initial status based on clinic auto-confirm policy
  const initialStatus = policy.autoConfirm ? 'confirmed' : 'requested';

  const appointment = await Appointment.create({
    doctor: data.doctor,
    scheduledAt,
    duration,
    type: data.type,
    // Drop empty/whitespace-only reasons so the stored record is clean.
    reason: data.reason && String(data.reason).trim() ? String(data.reason).trim() : undefined,
    branch: data.branch,
    patient: patient._id,
    createdBy: userId,
    status: initialStatus,
    source: data.source || 'chatbot',
  });

  // Auto-create a VideoSession for teleconsult appointments so that the patient
  // and doctor have a room to join. Without this, PatientVideoCall.jsx cannot
  // find a session and hangs in "waiting for doctor" forever.
  if (appointment.type === 'teleconsult') {
    try {
      const VideoSession = conn.model('VideoSession');
      const roomTokenService = require('../telemedicine/roomToken.service');
      const roomId = roomTokenService.generateRoomId(tenantSlug);
      await VideoSession.create({
        type: 'scheduled',
        status: 'scheduled',
        patient: patient._id,
        doctor: data.doctor,
        branch: data.branch,
        appointment: appointment._id,
        scheduledAt,
        roomId,
        // Keep room valid up to 24h past the appointment time
        expiresAt: new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000),
        createdBy: userId,
      });
    } catch (vsErr) {
      const logger = require('../../utils/logger');
      logger.error('Failed to auto-create VideoSession for appointment %s: %s', appointment._id, vsErr.message);
      // Non-blocking — appointment is still valid; doctor can start a session manually
    }
  }

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'create',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `Booked ${data.type || 'consultation'} appointment for ${new Date(data.scheduledAt).toLocaleDateString('en-IN')}`,
    metadata: { appointmentType: data.type, scheduledAt: data.scheduledAt, doctorId: String(data.doctor), branchId: data.branch ? String(data.branch) : null },
  });

  await notifyAndEmit({
    recipient: data.doctor,
    title: 'New Appointment Booked',
    message: `Patient ${patient.name} booked an appointment`,
    type: 'appointment',
    metadata: { appointmentId: appointment._id },
  }, tenantSlug);

  // Schedule reminder (24h before appointment)
  const { scheduleReminder } = require('../../utils/reminderScheduler');
  const jobId = await scheduleReminder(appointment._id.toString(), tenantSlug, data.scheduledAt);
  if (jobId) {
    appointment.reminderJobId = jobId;
    await appointment.save();
  }

  // ── Create invoice + Razorpay order for immediate payment ──
  // If the client omits `consultationFee`, fall back to the doctor's configured
  // fee. This keeps the "Confirm & Pay" flow working even when a caller forgets
  // to forward the fee, and makes the doctor record the source of truth.
  let paymentOrder = null;
  let consultationFee = data.consultationFee;
  if (!consultationFee || consultationFee <= 0) {
    try {
      const User = conn.model('User');
      const doctorRec = await User.findById(data.doctor).select('consultationFee').lean();
      if (doctorRec && doctorRec.consultationFee > 0) {
        consultationFee = doctorRec.consultationFee;
      }
    } catch {
      /* best-effort — if lookup fails we proceed without payment order */
    }
  }
  if (consultationFee && consultationFee > 0) {
    try {
      const User = conn.model('User');
      const doctorUser = await User.findById(data.doctor).select('name').lean();

      const Invoice = conn.model('Invoice');
      const invoice = await Invoice.create({
        patient: patient._id,
        appointment: appointment._id,
        doctor: data.doctor,
        branch: data.branch,
        items: [{
          description: `Consultation with Dr. ${doctorUser?.name || 'Doctor'}`,
          quantity: 1,
          unitPrice: consultationFee,
          discount: 0,
          tax: 0,
          total: consultationFee,
          itemType: 'consultation',
        }],
        subtotal: consultationFee,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: consultationFee,
        status: 'sent',
        dueDate: new Date(data.scheduledAt),
        createdBy: userId,
      });

      appointment.invoice = invoice._id;
      await appointment.save();

      const razorpay = require('../../utils/razorpay');
      const gatewayConfig = razorpay.checkConfig();
      if (!gatewayConfig.ok) {
        require('../../utils/logger').error(
          'Razorpay order aborted for booking [%s]: %s', tenantSlug, gatewayConfig.reason,
        );
        throw ApiError.serviceUnavailable(`Payment gateway is not configured: ${gatewayConfig.reason}`);
      }
      const amountPaise = Math.round(consultationFee * 100);
      const receipt = `rcpt_${invoice.invoiceNumber}_${Date.now()}`;
      const rzOrder = await razorpay.createOrder(amountPaise, 'INR', receipt, {
        invoiceId: String(invoice._id),
        appointmentId: String(appointment._id),
        invoiceNumber: invoice.invoiceNumber,
        tenantSlug,
      });

      const Payment = conn.model('Payment');
      await Payment.create({
        invoice: invoice._id,
        patient: patient._id,
        amount: consultationFee,
        mode: 'card',
        status: 'pending',
        gatewayProvider: 'razorpay',
        gatewayOrderId: rzOrder.id,
        branch: data.branch,
        createdBy: userId,
      });

      const env = require('../../config/env');
      paymentOrder = {
        orderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency,
        keyId: env.RAZORPAY_KEY_ID,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
      };
    } catch (payErr) {
      // Payment setup failed — appointment is still confirmed, patient can pay later
      const logger = require('../../utils/logger');
      logger.error('Failed to create payment order for appointment %s: %s', appointment._id, payErr.message);
    }
  }

  // Broadcast availability change so other clients refresh their slot views
  try {
    const { emitToTenant } = require('../../websocket');
    const dateStr = scheduledAt.toISOString().slice(0, 10);
    emitToTenant(tenantSlug, 'availability:invalidated', {
      doctorId: String(data.doctor),
      date: dateStr,
      reason: 'appointment_booked',
    });
  } catch (_) { /* non-blocking */ }

  const result = appointment.toJSON();
  if (paymentOrder) result.paymentOrder = paymentOrder;
  return result;
}

async function cancelAppointment(appointmentId, reason, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  const cancellable = ['requested', 'confirmed', 'checked_in'];
  if (!cancellable.includes(appointment.status)) {
    throw ApiError.badRequest('Appointment cannot be cancelled in its current status');
  }

  // Enforce cancellation cutoff policy
  const policy = await resolveBookingPolicy(tenantSlug);
  if (policy.cancellationCutoffMin != null && appointment.scheduledAt) {
    const msUntilAppt = new Date(appointment.scheduledAt).getTime() - Date.now();
    if (msUntilAppt < policy.cancellationCutoffMin * 60000) {
      const display = policy.cancellationCutoffMin >= 60
        ? `${Math.round(policy.cancellationCutoffMin / 60)} hour(s)`
        : `${policy.cancellationCutoffMin} minutes`;
      throw ApiError.badRequest(
        `Appointments must be cancelled at least ${display} in advance`,
      );
    }
  }

  // Cancel scheduled reminder
  const { cancelReminder } = require('../../utils/reminderScheduler');
  if (appointment.reminderJobId) await cancelReminder(appointment.reminderJobId);

  appointment.status = 'cancelled';
  appointment.cancelledAt = new Date();
  appointment.cancelReason = reason;
  await appointment.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'cancel',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `Cancelled appointment on ${appointment.scheduledAt ? new Date(appointment.scheduledAt).toLocaleDateString('en-IN') : 'N/A'}`,
    metadata: { reason, scheduledAt: appointment.scheduledAt, doctorId: String(appointment.doctor) },
  });

  // Cancel linked QueueEntry if patient was already checked in
  const QueueEntry = conn.model('QueueEntry');
  await QueueEntry.updateMany(
    { appointment: appointment._id, status: 'waiting' },
    { status: 'cancelled' },
  );

  // Cascade: cancel DRAFT/SENT invoices + fail PENDING payments
  try {
    const { INVOICE_STATUS, PAYMENT_STATUS, VIDEO_SESSION_STATUS } = require('../../config/constants');
    const Invoice = conn.model('Invoice');
    const invoiceCancelResult = await Invoice.updateMany(
      { appointment: appointment._id, status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] }, deletedAt: null },
      { $set: { status: INVOICE_STATUS.CANCELLED } },
    );
    if (invoiceCancelResult.modifiedCount > 0) {
      const Payment = conn.model('Payment');
      const cancelledIds = await Invoice.find({
        appointment: appointment._id, status: INVOICE_STATUS.CANCELLED, deletedAt: null,
      }).select('_id').lean();
      if (cancelledIds.length > 0) {
        await Payment.updateMany(
          { invoice: { $in: cancelledIds.map(i => i._id) }, status: PAYMENT_STATUS.PENDING, deletedAt: null },
          { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'appointment_cancelled_by_patient' } } },
        );
      }
    }

    // Cascade: cancel waiting/scheduled VideoSessions
    const VideoSession = conn.model('VideoSession');
    await VideoSession.updateMany(
      { appointment: appointment._id, status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.SCHEDULED, VIDEO_SESSION_STATUS.WAITING] }, deletedAt: null },
      { $set: { status: VIDEO_SESSION_STATUS.CANCELLED } },
    );
  } catch (cascadeErr) {
    const logger = require('../../utils/logger');
    logger.error('cancelAppointment: cascade cleanup failed for %s: %s', appointment._id, cascadeErr.message);
  }

  // Notify doctor of patient cancellation
  const dateStr = appointment.scheduledAt
    ? new Date(appointment.scheduledAt).toLocaleDateString()
    : '';
  await notifyAndEmit({
    recipient: appointment.doctor,
    title: 'Appointment Cancelled by Patient',
    message: `${patient.name} has cancelled the appointment on ${dateStr}.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'appointment',
    metadata: { appointmentId: appointment._id, reason, cancelledBy: userId },
  }, tenantSlug);

  // Broadcast availability change so other clients refresh their slot views
  try {
    const { emitToTenant } = require('../../websocket');
    const cancelDate = appointment.scheduledAt
      ? new Date(appointment.scheduledAt).toISOString().slice(0, 10)
      : '';
    emitToTenant(tenantSlug, 'availability:invalidated', {
      doctorId: String(appointment.doctor),
      date: cancelDate,
      reason: 'appointment_cancelled',
    });
  } catch (_) { /* non-blocking */ }

  // Remove stale pre-cancel notifications (e.g. "New Appointment Booked")
  try {
    const Notification = conn.model('Notification');
    await Notification.updateMany(
      {
        'metadata.appointmentId': { $in: [String(appointment._id), appointment._id] },
        title: { $nin: ['Appointment Cancelled by Patient'] }, // keep the cancellation notification itself
        deletedAt: null,
      },
      { $set: { deletedAt: new Date() } },
    );
  } catch (_) { /* non-blocking */ }

  return appointment;
}

async function rescheduleAppointment(appointmentId, newScheduledAt, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  const cancellable = ['requested', 'confirmed', 'checked_in'];
  if (!cancellable.includes(appointment.status)) {
    throw ApiError.badRequest('Appointment cannot be rescheduled in its current status');
  }

  // Enforce reschedule policy
  const policy = await resolveBookingPolicy(tenantSlug);

  if (policy.rescheduleCutoffMin != null && appointment.scheduledAt) {
    const msUntilAppt = new Date(appointment.scheduledAt).getTime() - Date.now();
    if (msUntilAppt < policy.rescheduleCutoffMin * 60000) {
      const display = policy.rescheduleCutoffMin >= 60
        ? `${Math.round(policy.rescheduleCutoffMin / 60)} hour(s)`
        : `${policy.rescheduleCutoffMin} minutes`;
      throw ApiError.badRequest(
        `Appointments must be rescheduled at least ${display} in advance`,
      );
    }
  }

  if (policy.maxReschedulesPerAppt != null && (appointment.rescheduleCount || 0) >= policy.maxReschedulesPerAppt) {
    throw ApiError.badRequest(
      `This appointment has reached the maximum number of reschedules (${policy.maxReschedulesPerAppt})`,
    );
  }

  const scheduledAt = new Date(newScheduledAt);
  const duration = appointment.duration || 30;
  const endTime = new Date(scheduledAt.getTime() + duration * 60000);

  // Validate against doctor schedule, leaves, and branch hours
  const { validateBookingTime } = require('../../services/availability.service');
  await validateBookingTime(appointment.doctor, newScheduledAt, duration, tenantSlug, appointment.branch);

  const conflict = await Appointment.findOne({
    _id: { $ne: appointmentId },
    doctor: appointment.doctor,
    status: { $nin: ['cancelled', 'no_show'] },
    scheduledAt: { $gte: scheduledAt, $lt: endTime },
  });
  if (conflict) {
    throw ApiError.conflict('Doctor has a conflicting appointment at this time');
  }

  // Cancel all old reminders and schedule new ones with same timings
  const { cancelReminders, scheduleReminders } = require('../../utils/reminderScheduler');
  if (appointment.reminders && appointment.reminders.length > 0) {
    await cancelReminders(appointment.reminders);
  } else if (appointment.reminderJobId) {
    // Backward compat: old single-reminder
    const { cancelSingleReminder } = require('../../utils/reminderScheduler');
    await cancelSingleReminder(appointment.reminderJobId);
  }

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'update',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `Rescheduled appointment to ${scheduledAt.toLocaleDateString('en-IN')}`,
    metadata: { previousDate: appointment.scheduledAt, newDate: scheduledAt, doctorId: String(appointment.doctor) },
  });

  const previousDate = appointment.scheduledAt;
  const timings = (appointment.reminderTimings && appointment.reminderTimings.length > 0)
    ? appointment.reminderTimings
    : [1440];

  appointment.scheduledAt = scheduledAt;
  appointment.status = 'requested';
  appointment.rescheduleCount = (appointment.rescheduleCount || 0) + 1;
  appointment.reminderSent = false;
  appointment.reminderSentAt = undefined;
  appointment.patientConfirmation = { status: 'pending' };

  // Schedule new reminders
  const reminderEntries = await scheduleReminders(appointment._id.toString(), tenantSlug, scheduledAt, timings);
  appointment.reminders = reminderEntries;
  appointment.reminderJobId = reminderEntries.length > 0 ? reminderEntries[0].jobId : undefined;

  await appointment.save();

  // Notify doctor of reschedule
  const newDateStr = scheduledAt.toLocaleDateString();
  await notifyAndEmit({
    recipient: appointment.doctor,
    title: 'Appointment Rescheduled',
    message: `${patient.name} has rescheduled the appointment to ${newDateStr}.`,
    type: 'appointment',
    metadata: { appointmentId: appointment._id, previousDate, newDate: scheduledAt, rescheduledBy: userId },
  }, tenantSlug);

  // Broadcast availability change for both old and new dates
  try {
    const { emitToTenant } = require('../../websocket');
    const doctorId = String(appointment.doctor);
    const oldDate = previousDate ? new Date(previousDate).toISOString().slice(0, 10) : '';
    const newDate = scheduledAt.toISOString().slice(0, 10);
    emitToTenant(tenantSlug, 'availability:invalidated', {
      doctorId,
      date: newDate,
      reason: 'appointment_rescheduled',
    });
    if (oldDate && oldDate !== newDate) {
      emitToTenant(tenantSlug, 'availability:invalidated', {
        doctorId,
        date: oldDate,
        reason: 'appointment_rescheduled',
      });
    }
  } catch (_) { /* non-blocking */ }

  return appointment;
}

async function createEmergencyRequest(data, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const EmergencySession = conn.model('EmergencySession');
  return EmergencySession.create({
    patient: patient._id,
    type: data.type,
    reason: data.reason,
    branch: data.branch,
    status: 'requested',
    createdBy: userId,
  });
}

async function listPrescriptions(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Prescription = conn.model('Prescription');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id, deletedAt: null };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Prescription.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('doctor', 'name specialization'),
    Prescription.countDocuments(filter),
  ]);

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'prescription',
    description: `Viewed prescriptions list (${total} records)`,
    metadata: { totalRecords: total },
  });

  return { items, total, page, limit };
}

async function getMedicalHistory(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const TreatmentRecord = conn.model('TreatmentRecord');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id, deletedAt: null };

  const [items, total] = await Promise.all([
    TreatmentRecord.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('doctor', 'name')
      .populate('appointment', 'scheduledAt type'),
    TreatmentRecord.countDocuments(filter),
  ]);

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'treatment',
    description: `Viewed medical history / treatment records (${total} records)`,
    metadata: { totalRecords: total },
  });

  return { items, total, page, limit };
}

async function listPayments(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Invoice = conn.model('Invoice');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  // Exclude cancelled invoices by default (orphaned from deleted appointments)
  if (!query.status) {
    filter.status = { $ne: 'cancelled' };
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('doctor', 'name'),
    Invoice.countDocuments(filter),
  ]);

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'invoice',
    description: `Viewed invoices & payments (${total} records)`,
    metadata: { totalRecords: total, statusFilter: query.status || null },
  });

  return { items, total, page, limit };
}

async function initiatePayment(invoiceId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const razorpay = require('../../utils/razorpay');
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Invoice = conn.model('Invoice');
  const Payment = conn.model('Payment');
  const { PAYMENT_MODE, PAYMENT_STATUS } = require('../../config/constants');

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');

  if (String(invoice.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  if (!['sent', 'overdue', 'partially_paid'].includes(invoice.status)) {
    throw ApiError.badRequest('Invoice is not payable in its current status');
  }

  // Calculate remaining balance (support partial payments)
  const remainingBalance = Math.round(((invoice.totalAmount || 0) - (invoice.paidAmount || 0)) * 100) / 100;
  if (remainingBalance <= 0) {
    throw ApiError.badRequest('Invoice is already fully paid');
  }

  // Amount in paise for Razorpay
  const amountPaise = Math.round(remainingBalance * 100);

  // Create Razorpay order with tenantSlug in notes for webhook routing.
  // Checked up front so a misconfigured gateway reports itself instead of
  // surfacing as a bare 401 from the SDK.
  const portalLogger = require('../../utils/logger');
  const gatewayConfig = razorpay.checkConfig();
  if (!gatewayConfig.ok) {
    portalLogger.error('Razorpay order aborted — gateway not configured [%s]: %s', tenantSlug, gatewayConfig.reason);
    throw ApiError.serviceUnavailable(`Payment gateway is not configured: ${gatewayConfig.reason}`);
  }

  const receipt = `rcpt_${invoice.invoiceNumber}_${Date.now()}`;
  let rzOrder;
  try {
    rzOrder = await razorpay.createOrder(amountPaise, 'INR', receipt, {
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      tenantSlug,
    });
  } catch (err) {
    const detail = err?.error?.description || err.message;
    portalLogger.error('Razorpay order failed [%s] invoice=%s: %s', tenantSlug, invoice.invoiceNumber, detail);
    throw ApiError.serviceUnavailable(`Payment gateway error: ${detail}`);
  }

  // Create PENDING Payment record
  await Payment.create({
    invoice: invoiceId,
    patient: patient._id,
    amount: remainingBalance,
    mode: PAYMENT_MODE.CARD,
    status: PAYMENT_STATUS.PENDING,
    gatewayProvider: 'razorpay',
    gatewayOrderId: rzOrder.id,
    branch: invoice.branch,
    createdBy: userId,
  });

  return {
    orderId: rzOrder.id,
    amount: amountPaise,
    currency: 'INR',
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    patientName: patient.name,
    patientEmail: patient.email,
    patientPhone: patient.phone,
  };
}

async function verifyInvoicePayment(payload, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);
  const paymentService = require('../payment/payment.service');

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = payload;

  // Verify the invoice belongs to this patient
  const Invoice = conn.model('Invoice');
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (String(invoice.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  // Find the pending payment
  const Payment = conn.model('Payment');
  const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
  if (!payment) throw ApiError.notFound('Payment record not found');

  const { PAYMENT_STATUS } = require('../../config/constants');
  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    return { payment, alreadyPaid: true };
  }

  // Delegate to payment service's production-grade verify flow
  const verifiedPayment = await paymentService.verifyGatewayPayment(
    {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      invoiceId: String(payment.invoice),
      amount: payment.amount * 100,
    },
    { userId, role: 'patient' },
    tenantSlug,
  );

  return { payment: verifiedPayment, alreadyPaid: false };
}

async function createShareToken(data, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const ShareToken = conn.model('ShareToken');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);

  const shareToken = await ShareToken.create({
    patient: patient._id,
    token,
    recordType: data.recordType,
    recordId: data.recordId || null,
    sharedBy: userId,
    sharedWith: data.sharedWith || null,
    expiresAt,
    maxAccesses: data.maxAccesses || 10,
  });

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'share',
    resource: 'share_token',
    resourceId: shareToken._id,
    description: `Created share link for ${data.recordType} records${data.sharedWith ? ' with ' + data.sharedWith : ''} (expires ${expiresAt.toLocaleDateString('en-IN')})`,
    metadata: { recordType: data.recordType, sharedWith: data.sharedWith || null, expiresInHours: data.expiresInHours, maxAccesses: data.maxAccesses },
  });

  return { token: shareToken.token, expiresAt: shareToken.expiresAt };
}

async function listShareTokens(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const ShareToken = conn.model('ShareToken');
  return ShareToken.find({
    patient: patient._id,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

async function revokeShareToken(tokenId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const ShareToken = conn.model('ShareToken');
  const shareToken = await ShareToken.findById(tokenId);
  if (!shareToken) throw ApiError.notFound('Share token not found');

  if (String(shareToken.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  shareToken.isRevoked = true;
  shareToken.revokedAt = new Date();
  await shareToken.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'revoke',
    resource: 'share_token',
    resourceId: shareToken._id,
    description: `Revoked share link for ${shareToken.recordType} records`,
    metadata: { recordType: shareToken.recordType, sharedWith: shareToken.sharedWith },
  });

  return shareToken;
}

async function viewSharedRecord(tokenStr, tenantSlug, ipAddress, userAgent) {
  const conn = await getTenantConnection(tenantSlug);
  const ShareToken = conn.model('ShareToken');

  const shareToken = await ShareToken.findOneAndUpdate(
    {
      token: tokenStr,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$accessCount', '$maxAccesses'] },
    },
    { $inc: { accessCount: 1 } },
    { new: true },
  );
  if (!shareToken) {
    throw ApiError.notFound('Share link is invalid, expired, or has reached maximum views');
  }

  let data;

  switch (shareToken.recordType) {
    case 'treatment': {
      const TreatmentRecord = conn.model('TreatmentRecord');
      const Patient = conn.model('Patient');

      const record = await TreatmentRecord.findById(shareToken.recordId)
        .populate('doctor', 'name specialization licenseNumber')
        .populate('appointment', 'scheduledAt status type')
        .lean();

      if (!record) { data = null; break; }

      // Strip attachment file URLs (keep metadata only)
      if (record.attachments) {
        record.attachments = record.attachments.map((a) => ({
          fileName: a.fileName,
          fileType: a.fileType,
          uploadedAt: a.uploadedAt,
        }));
      }

      // Fetch patient (safe subset — no phone, email, address)
      let patient = null;
      if (shareToken.patient) {
        const fullPatient = await Patient.findById(shareToken.patient)
          .select('name dateOfBirth gender medicalHistory')
          .lean();
        if (fullPatient) {
          patient = {
            name: fullPatient.name,
            dateOfBirth: fullPatient.dateOfBirth,
            gender: fullPatient.gender,
            medicalHistory: fullPatient.medicalHistory?.conditions || [],
            allergies: fullPatient.medicalHistory?.allergies || [],
          };
        }
      }

      // Fetch clinic branding from platform DB
      let clinic = null;
      try {
        const clinicDoc = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
          .select('name slug logo email phone address')
          .lean();
        if (clinicDoc) {
          clinic = {
            name: clinicDoc.name,
            logo: clinicDoc.logo,
            email: clinicDoc.email,
            phone: clinicDoc.phone,
            address: clinicDoc.address,
          };
        }
      } catch { /* clinic lookup is non-critical */ }

      data = {
        type: 'treatment',
        record,
        clinic,
        doctor: record.doctor || null,
        patient,
        appointment: record.appointment || null,
        expiresAt: shareToken.expiresAt,
        patientName: patient?.name || null,
      };
      break;
    }
    case 'prescription': {
      const Prescription = conn.model('Prescription');
      data = await Prescription.findById(shareToken.recordId)
        .populate('doctor', 'name')
        .lean();
      break;
    }
    case 'invoice': {
      const Invoice = conn.model('Invoice');
      const invoice = await Invoice.findById(shareToken.recordId).lean();
      if (invoice) {
        delete invoice.paymentReference;
        delete invoice.paymentId;
      }
      data = invoice;
      break;
    }
    case 'all': {
      const TreatmentRecord = conn.model('TreatmentRecord');
      const Prescription = conn.model('Prescription');
      const Invoice = conn.model('Invoice');
      const [treatments, prescriptions, invoices] = await Promise.all([
        TreatmentRecord.find({ patient: shareToken.patient })
          .sort({ createdAt: -1 }).limit(10)
          .populate('doctor', 'name')
          .lean(),
        Prescription.find({ patient: shareToken.patient })
          .sort({ createdAt: -1 }).limit(10)
          .populate('doctor', 'name')
          .lean(),
        Invoice.find({ patient: shareToken.patient })
          .sort({ createdAt: -1 }).limit(10)
          .lean(),
      ]);
      treatments.forEach((t) => {
        if (t.attachments) {
          t.attachments = t.attachments.map((a) => ({
            fileName: a.fileName,
            fileType: a.fileType,
            uploadedAt: a.uploadedAt,
          }));
        }
      });
      invoices.forEach((inv) => {
        delete inv.paymentReference;
        delete inv.paymentId;
      });
      data = { treatments, prescriptions, invoices };
      break;
    }
    default:
      throw ApiError.badRequest('Unknown record type');
  }

  logAccess(conn, {
    patient: shareToken.patient,
    accessedBy: null,
    accessType: 'view',
    resource: shareToken.recordType === 'all' ? 'profile' : shareToken.recordType,
    resourceId: shareToken.recordId,
    description: `External viewer accessed ${shareToken.recordType} records via share link${shareToken.sharedWith ? ' (shared with ' + shareToken.sharedWith + ')' : ''}`,
    metadata: { recordType: shareToken.recordType, sharedWith: shareToken.sharedWith, accessCount: shareToken.accessCount, maxAccesses: shareToken.maxAccesses, viewerIp: ipAddress },
    ipAddress,
    userAgent,
    shareToken: shareToken._id,
  });

  return data;
}

async function listConsents(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Consent = conn.model('Consent');
  const items = await Consent.find({ patient: patient._id })
    .populate('grantedTo', 'name role')
    .sort({ createdAt: -1 });

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'consent',
    description: `Viewed consent records (${items.length} records)`,
    metadata: { totalRecords: items.length },
  });

  return items;
}

async function approveConsent(consentId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Consent = conn.model('Consent');
  const consent = await Consent.findById(consentId);
  if (!consent) throw ApiError.notFound('Consent not found');

  if (String(consent.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  if (consent.status === 'revoked') {
    throw ApiError.badRequest('Cannot approve a revoked consent');
  }
  if (consent.status === 'active') {
    throw ApiError.badRequest('Consent is already active');
  }

  consent.status = 'active';
  consent.grantedAt = new Date();
  await consent.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'update',
    resource: 'consent',
    resourceId: consent._id,
    description: `Approved ${consent.consentType || 'data'} consent${consent.grantedTo ? '' : ''}`,
    metadata: { consentType: consent.consentType, scope: consent.scope, purpose: consent.purpose },
  });

  return consent;
}

async function revokePatientConsent(consentId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Consent = conn.model('Consent');
  const consent = await Consent.findById(consentId);
  if (!consent) throw ApiError.notFound('Consent not found');

  if (String(consent.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  if (consent.status === 'revoked') {
    throw ApiError.badRequest('Consent is already revoked');
  }

  consent.status = 'revoked';
  consent.revokedAt = new Date();
  await consent.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'revoke',
    resource: 'consent',
    resourceId: consent._id,
    description: `Revoked ${consent.consentType || 'data'} consent`,
    metadata: { consentType: consent.consentType, scope: consent.scope, purpose: consent.purpose },
  });

  return consent;
}

async function uploadInsuranceDoc(data, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const insPatient = await _resolvePatientAccess(userId, patientId, conn);

  // Pre-decode size check: base64 decodes to ~75% of its size
  const MAX_DECODED_SIZE = 10 * 1024 * 1024; // 10MB
  const estimatedSize = Math.ceil(data.fileData.length * 0.75);
  if (estimatedSize > MAX_DECODED_SIZE) {
    throw ApiError.badRequest('File size exceeds 10MB limit');
  }

  const buffer = Buffer.from(data.fileData, 'base64');
  const fileInfo = await uploadFile(
    { buffer, originalname: data.fileName, mimetype: data.mimeType },
    'insurance',
  );

  logAccess(conn, {
    patient: insPatient._id,
    accessedBy: userId,
    accessType: 'create',
    resource: 'insurance',
    description: `Uploaded insurance document: ${data.fileName}`,
    metadata: { fileName: data.fileName, mimeType: data.mimeType },
  });

  return {
    fileUrl: fileInfo.fileUrl,
    fileName: fileInfo.fileName,
    fileType: fileInfo.fileType,
  };
}

async function submitReview(data, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(data.appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  if (appointment.status !== 'completed') {
    throw ApiError.badRequest('Can only review completed appointments');
  }

  const Review = conn.model('Review');
  const existing = await Review.findOne({ patient: patient._id, appointment: data.appointmentId });
  if (existing) {
    throw ApiError.conflict('You have already reviewed this appointment');
  }

  const review = await Review.create({
    patient: patient._id,
    doctor: appointment.doctor,
    appointment: data.appointmentId,
    rating: data.rating,
    title: data.title,
    comment: data.comment,
    isAnonymous: data.isAnonymous || false,
    status: 'pending',
    createdBy: userId,
  });

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'create',
    resource: 'review',
    resourceId: review._id,
    description: `Submitted ${data.rating}-star review for appointment${data.isAnonymous ? ' (anonymous)' : ''}`,
    metadata: { rating: data.rating, title: data.title, isAnonymous: data.isAnonymous, doctorId: String(appointment.doctor) },
  });

  // Refresh featured doctor rating if applicable (fire-and-forget)
  const User = conn.model('User');
  const doctor = await User.findById(appointment.doctor).select('isFeaturedOnPlatform').lean();
  if (doctor?.isFeaturedOnPlatform) {
    const { refreshDoctorRating } = require('../featuredDoctor/featuredDoctor.service');
    refreshDoctorRating(tenantSlug, String(appointment.doctor));
  }

  return review;
}

async function listPatientReviews(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Review = conn.model('Review');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id, deletedAt: null };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort(sort || { createdAt: -1 }).skip(skip).limit(limit)
      .populate('doctor', 'name specializations profilePhoto')
      .populate('appointment', 'scheduledAt type')
      .lean(),
    Review.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getAccessLog(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const AccessLog = conn.model('AccessLog');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id };
  if (query.resource) filter.resource = query.resource;
  if (query.accessType) filter.accessType = query.accessType;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  // Exclude self-view entries — patient viewing their own records is noise
  if (patient.user) {
    filter.$nor = [{ accessedBy: patient.user, accessType: 'view' }];
  }

  const [items, total] = await Promise.all([
    AccessLog.find(filter)
      .sort(sort || { createdAt: -1 }).skip(skip).limit(limit)
      .populate('accessedBy', 'name role'),
    AccessLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get patient financial summary — totals and balances.
 */
async function getPatientFinancialSummary(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  await _resolvePatientAccess(userId, patientId, conn);
  const Invoice = conn.model('Invoice');
  const PatientLedger = conn.model('PatientLedger');
  const CreditNote = conn.model('CreditNote');

  const [invoiceAgg, statusAgg, creditNotes, ledgerEntry] = await Promise.all([
    // Overall totals (exclude cancelled)
    Invoice.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(patientId), status: { $ne: 'cancelled' }, deletedAt: null } },
      { $group: {
        _id: null,
        totalBilled: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
        invoiceCount: { $sum: 1 },
      }},
    ]),
    // Per-status breakdown
    Invoice.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(patientId), status: { $ne: 'cancelled' }, deletedAt: null } },
      { $group: {
        _id: '$status',
        total: { $sum: '$totalAmount' },
        count: { $sum: 1 },
      }},
    ]),
    CreditNote.aggregate([
      { $match: { patient: new mongoose.Types.ObjectId(patientId), status: 'issued', deletedAt: null } },
      { $group: { _id: null, availableCredit: { $sum: { $subtract: ['$totalAmount', '$appliedAmount'] } } } },
    ]),
    PatientLedger.findOne({ patient: patientId }).sort({ createdAt: -1 }).select('balance').lean(),
  ]);

  const inv = invoiceAgg[0] || { totalBilled: 0, totalPaid: 0, invoiceCount: 0 };

  // Build per-status lookup
  const byStatus = {};
  for (const s of statusAgg) { byStatus[s._id] = s; }

  const pendingTotal = (byStatus.sent?.total || 0) + (byStatus.draft?.total || 0) + (byStatus.partially_paid?.total || 0);
  const pendingCount = (byStatus.sent?.count || 0) + (byStatus.draft?.count || 0) + (byStatus.partially_paid?.count || 0);

  return {
    totalBilled: inv.totalBilled,
    totalPaid: inv.totalPaid,
    totalPending: pendingTotal,
    totalOverdue: byStatus.overdue?.total || 0,
    totalOutstanding: Math.max(inv.totalBilled - inv.totalPaid, 0),
    invoiceCount: inv.invoiceCount,
    paidCount: byStatus.paid?.count || 0,
    pendingCount,
    overdueCount: byStatus.overdue?.count || 0,
    availableCredit: creditNotes[0]?.availableCredit || 0,
    ledgerBalance: ledgerEntry?.balance || 0,
  };
}

/**
 * Get patient ledger entries.
 */
async function getPatientLedger(patientId, query, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  await _resolvePatientAccess(userId, patientId, conn);
  const PatientLedger = conn.model('PatientLedger');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patientId };
  const [items, total] = await Promise.all([
    PatientLedger.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    PatientLedger.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get patient credit notes.
 */
async function getPatientCreditNotes(patientId, query, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  await _resolvePatientAccess(userId, patientId, conn);
  const CreditNote = conn.model('CreditNote');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patientId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    CreditNote.find(filter).sort(sort).skip(skip).limit(limit)
      .populate('invoice', 'invoiceNumber totalAmount')
      .lean(),
    CreditNote.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Download invoice PDF for patient.
 */
async function downloadPatientInvoicePdf(invoiceId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const pdfPatient = await _resolvePatientAccess(userId, patientId, conn);

  logAccess(conn, {
    patient: pdfPatient._id,
    accessedBy: userId,
    accessType: 'download',
    resource: 'invoice',
    resourceId: invoiceId,
    description: `Downloaded invoice PDF`,
    metadata: { invoiceId: String(invoiceId) },
  });

  const invoiceService = require('../invoice/invoice.service');
  return invoiceService.generateInvoicePdf(invoiceId, tenantSlug);
}

// ── Clinic browsing (for appointment booking) ──────────────────────

async function listAvailableDepartments(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Department = conn.model('Department');
  const items = await Department.find({ isActive: true })
    .sort({ name: 1 })
    .populate('branch', 'name')
    .lean();
  return { items, total: items.length, page: 1, limit: items.length };
}

async function listAvailableDoctors(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const { skip, limit, page } = parsePagination(query);

  const filter = { role: 'doctor', isActive: true };
  if (query.department) filter.department = query.department;
  if (query.branch) filter.branch = query.branch;
  if (query.specialization) filter.specialization = query.specialization;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ name: 1 })
      .skip(skip).limit(limit)
      .select('name specialization department branch consultationFee avatar phone email')
      .populate('branch', 'name')
      .populate('department', 'name')
      .lean(),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getAvailableDoctor(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true })
    .select('name specialization department branch consultationFee avatar phone email')
    .populate('branch', 'name')
    .populate('department', 'name')
    .lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

async function updatePatientProfile(patientId, data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Patient = conn.model('Patient');
  const allowedFields = ['name', 'phone', 'dateOfBirth', 'gender', 'bloodGroup', 'address', 'emergencyContact'];
  const update = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  const updated = await Patient.findByIdAndUpdate(patient._id, update, { new: true, runValidators: true }).lean();
  if (!updated) throw ApiError.notFound('Patient not found');

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'update',
    resource: 'profile',
    resourceId: patient._id,
    description: `Updated profile fields: ${Object.keys(update).join(', ')}`,
    metadata: { updatedFields: Object.keys(update) },
  });

  return updated;
}

async function confirmAttendance(appointmentId, confirmationStatus, patientId, userId, tenantSlug) {
  if (!patientId) throw ApiError.badRequest('patientId query parameter is required');
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  const confirmable = ['requested', 'confirmed', 'checked_in'];
  if (!confirmable.includes(appointment.status)) {
    throw ApiError.badRequest('Cannot confirm attendance in the current appointment status');
  }

  appointment.patientConfirmation = {
    status: confirmationStatus,
    respondedAt: new Date(),
    method: 'app',
  };
  await appointment.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'update',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `${confirmationStatus === 'confirmed' ? 'Confirmed' : 'Declined'} attendance for appointment on ${new Date(appointment.scheduledAt).toLocaleDateString('en-IN')}`,
    metadata: { confirmationStatus, scheduledAt: appointment.scheduledAt, doctorId: String(appointment.doctor) },
  });

  // Notify doctor about patient's response
  const User = conn.model('User');
  const doctor = await User.findById(appointment.doctor).select('name').lean();
  const dateStr = new Date(appointment.scheduledAt).toLocaleDateString();
  const isConfirmed = confirmationStatus === 'confirmed';

  await notifyAndEmit({
    recipient: appointment.doctor,
    title: isConfirmed ? 'Patient Confirmed Attendance' : 'Patient Declined Attendance',
    message: isConfirmed
      ? `${patient.name} has confirmed attendance for the appointment on ${dateStr}.`
      : `${patient.name} has indicated they cannot attend the appointment on ${dateStr}. Please review.`,
    type: 'appointment',
    metadata: { appointmentId: appointment._id, confirmationStatus, patientName: patient.name },
  }, tenantSlug);

  return appointment;
}

async function verifyAppointmentPayment(payload, patientId, userId, tenantSlug) {
  const { PAYMENT_STATUS } = require('../../config/constants');
  const paymentService = require('../payment/payment.service');

  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId } = payload;

  // Verify the appointment belongs to this patient
  const Appointment = conn.model('Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  // Verify Razorpay signature
  const razorpay = require('../../utils/razorpay');
  const isValid = razorpay.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    throw ApiError.badRequest('Invalid payment signature — verification failed');
  }

  // Find the pending payment
  const Payment = conn.model('Payment');
  const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
  if (!payment) throw ApiError.notFound('Payment record not found');

  // Idempotency: already completed
  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    return { appointment, payment, alreadyPaid: true };
  }

  // Delegate to the payment service's production-grade verify flow
  // which uses CAS update, atomic invoice update, audit log, and ledger
  const verifiedPayment = await paymentService.verifyGatewayPayment(
    {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      invoiceId: String(payment.invoice),
      amount: payment.amount * 100, // convert rupees back to paise for the service
    },
    { userId, role: 'patient' },
    tenantSlug,
  );

  return { appointment, payment: verifiedPayment, alreadyPaid: false };
}

// ── Dependent Management (Guardian) ─────────────────────────────────

const GUARDIAN_CONSENT_TEXT = 'I confirm that I am the legal guardian of this minor and accept full responsibility for managing their medical care, appointments, prescriptions, and health records through this platform. I understand that this access may be revoked when the dependent reaches the age of majority.';

function _calculateAge(dateOfBirth) {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Promote a patient account to guardian so it can manage dependents.
 *
 * The role was previously fixed at signup with no way out: anyone who chose
 * "For myself" and later needed to manage a child was told to contact the
 * clinic, and no such staff flow existed. This is that missing path.
 *
 * The caller keeps the same account, patient record and history — only the role
 * changes. Their current access token still says `patient`, so the client must
 * refresh it (POST /auth/refresh) before the dependent routes will admit them;
 * `requiresTokenRefresh` says so explicitly.
 */
async function becomeGuardian(userId, tenantSlug, consentAccepted) {
  if (consentAccepted !== true) {
    throw ApiError.badRequest('You must accept the guardian responsibility agreement');
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role === 'guardian') {
    return { role: 'guardian', alreadyGuardian: true, requiresTokenRefresh: false };
  }
  if (user.role !== 'patient') {
    throw ApiError.forbidden('Only patient accounts can be upgraded to a guardian account');
  }

  user.role = 'guardian';
  await user.save();

  // Keep the cross-tenant email index in step, or email-first login keeps
  // reporting the old role for this clinic.
  require('../auth/auth.service')
    .syncUserDirectory(user.email, tenantSlug, String(user._id), 'guardian')
    .catch(() => { /* directory sync is best-effort */ });

  require('../../utils/logger').info(
    'User %s upgraded to guardian in %s', user._id, tenantSlug,
  );

  return { role: 'guardian', alreadyGuardian: false, requiresTokenRefresh: true };
}

async function listDependents(guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependents = await Patient.find({ guardian: guardianUserId, deletedAt: null }).lean();

  return dependents.map((dep) => {
    const age = dep.dateOfBirth ? _calculateAge(dep.dateOfBirth) : null;
    return {
      ...dep,
      age,
      isMinor: age !== null ? age < 18 : null,
      canDetach: age !== null ? age >= 18 : false,
    };
  });
}

async function createDependent(data, guardianUserId, tenantSlug, ipAddress) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  // Age validation — dependent must be under 18
  const age = _calculateAge(data.dateOfBirth);
  if (age >= 18) {
    throw ApiError.badRequest('Dependent must be under 18 years old at the time of registration');
  }

  // Cap check — max 10 dependents per guardian
  const count = await Patient.countDocuments({ guardian: guardianUserId, deletedAt: null });
  if (count >= 10) {
    throw ApiError.badRequest('Maximum of 10 dependents allowed per guardian');
  }

  const patientData = {
    name: `${data.firstName} ${data.lastName}`.trim(),
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    phone: data.phone || 'N/A',
    bloodGroup: data.bloodGroup,
    guardian: guardianUserId,
    user: null,
  };

  if (data.allergies || data.medicalHistory) {
    patientData.medicalHistory = {};
    if (data.allergies) patientData.medicalHistory.allergies = data.allergies;
    if (data.medicalHistory) {
      if (data.medicalHistory.conditions) patientData.medicalHistory.conditions = data.medicalHistory.conditions;
      if (data.medicalHistory.medications) patientData.medicalHistory.medications = data.medicalHistory.medications;
    }
  }

  const patient = await Patient.create(patientData);

  // Create guardian consent record
  const GuardianConsent = conn.model('GuardianConsent');
  await GuardianConsent.create({
    guardian: guardianUserId,
    dependent: patient._id,
    consentType: 'guardianship',
    consentText: GUARDIAN_CONSENT_TEXT,
    acceptedAt: new Date(),
    // The field exists precisely to give this consent evidential weight; it was
    // declared on the schema but never written.
    ipAddress,
  });

  return patient.toJSON();
}

async function updateDependent(dependentId, data, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const patient = await Patient.findOne({ _id: dependentId, guardian: guardianUserId, deletedAt: null });
  if (!patient) throw ApiError.notFound('Dependent not found');

  // The under-18 rule belongs to *adding* a dependent, not to correcting one.
  // Rejecting an 18+ date of birth here created a deadlock: a dependent whose
  // date of birth was missing or mistyped could never have it fixed (this check
  // refused it) and could never be detached either (detachDependent requires a
  // date of birth and age >= 18) — leaving an adult permanently under a
  // guardian. Correcting the date simply makes them eligible to detach, which
  // is the outcome we want.

  // Build update
  const update = {};
  if (data.firstName || data.lastName) {
    const firstName = data.firstName || patient.name.split(' ')[0];
    const lastName = data.lastName || patient.name.split(' ').slice(1).join(' ');
    update.name = `${firstName} ${lastName}`.trim();
  }
  if (data.dateOfBirth !== undefined) update.dateOfBirth = data.dateOfBirth;
  if (data.gender !== undefined) update.gender = data.gender;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.bloodGroup !== undefined) update.bloodGroup = data.bloodGroup;

  if (data.allergies || data.medicalHistory) {
    const existing = patient.medicalHistory || {};
    update.medicalHistory = { ...existing };
    if (data.allergies) update.medicalHistory.allergies = data.allergies;
    if (data.medicalHistory) {
      if (data.medicalHistory.conditions) update.medicalHistory.conditions = data.medicalHistory.conditions;
      if (data.medicalHistory.medications) update.medicalHistory.medications = data.medicalHistory.medications;
    }
  }

  const updated = await Patient.findByIdAndUpdate(dependentId, update, { new: true, runValidators: true }).lean();
  return updated;
}

async function detachDependent(dependentId, detachData, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const User = conn.model('User');

  const patient = await Patient.findOne({ _id: dependentId, guardian: guardianUserId, deletedAt: null });
  if (!patient) throw ApiError.notFound('Dependent not found');

  // Validate dependent is >= 18
  if (!patient.dateOfBirth) {
    throw ApiError.badRequest('Cannot detach — dependent has no date of birth on record');
  }
  const age = _calculateAge(patient.dateOfBirth);
  if (age < 18) {
    throw ApiError.badRequest('Dependent must be at least 18 years old to be detached');
  }

  // Check email is not already taken
  const existingUser = await User.findOne({ email: detachData.email, deletedAt: null });
  if (existingUser) {
    throw ApiError.conflict('Email is already registered to another account');
  }

  // ── Create the new account FIRST ────────────────────────────────
  // This is the only step that realistically fails on user input (password
  // rules, an email claimed between the check above and here). Doing it before
  // the archive write and consent revocation means a failure leaves the
  // dependent exactly as they were, instead of stranding an archive row for a
  // dependent who is still attached.
  const Appointment = conn.model('Appointment');
  const Prescription = conn.model('Prescription');
  const GuardianConsent = conn.model('GuardianConsent');
  const DependentArchive = conn.model('DependentArchive');

  const newUser = await User.create({
    name: patient.name,
    email: detachData.email,
    phone: detachData.phone,
    password: detachData.password,
    role: 'patient',
  });

  try {

    const [appointments, prescriptions, consents] = await Promise.all([
      Appointment.find({ patient: patient._id, deletedAt: null })
        .populate('doctor', 'name')
        .lean(),
      Prescription.find({ patient: patient._id, deletedAt: null })
        .populate('doctor', 'name')
        .lean(),
      GuardianConsent.find({ guardian: guardianUserId, dependent: patient._id }).lean(),
    ]);

    await DependentArchive.create({
      guardian: guardianUserId,
      dependent: patient._id,
      detachedAt: new Date(),
      snapshotData: patient.toJSON(),
      appointments: appointments.map((a) => ({
        appointmentId: a._id,
        scheduledAt: a.scheduledAt,
        doctor: a.doctor?.name || 'Unknown',
        department: a.type || '',
        status: a.status,
        notes: a.reason || '',
      })),
      prescriptions: prescriptions.map((p) => ({
        prescriptionId: p._id,
        diagnosis: p.diagnosis || '',
        medications: (p.medications || []).map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration || '',
        })),
        prescribedAt: p.createdAt,
      })),
      consentHistory: consents.map((c) => ({
        consentType: c.consentType,
        acceptedAt: c.acceptedAt,
        revokedAt: c.revokedAt,
      })),
    });

    // Revoke all active guardian consents
    await GuardianConsent.updateMany(
      { guardian: guardianUserId, dependent: patient._id, revokedAt: null },
      { revokedAt: new Date(), revokedBy: guardianUserId },
    );

    // Transfer ownership: link Patient to new User, remove guardian
    patient.user = newUser._id;
    patient.email = detachData.email;
    patient.phone = detachData.phone;
    patient.guardian = null;
    await patient.save();
  } catch (err) {
    // Undo the account so a retry isn't blocked by "email already registered".
    await User.deleteOne({ _id: newUser._id }).catch(() => {});
    require('../../utils/logger').error(
      'detachDependent failed for %s — rolled back new user %s: %s',
      dependentId, newUser._id, err.message,
    );
    throw err;
  }

  return { patient: patient.toJSON(), message: 'Dependent is now an independent patient with their own login' };
}

// ── Guardian Archives & Consent Queries ──────────────────────────────

async function listDependentArchives(guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DependentArchive = conn.model('DependentArchive');

  const archives = await DependentArchive.find({ guardian: guardianUserId })
    .sort({ detachedAt: -1 })
    .lean();

  return archives.map((a) => ({
    _id: a._id,
    dependentName: a.snapshotData?.name || 'Unknown',
    dateOfBirth: a.snapshotData?.dateOfBirth,
    gender: a.snapshotData?.gender,
    detachedAt: a.detachedAt,
    appointmentCount: a.appointments?.length || 0,
    prescriptionCount: a.prescriptions?.length || 0,
  }));
}

async function getDependentArchive(archiveId, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DependentArchive = conn.model('DependentArchive');

  const archive = await DependentArchive.findOne({ _id: archiveId, guardian: guardianUserId }).lean();
  if (!archive) throw ApiError.notFound('Archive not found');

  return archive;
}

async function getDependentConsent(dependentId, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const GuardianConsent = conn.model('GuardianConsent');

  const consent = await GuardianConsent.findOne({
    guardian: guardianUserId,
    dependent: dependentId,
    revokedAt: null,
  }).lean();

  return consent;
}

// ── Patient Self-Check-in & Queue Position ──────────────────────────

// Check-in window defaults (overridden per-clinic by ClinicBookingPolicy)
const AVG_CONSULT_MINUTES = 15;

async function checkInAppointment(appointmentId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const QueueEntry  = conn.model('QueueEntry');
  const User        = conn.model('User');

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.patient) !== String(patient._id)) {
    throw ApiError.forbidden('Access denied to this patient record');
  }

  // Teleconsult appointments don't require physical check-in
  if (appointment.type === 'teleconsult') {
    throw ApiError.badRequest('Teleconsult appointments do not require physical check-in');
  }

  // Status guard: only from 'confirmed'
  if (appointment.status === 'checked_in') {
    // Idempotent: already checked in — return existing queue entry
    const existing = await QueueEntry.findOne({
      appointment: appointment._id,
      status: { $in: ['waiting', 'in_consultation'] },
    })
      .populate('doctor', 'name specialization')
      .lean();

    return { appointment, queueEntry: existing };
  }

  if (appointment.status !== 'confirmed') {
    throw ApiError.badRequest('Only confirmed appointments can be checked in');
  }

  // Time window guard — resolved from clinic policy
  const checkInPolicy = await resolveBookingPolicy(tenantSlug);
  const checkInBeforeMs = checkInPolicy.checkInWindowBeforeMin * 60 * 1000;
  const checkInAfterMs = checkInPolicy.checkInWindowAfterMin * 60 * 1000;

  const now = Date.now();
  const scheduled = new Date(appointment.scheduledAt).getTime();
  if (now < scheduled - checkInBeforeMs) {
    throw ApiError.badRequest(
      `Check-in is available starting ${checkInPolicy.checkInWindowBeforeMin} minutes before your appointment`,
    );
  }
  if (now > scheduled + checkInAfterMs) {
    throw ApiError.badRequest(
      `Check-in window has expired (${checkInPolicy.checkInWindowAfterMin} minutes after scheduled time)`,
    );
  }

  // Transition to CHECKED_IN
  appointment.status = 'checked_in';
  appointment.checkedInAt = new Date();
  await appointment.save();

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'update',
    resource: 'appointment',
    resourceId: appointment._id,
    description: `Checked in for appointment on ${new Date(appointment.scheduledAt).toLocaleDateString('en-IN')}`,
    metadata: { scheduledAt: appointment.scheduledAt, doctorId: String(appointment.doctor) },
  });

  // Auto-create QueueEntry
  const { addToQueue } = require('../queue/queue.service');
  const queueEntry = await addToQueue({
    patient: patient._id,
    doctor: appointment.doctor,
    appointment: appointment._id,
    branch: appointment.branch,
    department: appointment.department,
  }, tenantSlug, userId);

  // Load doctor name for notification/SMS
  const doctor = await User.findById(appointment.doctor).select('name').lean();
  const doctorName = doctor?.name || 'your doctor';

  // Notify doctor
  await notifyAndEmit({
    recipient: appointment.doctor,
    title: 'Patient Checked In',
    message: `${patient.name} has checked in for their appointment. Token #${queueEntry.tokenNumber}.`,
    type: 'appointment',
    metadata: { appointmentId: appointment._id, queueEntryId: queueEntry._id, tokenNumber: queueEntry.tokenNumber },
  }, tenantSlug);

  // SMS confirmation to patient (best-effort)
  try {
    const smsService = require('../../services/sms.service');
    if (patient.phone && patient.phone !== 'N/A') {
      await smsService.sendCheckInConfirmation({
        phone: patient.phone,
        patientName: patient.name,
        tokenNumber: queueEntry.tokenNumber,
        doctorName,
        tenantSlug,
      });
    }
  } catch { /* SMS failure should not break check-in */ }

  // Real-time broadcast to queue screens
  const { emitToTenant } = require('../../websocket');
  emitToTenant(tenantSlug, 'queue:update', {
    action: 'patient_checked_in',
    entryId: queueEntry._id,
    appointmentId: appointment._id,
    branch: appointment.branch,
  });

  // Calculate queue position
  const position = await _calculateQueuePosition(queueEntry, conn);

  return {
    appointment,
    queueEntry: {
      _id: queueEntry._id,
      tokenNumber: queueEntry.tokenNumber,
      status: queueEntry.status,
      position,
      estimatedWaitMinutes: position * AVG_CONSULT_MINUTES,
      doctorName,
    },
  };
}

async function getQueuePosition(appointmentId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  await _resolvePatientAccess(userId, patientId, conn);

  const QueueEntry = conn.model('QueueEntry');
  const entry = await QueueEntry.findOne({
    appointment: appointmentId,
    status: { $in: ['waiting', 'in_consultation'] },
  })
    .populate('doctor', 'name specialization')
    .populate('room', 'name code')
    .lean();

  if (!entry) return { inQueue: false };

  if (entry.status === 'in_consultation') {
    return {
      inQueue: true,
      status: 'in_consultation',
      position: 0,
      tokenNumber: entry.tokenNumber,
      estimatedWaitMinutes: 0,
      doctorName: entry.doctor?.name,
      room: entry.room?.code || entry.room?.name || null,
      calledAt: entry.calledAt,
    };
  }

  // Status is 'waiting' — calculate position
  const position = await _calculateQueuePosition(entry, conn);

  return {
    inQueue: true,
    status: 'waiting',
    position,
    tokenNumber: entry.tokenNumber,
    estimatedWaitMinutes: position * AVG_CONSULT_MINUTES,
    doctorName: entry.doctor?.name,
    room: null,
    calledAt: null,
  };
}

/**
 * Count how many queue entries are ahead of this one (same branch, today, waiting).
 */
async function _calculateQueuePosition(entry, conn) {
  const { QUEUE_STATUS, QUEUE_PRIORITY } = require('../../config/constants');
  const QueueEntry = conn.model('QueueEntry');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const PRIORITY_WEIGHT = {
    [QUEUE_PRIORITY.EMERGENCY]: 0,
    [QUEUE_PRIORITY.HIGH]:      1,
    [QUEUE_PRIORITY.NORMAL]:    2,
  };

  const waitingAhead = await QueueEntry.find({
    branch: entry.branch,
    status: QUEUE_STATUS.WAITING,
    createdAt: { $gte: today },
    _id: { $ne: entry._id },
  })
    .select('priority tokenNumber')
    .lean();

  const myWeight = PRIORITY_WEIGHT[entry.priority] ?? 2;
  let position = 1; // 1-based
  for (const other of waitingAhead) {
    const otherWeight = PRIORITY_WEIGHT[other.priority] ?? 2;
    if (otherWeight < myWeight || (otherWeight === myWeight && other.tokenNumber < entry.tokenNumber)) {
      position++;
    }
  }

  return position;
}

// ── Consultation Detail ─────────────────────────────────────────────

async function getConsultationDetail(appointmentId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Appointment = conn.model('Appointment');
  const TreatmentRecord = conn.model('TreatmentRecord');
  const Prescription = conn.model('Prescription');
  const PrescriptionTask = conn.model('PrescriptionTask');

  // Verify appointment belongs to this patient
  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patient._id })
    .populate('doctor', 'name specialization profilePhoto')
    .populate('branch', 'name address')
    .lean();
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // Fetch consultation record
  const consultation = await TreatmentRecord.findOne({ appointment: appointmentId })
    .populate('doctor', 'name specialization profilePhoto')
    .lean();

  if (!consultation) throw ApiError.notFound('Consultation record not found for this appointment');

  // Fetch linked prescription
  const prescription = await Prescription.findOne({ appointment: appointmentId })
    .lean();

  // Fetch care tasks with completion stats
  let careTasks = [];
  if (prescription) {
    careTasks = await PrescriptionTask.find({ prescription: prescription._id })
      .lean({ virtuals: true });
  }

  logAccess(conn, {
    patient: patient._id,
    accessedBy: userId,
    accessType: 'view',
    resource: 'consultation',
    resourceId: consultation._id,
    description: 'Viewed consultation details',
  });

  // Keep signature data — it's part of the patient's own medical record.
  // Add convenience `signed` flag for frontend backward compatibility.
  if (consultation.doctorSignature?.dataUrl) {
    consultation.doctorSignature.signed = true;
  }

  // Enrich with clinic branding from platform DB (for letterhead rendering)
  let clinic = null;
  try {
    const clinicDoc = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
      .select('name slug logo email phone address')
      .lean();
    if (clinicDoc) {
      clinic = {
        name: clinicDoc.name,
        logo: clinicDoc.logo,
        email: clinicDoc.email,
        phone: clinicDoc.phone,
        address: clinicDoc.address,
      };
    }
  } catch { /* clinic lookup is non-critical */ }

  return { appointment, consultation, prescription, careTasks, clinic, patient };
}

// ── Guardian Notification Preference ────────────────────────────────

async function updateDependentNotificationPrefs(dependentId, data, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const patient = await Patient.findOne({ _id: dependentId, guardian: guardianUserId, deletedAt: null });
  if (!patient) throw ApiError.notFound('Dependent not found');

  patient.guardianNotifications = { enabled: !!data.enabled };
  await patient.save();
  return { guardianNotifications: patient.guardianNotifications };
}

module.exports = {
  getPatientProfiles,
  getPatientProfile,
  updatePatientProfile,
  getPortalDashboard,
  listPatientAppointments,
  getAppointmentById,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  createEmergencyRequest,
  listPrescriptions,
  getMedicalHistory,
  listPayments,
  initiatePayment,
  verifyInvoicePayment,
  createShareToken,
  listShareTokens,
  revokeShareToken,
  viewSharedRecord,
  listConsents,
  approveConsent,
  revokePatientConsent,
  uploadInsuranceDoc,
  submitReview,
  listPatientReviews,
  getAccessLog,
  getPatientFinancialSummary,
  getPatientLedger,
  getPatientCreditNotes,
  downloadPatientInvoicePdf,
  listAvailableDepartments,
  listAvailableDoctors,
  getAvailableDoctor,
  confirmAttendance,
  verifyAppointmentPayment,
  becomeGuardian,
  listDependents,
  createDependent,
  updateDependent,
  detachDependent,
  listDependentArchives,
  getDependentArchive,
  getDependentConsent,
  checkInAppointment,
  getQueuePosition,
  getConsultationDetail,
  updateDependentNotificationPrefs,
};
