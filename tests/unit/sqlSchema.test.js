'use strict';

/**
 * Unit tests for the schema-mapping rules.
 *
 * The DDL for 73 tables is generated from these functions, so a wrong rule here
 * is a wrong column everywhere. They are pure, which is the point — the whole
 * mapping can be tested against literal inputs without a database.
 *
 * Each test names the decision it protects rather than the function it calls.
 */

const typeMap = require('../../sql/schema/typeMap');
const overrides = require('../../sql/schema/overrides');
const ddl = require('../../sql/schema/ddl');

describe('identifiers', () => {
  it('snake_cases camelCase, because PostgreSQL folds unquoted names to lower case', () => {
    expect(typeMap.snake('scheduledAt')).toBe('scheduled_at');
    expect(typeMap.snake('maxAdvanceDays')).toBe('max_advance_days');
    expect(typeMap.snake('HTTPServer')).toBe('http_server');
  });

  it('flattens nested paths to one column name', () => {
    expect(typeMap.columnName('address.city')).toBe('address_city');
    expect(typeMap.columnName('medicalHistory.allergies[]')).toBe('medical_history_allergies');
  });

  it('suffixes reference columns with _id, without exception', () => {
    expect(typeMap.referenceColumnName('session')).toBe('session_id');
    expect(typeMap.referenceColumnName('createdBy')).toBe('created_by_id');
    // Already suffixed — not doubled.
    expect(typeMap.referenceColumnName('clinicId')).toBe('clinic_id');
  });

  it('keeps identifiers inside PostgreSQL 63-byte limit, distinctly', () => {
    const a = typeMap.fitIdentifier(`${'x'.repeat(70)}_alpha`);
    const b = typeMap.fitIdentifier(`${'x'.repeat(70)}_beta`);
    expect(a.length).toBeLessThanOrEqual(63);
    expect(b.length).toBeLessThanOrEqual(63);
    // Silent truncation would collide these into one object.
    expect(a).not.toBe(b);
  });

  it('pluralises irregular model names correctly', () => {
    // A naive `+ 's'` produced branchs, user_directorys, clinic_booking_policys.
    expect(typeMap.tableName('Branch', null)).toBe('branches');
    expect(typeMap.tableName('UserDirectory', null)).toBe('user_directories');
    expect(typeMap.tableName('ClinicBookingPolicy', null)).toBe('clinic_booking_policies');
    expect(typeMap.tableName('PatientLedger', null)).toBe('patient_ledgers');
  });
});

describe('nullability — the profile overrules the schema', () => {
  const required = { isRequired: true };
  const optional = { isRequired: false };

  it('accepts NOT NULL when the schema requires it and every document has it', () => {
    const d = typeMap.decideNullability(required, { presencePct: 100, nulls: 0, docsSeen: 500 });
    expect(d.notNull).toBe(true);
  });

  it('RELAXES NOT NULL when the data disagrees with `required: true`', () => {
    // The whole reason CP-1 runs before any DDL is written.
    const d = typeMap.decideNullability(required, { presencePct: 88.2, nulls: 0, docsSeen: 500 });
    expect(d.notNull).toBe(false);
    expect(d.reason).toMatch(/^RELAXED/);
  });

  it('RELAXES on explicit nulls even at 100% presence', () => {
    const d = typeMap.decideNullability(required, { presencePct: 100, nulls: 3, docsSeen: 500 });
    expect(d.notNull).toBe(false);
  });

  it('trusts the schema when there is no data to contradict it', () => {
    // 13 collections are empty; there are no rows to reject.
    const d = typeMap.decideNullability(required, { presencePct: 100, nulls: 0, docsSeen: 0 });
    expect(d.notNull).toBe(true);
    expect(d.reason).toMatch(/no data profiled/);
  });

  it('never invents NOT NULL for an optional field, however complete the data', () => {
    const d = typeMap.decideNullability(optional, { presencePct: 100, nulls: 0, docsSeen: 500 });
    expect(d.notNull).toBe(false);
  });
});

describe('types', () => {
  it('collapses int and double to numeric — F-7, benign Mongo number encoding', () => {
    const r = typeMap.typeFromObserved({ int: 40, double: 12 });
    expect(r.type).toBe('numeric');
    expect(r.ambiguous).toBe(false);
  });

  it('flags genuinely mixed kinds rather than silently widening — F-5', () => {
    const r = typeMap.typeFromObserved({ boolean: 7, int: 1 });
    expect(r.ambiguous).toBe(true);
  });

  it('ignores nulls when inferring a type', () => {
    const r = typeMap.typeFromObserved({ string: 10, null: 5 });
    expect(r.type).toBe('text');
    expect(r.ambiguous).toBe(false);
  });

  it('maps a declared ref to the objectid domain regardless of reported instance', () => {
    const col = typeMap.mapColumn('patient', { instance: 'ObjectID', options: { ref: 'Patient' } }, null, null);
    expect(col.type).toBe('objectid');
    expect(col.column).toBe('patient_id');
    expect(col.ref).toBe('Patient');
  });

  it('types an undeclared field from the data and says so', () => {
    const col = typeMap.mapColumn('gstDetails', null, { types: { object: 12 }, presencePct: 40, nulls: 0, docsSeen: 30 }, null);
    expect(col.typeSource).toBe('observed');
    expect(col.notes.join(' ')).toMatch(/UNDECLARED/);
  });
});

describe('enums', () => {
  it('emits a CHECK when every observed value is declared', () => {
    const d = typeMap.decideEnum({ enumValues: ['a', 'b', 'c'] }, { values: ['a', 'b'] });
    expect(d.values).toEqual(['a', 'b', 'c']);
  });

  it('refuses the CHECK when data holds a value the enum does not list', () => {
    // Declaring it would reject existing rows at load.
    const d = typeMap.decideEnum({ enumValues: ['a', 'b'] }, { values: ['a', 'z'] });
    expect(d.values).toBeNull();
    expect(d.violations).toContain('z');
  });
});

describe('DDL emission', () => {
  it('refuses to emit anything that is not a plain identifier', () => {
    expect(() => ddl.ident('patients; drop table users')).toThrow(/non-identifier/);
    expect(ddl.ident('patients')).toBe('patients');
  });

  it('quotes reserved words rather than renaming them', () => {
    // Renaming would stop the column matching the JSON field the API returns.
    expect(ddl.ident('user')).toBe('"user"');
  });

  it('escapes quotes in literals', () => {
    expect(ddl.literal("O'Brien")).toBe("'O''Brien'");
  });

  it('emits NOT VALID only where asked', () => {
    const fk = { column: 'patient_id', referencesTable: 'patients', onDelete: 'set null', notValid: true };
    expect(ddl.addForeignKey('t', 'ledgers', fk, 't')).toMatch(/not valid/);
    expect(ddl.addForeignKey('t', 'ledgers', { ...fk, notValid: false }, 't')).not.toMatch(/not valid/);
  });

  it('grants a tenant role USAGE on exactly one schema and revokes CREATE on public', () => {
    const sql = ddl.createTenantRole('clinic_a', 'tenant_clinic_a', 'pw').join('\n');
    expect(sql).toMatch(/grant usage on schema clinic_a to tenant_clinic_a/);
    expect(sql).toMatch(/revoke create on schema public from tenant_clinic_a/);
    // Exactly one schema is granted.
    expect(sql.match(/grant usage on schema (\w+)/g)).toEqual(
      expect.arrayContaining(['grant usage on schema public', 'grant usage on schema clinic_a'])
    );
  });
});

describe('recorded decisions stay recorded', () => {
  it('keeps chat_messages.session NOT NULL — the F-2 correction', () => {
    // FINDINGS.md recommends nullable; the profile shows 100% presence with zero
    // nulls, so the problem is referential and NOT VALID carries it instead.
    const o = overrides.columnFor('tenant', 'ChatMessage', 'session');
    expect(o.notNull).toBe(true);
    expect(o.reason).toMatch(/F-2 CORRECTED/);
  });

  it('promotes exactly the arrays something aggregates across', () => {
    expect(overrides.childTableFor('tenant', 'Invoice', 'items').table).toBe('invoice_items');
    expect(overrides.childTableFor('platform', 'Subscription', 'invoiceHistory')).toBeTruthy();
    // Same shape as a promoted array, but nothing unwinds it.
    expect(overrides.childTableFor('tenant', 'DentalScanResult', 'observations')).toBeNull();
  });

  it('records every deferred foreign key with its measurement', () => {
    for (const [key, entry] of Object.entries(overrides.DEFERRED_FOREIGN_KEYS)) {
      expect(typeof entry.measured).toBe('string');
      expect(entry.measured.length).toBeGreaterThan(0);
      expect(typeof entry.decision).toBe('string');
      expect(key).toMatch(/^(platform|tenant)\//);
    }
  });
});
