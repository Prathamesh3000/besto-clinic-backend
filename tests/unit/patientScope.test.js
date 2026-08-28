'use strict';

const {
  listAccessiblePatientIds,
  canActForPatient,
  resolveActingPatientId,
} = require('../../src/utils/patientScope');

const OWN = '000000000000000000000001';
const DEPENDENT = '000000000000000000000002';
const STRANGER = '000000000000000000000003';
const USER = 'aaaaaaaaaaaaaaaaaaaaaaaa';

/**
 * Minimal stand-in for a tenant connection. `rows` is the Patient collection;
 * the fake honours the two filter shapes the helpers actually build.
 */
function fakeConn(rows) {
  const matches = (row, filter) => {
    if (filter._id && String(row._id) !== String(filter._id)) return false;
    if (filter.$or) {
      const ok = filter.$or.some((c) =>
        (c.user && c.user === row.user) || (c.guardian && c.guardian === row.guardian));
      if (!ok) return false;
    }
    if (filter.user && row.user !== filter.user) return false;
    if ('deletedAt' in filter && row.deletedAt !== filter.deletedAt) return false;
    return true;
  };
  const chain = (result) => ({ select: () => ({ lean: async () => result }) });
  return {
    model: () => ({
      find: (filter) => chain(rows.filter((r) => matches(r, filter))),
      findOne: (filter) => chain(rows.find((r) => matches(r, filter)) || null),
    }),
  };
}

const ROWS = [
  { _id: OWN, user: USER, guardian: null, deletedAt: null },
  { _id: DEPENDENT, user: null, guardian: USER, deletedAt: null },
  { _id: STRANGER, user: 'someone-else', guardian: null, deletedAt: null },
];

describe('listAccessiblePatientIds', () => {
  it('includes the user\'s own record and their dependents', async () => {
    const ids = await listAccessiblePatientIds(USER, fakeConn(ROWS));
    expect(ids.sort()).toEqual([OWN, DEPENDENT].sort());
  });

  it('excludes patients belonging to someone else', async () => {
    const ids = await listAccessiblePatientIds(USER, fakeConn(ROWS));
    expect(ids).not.toContain(STRANGER);
  });

  it('returns an empty list for a user with no records', async () => {
    expect(await listAccessiblePatientIds('nobody', fakeConn(ROWS))).toEqual([]);
  });
});

describe('canActForPatient', () => {
  const ids = [OWN, DEPENDENT];

  it('accepts a plain id, an ObjectId-like value, and a populated doc', () => {
    expect(canActForPatient(ids, DEPENDENT)).toBe(true);
    expect(canActForPatient(ids, { toString: () => DEPENDENT })).toBe(true);
    expect(canActForPatient(ids, { _id: DEPENDENT, name: 'Child' })).toBe(true);
  });

  it('rejects an unrelated patient', () => {
    expect(canActForPatient(ids, STRANGER)).toBe(false);
  });

  it('rejects null/undefined rather than throwing', () => {
    expect(canActForPatient(ids, null)).toBe(false);
    expect(canActForPatient(ids, undefined)).toBe(false);
  });
});

describe('resolveActingPatientId', () => {
  it('defaults to the user\'s own record when none is requested', async () => {
    expect(await resolveActingPatientId(USER, fakeConn(ROWS), undefined)).toBe(OWN);
  });

  it('never silently falls back to a dependent', async () => {
    const onlyDependent = [{ _id: DEPENDENT, user: null, guardian: USER, deletedAt: null }];
    expect(await resolveActingPatientId(USER, fakeConn(onlyDependent), undefined)).toBeNull();
  });

  it('allows a guardian to act for their dependent', async () => {
    expect(await resolveActingPatientId(USER, fakeConn(ROWS), DEPENDENT)).toBe(DEPENDENT);
  });

  it('rejects acting for an unrelated patient', async () => {
    await expect(resolveActingPatientId(USER, fakeConn(ROWS), STRANGER))
      .rejects.toThrow(/Access denied/i);
  });
});
