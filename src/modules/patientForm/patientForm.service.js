'use strict';

const ApiError = require('../../utils/ApiError');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const logic = require('./patientForm.logic');

const SINGLETON = { singleton: 'default' };

/** Plain-object view of a config doc. The QR token is only shown to users who can edit the form. */
function toConfigDTO(doc, { includeToken }) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    version: o.version,
    title: o.title,
    consentText: o.consentText,
    fields: (o.fields || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        builtIn: !!f.builtIn,
        locked: !!f.locked,
        enabled: !!f.enabled,
        required: !!f.required,
        order: f.order,
        ...(f.options && f.options.length ? { options: f.options.map((p) => ({ value: p.value, label: p.label })) } : {}),
      })),
    qr: {
      enabled: !!(o.qr && o.qr.enabled),
      ...(includeToken ? { token: o.qr && o.qr.token } : {}),
      ...(o.qr && o.qr.regeneratedAt ? { regeneratedAt: o.qr.regeneratedAt } : {}),
    },
  };
}

function canSeeToken(user) {
  return (ROLE_PERMISSIONS[user && user.role] || []).includes(PERMISSIONS.CLINIC_UPDATE);
}

/** Load the config, creating the defaults (atomically) on first use. */
async function getOrCreateConfigDoc(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Model = conn.model('PatientFormConfig');

  const existing = await Model.findOne(SINGLETON);
  if (existing) return existing;

  const defaults = { ...logic.buildDefaultConfig(), qr: { enabled: true, token: logic.generateQrToken() } };
  try {
    return await Model.findOneAndUpdate(
      SINGLETON,
      { $setOnInsert: defaults },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (err && err.code === 11000) return Model.findOne(SINGLETON); // lost the race
    throw err;
  }
}

/** Read-only lookup — never creates (used by the unauthenticated endpoints). */
async function findConfigDoc(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  return conn.model('PatientFormConfig').findOne(SINGLETON);
}

async function getConfig(tenantSlug, user) {
  const doc = await getOrCreateConfigDoc(tenantSlug);
  return toConfigDTO(doc, { includeToken: canSeeToken(user) });
}

async function updateConfig(body, user, tenantSlug) {
  const { errors, value } = logic.validateConfigInput(body);
  if (errors.length) throw ApiError.badRequest(errors[0].message, errors);

  await getOrCreateConfigDoc(tenantSlug);
  const conn = await getTenantConnection(tenantSlug);
  const doc = await conn.model('PatientFormConfig').findOneAndUpdate(
    SINGLETON,
    {
      $set: { title: value.title, consentText: value.consentText, fields: value.fields, updatedBy: user.userId },
      $inc: { version: 1 },
    },
    { new: true },
  );
  return toConfigDTO(doc, { includeToken: true });
}

async function regenerateQr(user, tenantSlug) {
  await getOrCreateConfigDoc(tenantSlug);
  const conn = await getTenantConnection(tenantSlug);
  const doc = await conn.model('PatientFormConfig').findOneAndUpdate(
    SINGLETON,
    { $set: { 'qr.token': logic.generateQrToken(), 'qr.regeneratedAt': new Date(), updatedBy: user.userId } },
    { new: true },
  );
  return toConfigDTO(doc, { includeToken: true });
}

async function toggleQr(enabled, user, tenantSlug) {
  await getOrCreateConfigDoc(tenantSlug);
  const conn = await getTenantConnection(tenantSlug);
  const doc = await conn.model('PatientFormConfig').findOneAndUpdate(
    SINGLETON,
    { $set: { 'qr.enabled': !!enabled, updatedBy: user.userId } },
    { new: true },
  );
  return toConfigDTO(doc, { includeToken: true });
}

module.exports = { getConfig, updateConfig, regenerateQr, toggleQr, getOrCreateConfigDoc, findConfigDoc, toConfigDTO };
