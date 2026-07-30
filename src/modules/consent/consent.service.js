'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');

// ── Helpers ─────────────────────────────────────────────────────────

function _hasFullAccess(user) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(PERMISSIONS.CONSENT_READ);
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

// ── Service methods ─────────────────────────────────────────────────

async function listConsents(query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Consent = conn.model('Consent');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.patient) filter.patient = query.patient;
  if (query.consentType) filter.consentType = query.consentType;
  if (query.status) filter.status = query.status;

  // Self-scope: if user only has CONSENT_READ_OWN, restrict to their consents
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
    Consent.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name')
      .populate('grantedTo', 'name'),
    Consent.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getConsentById(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Consent = conn.model('Consent');
  const consent = await Consent.findById(id)
    .populate('patient', 'name')
    .populate('grantedTo', 'name');
  if (!consent) throw ApiError.notFound('Consent not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(consent.patient._id || consent.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own consents');
    }
  }

  return consent;
}

async function createConsent(data, tenantSlug, userId, ipAddress) {
  const conn = await getTenantConnection(tenantSlug);

  // Validate patient exists
  const Patient = conn.model('Patient');
  const patient = await Patient.findById(data.patient);
  if (!patient) throw ApiError.notFound('Patient not found');

  data.createdBy = userId;
  data.ipAddress = ipAddress;
  data.grantedAt = new Date();

  const Consent = conn.model('Consent');
  return Consent.create(data);
}

async function updateConsent(id, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Consent = conn.model('Consent');

  // Prevent changing critical fields
  delete data.patient;
  delete data.status;
  delete data.grantedAt;
  delete data.revokedAt;

  // Ownership check: users without full CONSENT_UPDATE permission
  // (e.g. patients) may only update their own consents.
  const userPerms = ROLE_PERMISSIONS[user.role] || [];
  if (!userPerms.includes(PERMISSIONS.CONSENT_UPDATE)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    const existing = await Consent.findById(id).select('patient').lean();
    if (!existing) throw ApiError.notFound('Consent not found');
    if (!patientId || String(existing.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only update your own consents');
    }
  }

  // Atomic update: only update if status is not 'revoked'
  const consent = await Consent.findOneAndUpdate(
    { _id: id, status: { $ne: 'revoked' } },
    data,
    { new: true, runValidators: true },
  );
  if (!consent) {
    throw ApiError.notFound('Consent not found or is revoked');
  }

  return consent;
}

async function revokeConsent(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const Consent = conn.model('Consent');

  const consent = await Consent.findById(id);
  if (!consent) throw ApiError.notFound('Consent not found');
  if (consent.status === 'revoked') {
    throw ApiError.badRequest('Consent is already revoked');
  }

  // Self-scope check: patients can only revoke their own consents
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(consent.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only revoke your own consents');
    }
  }

  consent.status = 'revoked';
  consent.revokedAt = new Date();
  await consent.save();
  return consent;
}

module.exports = {
  listConsents,
  getConsentById,
  createConsent,
  updateConsent,
  revokeConsent,
};
