'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { PRESCRIPTION_STATUS } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');

/** Check if user has full (non-OWN) permission */
function _hasFullAccess(user) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(PERMISSIONS.PRESCRIPTION_READ);
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

async function listPrescriptions(query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.patient) filter.patient = query.patient;
  if (query.doctor) filter.doctor = query.doctor;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { prescriptionId: { $regex: escaped, $options: 'i' } },
      { diagnosis: { $regex: escaped, $options: 'i' } },
    ];
  }

  // Self-scope: if user only has PRESCRIPTION_READ_OWN, restrict to their prescriptions
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      // No linked patient record — return empty
      return { items: [], total: 0, page: 1, limit };
    }
  }

  const [items, total] = await Promise.all([
    Prescription.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name specialization'),
    Prescription.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPrescriptionById(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');
  const prescription = await Prescription.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name');
  if (!prescription) throw ApiError.notFound('Prescription not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(prescription.patient._id || prescription.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own prescriptions');
    }
  }

  return prescription;
}

async function createPrescription(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');
  const Patient = conn.model('Patient');

  // Validate patient exists
  const patient = await Patient.findById(data.patient).lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  // Set doctor to the prescribing user if not provided
  if (!data.doctor) {
    data.doctor = userId;
  }

  const prescription = await Prescription.create({
    ...data,
    createdBy: userId,
  });

  // Notify patient of new prescription
  if (patient.user) {
    const User = conn.model('User');
    const doctor = await User.findById(data.doctor).select('name').lean();
    await notifyAndEmit({
      recipient: patient.user,
      title: 'New Prescription',
      message: `Dr. ${doctor?.name || 'Your doctor'} has issued a new prescription for you.`,
      type: 'appointment',
      metadata: { prescriptionId: prescription._id },
    }, tenantSlug);
  }

  return prescription;
}

async function updatePrescription(id, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');

  const prescription = await Prescription.findById(id);
  if (!prescription) throw ApiError.notFound('Prescription not found');

  // Only the prescribing doctor or users with full access can update
  if (!_hasFullAccess(user) && String(prescription.doctor) !== user.userId) {
    throw ApiError.forbidden('You can only update your own prescriptions');
  }

  // Prevent changing status directly — use cancel endpoint instead
  delete data.status;
  delete data.patient;
  delete data.doctor;

  Object.assign(prescription, data);
  await prescription.save();
  return prescription;
}

async function cancelPrescription(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');

  const prescription = await Prescription.findById(id);
  if (!prescription) throw ApiError.notFound('Prescription not found');

  if (prescription.status === PRESCRIPTION_STATUS.CANCELLED) {
    throw ApiError.badRequest('Prescription is already cancelled');
  }
  if (prescription.status === PRESCRIPTION_STATUS.COMPLETED) {
    throw ApiError.badRequest('Cannot cancel a completed prescription');
  }

  prescription.status = PRESCRIPTION_STATUS.CANCELLED;
  prescription.followUpRemindersEnabled = false;
  await prescription.save();

  // Cascade: deactivate care tasks and cancel pending reminders
  try {
    const PrescriptionTask = conn.model('PrescriptionTask');
    const CareReminder = conn.model('CareReminder');
    const { cancelPrescriptionReminders } = require('../../utils/careReminderScheduler');

    const pendingReminders = await CareReminder.find({
      prescription: id,
      status: { $in: ['pending', 'sent'] },
    }).select('_id').lean();

    if (pendingReminders.length > 0) {
      const reminderIds = pendingReminders.map(r => r._id);
      await cancelPrescriptionReminders(reminderIds);
      await CareReminder.updateMany(
        { _id: { $in: reminderIds } },
        { $set: { status: 'cancelled' } },
      );
    }

    await PrescriptionTask.updateMany(
      { prescription: id, isActive: true },
      { $set: { isActive: false, deactivatedAt: new Date() } },
    );
  } catch (cascadeErr) {
    const logger = require('../../utils/logger');
    logger.error('cancelPrescription: cascade cleanup failed for %s: %s', id, cascadeErr.message);
  }

  // Notify patient of cancellation
  const Patient = conn.model('Patient');
  const User = conn.model('User');
  const patient = await Patient.findById(prescription.patient).select('user name').lean();
  const doctor = await User.findById(prescription.doctor).select('name').lean();
  if (patient?.user) {
    await notifyAndEmit({
      recipient: patient.user,
      title: 'Prescription Cancelled',
      message: `A prescription from Dr. ${doctor?.name || 'your doctor'} has been cancelled.`,
      type: 'alert',
      metadata: { prescriptionId: prescription._id },
    }, tenantSlug);
  }

  return prescription;
}

module.exports = {
  listPrescriptions,
  getPrescriptionById,
  createPrescription,
  updatePrescription,
  cancelPrescription,
};
