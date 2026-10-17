'use strict';

/**
 * Consents — ported to the repository seam.
 *
 * The self-scoping rules stay here, unchanged. Deciding whether a caller may see
 * a consent is an authorisation question about the *user*, and the repository
 * deliberately knows nothing about users — pushing this behind the seam would
 * scatter a security rule into a layer that cannot reason about it.
 *
 * One behaviour improved rather than merely moved, and it is worth being
 * explicit about because it is a change:
 *
 * `revokeConsent` used to load the document, check its status in JavaScript, set
 * two fields and save. Between the read and the save another request could
 * revoke the same consent, and both would succeed — the second overwriting the
 * first's `revokedAt`. The port makes the status check part of the write
 * (`status: { $ne: 'revoked' }`), so the second request now finds nothing to
 * update. The preceding read is kept only to tell "not found" from "already
 * revoked" from "not yours", which callers rely on for the status code.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');

const WITH_REFS = [
  { path: 'patient', select: ['name'] },
  { path: 'grantedTo', select: ['name'] },
];

// ── Helpers ─────────────────────────────────────────────────────────

function _hasFullAccess(user) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(PERMISSIONS.CONSENT_READ);
}

/**
 * Resolve the Patient._id linked to this user (for self-scope filtering).
 * Returns null if no linked patient record exists.
 */
async function _getLinkedPatientId(userId) {
  // No `select` — the seam's option only opts *into* hidden columns
  // (`'+password'`), it does not narrow the projection. Asking for one field
  // and being handed all of them is harmless here; implying otherwise is not.
  const patient = await repo('Patient').findOne({ user: userId });
  return patient ? patient._id : null;
}

// ── Service methods ─────────────────────────────────────────────────

async function listConsents(query, _tenantSlug, user) {
  const consents = repo('Consent');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.patient) filter.patient = query.patient;
  if (query.consentType) filter.consentType = query.consentType;
  if (query.status) filter.status = query.status;

  // Self-scope: if user only has CONSENT_READ_OWN, restrict to their consents
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId);
    if (patientId) {
      filter.patient = patientId;
    } else {
      // No linked patient record — return empty
      return { items: [], total: 0, page: 1, limit };
    }
  }

  const { items, total } = await consents.find(filter, {
    sort, skip, limit, populate: WITH_REFS,
  });

  return { items, total, page, limit };
}

async function getConsentById(id, _tenantSlug, user) {
  const consent = await repo('Consent').findById(id, { populate: WITH_REFS });
  if (!consent) throw ApiError.notFound('Consent not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId);
    if (!patientId || String(consent.patient?._id || consent.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own consents');
    }
  }

  return consent;
}

async function createConsent(data, _tenantSlug, userId, ipAddress) {
  // Validate patient exists
  const patient = await repo('Patient').findById(data.patient);
  if (!patient) throw ApiError.notFound('Patient not found');

  return repo('Consent').create({
    ...data,
    createdBy: userId,
    ipAddress,
    grantedAt: new Date(),
  });
}

async function updateConsent(id, data, _tenantSlug, user) {
  const consents = repo('Consent');

  // Prevent changing critical fields
  const patch = { ...data };
  delete patch.patient;
  delete patch.status;
  delete patch.grantedAt;
  delete patch.revokedAt;

  // Ownership check: users without full CONSENT_UPDATE permission
  // (e.g. patients) may only update their own consents.
  const userPerms = ROLE_PERMISSIONS[user.role] || [];
  if (!userPerms.includes(PERMISSIONS.CONSENT_UPDATE)) {
    const patientId = await _getLinkedPatientId(user.userId);
    const existing = await consents.findById(id);
    if (!existing) throw ApiError.notFound('Consent not found');
    if (!patientId || String(existing.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only update your own consents');
    }
  }

  // Atomic update: only update if status is not 'revoked'
  const consent = await consents.updateOne({ _id: id, status: { $ne: 'revoked' } }, patch);
  if (!consent) {
    throw ApiError.notFound('Consent not found or is revoked');
  }

  return consent;
}

async function revokeConsent(id, _tenantSlug, user) {
  const consents = repo('Consent');

  // Read first, only to distinguish the three failure cases from each other —
  // the write below is what actually enforces "not already revoked".
  const existing = await consents.findById(id);
  if (!existing) throw ApiError.notFound('Consent not found');
  if (existing.status === 'revoked') {
    throw ApiError.badRequest('Consent is already revoked');
  }

  // Self-scope check: patients can only revoke their own consents
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId);
    if (!patientId || String(existing.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only revoke your own consents');
    }
  }

  const consent = await consents.updateOne(
    { _id: id, status: { $ne: 'revoked' } },
    { status: 'revoked', revokedAt: new Date() },
  );
  // Null means another request revoked it between the read above and this
  // write. That is the race the atomic filter exists to close.
  if (!consent) throw ApiError.badRequest('Consent is already revoked');

  return consent;
}

module.exports = {
  listConsents,
  getConsentById,
  createConsent,
  updateConsent,
  revokeConsent,
};
