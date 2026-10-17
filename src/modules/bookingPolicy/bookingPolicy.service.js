'use strict';

/**
 * Clinic booking policy — ported to the repository seam (Phase 3).
 *
 * A singleton: one document per clinic, created the first time anyone saves.
 * That lifecycle is why the seam grew `upsertOne` — a find-then-create here
 * would race with itself on first use, and two concurrent saves would leave two
 * policy documents with no constraint to stop them.
 *
 * `getResolvedPolicy` is left alone. It delegates to `resolveBookingPolicy`,
 * which is shared with the appointment module and caches through Redis; moving
 * it would be a port of that utility rather than of this module.
 */

const { repo } = require('../../db/repository');
const { resolveBookingPolicy, SYSTEM_DEFAULTS } = require('../../utils/resolveBookingPolicy');

/**
 * The policy with system defaults filled in. Every field is non-null.
 */
async function getResolvedPolicy(tenantSlug) {
  return resolveBookingPolicy(tenantSlug);
}

/**
 * The stored document, nulls intact.
 *
 * The settings screen needs to tell "explicitly set to 30 minutes" apart from
 * "inheriting the default of 30 minutes", so this deliberately does not merge
 * the defaults in — it returns them alongside instead.
 */
async function getRawPolicy() {
  const doc = await repo('ClinicBookingPolicy').findOne({});
  return {
    policy: doc || {},
    systemDefaults: SYSTEM_DEFAULTS,
  };
}

async function updatePolicy(data, userId) {
  return repo('ClinicBookingPolicy').upsertOne({}, { ...data, updatedBy: userId });
}

module.exports = { getResolvedPolicy, getRawPolicy, updatePolicy };
