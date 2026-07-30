'use strict';

/**
 * Booking policy resolution utility.
 *
 * Three-tier chain:
 *   DoctorSchedule (per-doctor)  →  ClinicBookingPolicy (per-clinic)  →  SYSTEM_DEFAULTS
 *
 * DoctorSchedule can override: slotDuration, bufferMinutes, minNoticeMinutes, maxAdvanceDays.
 * All other policy fields are clinic-wide only.
 */

const { getTenantConnection } = require('../db/tenantConnectionManager');

/** Hard-coded system defaults — the ultimate fallback. */
const SYSTEM_DEFAULTS = Object.freeze({
  slotDuration: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 60,
  maxAdvanceDays: 60,
  cancellationCutoffMin: null,
  rescheduleCutoffMin: null,
  maxReschedulesPerAppt: null,
  noShowBlockThreshold: null,
  checkInWindowBeforeMin: 60,
  checkInWindowAfterMin: 30,
  autoConfirm: true,
  appointmentTypeDurations: null,
  defaultReminderTimings: [1440, 60, 15],
});

/** Fields on DoctorSchedule that can override clinic-level policy. */
const DOCTOR_OVERRIDABLE = new Set([
  'slotDuration',
  'bufferMinutes',
  'minNoticeMinutes',
  'maxAdvanceDays',
]);

/**
 * Pick a non-null value from the resolution chain.
 * @param  {...*} values - Values in priority order (highest first).
 * @returns {*} The first non-null/non-undefined value, or the last argument.
 */
function _pick(...values) {
  for (const v of values) {
    if (v != null) return v;
  }
  return values[values.length - 1];
}

/**
 * Load the singleton ClinicBookingPolicy document for a tenant.
 * Returns null if none exists (tenant hasn't configured any policy).
 *
 * @param {string} tenantSlug
 * @returns {Promise<Object|null>}
 */
async function _loadClinicPolicy(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicBookingPolicy = conn.model('ClinicBookingPolicy');
  return ClinicBookingPolicy.findOne({}).lean();
}

/**
 * Resolve the effective booking policy by merging three layers.
 *
 * @param {string}      tenantSlug      - Tenant identifier.
 * @param {Object|null} doctorSchedule  - DoctorSchedule document (lean or Mongoose doc).
 *                                        Pass null when you only need clinic-level policy.
 * @returns {Promise<Object>} Fully resolved policy — every field is non-null.
 */
async function resolveBookingPolicy(tenantSlug, doctorSchedule = null) {
  const clinicPolicy = await _loadClinicPolicy(tenantSlug);

  const resolved = {};

  for (const [key, systemDefault] of Object.entries(SYSTEM_DEFAULTS)) {
    const clinicValue = clinicPolicy ? clinicPolicy[key] : null;

    if (DOCTOR_OVERRIDABLE.has(key) && doctorSchedule) {
      // Doctor-level override → clinic → system
      resolved[key] = _pick(doctorSchedule[key], clinicValue, systemDefault);
    } else {
      // Clinic-only fields → clinic → system
      resolved[key] = _pick(clinicValue, systemDefault);
    }
  }

  // Convert Map to plain object for appointmentTypeDurations
  if (resolved.appointmentTypeDurations instanceof Map) {
    resolved.appointmentTypeDurations = Object.fromEntries(resolved.appointmentTypeDurations);
  }

  return resolved;
}

module.exports = { resolveBookingPolicy, SYSTEM_DEFAULTS };
