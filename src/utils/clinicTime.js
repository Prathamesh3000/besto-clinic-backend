'use strict';

/**
 * Clinic-local date boundaries.
 *
 * The API may run on a UTC host (Docker/Render default), so a naive
 * `new Date().setHours(0,0,0,0)` starts the day at 05:30 IST — pushing the
 * first 5.5 hours of every day, and of every month, into the wrong bucket.
 * Anything that answers "today" or "this month" for a clinic should use these.
 */

const CLINIC_TZ = 'Asia/Kolkata';
const CLINIC_TZ_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Y/M/D/weekday of an instant as seen on a clinic wall clock. */
function clinicParts(date = new Date()) {
  const shifted = new Date(date.getTime() + CLINIC_TZ_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * A clinic wall-clock time as a real UTC instant, for use in queries.
 * Out-of-range values roll over as Date.UTC does, so `(y, m + 1, 0)` is the
 * last day of month `m`.
 */
function clinicInstant(year, month, day, h = 0, m = 0, s = 0, ms = 0) {
  return new Date(Date.UTC(year, month, day, h, m, s, ms) - CLINIC_TZ_OFFSET_MS);
}

/** Start and end of the clinic-local month containing `date`. */
function clinicMonthRange(date = new Date()) {
  const { year, month } = clinicParts(date);
  return {
    start: clinicInstant(year, month, 1),
    end: clinicInstant(year, month + 1, 0, 23, 59, 59, 999),
  };
}

/** Start and end of the clinic-local day containing `date`. */
function clinicDayRange(date = new Date()) {
  const { year, month, day } = clinicParts(date);
  return {
    start: clinicInstant(year, month, day),
    end: clinicInstant(year, month, day, 23, 59, 59, 999),
  };
}

module.exports = {
  CLINIC_TZ,
  CLINIC_TZ_OFFSET_MS,
  clinicParts,
  clinicInstant,
  clinicMonthRange,
  clinicDayRange,
};
