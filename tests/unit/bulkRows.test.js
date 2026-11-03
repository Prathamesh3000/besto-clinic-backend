'use strict';

const { bulkRowsSchema, validateBulkRow } = require('../../src/utils/bulkRows');
const { createBranchSchema, bulkCreateBranchSchema } = require('../../src/modules/branch/branch.validator');
const { bulkDepartmentRowSchema, bulkCreateDepartmentSchema } = require('../../src/modules/department/department.validator');
const { bulkDoctorRowSchema, bulkCreateDoctorSchema } = require('../../src/modules/doctor/doctor.validator');
const { bulkStaffRowSchema, bulkCreateStaffSchema } = require('../../src/modules/staff/staff.validator');
const { bulkItemRowSchema, bulkCreateItemsSchema } = require('../../src/modules/inventory/inventory.validator');
const { createPatientSchema, bulkCreatePatientSchema } = require('../../src/modules/patient/patient.validator');

describe('bulk route schema (payload shape only)', () => {
  const routeSchemas = {
    branch: bulkCreateBranchSchema,
    department: bulkCreateDepartmentSchema,
    doctor: bulkCreateDoctorSchema,
    staff: bulkCreateStaffSchema,
    inventory: bulkCreateItemsSchema,
    patient: bulkCreatePatientSchema,
  };

  test.each(Object.entries(routeSchemas))('%s: one bad row no longer rejects the batch', (_name, schema) => {
    const { error } = schema.validate({ rows: [{ name: 'ok' }, { phone: '1', email: 'nope' }, {}] });
    expect(error).toBeUndefined();
  });

  test.each(Object.entries(routeSchemas))('%s: still rejects empty, oversized and malformed payloads', (_name, schema) => {
    expect(schema.validate({ rows: [] }).error).toBeDefined();
    expect(schema.validate({ rows: Array.from({ length: 501 }, () => ({})) }).error).toBeDefined();
    expect(schema.validate({ rows: ['text'] }).error).toBeDefined();
    expect(schema.validate({}).error).toBeDefined();
  });

  test('bulkRowsSchema honours a custom max', () => {
    expect(bulkRowsSchema(2).validate({ rows: [{}, {}, {}] }).error).toBeDefined();
  });
});

describe('validateBulkRow', () => {
  test('doctor: short phone and weak password are reported per row with readable text', () => {
    const r = validateBulkRow(bulkDoctorRowSchema, {
      name: 'Dr A', email: 'a@x.com', phone: '12345', password: 'weak',
    });
    expect(r.value).toBeUndefined();
    expect(r.message).toMatch(/phone length must be at least 10/);
    expect(r.message).toMatch(/password/i);
    expect(r.message).not.toContain('"');
  });

  test('doctor: a valid row keeps the conversions the route used to apply', () => {
    const r = validateBulkRow(bulkDoctorRowSchema, {
      name: '  Dr A  ', email: ' A@X.COM ', password: 'Strong123', consultationFee: '500', branchCode: ' MAIN ',
    });
    expect(r.message).toBeUndefined();
    expect(r.value).toMatchObject({ name: 'Dr A', email: 'a@x.com', consultationFee: 500, branchCode: 'MAIN' });
  });

  test('staff: role is lowercased and required', () => {
    expect(validateBulkRow(bulkStaffRowSchema, { name: 'Ravi', email: 'r@x.com', password: 'Strong123' }).message)
      .toMatch(/role is required/);
    expect(validateBulkRow(bulkStaffRowSchema, {
      name: 'Ravi', email: 'r@x.com', password: 'Strong123', role: 'Receptionist',
    }).value.role).toBe('receptionist');
  });

  test('department and branch: codes are upper-cased, descriptions may be blank', () => {
    expect(validateBulkRow(bulkDepartmentRowSchema, { name: 'Ortho', code: 'ort', description: '' }).value.code).toBe('ORT');
    expect(validateBulkRow(createBranchSchema, { name: 'Main', code: 'main', email: 'M@X.COM' }).value)
      .toMatchObject({ code: 'MAIN', email: 'm@x.com' });
  });

  test('inventory: defaults are applied and a bad category is reported', () => {
    const ok = validateBulkRow(bulkItemRowSchema, { name: 'Gloves', code: 'GL-1', category: 'consumables' });
    expect(ok.value).toMatchObject({ unit: 'piece', currentStock: 0, minimumThreshold: 5, currency: 'INR' });
    expect(validateBulkRow(bulkItemRowSchema, { name: 'Gloves', code: 'GL-1', category: 'bogus' }).message)
      .toMatch(/category must be one of/);
  });

  test('patient: unknown columns are stripped, not rejected', () => {
    const r = validateBulkRow(createPatientSchema, { name: 'Anita Desai', phone: '9876543210', extra: 'x' });
    expect(r.message).toBeUndefined();
    expect(r.value).not.toHaveProperty('extra');
  });

  test('reports every problem in a row, not only the first', () => {
    const r = validateBulkRow(createPatientSchema, { name: 'A', phone: '1', gender: 'robot' });
    expect(r.message.split('; ').length).toBeGreaterThanOrEqual(3);
  });
});
