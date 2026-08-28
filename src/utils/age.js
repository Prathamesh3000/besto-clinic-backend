'use strict';

/**
 * Age rules for self-managed accounts.
 *
 * Anyone below MINIMUM_SELF_REGISTRATION_AGE cannot hold their own login. They
 * are represented as a Patient record owned by a guardian (see
 * patientPortal.service.js createDependent/detachDependent), which is also what
 * Google Play's Families Policy expects of an app that is declared 18+.
 */
const MINIMUM_SELF_REGISTRATION_AGE = 18;

/**
 * Whole years elapsed since `dateOfBirth`, calendar-aware (not date-diff / 365).
 *
 * @param {Date|string} dateOfBirth
 * @returns {number} age in whole years, or NaN if the input is not a valid date
 */
function calculateAge(dateOfBirth) {
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return NaN;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

module.exports = { calculateAge, MINIMUM_SELF_REGISTRATION_AGE };
