'use strict';

/**
 * The 18+ registration gate.
 *
 * Under-18s cannot hold their own login — a guardian adds them as a dependent.
 * This is also what Google Play's Families Policy requires of an app declared
 * 18+, so a regression here is a compliance problem as well as a product one.
 *
 * Three HTTP entry points reach registration (/auth/register, /public/register,
 * /public/platform-register) and two of them bypass the Joi schema, which is
 * why the rule lives in the service. These tests exercise the service directly,
 * where the guarantee actually is.
 */

const { seedTestTenant } = require('../helpers/tenant');
const authService = require('../../src/modules/auth/auth.service');

/** ISO date for a birthday exactly `years` ago, shifted by `days`. */
function birthday(years, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const base = {
  name: 'Test User',
  email: 'age-gate@example.com',
  phone: '9999999999',
  password: 'password123',
  role: 'patient',
};

describe('registration age gate', () => {
  let slug;

  beforeEach(async () => {
    slug = await seedTestTenant();
  });

  it('rejects a 17-year-old and explains the guardian route', async () => {
    await expect(authService.register({ ...base, dateOfBirth: birthday(17) }, slug))
      .rejects.toThrow(/at least 18|parent or guardian/i);
  });

  it('rejects someone turning 18 tomorrow', async () => {
    // Guards the boundary: `18 years minus a day` must still be under age.
    await expect(authService.register({ ...base, dateOfBirth: birthday(18, 1) }, slug))
      .rejects.toThrow(/at least 18/i);
  });

  it('rejects a missing date of birth', async () => {
    await expect(authService.register({ ...base }, slug))
      .rejects.toThrow(/date of birth is required/i);
  });

  it('rejects a future date of birth', async () => {
    await expect(authService.register({ ...base, dateOfBirth: birthday(-5) }, slug))
      .rejects.toThrow(/cannot be in the future/i);
  });

  it('rejects an unparseable date of birth', async () => {
    await expect(authService.register({ ...base, dateOfBirth: 'not-a-date' }, slug))
      .rejects.toThrow(/not a valid date/i);
  });

  it('blocks before touching the database', async () => {
    // The check is the first statement in register(), so an under-age attempt
    // must not create a User. Anything else would leave junk behind on every
    // rejected signup.
    const { getTenantConnection } = require('../../src/db/tenantConnectionManager');

    await expect(authService.register({ ...base, dateOfBirth: birthday(10) }, slug))
      .rejects.toThrow();

    const conn = await getTenantConnection(slug);
    const count = await conn.model('User').countDocuments({ email: base.email });
    expect(count).toBe(0);
  });

  it('applies the same rule to platformRegister', async () => {
    // The public platform endpoint bypasses the Joi schema entirely, so the
    // service-level guard is the only thing standing there.
    await expect(
      authService.platformRegister({ ...base, dateOfBirth: birthday(15) }, 'irrelevant-clinic-id'),
    ).rejects.toThrow(/at least 18/i);
  });
});
