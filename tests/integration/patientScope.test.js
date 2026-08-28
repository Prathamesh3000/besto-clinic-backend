'use strict';

/**
 * Guardian-aware patient scoping, against a real database.
 *
 * Before this guard existed, dentalScan / emergency / telemedicine resolved the
 * acting patient with `Patient.findOne({ user: userId })`, which ignores the
 * guardian relationship — so a parent scanning a child's teeth filed the scan
 * against their *own* medical record. The unit tests cover the logic with fakes;
 * these exercise the real Mongo queries, including the `deletedAt` filter.
 */

const mongoose = require('mongoose');
const { seedTestTenant } = require('../helpers/tenant');
const { getTenantConnection } = require('../../src/db/tenantConnectionManager');
const {
  listAccessiblePatientIds,
  canActForPatient,
  resolveActingPatientId,
} = require('../../src/utils/patientScope');

const GUARDIAN_USER = new mongoose.Types.ObjectId();
const STRANGER_USER = new mongoose.Types.ObjectId();

describe('patientScope (real database)', () => {
  let conn;
  let own;
  let dependent;
  let stranger;
  let deletedDependent;

  beforeEach(async () => {
    const slug = await seedTestTenant();
    conn = await getTenantConnection(slug);
    const Patient = conn.model('Patient');

    // `phone` is required on the Patient schema; createDependent defaults it
    // to 'N/A' for dependents, so mirror that here.
    own = await Patient.create({ name: 'Guardian Themselves', phone: '9999999999', user: GUARDIAN_USER });
    dependent = await Patient.create({ name: 'Child One', phone: 'N/A', guardian: GUARDIAN_USER });
    stranger = await Patient.create({ name: 'Unrelated Patient', phone: '8888888888', user: STRANGER_USER });
    deletedDependent = await Patient.create({
      name: 'Removed Child',
      phone: 'N/A',
      guardian: GUARDIAN_USER,
      deletedAt: new Date(),
    });
  });

  describe('listAccessiblePatientIds', () => {
    it('returns the guardian\'s own record and their dependents', async () => {
      const ids = await listAccessiblePatientIds(GUARDIAN_USER, conn);
      expect(ids.sort()).toEqual([String(own._id), String(dependent._id)].sort());
    });

    it('excludes soft-deleted dependents', async () => {
      const ids = await listAccessiblePatientIds(GUARDIAN_USER, conn);
      expect(ids).not.toContain(String(deletedDependent._id));
    });

    it('excludes patients belonging to someone else', async () => {
      const ids = await listAccessiblePatientIds(GUARDIAN_USER, conn);
      expect(ids).not.toContain(String(stranger._id));
    });

    it('returns nothing for a user with no records', async () => {
      const ids = await listAccessiblePatientIds(new mongoose.Types.ObjectId(), conn);
      expect(ids).toEqual([]);
    });
  });

  describe('resolveActingPatientId', () => {
    it('defaults to the caller\'s own record, never a dependent', async () => {
      const id = await resolveActingPatientId(GUARDIAN_USER, conn, undefined);
      expect(id).toBe(String(own._id));
    });

    it('allows a guardian to act for their dependent', async () => {
      const id = await resolveActingPatientId(GUARDIAN_USER, conn, dependent._id);
      expect(id).toBe(String(dependent._id));
    });

    it('refuses to act for an unrelated patient', async () => {
      // This is the guard that stops one patient filing records against another.
      await expect(resolveActingPatientId(GUARDIAN_USER, conn, stranger._id))
        .rejects.toThrow(/access denied/i);
    });

    it('refuses to act for a soft-deleted dependent', async () => {
      await expect(resolveActingPatientId(GUARDIAN_USER, conn, deletedDependent._id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('canActForPatient', () => {
    it('accepts a populated document as well as a bare id', async () => {
      const ids = await listAccessiblePatientIds(GUARDIAN_USER, conn);
      expect(canActForPatient(ids, dependent._id)).toBe(true);
      expect(canActForPatient(ids, { _id: dependent._id, name: 'Child One' })).toBe(true);
      expect(canActForPatient(ids, stranger._id)).toBe(false);
      expect(canActForPatient(ids, null)).toBe(false);
    });
  });
});
