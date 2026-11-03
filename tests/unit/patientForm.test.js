'use strict';

const logic = require('../../src/modules/patientForm/patientForm.logic');
const range = require('../../src/modules/patientRegistration/patientRegistration.logic');

const PNG = `${logic.SIGNATURE_PREFIX}iVBORw0KGgo=`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const validAnswers = () => ({
  name: 'Asha Patil', phone: '7208192457', age: 22, gender: 'female',
  referralSource: 'google', chiefComplaint: 'Tooth pain',
});

describe('default config', () => {
  const cfg = logic.buildDefaultConfig();

  test('has all 8 built-ins with contract defaults', () => {
    expect(cfg.fields.map((f) => f.key)).toEqual(
      ['name', 'phone', 'age', 'gender', 'address', 'referralSource', 'chiefComplaint', 'signature'],
    );
    const by = Object.fromEntries(cfg.fields.map((f) => [f.key, f]));
    expect(by.address.required).toBe(false);
    expect(by.referralSource.required).toBe(true);
    expect(by.name.locked && by.phone.locked).toBe(true);
    expect(by.age.locked).toBe(false);
    expect(cfg.fields.every((f) => f.enabled && f.builtIn)).toBe(true);
    expect(by.referralSource.options.map((o) => o.value)).toEqual(logic.REFERRAL_VALUES);
  });

  test('QR tokens are 32+ chars and unique', () => {
    const a = logic.generateQrToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(logic.generateQrToken());
  });

  test('default config passes its own validator', () => {
    expect(logic.validateConfigInput(cfg).errors).toEqual([]);
  });
});

describe('validateConfigInput', () => {
  const base = () => clone(logic.buildDefaultConfig());
  const msgs = (input) => logic.validateConfigInput(input).errors.map((e) => e.message).join(' | ');

  test('accepts disabling/relabelling/optional on unlocked fields and renumbers order', () => {
    const c = base();
    c.fields.find((f) => f.key === 'age').enabled = false;
    c.fields.find((f) => f.key === 'gender').required = false;
    c.fields.find((f) => f.key === 'address').label = 'Home address';
    c.fields[0].order = 99; // name moved last
    const { errors, value } = logic.validateConfigInput(c);
    expect(errors).toEqual([]);
    expect(value.fields[value.fields.length - 1].key).toBe('name');
    expect(value.fields.map((f) => f.order)).toEqual(value.fields.map((_, i) => i));
  });

  test('locked fields cannot be disabled or optional', () => {
    const c = base();
    c.fields[0].enabled = false;
    expect(msgs(c)).toMatch(/locked/);
    const d = base();
    d.fields[1].required = false;
    expect(msgs(d)).toMatch(/locked/);
  });

  test('rejects duplicate keys, bad custom keys, missing built-ins, too many fields', () => {
    const dup = base();
    dup.fields.push(clone(dup.fields[2]));
    expect(msgs(dup)).toMatch(/Duplicate field key/);

    const bad = base();
    bad.fields.push({ key: 'weird', label: 'x', type: 'text' });
    expect(msgs(bad)).toMatch(/Invalid field key/);

    const missing = base();
    missing.fields = missing.fields.filter((f) => f.key !== 'age');
    expect(msgs(missing)).toMatch(/"age" is missing/);

    const many = base();
    for (let i = 0; i < 25; i += 1) many.fields.push({ key: `custom_f${i}`, label: 'x', type: 'text' });
    expect(msgs(many)).toMatch(/at most 30/);
  });

  test('custom fields: select needs options, types restricted, built-in type fixed', () => {
    const c = base();
    c.fields.push({ key: 'custom_diet', label: 'Diet', type: 'select' });
    expect(msgs(c)).toMatch(/needs 1 to 20 options/);

    const ok = base();
    ok.fields.push({ key: 'custom_diet', label: 'Diet', type: 'select', options: [{ value: 'veg', label: 'Veg' }] });
    const res = logic.validateConfigInput(ok);
    expect(res.errors).toEqual([]);
    expect(res.value.fields.find((f) => f.key === 'custom_diet').builtIn).toBe(false);

    const num = base();
    num.fields.push({ key: 'custom_n', label: 'N', type: 'number' });
    expect(msgs(num)).toMatch(/Custom field type/);

    const retype = base();
    retype.fields[2].type = 'text';
    expect(msgs(retype)).toMatch(/must keep type/);
  });

  test('built-in option values are constrained to the Patient enums', () => {
    const c = base();
    c.fields.find((f) => f.key === 'referralSource').options.push({ value: 'radio_ad', label: 'Radio' });
    expect(msgs(c)).toMatch(/not allowed/);
    const sub = base();
    sub.fields.find((f) => f.key === 'referralSource').options = [{ value: 'self', label: 'Walk-in' }];
    expect(logic.validateConfigInput(sub).errors).toEqual([]);
  });
});

describe('validateAnswers', () => {
  const cfg = logic.buildDefaultConfig();
  const run = (answers, sig = PNG, config = cfg) => logic.validateAnswers(config, answers, sig);
  const fields = (r) => r.errors.map((e) => e.field);

  test('accepts a complete valid submission and normalises values', () => {
    const r = run({ ...validAnswers(), name: '  Asha Patil ', age: '22' });
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({ name: 'Asha Patil', age: 22, phone: '7208192457' });
    expect(r.signature).toBe(PNG);
  });

  test('required fields enforced, optional address may be omitted', () => {
    const a = validAnswers();
    delete a.referralSource;
    delete a.age;
    expect(fields(run(a))).toEqual(expect.arrayContaining(['answers.referralSource', 'answers.age']));
    expect(fields(run(validAnswers()))).not.toContain('answers.address');
  });

  test('unknown and disabled keys are rejected', () => {
    expect(fields(run({ ...validAnswers(), hacker: 1 }))).toContain('answers.hacker');
    const c = clone(cfg);
    c.fields.find((f) => f.key === 'age').enabled = false;
    expect(fields(run(validAnswers(), PNG, c))).toContain('answers.age');
    const a = validAnswers();
    delete a.age;
    expect(run(a, PNG, c).errors).toEqual([]);
  });

  test('type and range checks', () => {
    expect(fields(run({ ...validAnswers(), age: 130 }))).toContain('answers.age');
    expect(fields(run({ ...validAnswers(), age: 2.5 }))).toContain('answers.age');
    expect(fields(run({ ...validAnswers(), phone: '12345' }))).toContain('answers.phone');
    expect(fields(run({ ...validAnswers(), phone: 'abcdefghij' }))).toContain('answers.phone');
    expect(fields(run({ ...validAnswers(), gender: 'robot' }))).toContain('answers.gender');
    expect(fields(run({ ...validAnswers(), name: 'A' }))).toContain('answers.name');
    expect(fields(run({ ...validAnswers(), name: { $gt: '' } }))).toContain('answers.name');
  });

  test('signature: required, prefix, base64 and size cap', () => {
    expect(fields(run(validAnswers(), ''))).toContain('signature');
    expect(fields(run(validAnswers(), 'data:image/jpeg;base64,AAAA'))).toContain('signature');
    expect(fields(run(validAnswers(), `${logic.SIGNATURE_PREFIX}not base64!!`))).toContain('signature');
    const big = `${logic.SIGNATURE_PREFIX}${'A'.repeat(Math.ceil((logic.MAX_SIGNATURE_BYTES * 4) / 3) + 8)}`;
    expect(fields(run(validAnswers(), big))).toContain('signature');
    expect(fields(run({ ...validAnswers(), signature: PNG }))).toContain('answers.signature');
  });

  test('custom fields: select options, checkbox required', () => {
    const c = clone(cfg);
    c.fields.push({ key: 'custom_diet', label: 'Diet', type: 'select', enabled: true, required: true, order: 8,
      options: [{ value: 'veg', label: 'Veg' }] });
    c.fields.push({ key: 'custom_ok', label: 'OK', type: 'checkbox', enabled: true, required: true, order: 9 });
    expect(fields(run(validAnswers(), PNG, c))).toEqual(
      expect.arrayContaining(['answers.custom_diet', 'answers.custom_ok']),
    );
    expect(fields(run({ ...validAnswers(), custom_diet: 'meat', custom_ok: true }, PNG, c)))
      .toEqual(['answers.custom_diet']);
    const good = run({ ...validAnswers(), custom_diet: 'veg', custom_ok: true }, PNG, c);
    expect(good.errors).toEqual([]);
    expect(good.clean.custom_ok).toBe(true);
    expect(fields(run({ ...validAnswers(), custom_diet: 'veg', custom_ok: false }, PNG, c)))
      .toContain('answers.custom_ok');
  });

  test('non-object answers are rejected', () => {
    expect(run(null).errors.length).toBe(1);
    expect(run([]).errors.length).toBe(1);
  });
});

describe('duplicate-key helpers', () => {
  test('normalisePhone strips formatting and country prefix', () => {
    expect(logic.normalisePhone('+91 72081-92457')).toBe('7208192457');
    expect(logic.normalisePhone('07208192457')).toBe('7208192457');
    expect(logic.normalisePhone('(720) 819 2457')).toBe('7208192457');
    expect(logic.normalisePhone(null)).toBe('');
  });

  test('normaliseName is case/whitespace insensitive', () => {
    expect(logic.normaliseName('  Asha   PATIL ')).toBe('asha patil');
  });

  test('isSamePerson: same phone + same name reuses, same phone + different name does not', () => {
    const p = { phone: '+91 7208192457', name: 'Asha Patil' };
    expect(logic.isSamePerson(p, '7208192457', ' asha  patil')).toBe(true);
    expect(logic.isSamePerson(p, '7208192457', 'Ravi Patil')).toBe(false);
    expect(logic.isSamePerson(p, '7208192458', 'Asha Patil')).toBe(false);
  });

  test('phoneMatchRegexSource matches differently formatted stored phones', () => {
    const rx = new RegExp(logic.phoneMatchRegexSource('7208192457'));
    expect(rx.test('+91 72081-92457')).toBe(true);
    expect(rx.test('7208192457')).toBe(true);
    expect(rx.test('7208192458')).toBe(false);
  });

  test('approximateDob and snapshot', () => {
    const dob = logic.approximateDob(30, new Date('2026-11-02T00:00:00Z'));
    expect(dob.getFullYear()).toBe(1996);
    const cfg = logic.buildDefaultConfig();
    cfg.fields.find((f) => f.key === 'age').enabled = false;
    const snap = logic.buildSnapshot(cfg);
    expect(snap.find((f) => f.key === 'age')).toBeUndefined();
    expect(snap.find((f) => f.key === 'gender').options).toHaveLength(3);
  });
});

describe('tokensMatch', () => {
  test('matches only identical non-empty strings', () => {
    expect(logic.tokensMatch('abc123', 'abc123')).toBe(true);
    expect(logic.tokensMatch('abc123', 'abc124')).toBe(false);
    expect(logic.tokensMatch('abc123', 'abc')).toBe(false);
    expect(logic.tokensMatch('abc123', '')).toBe(false);
    expect(logic.tokensMatch('abc123', undefined)).toBe(false);
    expect(logic.tokensMatch('', '')).toBe(false);
    expect(logic.tokensMatch('abc123', ['abc123'])).toBe(false);
  });
});

describe('stats range helpers', () => {
  // Wednesday 2026-11-04 15:30 local
  const now = new Date(2026, 10, 4, 15, 30);

  test('today / week (Monday) / month boundaries and previous periods', () => {
    const r = range.computeStatsRanges(now);
    expect(range.dateKey(r.today.start)).toBe('2026-11-04');
    expect(range.dateKey(r.thisWeek.start)).toBe('2026-11-02');
    expect(range.dateKey(r.thisMonth.start)).toBe('2026-11-01');
    expect(range.dateKey(r.previous.today.start)).toBe('2026-11-03');
    expect(range.dateKey(r.previous.thisWeek.start)).toBe('2026-10-26');
    expect(range.dateKey(r.previous.thisMonth.start)).toBe('2026-10-01');
    expect(range.dateKey(r.previous.thisMonth.end)).toBe('2026-11-01');
    expect(range.dateKey(r.dailyStart)).toBe('2026-10-06');
  });

  test('Sunday belongs to the week that started the previous Monday', () => {
    const r = range.computeStatsRanges(new Date(2026, 10, 8, 10, 0));
    expect(range.dateKey(r.thisWeek.start)).toBe('2026-11-02');
  });

  test('buildDailySeries zero-fills 30 days and ignores out-of-range rows', () => {
    const rows = [
      { _id: { date: '2026-11-04', source: 'qr' }, count: 3 },
      { _id: { date: '2026-11-03', source: 'reception' }, count: 2 },
      { _id: { date: '2020-01-01', source: 'qr' }, count: 9 },
    ];
    const s = range.buildDailySeries(rows, now, 30);
    expect(s).toHaveLength(30);
    expect(s[29]).toEqual({ date: '2026-11-04', reception: 0, qr: 3 });
    expect(s[28]).toEqual({ date: '2026-11-03', reception: 2, qr: 0 });
    expect(s[0].date).toBe('2026-10-06');
  });

  test('parseDateRange: date-only "to" is inclusive; garbage is flagged', () => {
    const r = range.parseDateRange('2026-11-01', '2026-11-03');
    expect(range.dateKey(r.from)).toBe('2026-11-01');
    expect(range.dateKey(r.to)).toBe('2026-11-04');
    expect(range.parseDateRange('nope', undefined).invalid).toBe(true);
    expect(range.parseDateRange(undefined, undefined)).toEqual({ from: null, to: null, invalid: false });
  });
});
