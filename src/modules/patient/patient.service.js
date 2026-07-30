'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const { INVOICE_STATUS, PAYMENT_STATUS, VIDEO_SESSION_STATUS } = require('../../config/constants');
const { logAccess } = require('../../utils/logAccess');
const logger = require('../../utils/logger');

/** Check if user has full (non-OWN) permission */
function _hasFullAccess(user, permission) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

async function listPatients(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
      { patientId: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (query.gender) {
    filter.gender = query.gender;
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }

  // Self-scope: if user only has PATIENT_READ_OWN, restrict to their own record
  if (!_hasFullAccess(user, PERMISSIONS.PATIENT_READ)) {
    filter.user = user.userId;
  }

  const [items, total] = await Promise.all([
    Patient.find(filter).sort(sort).skip(skip).limit(limit).populate('primaryDoctor', 'name'),
    Patient.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPatientById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const patient = await Patient.findById(id)
    .populate('primaryDoctor', 'name email')
    .populate('guardian', 'name email');
  if (!patient) throw ApiError.notFound('Patient not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.PATIENT_READ)) {
    const isOwner = String(patient.user) === String(user.userId);
    const isGuardian = patient.guardian && String(patient.guardian._id || patient.guardian) === String(user.userId);
    const isPrimaryDoctor = patient.primaryDoctor && String(patient.primaryDoctor._id || patient.primaryDoctor) === String(user.userId);

    if (!isOwner && !isGuardian && !isPrimaryDoctor) {
      // Check if this doctor has any appointment with this patient
      if (user.role === 'doctor') {
        const Appointment = conn.model('Appointment');
        const hasRelation = await Appointment.exists({ doctor: user.userId, patient: id });
        if (!hasRelation) {
          throw ApiError.forbidden('You can only view records of patients you have treated');
        }
      } else {
        throw ApiError.forbidden('You can only view your own patient record');
      }
    }
  }

  logAccess(conn, {
    patient: patient._id,
    accessedBy: user.userId,
    accessType: 'view',
    resource: 'profile',
    resourceId: patient._id,
    description: `${user.role} viewed patient profile`,
  });

  return patient;
}

async function createPatient(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const patient = await Patient.create(data);

  logAccess(conn, {
    patient: patient._id,
    accessedBy: user.userId,
    accessType: 'create',
    resource: 'profile',
    resourceId: patient._id,
    description: `${user.role} created patient record`,
  });

  return patient;
}

async function updatePatient(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  // Self-scope check for UPDATE_OWN
  if (!_hasFullAccess(user, PERMISSIONS.PATIENT_UPDATE)) {
    const existing = await Patient.findById(id);
    if (!existing) throw ApiError.notFound('Patient not found');
    if (String(existing.user) !== String(user.userId)) {
      throw ApiError.forbidden('You can only update your own patient record');
    }
  }

  const patient = await Patient.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!patient) throw ApiError.notFound('Patient not found');

  logAccess(conn, {
    patient: patient._id,
    accessedBy: user.userId,
    accessType: 'update',
    resource: 'profile',
    resourceId: patient._id,
    description: `${user.role} updated patient profile`,
  });

  return patient;
}

async function deletePatient(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const now = new Date();
  const patient = await Patient.findByIdAndUpdate(
    id,
    { deletedAt: now },
    { new: true },
  );
  if (!patient) throw ApiError.notFound('Patient not found');

  // Cascade: soft-delete all non-terminal appointments for this patient
  const Appointment = conn.model('Appointment');
  await Appointment.updateMany(
    { patient: id, deletedAt: null, status: { $nin: ['completed', 'cancelled', 'no_show'] } },
    { deletedAt: now, status: 'cancelled' },
  );

  // Cascade: cancel DRAFT/SENT invoices
  try {
    const Invoice = conn.model('Invoice');
    await Invoice.updateMany(
      { patient: id, status: { $in: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SENT] }, deletedAt: null },
      { $set: { status: INVOICE_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.error('deletePatient: failed to cancel invoices for %s: %s', id, err.message);
  }

  // Cascade: fail PENDING payments
  try {
    const Payment = conn.model('Payment');
    await Payment.updateMany(
      { patient: id, status: PAYMENT_STATUS.PENDING, deletedAt: null },
      { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'patient_deleted' } } },
    );
  } catch (err) {
    logger.error('deletePatient: failed to cancel payments for %s: %s', id, err.message);
  }

  // Cascade: cancel active VideoSessions
  try {
    const VideoSession = conn.model('VideoSession');
    await VideoSession.updateMany(
      { patient: id, status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.SCHEDULED, VIDEO_SESSION_STATUS.WAITING] }, deletedAt: null },
      { $set: { status: VIDEO_SESSION_STATUS.CANCELLED } },
    );
  } catch (err) {
    logger.error('deletePatient: failed to cancel video sessions for %s: %s', id, err.message);
  }

  // Cascade: cancel waiting QueueEntries
  try {
    const QueueEntry = conn.model('QueueEntry');
    await QueueEntry.updateMany(
      { patient: id, status: 'waiting' },
      { $set: { status: 'cancelled' } },
    );
  } catch (err) {
    logger.error('deletePatient: failed to cancel queue entries for %s: %s', id, err.message);
  }

  // Cascade: deactivate PrescriptionTasks + cancel pending CareReminders
  try {
    const PrescriptionTask = conn.model('PrescriptionTask');
    const CareReminder = conn.model('CareReminder');

    await PrescriptionTask.updateMany(
      { patient: id, isActive: true },
      { $set: { isActive: false, deactivatedAt: now } },
    );

    const pendingReminders = await CareReminder.find({
      patient: id, status: { $in: ['pending', 'sent'] },
    }).select('_id').lean();

    if (pendingReminders.length > 0) {
      const { cancelPrescriptionReminders } = require('../../utils/careReminderScheduler');
      const ids = pendingReminders.map(r => r._id);
      await cancelPrescriptionReminders(ids);
      await CareReminder.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled' } });
    }
  } catch (err) {
    logger.error('deletePatient: failed to deactivate care tasks for %s: %s', id, err.message);
  }

  logAccess(conn, {
    patient: patient._id,
    accessedBy: user.userId,
    accessType: 'update',
    resource: 'profile',
    resourceId: patient._id,
    description: `${user.role} deleted patient record`,
  });

  return patient;
}

async function bulkCreatePatients(rows, user, tenantSlug) {
  const results = { totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [] };

  for (let i = 0; i < rows.length; i++) {
    try {
      const patient = await createPatient(rows[i], user, tenantSlug);
      results.successCount++;
      results.created.push(patient);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = { listPatients, getPatientById, createPatient, updatePatient, deletePatient, bulkCreatePatients };
