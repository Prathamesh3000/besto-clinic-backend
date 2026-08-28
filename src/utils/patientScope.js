'use strict';

const ApiError = require('./ApiError');

/**
 * Which Patient records a portal user may act on.
 *
 * A guardian owns their own Patient record *and* one per dependent (see
 * patientPortal.service.js createDependent). Resolving with
 * `Patient.findOne({ user: userId })` therefore silently drops every dependent —
 * which is why scans, emergencies and video sessions raised for a child used to
 * be filed against the parent instead.
 *
 * patientPortal.service.js does this correctly via `_resolvePatientAccess`;
 * these helpers exist so the other modules can behave the same way.
 */

/** Mongo filter matching every Patient this user may act for. */
function accessibleFilter(userId) {
  return { $or: [{ user: userId }, { guardian: userId }], deletedAt: null };
}

/**
 * Every patient id this user may act for — their own record plus dependents.
 * @returns {Promise<string[]>} ids as strings, for easy comparison
 */
async function listAccessiblePatientIds(userId, conn) {
  const Patient = conn.model('Patient');
  const patients = await Patient.find(accessibleFilter(userId)).select('_id').lean();
  return patients.map((p) => String(p._id));
}

/**
 * True when `patientId` belongs to this user or one of their dependents.
 * Accepts the id list so callers can fetch once and check many records.
 */
function canActForPatient(accessibleIds, patientId) {
  if (!patientId) return false;
  // patientId may be a populated doc, an ObjectId, or a string.
  const id = String(patientId._id || patientId);
  return accessibleIds.includes(id);
}

/**
 * Resolve the patient a request is acting as.
 *
 * With no `requestedPatientId` this returns the user's OWN record — identical to
 * the previous behaviour, so existing callers are unaffected. When one is given
 * it must be the user's own record or a dependent, else 403.
 *
 * @returns {Promise<string|null>} patient id, or null when the user has no record
 */
async function resolveActingPatientId(userId, conn, requestedPatientId) {
  const Patient = conn.model('Patient');

  if (!requestedPatientId) {
    const own = await Patient.findOne({ user: userId, deletedAt: null }).select('_id').lean();
    return own ? String(own._id) : null;
  }

  const target = await Patient.findOne({
    _id: requestedPatientId,
    ...accessibleFilter(userId),
  }).select('_id').lean();

  if (!target) throw ApiError.forbidden('Access denied to this patient record');
  return String(target._id);
}

module.exports = { listAccessiblePatientIds, canActForPatient, resolveActingPatientId };
