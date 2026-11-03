'use strict';

/**
 * Integration test for the per-row bulk import behaviour of six modules
 * (branch, department, doctor, staff, inventory, patient): one bad row must not
 * reject the batch; good rows persist and bad rows are reported as { row, message }.
 *
 * Runs ONLY against the throwaway mongod started by tests/setup.js
 * (mongodb-memory-server, 127.0.0.1). `.env` is never read (dotenv is mocked) and
 * Redis is faked. Run with:
 *   TELEMEDICINE_SECRET=x npx jest --selectProjects integration tests/integration/bulkImport.integration.test.js
 *
 * Stubbed side effects: auth.service.syncUserDirectory (platform user-directory sync
 * for doctors/staff). Everything else (routers, validators, services, models) is real.
 */

jest.mock('dotenv', () => ({ config: () => ({}) }));
jest.mock('../../src/config/redis', () => ({
  getRedis: () => ({
    get: async () => null, set: async () => 'OK', del: async () => 1, incr: async () => 1, expire: async () => 1,
  }),
}));
jest.mock('../../src/middleware/authenticate', () => ({
  authenticate: () => (req, _res, next) => {
    req.user = JSON.parse(req.headers['x-test-user'] || '{}');
    next();
  },
}));
jest.mock('../../src/middleware/tenantResolver', () => ({
  tenantResolver: () => (req, _res, next) => {
    const { runWithTenant } = require('../../src/db/repository/context');
    req.tenantSlug = req.headers['x-test-tenant'];
    return runWithTenant({ slug: req.tenantSlug }, () => next());
  },
}));
jest.mock('../../src/middleware/authorize', () => ({
  authorize: () => (_req, _res, next) => next(),
  authorizeAny: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/modules/auth/auth.service', () => ({
  ...jest.requireActual('../../src/modules/auth/auth.service'),
  syncUserDirectory: jest.fn(async () => {}),
}));

const http = require('http');
const mongoose = require('mongoose');

const SLUG = 'bulk-main';
const user = { userId: String(new mongoose.Types.ObjectId()), role: 'super_admin' };

let server;
let url;
let conn;
let Clinic;

async function post(path, body) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-test-user': JSON.stringify(user), 'x-test-tenant': SLUG,
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_e) { /* empty */ }
  if (process.env.DEBUG_BULK && json && json.data) console.log(path, JSON.stringify(json.data.errors)); // eslint-disable-line no-console
  return { status: res.status, body: json, data: json && json.data };
}

const seedClinic = () => Clinic.updateOne(
  { slug: SLUG },
  {
    $set: {
      slug: SLUG, name: 'Bulk Clinic', clinicCode: 'BULK1234', email: 'bulk@example.test', status: 'active', deletedAt: null,
      'features.maxBranches': 1000, 'features.maxDoctors': 1000, 'features.maxStaff': 1000,
      dbUri: `${process.env.PLATFORM_DB_URI.replace(/\/[^/]*$/, '/')}bulk_main`,
    },
  },
  { upsert: true },
);

async function wipeTenant() {
  for (const name of ['Branch', 'Department', 'User', 'InventoryItem', 'InventoryTransaction', 'Patient', 'Role']) {
    await conn.model(name).collection.deleteMany({});
  }
}

const expectBadMsg = (e, row, field) => {
  expect(e.row).toBe(row);
  expect(e.message).not.toContain('"');
  expect(e.message.toLowerCase()).toContain(field.toLowerCase());
};

const GOOD_PW = 'Passw0rdOk';

beforeAll(async () => {
  expect(process.env.PLATFORM_DB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+/);
  process.env.SQL_ENTITIES = '';
  Clinic = require('../../src/models/platform/Clinic');
  await seedClinic();
  conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG);

  const express = require('express');
  const errorHandler = require('../../src/middleware/errorHandler');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/branches', require('../../src/modules/branch/branch.routes'));
  app.use('/departments', require('../../src/modules/department/department.routes'));
  app.use('/doctors', require('../../src/modules/doctor/doctor.routes'));
  app.use('/staff', require('../../src/modules/staff/staff.routes'));
  app.use('/inventory', require('../../src/modules/inventory/inventory.routes'));
  app.use('/patients', require('../../src/modules/patient/patient.routes'));
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await seedClinic(); // tests/setup.js wipes the platform DB after every test
  await wipeTenant();
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  const { closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');
  await closeAllTenantConnections();
});

const mkBranch = (code, name = `Branch ${code}`) => conn.model('Branch').create({ name, code });

/* ------------------------------------------------------------------ shape */
describe.each([
  ['branches'], ['departments'], ['doctors'], ['staff'], ['inventory'], ['patients'],
])('%s route-level shape checks', (path) => {
  test('empty rows / 501 rows / non-object rows / missing rows -> 400', async () => {
    expect((await post(`/${path}/bulk`, { rows: [] })).status).toBe(400);
    expect((await post(`/${path}/bulk`, { rows: Array.from({ length: 501 }, () => ({ name: 'x' })) })).status).toBe(400);
    expect((await post(`/${path}/bulk`, { rows: ['a', 5] })).status).toBe(400);
    expect((await post(`/${path}/bulk`, { rows: [null] })).status).toBe(400);
    expect((await post(`/${path}/bulk`, {})).status).toBe(400);
  });
});

/* ----------------------------------------------------------------- branch */
describe('branches', () => {
  test('mixed batch: good rows persist, bad rows reported, conversions, duplicates', async () => {
    const r = await post('/branches/bulk', {
      rows: [
        { name: 'Main', code: ' main ', email: '  Main@Example.COM ' },
        { name: '', code: 'NONAME' }, // 2 bad: name empty
        { name: 'Second', code: 'second' },
        { name: 'Dup of main', code: 'MAIN' }, // 4 duplicate
        { name: 'No code' }, // 5 bad: code missing
        { name: 'Bad email', code: 'BADEM', email: 'nope' }, // 6 bad
        { name: 'Last', code: 'LAST' },
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data).toMatchObject({ totalReceived: 7, successCount: 3, errorCount: 4 });
    expect(r.data.errors.map((e) => e.row)).toEqual([2, 4, 5, 6]);
    expectBadMsg(r.data.errors[0], 2, 'name');
    expect(r.data.errors[1]).toEqual({ row: 4, message: 'Branch code MAIN already exists' });
    expectBadMsg(r.data.errors[2], 5, 'code');
    expectBadMsg(r.data.errors[3], 6, 'email');
    const rows = await conn.model('Branch').find({}).lean();
    expect(rows.map((b) => b.code).sort()).toEqual(['LAST', 'MAIN', 'SECOND']);
    expect(rows.find((b) => b.code === 'MAIN').email).toBe('main@example.com');
    const clinic = await Clinic.findOne({ slug: SLUG }).lean();
    expect(clinic.usage.branchesCount).toBe(3); // failed rows rolled their counter back
  });

  test('500 valid branches import fully', async () => {
    const rows = Array.from({ length: 500 }, (_v, i) => ({ name: `B ${i}`, code: `BR${i}` }));
    const t0 = Date.now();
    const r = await post('/branches/bulk', { rows });
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`PERF branches 500 rows: ${ms} ms`);
    expect(r.data).toMatchObject({ successCount: 500, errorCount: 0 });
    expect(await conn.model('Branch').countDocuments({})).toBe(500);
    expect(ms).toBeLessThan(25000);
  });
});

/* -------------------------------------------------------------- department */
describe('departments', () => {
  test('mixed batch with branchCode resolution, uppercase code, dup, unknown branch', async () => {
    const main = await mkBranch('MAIN');
    const r = await post('/departments/bulk', {
      rows: [
        { name: ' Ortho ', code: 'ortho', branchCode: ' main ' }, // 1 ok
        { name: 'X', code: 'x1', branchCode: 'nowhere' }, // 2 unknown branch
        { name: 'Perio', code: 'perio', branchCode: 'MAIN' }, // 3 ok
        { name: 'Ortho again', code: 'ORTHO', branchCode: 'main' }, // 4 duplicate
        { code: 'nameless', branchCode: 'MAIN' }, // 5 bad: name
        { name: 'ById', code: 'byid', branch: String(main._id) }, // 6 ok
        { name: 'No branch', code: 'nb' }, // 7 no branch at all
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data.totalReceived).toBe(7);
    const byRow = Object.fromEntries(r.data.errors.map((e) => [e.row, e.message]));
    expect(Object.keys(byRow).map(Number)).toEqual([2, 4, 5, 7]);
    expect(byRow[2]).toBe('Branch code "nowhere" not found');
    expect(byRow[4]).toBe('Department code ORTHO already exists in this branch');
    expect(byRow[5].toLowerCase()).toContain('name');
    expect(byRow[5]).not.toContain('"');
    expect(r.data).toMatchObject({ successCount: 3, errorCount: 4 });
    const depts = await conn.model('Department').find({}).lean();
    expect(depts.map((d) => d.code).sort()).toEqual(['BYID', 'ORTHO', 'PERIO']);
    expect(depts.find((d) => d.code === 'ORTHO').name).toBe('Ortho');
    expect(depts.every((d) => String(d.branch) === String(main._id))).toBe(true);
  });
});

/* ------------------------------------------------------------------ doctor */
describe('doctors', () => {
  test('mixed batch: conversions, branchCode, duplicates, unknown branch', async () => {
    const main = await mkBranch('MAIN');
    const good = (n, over = {}) => ({
      name: `Dr ${n}`, email: ` Doc${n}@Example.COM `, password: GOOD_PW, phone: '9876543210', ...over,
    });
    const r = await post('/doctors/bulk', {
      rows: [
        good(1, { consultationFee: '750', branchCode: ' main ' }), // 1 ok
        good(2, { branchCode: 'ghost' }), // 2 unknown branch
        good(3, { email: 'doc1@example.com' }), // 3 duplicate of row 1
        good(4, { password: 'weak' }), // 4 bad password
        good(5, { email: 'not-an-email' }), // 5 bad email
        good(6, { consultationFee: 0 }), // 6 ok
        { ...good(7), consultationFee: 'abc' }, // 7 bad fee
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data).toMatchObject({ totalReceived: 7, successCount: 2, errorCount: 5 });
    const byRow = Object.fromEntries(r.data.errors.map((e) => [e.row, e.message]));
    expect(Object.keys(byRow).map(Number)).toEqual([2, 3, 4, 5, 7]);
    expect(byRow[2]).toBe('Branch code "ghost" not found');
    expect(byRow[3]).toMatch(/already registered/);
    expect(byRow[3]).not.toMatch(/E11000|"/);
    expect(byRow[4].toLowerCase()).toContain('password');
    expect(byRow[4]).not.toContain('"');
    expect(byRow[5].toLowerCase()).toContain('email');
    expect(byRow[5]).not.toContain('"');
    expect(byRow[7].toLowerCase()).toContain('consultationfee');
    const docs = await conn.model('User').find({ role: 'doctor' }).lean();
    expect(docs.map((d) => d.email).sort()).toEqual(['doc1@example.com', 'doc6@example.com']);
    const d1 = docs.find((d) => d.email === 'doc1@example.com');
    expect(d1.consultationFee).toBe(750);
    expect(typeof d1.consultationFee).toBe('number');
    expect(String(d1.branch)).toBe(String(main._id));
    const clinic = await Clinic.findOne({ slug: SLUG }).lean();
    expect(clinic.usage.doctorsCount).toBe(2);
  });
});

/* ------------------------------------------------------------------- staff */
describe('staff', () => {
  beforeEach(async () => {
    const Role = conn.model('Role');
    await Role.create([
      { name: 'Receptionist', slug: 'receptionist', group: 'front_desk', permissions: [] },
      { name: 'Billing Officer', slug: 'billing_officer', group: 'finance', permissions: [] },
      { name: 'Doctor', slug: 'doctor', group: 'clinical', permissions: [] },
    ]);
  });

  test('mixed batch: role lowercase/name match, invalid role, duplicate email, branchCode', async () => {
    await mkBranch('MAIN');
    const s = (n, over = {}) => ({
      name: `Staff ${n}`, email: ` S${n}@Example.COM `, password: GOOD_PW, role: 'receptionist', ...over,
    });
    const r = await post('/staff/bulk', {
      rows: [
        s(1, { role: ' RECEPTIONIST ', branchCode: ' main ' }), // 1 ok
        s(2, { role: 'wizard' }), // 2 invalid role
        s(3, { email: 's1@example.com' }), // 3 duplicate
        s(4, { role: 'Billing Officer' }), // 4 ok via name
        s(5, { branchCode: 'ghost' }), // 5 unknown branch
        s(6, { role: 'doctor' }), // 6 clinical role excluded -> invalid
        { ...s(7), password: 'x' }, // 7 bad password
        { ...s(8), role: undefined }, // 8 role missing
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data).toMatchObject({ totalReceived: 8, successCount: 2, errorCount: 6 });
    const byRow = Object.fromEntries(r.data.errors.map((e) => [e.row, e.message]));
    expect(Object.keys(byRow).map(Number)).toEqual([2, 3, 5, 6, 7, 8]);
    expect(byRow[2]).toMatch(/^Invalid role/);
    expect(byRow[3]).toBe('Email already registered');
    expect(byRow[5]).toBe('Branch code "ghost" not found');
    expect(byRow[6]).toMatch(/^Invalid role/);
    expect(byRow[7].toLowerCase()).toContain('password');
    expect(byRow[8].toLowerCase()).toContain('role');
    const users = await conn.model('User').find({ role: { $ne: 'doctor' } }).lean();
    expect(users.map((u) => `${u.email}:${u.role}`).sort()).toEqual([
      's1@example.com:receptionist', 's4@example.com:billing_officer',
    ]);
    expect(String(users.find((u) => u.email === 's1@example.com').branch)).toBeTruthy();
  });
});

/* --------------------------------------------------------------- inventory */
describe('inventory', () => {
  test('mixed batch: defaults, branchCode, missing branch, dup, bad category', async () => {
    const main = await mkBranch('MAIN');
    const r = await post('/inventory/bulk', {
      rows: [
        { name: 'Gloves', code: 'glv1', category: 'consumables', branchCode: ' main ' }, // 1 ok (defaults)
        { name: 'Mask', code: 'msk1', category: 'consumables', branchCode: 'ghost' }, // 2 unknown branch
        { name: 'Gloves dup', code: 'GLV1', category: 'consumables', branchCode: 'MAIN' }, // 3 duplicate
        { name: 'No branch', code: 'nb1', category: 'consumables' }, // 4 branch missing
        { name: 'Bad cat', code: 'bc1', category: 'nonsense', branch: String(main._id) }, // 5 bad category
        { name: 'Drill', code: 'drl1', category: 'instruments', currentStock: 3, minimumThreshold: 1, unit: 'box', branch: String(main._id) }, // 6 ok
        { name: 'Neg', code: 'ng1', category: 'consumables', currentStock: -4, branchCode: 'main' }, // 7 bad stock
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data).toMatchObject({ totalReceived: 7, successCount: 2, errorCount: 5 });
    const byRow = Object.fromEntries(r.data.errors.map((e) => [e.row, e.message]));
    expect(Object.keys(byRow).map(Number)).toEqual([2, 3, 4, 5, 7]);
    expect(byRow[2]).toBe('Branch code "ghost" not found');
    expect(byRow[3]).toMatch(/already exists/);
    expect(byRow[4]).toMatch(/branch/i);
    expect(byRow[5].toLowerCase()).toContain('category');
    expect(byRow[5]).not.toContain('"');
    expect(byRow[7].toLowerCase()).toContain('currentstock');
    const items = await conn.model('InventoryItem').find({}).lean();
    expect(items.map((i) => i.code).sort()).toEqual(['DRL1', 'GLV1']);
    const g = items.find((i) => i.code === 'GLV1');
    expect(g).toMatchObject({ unit: 'piece', currentStock: 0, minimumThreshold: 5, currency: 'INR' });
    expect(String(g.branch)).toBe(String(main._id));
    expect(items.find((i) => i.code === 'DRL1')).toMatchObject({ unit: 'box', currentStock: 3, minimumThreshold: 1 });
  });
});

describe('inventory cross-branch code', () => {
  test('same code in a second branch gives a readable per-row error, batch completes', async () => {
    await mkBranch('AAA'); await mkBranch('BBB');
    const r = await post('/inventory/bulk', {
      rows: [
        { name: 'Item', code: 'same1', category: 'other', branchCode: 'aaa' },
        { name: 'Item', code: 'same1', category: 'other', branchCode: 'bbb' },
        { name: 'Item 2', code: 'other1', category: 'other', branchCode: 'bbb' },
      ],
    });
    expect(r.data).toMatchObject({ successCount: 2, errorCount: 1 });
    expect(r.data.errors[0].row).toBe(2);
    expect(r.data.errors[0].message).not.toMatch(/E11000/);
  });
});

/* ----------------------------------------------------------------- patient */
describe('patients', () => {
  test('mixed batch: trim, bad rows with readable messages', async () => {
    const r = await post('/patients/bulk', {
      rows: [
        { name: '  Asha Patil  ', phone: ' 9876543210 ', email: ' ASHA@Example.COM ' }, // 1 ok
        { name: 'A', phone: '9876543211' }, // 2 name too short
        { name: 'No Phone' }, // 3 phone missing
        { name: 'Bad Gender', phone: '9876543212', gender: 'robot' }, // 4
        { name: 'Ravi Kumar', phone: '9876543213', age: 30 }, // 5 ok
        { name: 'Bad Age', phone: '9876543214', age: 500 }, // 6
      ],
    });
    expect([200, 201]).toContain(r.status);
    expect(r.data).toMatchObject({ totalReceived: 6, successCount: 2, errorCount: 4 });
    expect(r.data.errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
    expectBadMsg(r.data.errors[0], 2, 'name');
    expectBadMsg(r.data.errors[1], 3, 'phone');
    expectBadMsg(r.data.errors[2], 4, 'gender');
    expectBadMsg(r.data.errors[3], 6, 'age');
    const ps = await conn.model('Patient').find({}).lean();
    expect(ps.map((p) => p.name).sort()).toEqual(['Asha Patil', 'Ravi Kumar']);
    const a = ps.find((p) => p.name === 'Asha Patil');
    expect(a.phone).toBe('9876543210');
    expect(a.email).toBe('asha@example.com');
  });

  test('500 valid patients import fully', async () => {
    const rows = Array.from({ length: 500 }, (_v, i) => ({ name: `Patient ${i}`, phone: `98${String(10000000 + i)}` }));
    const t0 = Date.now();
    const r = await post('/patients/bulk', { rows });
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`PERF patients 500 rows: ${ms} ms`);
    expect(r.data).toMatchObject({ successCount: 500, errorCount: 0 });
    expect(await conn.model('Patient').countDocuments({})).toBe(500);
    expect(ms).toBeLessThan(60000);
  });
});
