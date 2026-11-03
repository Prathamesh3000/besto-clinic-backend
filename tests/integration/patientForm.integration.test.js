'use strict';

/**
 * Integration test for the New Patient Registration form (config, reception + QR
 * submit, duplicates, list/detail/stats, dashboard counts).
 *
 * Runs ONLY against a throwaway mongod started by tests/setup.js (mongodb-memory-server,
 * 127.0.0.1, random port). If no local mongod can be started the setup hook fails with
 * the mongodb-memory-server error; on Windows without a download point it at the
 * installed server:
 *   MONGOMS_SYSTEM_BINARY="C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe"
 *   npx jest --selectProjects integration tests/integration/patientForm.integration.test.js
 *
 * Safety: `.env` is never read (dotenv is mocked) and Redis is faked.
 */

jest.mock('dotenv', () => ({ config: () => ({}) }));
jest.mock('../../src/config/redis', () => ({
  getRedis: () => ({ get: async () => null, set: async () => 'OK' }),
}));
// Staff routers: replace auth/tenant/permission middleware with header-driven stubs.
jest.mock('../../src/middleware/authenticate', () => ({
  authenticate: () => (req, _res, next) => {
    req.user = JSON.parse(req.headers['x-test-user'] || '{}');
    next();
  },
}));
jest.mock('../../src/middleware/tenantResolver', () => ({
  tenantResolver: () => (req, _res, next) => {
    req.tenantSlug = req.headers['x-test-tenant'];
    next();
  },
}));
jest.mock('../../src/middleware/authorize', () => ({
  authorize: () => (_req, _res, next) => next(),
  authorizeAny: () => (_req, _res, next) => next(),
}));

const http = require('http');
const mongoose = require('mongoose');

const SLUG = 'pf-main';
const SLUG_STATS = 'pf-stats';
const SLUG_OTHER = 'pf-other';
const CODE = 'DENT1234';
const CODE_OTHER = 'ZZZ9999';
const SIG = `data:image/png;base64,${'iVBORw0KGgo'.repeat(10)}`;

const staff = { userId: String(new mongoose.Types.ObjectId()), role: 'super_admin' };

let baseUri;
let server;
let url;
let formSvc;
let regSvc;
let dashSvc;
let tokenHelper;
let Clinic;
let logic;

const fullAnswers = (over = {}) => ({
  name: 'Asha Patil',
  phone: '7208192457',
  age: 22,
  gender: 'female',
  address: '12 MG Road',
  referralSource: 'google',
  chiefComplaint: 'Tooth pain',
  ...over,
});

async function call(method, path, { body, headers = {}, staffCall = null, tenant = SLUG } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (staffCall) {
    h['x-test-user'] = JSON.stringify(staffCall);
    h['x-test-tenant'] = tenant;
  }
  const res = await fetch(`${url}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (_e) { /* empty */ }
  return { status: res.status, body: json };
}

async function seedClinics() {
  const mk = (slug, name, clinicCode) => Clinic.updateOne(
    { slug },
    {
      $set: {
        slug, name, clinicCode, email: `${slug}@example.test`, status: 'active', deletedAt: null,
        dbUri: `${baseUri}${slug.replace(/-/g, '_')}`,
      },
    },
    { upsert: true },
  );
  await mk(SLUG, 'Jathar Dental', CODE);
  await mk(SLUG_STATS, 'Stats Clinic', 'STAT1111');
  await mk(SLUG_OTHER, 'Other Clinic', CODE_OTHER.replace('ZZZ', 'OTH').replace('9999', '8888'));
}

beforeAll(async () => {
  // tests/setup.js has already set env + started the memory server.
  expect(process.env.PLATFORM_DB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+/);
  process.env.SQL_ENTITIES = '';
  baseUri = process.env.PLATFORM_DB_URI.replace(/\/[^/]*$/, '/');

  Clinic = require('../../src/models/platform/Clinic');
  formSvc = require('../../src/modules/patientForm/patientForm.service');
  regSvc = require('../../src/modules/patientRegistration/patientRegistration.service');
  dashSvc = require('../../src/modules/dashboard/dashboard.service');
  tokenHelper = require('../../src/utils/tokenHelper');
  logic = require('../../src/modules/patientForm/patientForm.logic');

  const express = require('express');
  const errorHandler = require('../../src/middleware/errorHandler');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/public/patient-form', require('../../src/modules/patientRegistration/publicPatientForm.routes'));
  app.use('/patient-form', require('../../src/modules/patientForm/patientForm.routes'));
  app.use('/patient-registrations', require('../../src/modules/patientRegistration/patientRegistration.routes'));
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(seedClinics); // tests/setup.js wipes the platform DB after every test

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  const { closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');
  await closeAllTenantConnections();
});

describe('config (scenarios 1-2)', () => {
  let cfg;

  test('default config is created lazily with contract defaults', async () => {
    const r = await call('GET', '/patient-form', { staffCall: staff });
    expect(r.status).toBe(200);
    cfg = r.body.data;
    expect(cfg.version).toBe(1);
    const f = Object.fromEntries(cfg.fields.map((x) => [x.key, x]));
    expect(f.address).toMatchObject({ enabled: true, required: false });
    expect(f.referralSource).toMatchObject({ enabled: true, required: true });
    expect(f.name).toMatchObject({ locked: true, enabled: true, required: true });
    expect(f.phone).toMatchObject({ locked: true, enabled: true, required: true });
    expect(cfg.qr.enabled).toBe(true);
    expect(cfg.qr.token.length).toBeGreaterThanOrEqual(32);
    // second GET does not create another / change the token
    const r2 = await call('GET', '/patient-form', { staffCall: staff });
    expect(r2.body.data.qr.token).toBe(cfg.qr.token);
    const conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG);
    expect(await conn.model('PatientFormConfig').countDocuments({})).toBe(1);
  });

  test('concurrent first-GET on a fresh tenant yields exactly one config', async () => {
    await Promise.all([1, 2, 3, 4].map(() => formSvc.getOrCreateConfigDoc(SLUG_OTHER)));
    const conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG_OTHER);
    expect(await conn.model('PatientFormConfig').countDocuments({})).toBe(1);
  });

  const putBody = (mut) => {
    const b = { title: cfg.title, consentText: cfg.consentText, fields: JSON.parse(JSON.stringify(cfg.fields)) };
    mut(b);
    return b;
  };

  test('valid change bumps version, custom field round-trips', async () => {
    const body = putBody((b) => {
      b.fields.find((x) => x.key === 'address').enabled = false;
      b.fields.find((x) => x.key === 'referralSource').label = 'How did you hear?';
      b.fields.push({ key: 'custom_insurance', label: 'Insurance?', type: 'checkbox', required: false });
      b.fields.push({
        key: 'custom_shift', label: 'Preferred shift', type: 'select', required: false,
        options: [{ value: 'am', label: 'Morning' }, { value: 'pm', label: 'Evening' }],
      });
    });
    const r = await call('PUT', '/patient-form', { staffCall: staff, body });
    expect(r.status).toBe(200);
    expect(r.body.data.version).toBe(2);
    const g = await call('GET', '/patient-form', { staffCall: staff });
    const keys = g.body.data.fields.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['custom_insurance', 'custom_shift']));
    const shift = g.body.data.fields.find((x) => x.key === 'custom_shift');
    expect(shift).toMatchObject({ builtIn: false, type: 'select' });
    expect(shift.options).toEqual([{ value: 'am', label: 'Morning' }, { value: 'pm', label: 'Evening' }]);
    expect(g.body.data.fields.find((x) => x.key === 'address').enabled).toBe(false);
    cfg = g.body.data;
  });

  test.each([
    ['disable name', (b) => { b.fields.find((x) => x.key === 'name').enabled = false; }],
    ['optionalise phone', (b) => { b.fields.find((x) => x.key === 'phone').required = false; }],
    ['duplicate keys', (b) => { b.fields.push({ ...b.fields.find((x) => x.key === 'age') }); }],
    ['select without options', (b) => { b.fields.push({ key: 'custom_nope', label: 'N', type: 'select', required: false }); }],
    ['>30 fields', (b) => {
      for (let i = 0; i < 25; i += 1) b.fields.push({ key: `custom_f${i}`, label: `F${i}`, type: 'text', required: false });
    }],
  ])('PUT rejects: %s', async (_n, mut) => {
    const before = (await call('GET', '/patient-form', { staffCall: staff })).body.data.version;
    const r = await call('PUT', '/patient-form', { staffCall: staff, body: putBody(mut) });
    expect(r.status).toBe(400);
    const after = (await call('GET', '/patient-form', { staffCall: staff })).body.data.version;
    expect(after).toBe(before);
  });

  test('restore address for later scenarios', async () => {
    const body = putBody((b) => { b.fields.find((x) => x.key === 'address').enabled = true; });
    const r = await call('PUT', '/patient-form', { staffCall: staff, body });
    expect(r.status).toBe(200);
    cfg = r.body.data;
  });
});

describe('reception submit + duplicates (scenarios 3-4)', () => {
  let conn;
  beforeAll(async () => {
    conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG);
  });
  const submit = (answers, extra = {}) => call('POST', '/patient-registrations', {
    staffCall: staff,
    body: { formVersion: 1, answers, signature: SIG, ...extra },
  });

  test('creates patient + registration with snapshot', async () => {
    const r = await submit(fullAnswers({ name: '  Rohit Kale ', phone: '+91 98765 43210', custom_shift: 'am', custom_insurance: true }));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ isExistingPatient: false, linkedToAccount: false });
    const p = await conn.model('Patient').findById(r.body.data.patientId).lean();
    expect(p).toMatchObject({
      name: 'Rohit Kale', age: 22, referralSource: 'google', registrationSource: 'reception', gender: 'female',
    });
    expect(String(p.registeredBy)).toBe(staff.userId);
    expect(p.address.street).toBe('12 MG Road');
    expect(p.chiefComplaint).toBeUndefined();
    expect(p.patientId).toBe(r.body.data.patientCode);
    const reg = await conn.model('PatientRegistration').findById(r.body.data.registrationId).select('+signature').lean();
    expect(reg).toMatchObject({ source: 'reception', chiefComplaint: 'Tooth pain', referralSource: 'google', hasSignature: true });
    expect(reg.formVersion).toBe(await conn.model('PatientFormConfig').findOne({}).then((c) => c.version));
    expect(reg.formSnapshot.length).toBeGreaterThan(5);
    expect(reg.answers.custom_shift).toBe('am');
    expect(reg.signature).toBe(SIG);
    expect(String(reg.registeredBy)).toBe(staff.userId);
  });

  test('missing required answer -> 400 with answers.<key> field', async () => {
    const a = fullAnswers(); delete a.referralSource;
    const r = await submit(a);
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e) => e.field)).toContain('answers.referralSource');
  });

  test('unknown key, bad signature prefix, oversize signature rejected', async () => {
    let r = await submit(fullAnswers({ bogus: 'x' }));
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e) => e.field)).toContain('answers.bogus');
    r = await call('POST', '/patient-registrations', {
      staffCall: staff, body: { answers: fullAnswers(), signature: 'data:image/jpeg;base64,AAAA' },
    });
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e) => e.field)).toContain('signature');
    const big = `data:image/png;base64,${'A'.repeat(310 * 1024 * 4 / 3)}`;
    r = await call('POST', '/patient-registrations', { staffCall: staff, body: { answers: fullAnswers(), signature: big } });
    expect(r.status).toBe(400);
  });

  test('same phone (any format) + same name (case/space-insensitive) => existing patient', async () => {
    const P = conn.model('Patient');
    const first = await submit(fullAnswers({ name: 'Meera Joshi', phone: '9000011111' }));
    expect(first.status).toBe(201);
    const before = await P.countDocuments({});
    const variants = [
      { name: 'MEERA   joshi', phone: '+91 90000 11111' },
      { name: ' meera joshi ', phone: '090000-11111' },
      { name: 'Meera Joshi', phone: '90000 11111' },
    ];
    for (const v of variants) {
      const r = await submit(fullAnswers(v));
      expect(r.status).toBe(201);
      expect(r.body.data.isExistingPatient).toBe(true);
      expect(r.body.data.patientId).toBe(first.body.data.patientId);
    }
    expect(await P.countDocuments({})).toBe(before);
    expect(await conn.model('PatientRegistration').countDocuments({ patient: first.body.data.patientId })).toBe(4);
    // same phone, different name => new patient
    const other = await submit(fullAnswers({ name: 'Meera Joshi Jr', phone: '9000011111' }));
    expect(other.body.data.isExistingPatient).toBe(false);
    expect(other.body.data.patientId).not.toBe(first.body.data.patientId);
    expect(await P.countDocuments({})).toBe(before + 1);
  });

  test('soft-deleted patient is not reused', async () => {
    const P = conn.model('Patient');
    const a = await submit(fullAnswers({ name: 'Gone Person', phone: '9111122222' }));
    await P.updateOne({ _id: a.body.data.patientId }, { deletedAt: new Date() });
    const b = await submit(fullAnswers({ name: 'Gone Person', phone: '9111122222' }));
    expect(b.body.data.isExistingPatient).toBe(false);
  });
});

describe('public flow (scenario 5)', () => {
  let token;
  let conn;
  beforeAll(async () => {
    token = (await formSvc.getConfig(SLUG, staff)).qr.token;
    conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG);
  });
  const pub = (path, opts) => call(path.startsWith('GET ') ? 'GET' : 'POST', path.replace(/^(GET|POST) /, ''), opts);

  test('GET form: ok with token; identical generic 404 otherwise', async () => {
    const ok = await call('GET', `/public/patient-form/${CODE}?t=${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.clinic).toMatchObject({ name: 'Jathar Dental', clinicCode: CODE });
    expect(ok.body.data.form.fields.every((f) => f.enabled)).toBe(true);
    expect(JSON.stringify(ok.body)).not.toContain(token);

    const wrongTok = await call('GET', `/public/patient-form/${CODE}?t=${'x'.repeat(token.length)}`);
    const shortTok = await call('GET', `/public/patient-form/${CODE}?t=abc`);
    const noTok = await call('GET', `/public/patient-form/${CODE}`);
    const badCode = await call('GET', `/public/patient-form/NOPE0000?t=${token}`);
    for (const r of [wrongTok, shortTok, noTok, badCode]) expect(r.status).toBe(404);
    expect(wrongTok.body).toEqual(badCode.body);
    expect(shortTok.body).toEqual(badCode.body);
    expect(noTok.body).toEqual(badCode.body);

    await formSvc.toggleQr(false, staff, SLUG);
    const disabled = await call('GET', `/public/patient-form/${CODE}?t=${token}`);
    expect(disabled.status).toBe(404);
    expect(disabled.body).toEqual(badCode.body);
    await formSvc.toggleQr(true, staff, SLUG);
  });

  const submitPub = (answers, headers = {}, t = token) => call('POST', `/public/patient-form/${CODE}/submit?t=${t}`, {
    body: { answers, signature: SIG }, headers,
  });

  test('submit creates qr registration, guest', async () => {
    const r = await submitPub(fullAnswers({ name: 'Qr Guest', phone: '9222233333' }));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ isExistingPatient: false, linkedToAccount: false });
    const reg = await conn.model('PatientRegistration').findById(r.body.data.registrationId).lean();
    expect(reg.source).toBe('qr');
    expect(reg.registeredBy).toBeNull();
    expect(reg.ip).toBeTruthy();
    const p = await conn.model('Patient').findById(r.body.data.patientId).lean();
    expect(p.registrationSource).toBe('qr');
    expect(p.registeredBy).toBeUndefined();
    const bad = await submitPub(fullAnswers({ name: 'Nope Person', phone: '9222244444' }), {}, 'wrong');
    expect(bad.status).toBe(404);
    expect(await conn.model('Patient').countDocuments({ name: 'Nope Person' })).toBe(0);
  });

  test('valid patient Bearer links; invalid / other-clinic token => guest', async () => {
    const uid = new mongoose.Types.ObjectId();
    await conn.model('User').collection.insertOne({
      _id: uid, name: 'App Patient', email: 'app@example.test', role: 'patient', isActive: true,
    });
    const good = tokenHelper.signAccessToken({ userId: String(uid), role: 'patient', tenantSlug: SLUG });
    const r = await submitPub(fullAnswers({ name: 'Linked One', phone: '9333344444' }), { authorization: `Bearer ${good}` });
    expect(r.status).toBe(201);
    expect(r.body.data.linkedToAccount).toBe(true);
    const p = await conn.model('Patient').findById(r.body.data.patientId).lean();
    expect(String(p.user)).toBe(String(uid));
    const reg = await conn.model('PatientRegistration').findById(r.body.data.registrationId).lean();
    expect(String(reg.linkedUser)).toBe(String(uid));

    const other = tokenHelper.signAccessToken({ userId: String(uid), role: 'patient', tenantSlug: SLUG_OTHER });
    const r2 = await submitPub(fullAnswers({ name: 'Other Clinic Tok', phone: '9333355555' }), { authorization: `Bearer ${other}` });
    expect(r2.status).toBe(201);
    expect(r2.body.data.linkedToAccount).toBe(false);
    const r3 = await submitPub(fullAnswers({ name: 'Garbage Tok', phone: '9333366666' }), { authorization: 'Bearer not.a.jwt' });
    expect(r3.status).toBe(201);
    expect(r3.body.data.linkedToAccount).toBe(false);
    const staffTok = tokenHelper.signAccessToken({ userId: String(uid), role: 'receptionist', tenantSlug: SLUG });
    const r4 = await submitPub(fullAnswers({ name: 'Staff Tok', phone: '9333377777' }), { authorization: `Bearer ${staffTok}` });
    expect(r4.body.data.linkedToAccount).toBe(false);
  });

  test('QR regenerate kills the old token', async () => {
    const r = await call('POST', '/patient-form/qr/regenerate', { staffCall: staff });
    expect(r.status).toBe(200);
    expect(r.body.data.qr.token).not.toBe(token);
    expect((await call('GET', `/public/patient-form/${CODE}?t=${token}`)).status).toBe(404);
    expect((await submitPub(fullAnswers({ name: 'Old Qr', phone: '9444455555' }))).status).toBe(404);
    expect((await call('GET', `/public/patient-form/${CODE}?t=${r.body.data.qr.token}`)).status).toBe(200);
    token = r.body.data.qr.token;
  });
});

describe('list / detail / stats (scenario 6)', () => {
  let conn;
  let regs;
  const day = (offset, h = 12) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  beforeAll(async () => {
    await seedClinics(); // beforeEach has not run yet and the platform DB is wiped between tests
    conn = await require('../../src/db/tenantConnectionManager').getTenantConnection(SLUG_STATS);
    await formSvc.getOrCreateConfigDoc(SLUG_STATS);
    const P = conn.model('Patient');
    const R = conn.model('PatientRegistration');
    const mkPatient = (name, phone) => P.create({ name, phone, registrationSource: 'reception' });
    const a = await mkPatient('Alpha Tester', '9800000001');
    const b = await mkPatient('Beta Tester', '9800000002');
    const rows = [
      { p: a, source: 'reception', ref: 'google', at: new Date() },
      { p: a, source: 'qr', ref: 'self', at: new Date() },
      { p: b, source: 'reception', ref: undefined, at: day(-1) },
      { p: b, source: 'qr', ref: 'doctor', at: day(-3) },
      { p: a, source: 'reception', ref: 'google', at: day(-10) },
      { p: b, source: 'qr', ref: 'google', at: day(-40) },
      { p: a, source: 'reception', ref: 'self', at: day(-70) },
    ];
    regs = [];
    for (const x of rows) {
      regs.push(await R.create({
        patient: x.p._id, source: x.source, formVersion: 1, referralSource: x.ref, answers: { name: x.p.name },
        hasSignature: true, signature: SIG, createdAt: x.at, updatedAt: x.at,
      }));
    }
  });

  test('list: pagination, filters, no raw base64, hasSignature', async () => {
    const all = await call('GET', '/patient-registrations?limit=3&page=2', { staffCall: staff, tenant: SLUG_STATS });
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta || all.body.pagination).toMatchObject({ page: 2, limit: 3, total: 7 });
    expect(JSON.stringify(all.body)).not.toContain('base64');
    expect(all.body.data.every((x) => x.hasSignature === true)).toBe(true);
    expect(all.body.data[0].patient).toMatchObject({ name: expect.any(String), phone: expect.any(String) });

    const q = (s) => call('GET', `/patient-registrations?${s}`, { staffCall: staff, tenant: SLUG_STATS });
    expect((await q('source=qr')).body.data).toHaveLength(3);
    expect((await q('referralSource=google')).body.data).toHaveLength(3);
    expect((await q('search=alpha')).body.data).toHaveLength(4);
    expect((await q('search=980000-0002')).body.data).toHaveLength(3);
    expect((await q('search=980')).body.data).toHaveLength(7);
    expect((await q('search=zzz')).body.data).toHaveLength(0);
    expect((await q('search=.*')).body.data).toHaveLength(0); // regex metachars escaped
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect((await q(`from=${iso(day(-1))}&to=${iso(day(-1))}`)).body.data).toHaveLength(1);
    expect((await q(`from=${iso(day(-4))}`)).body.data).toHaveLength(4);
    expect((await q(`to=${iso(day(-30))}`)).body.data).toHaveLength(2);
    expect((await q('from=garbage')).status).toBe(400);
    expect((await q('source=bogus')).status).toBe(400);
    expect((await q('referralSource=bogus')).status).toBe(400);
  });

  test('detail returns signature; bad id -> 400; missing -> 404', async () => {
    const d = await call('GET', `/patient-registrations/${regs[0]._id}`, { staffCall: staff, tenant: SLUG_STATS });
    expect(d.status).toBe(200);
    expect(d.body.data.signature).toBe(SIG);
    expect(d.body.data.patient.name).toBe('Alpha Tester');
    expect((await call('GET', '/patient-registrations/xyz', { staffCall: staff, tenant: SLUG_STATS })).status).toBe(400);
    const missing = String(new mongoose.Types.ObjectId());
    expect((await call('GET', `/patient-registrations/${missing}`, { staffCall: staff, tenant: SLUG_STATS })).status).toBe(404);
  });

  test('stats match independently computed expectations; dashboard newPatients agrees', async () => {
    const now = new Date();
    const sod = new Date(now); sod.setHours(0, 0, 0, 0);
    const monday = new Date(sod); monday.setDate(monday.getDate() - ((sod.getDay() + 6) % 7));
    const som = new Date(sod.getFullYear(), sod.getMonth(), 1);
    const created = regs.map((r) => new Date(r.createdAt));
    const cnt = (lo, hi) => created.filter((c) => c >= lo && c < hi).length;
    const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const expected = {
      today: cnt(sod, addD(sod, 1)),
      thisWeek: cnt(monday, addD(monday, 7)),
      thisMonth: cnt(som, new Date(sod.getFullYear(), sod.getMonth() + 1, 1)),
      previous: {
        today: cnt(addD(sod, -1), sod),
        thisWeek: cnt(addD(monday, -7), monday),
        thisMonth: cnt(new Date(sod.getFullYear(), sod.getMonth() - 1, 1), som),
      },
    };
    const r = await call('GET', '/patient-registrations/stats', { staffCall: staff, tenant: SLUG_STATS });
    expect(r.status).toBe(200);
    const s = r.body.data;
    expect(s).toMatchObject({ today: expected.today, thisWeek: expected.thisWeek, thisMonth: expected.thisMonth });
    expect(s.previous).toEqual(expected.previous);

    const inMonth = regs.filter((x) => x.createdAt >= som && x.createdAt < new Date(sod.getFullYear(), sod.getMonth() + 1, 1));
    const bySource = { reception: 0, qr: 0 };
    const byRef = {};
    inMonth.forEach((x) => { bySource[x.source] += 1; const k = x.referralSource || 'unknown'; byRef[k] = (byRef[k] || 0) + 1; });
    expect(s.bySource).toEqual(bySource);
    expect(s.byReferral).toEqual(byRef);

    expect(s.daily).toHaveLength(30);
    const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(s.daily[29].date).toBe(dk(sod));
    expect(s.daily[0].date).toBe(dk(addD(sod, -29)));
    const expDaily = {};
    regs.filter((x) => x.createdAt >= addD(sod, -29)).forEach((x) => {
      const k = dk(new Date(x.createdAt));
      expDaily[k] = expDaily[k] || { reception: 0, qr: 0 };
      expDaily[k][x.source] += 1;
    });
    s.daily.forEach((d) => {
      expect({ reception: d.reception, qr: d.qr }).toEqual(expDaily[d.date] || { reception: 0, qr: 0 });
    });

    const dash = await dashSvc.getClinicDashboard(SLUG_STATS);
    expect(dash.newPatients).toEqual({ today: s.today, thisWeek: s.thisWeek, thisMonth: s.thisMonth });
  });
});

describe('createPatientSchema compatibility (scenario 7)', () => {
  const { createPatientSchema } = require('../../src/modules/patient/patient.validator');
  test('old payloads without age/referralSource still valid; new ones too', () => {
    expect(createPatientSchema.validate({ name: 'Old Style', phone: '9876543210' }).error).toBeUndefined();
    expect(createPatientSchema.validate({ name: 'New Style', phone: '9876543210', age: 30, referralSource: 'doctor' }).error).toBeUndefined();
    expect(createPatientSchema.validate({ name: 'Bad', phone: '9876543210', age: 200 }).error).toBeDefined();
  });
});

// keep `logic` referenced (sanity: token length used by the contract)
test('qr token generator is 32+ chars', () => {
  expect(logic.generateQrToken().length).toBeGreaterThanOrEqual(32);
});
