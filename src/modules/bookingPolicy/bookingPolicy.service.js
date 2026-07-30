'use strict';

const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { resolveBookingPolicy, SYSTEM_DEFAULTS } = require('../../utils/resolveBookingPolicy');

/**
 * Get the resolved (merged) booking policy for a clinic.
 * All fields are guaranteed non-null (system defaults fill gaps).
 */
async function getResolvedPolicy(tenantSlug) {
  return resolveBookingPolicy(tenantSlug);
}

/**
 * Get the raw ClinicBookingPolicy document.
 * Null fields are preserved — useful for the settings UI to distinguish
 * "explicitly set" from "using default".
 */
async function getRawPolicy(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicBookingPolicy = conn.model('ClinicBookingPolicy');
  const doc = await ClinicBookingPolicy.findOne({}).lean();

  // Return structured response with the raw values + system defaults for reference
  return {
    policy: doc || {},
    systemDefaults: SYSTEM_DEFAULTS,
  };
}

/**
 * Upsert the clinic booking policy.
 * Creates the singleton doc if it doesn't exist, updates if it does.
 */
async function updatePolicy(data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicBookingPolicy = conn.model('ClinicBookingPolicy');

  const update = { ...data, updatedBy: userId };

  const policy = await ClinicBookingPolicy.findOneAndUpdate(
    {},
    { $set: update },
    { new: true, upsert: true, runValidators: true },
  );

  return policy;
}

module.exports = { getResolvedPolicy, getRawPolicy, updatePolicy };
