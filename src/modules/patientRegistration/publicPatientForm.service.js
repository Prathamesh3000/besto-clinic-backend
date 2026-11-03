'use strict';

const Clinic = require('../../models/platform/Clinic');
const ApiError = require('../../utils/ApiError');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { verifyAccessToken } = require('../../utils/tokenHelper');
const { getRedis } = require('../../config/redis');
const { ROLES } = require('../../config/constants');
const formService = require('../patientForm/patientForm.service');
const logic = require('../patientForm/patientForm.logic');
const registrationService = require('./patientRegistration.service');

/** One generic message for every "no" so callers cannot tell which check failed. */
const notAvailable = () => ApiError.notFound('This registration form is not available');

/**
 * Resolve clinic code + QR token -> { clinic, config }.
 * Bad code, missing config, disabled QR and wrong token all throw the same 404.
 */
async function resolveForm(clinicCode, token) {
  const code = typeof clinicCode === 'string' ? clinicCode.toUpperCase().trim() : '';
  if (!code || code.length > 32) throw notAvailable();

  const clinic = await Clinic.findOne({ clinicCode: code, status: 'active', deletedAt: null })
    .select('slug name logo clinicCode')
    .lean();
  if (!clinic) throw notAvailable();

  const config = await formService.findConfigDoc(clinic.slug);
  if (!config || !config.qr || !config.qr.enabled || !logic.tokensMatch(config.qr.token, token)) {
    throw notAvailable();
  }
  return { clinic, config: config.toObject() };
}

async function getPublicForm(clinicCode, token) {
  const { clinic, config } = await resolveForm(clinicCode, token);
  return {
    clinic: {
      name: clinic.name,
      ...(clinic.logo ? { logoUrl: clinic.logo } : {}),
      clinicCode: clinic.clinicCode,
    },
    form: {
      title: config.title,
      consentText: config.consentText,
      version: config.version,
      fields: formService.toConfigDTO(config, { includeToken: false }).fields.filter((f) => f.enabled),
    },
  };
}

/**
 * Optional Bearer token: returns the user id only for a valid, non-revoked access
 * token of a patient-role user of THIS clinic who exists in its tenant DB.
 * Anything else (missing/invalid/other clinic/staff) => null (guest). Never throws.
 */
async function resolveLinkedUser(authHeader, clinicSlug) {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const decoded = verifyAccessToken(authHeader.split(' ')[1]);
    if (decoded.role !== ROLES.PATIENT || decoded.tenantSlug !== clinicSlug || !decoded.userId) return null;

    const revoked = await getRedis().get(`auth:blacklist:${decoded.jti}`);
    if (revoked) return null;

    const conn = await getTenantConnection(clinicSlug);
    const user = await conn.model('User')
      .findOne({ _id: decoded.userId, role: ROLES.PATIENT, isActive: true })
      .select('_id')
      .lean();
    return user ? String(user._id) : null;
  } catch (_err) {
    return null;
  }
}

async function submitPublicForm(clinicCode, token, body, req) {
  const { clinic, config } = await resolveForm(clinicCode, token);
  const linkedUserId = await resolveLinkedUser(req.headers.authorization, clinic.slug);

  return registrationService.submitRegistration({
    tenantSlug: clinic.slug,
    config,
    body,
    source: 'qr',
    linkedUserId,
    ip: req.ip,
  });
}

module.exports = { getPublicForm, submitPublicForm, resolveLinkedUser };
