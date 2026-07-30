/**
 * Doctor name formatting utilities.
 *
 * Database stores names that may or may not include "Dr." prefix.
 * UI always prepends "Dr." — these helpers prevent "Dr. Dr. Name".
 */

/** Strip "Dr." prefix if already present. */
export function stripDrPrefix(name) {
  return (name || '').replace(/^Dr\.?\s*/i, '').trim() || name;
}

/** Return "Dr. Name" with dedup protection. Falls back to `fallback`. */
export function formatDoctorName(name, fallback = 'Doctor') {
  const stripped = stripDrPrefix(name);
  return stripped ? `Dr. ${stripped}` : fallback;
}
