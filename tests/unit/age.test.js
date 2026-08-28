'use strict';

const { calculateAge, MINIMUM_SELF_REGISTRATION_AGE } = require('../../src/utils/age');

/** ISO date for a birthday exactly `years` ago, offset by `days` (negative = earlier). */
function birthdayYearsAgo(years, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

describe('calculateAge', () => {
  it('returns whole years for a past date', () => {
    expect(calculateAge(birthdayYearsAgo(30))).toBe(30);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    // Turns 18 tomorrow — still 17 today.
    expect(calculateAge(birthdayYearsAgo(18, 1))).toBe(17);
  });

  it('counts the birthday on the day it occurs', () => {
    expect(calculateAge(birthdayYearsAgo(18))).toBe(18);
  });

  it('returns NaN for an unparseable date', () => {
    expect(Number.isNaN(calculateAge('not-a-date'))).toBe(true);
  });

  it('returns a negative age for a future date', () => {
    expect(calculateAge(birthdayYearsAgo(-5))).toBeLessThan(0);
  });
});

describe('MINIMUM_SELF_REGISTRATION_AGE', () => {
  it('is 18, matching the dependent age cap in patientPortal.service', () => {
    expect(MINIMUM_SELF_REGISTRATION_AGE).toBe(18);
  });

  it('classifies a 17-year-old as too young and an 18-year-old as old enough', () => {
    expect(calculateAge(birthdayYearsAgo(17))).toBeLessThan(MINIMUM_SELF_REGISTRATION_AGE);
    expect(calculateAge(birthdayYearsAgo(18))).toBeGreaterThanOrEqual(MINIMUM_SELF_REGISTRATION_AGE);
  });
});
