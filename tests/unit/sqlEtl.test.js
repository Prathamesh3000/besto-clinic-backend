'use strict';

/**
 * Unit tests for the ETL value transforms and the row <-> document mapping.
 *
 * CP-4 proves the ETL loaded the right number of rows and the right values for a
 * sample. These tests cover the cases a sample of real data will not contain —
 * the malformed document, the drifted type, the value that must NOT be silently
 * coerced — which are exactly the ones that quietly lose data.
 */

const transform = require('../../sql/etl/transform');
const { mapperFor } = require('../../src/db/repository/mapping');

describe('ObjectId conversion', () => {
  it('accepts a hex string unchanged', () => {
    expect(transform.toObjectId('69cfcaf15ed0c70cee242dee')).toBe('69cfcaf15ed0c70cee242dee');
  });

  it('accepts a driver ObjectId via toHexString', () => {
    const fake = { toHexString: () => '69cfcaf15ed0c70cee242dee' };
    expect(transform.toObjectId(fake)).toBe('69cfcaf15ed0c70cee242dee');
  });

  it('accepts extended-JSON $oid', () => {
    expect(transform.toObjectId({ $oid: '69cfcaf15ed0c70cee242dee' })).toBe('69cfcaf15ed0c70cee242dee');
  });

  it('returns undefined — not null — for a value that is not an id', () => {
    // The distinction matters: undefined is reported as a problem, null would be
    // written as a row that quietly lost its parent.
    expect(transform.toObjectId('not-an-id')).toBeUndefined();
    expect(transform.toObjectId('69cfcaf15ed0c70cee242de')).toBeUndefined(); // 23 chars
  });

  it('passes null through as null', () => {
    expect(transform.toObjectId(null)).toBeNull();
  });
});

describe('numeric conversion', () => {
  it('formats as a decimal string so the value does not route through a double', () => {
    // Passing a JS number to a numeric column is how 1234.56 becomes
    // 1234.5599999999999 — these columns hold invoice totals.
    expect(transform.toNumeric(1234.56)).toBe('1234.56');
    expect(transform.toNumeric(100)).toBe('100');
  });

  it('handles Decimal128 by its own string form', () => {
    expect(transform.toNumeric({ _bsontype: 'Decimal128', toString: () => '99.99' })).toBe('99.99');
  });

  it('rejects a non-numeric string rather than producing NaN', () => {
    expect(transform.toNumeric('abc')).toBeUndefined();
    expect(transform.toNumeric(Infinity)).toBeUndefined();
  });
});

describe('boolean coercion is opt-in', () => {
  it('coerces 1/0 only where a finding asked for it (F-5)', () => {
    expect(transform.toBoolean(1, 'intToBool')).toBe(true);
    expect(transform.toBoolean(0, 'intToBool')).toBe(false);
  });

  it('refuses an int where no coercion was declared', () => {
    // Silently turning 1 into true everywhere would hide drift the profile exists
    // to surface.
    expect(transform.toBoolean(1)).toBeUndefined();
  });
});

describe('timestamps carry the instant unchanged', () => {
  it('passes a Date through untouched', () => {
    const d = new Date('2025-09-16T05:30:00.000Z');
    expect(transform.toTimestamp(d).toISOString()).toBe('2025-09-16T05:30:00.000Z');
  });

  it('applies no timezone arithmetic anywhere', () => {
    // scheduledAt holds clinic wall-clock labelled as UTC. Shifting it here would
    // move every appointment by 5.5 hours while row counts stayed perfect.
    const iso = '2025-09-16T05:30:00.000Z';
    expect(transform.toTimestamp(iso).toISOString()).toBe(iso);
  });

  it('rejects an unparseable date', () => {
    expect(transform.toTimestamp('not a date')).toBeUndefined();
  });
});

describe('jsonb serialisation unwraps BSON', () => {
  it('renders a nested ObjectId as its hex string, not {}', () => {
    // F-6 records ObjectIds stored inside Mixed metadata. JSON.stringify has no
    // useful default for them, so without unwrapping they arrive as empty objects.
    const value = { appointmentId: { toHexString: () => '69cfcaf15ed0c70cee242dee' } };
    expect(JSON.parse(transform.toJsonb(value)).appointmentId).toBe('69cfcaf15ed0c70cee242dee');
  });

  it('renders nested Dates as ISO strings', () => {
    const value = { at: new Date('2025-01-01T00:00:00.000Z') };
    expect(JSON.parse(transform.toJsonb(value)).at).toBe('2025-01-01T00:00:00.000Z');
  });

  it('coerces map values only under the F-5 rule', () => {
    const { value, changed } = transform.coerceMapValues({ free: 1, starter: true }, 'intToBoolMapValues');
    expect(value).toEqual({ free: true, starter: true });
    expect(changed).toEqual(['free']);

    const untouched = transform.coerceMapValues({ free: 1 }, undefined);
    expect(untouched.value).toEqual({ free: 1 });
  });
});

describe('path reading', () => {
  it('reads a nested path', () => {
    expect(transform.readPath({ address: { city: 'Pune' } }, 'address.city')).toBe('Pune');
  });

  it('returns undefined rather than throwing on a missing branch', () => {
    expect(transform.readPath({}, 'address.city')).toBeUndefined();
  });

  it('reads through a Map', () => {
    expect(transform.readPath({ planDefaults: new Map([['free', 3]]) }, 'planDefaults.free')).toBe(3);
  });
});

describe('column conversion reports rather than throws', () => {
  it('reports a NOT NULL column with no value', () => {
    const { value, problem } = transform.convert(
      { column: 'name', type: 'text', notNull: true }, undefined
    );
    expect(value).toBeNull();
    expect(problem).toMatch(/NOT NULL/);
  });

  it('reports an unconvertible value instead of writing null silently', () => {
    const { problem } = transform.convert({ column: 'patient_id', type: 'objectid' }, 'garbage');
    expect(problem).toMatch(/not a valid ObjectId/);
  });

  it('allows a missing nullable column with no complaint', () => {
    const { value, problem } = transform.convert({ column: 'notes', type: 'text', notNull: false }, undefined);
    expect(value).toBeNull();
    expect(problem).toBeNull();
  });
});

describe('promoted arrays', () => {
  const child = {
    table: 'invoice_items',
    mongoPath: 'items',
    columns: [
      { column: 'invoice_id', type: 'objectid', notNull: true },
      { column: 'line_no', type: 'integer', notNull: true },
      { column: 'description', mongoPath: 'description', type: 'text', notNull: true },
      { column: 'total', mongoPath: 'total', type: 'numeric', notNull: true },
    ],
  };

  it('preserves array order as line_no', () => {
    // Without it, SELECT returns invoice lines in an undefined order and the port
    // silently reorders what the customer last saw.
    const doc = { items: [{ description: 'A', total: 10 }, { description: 'B', total: 20 }] };
    const { rows } = transform.buildChildRows(child, doc, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rows.map((r) => r.line_no)).toEqual([0, 1]);
    expect(rows.map((r) => r.description)).toEqual(['A', 'B']);
  });

  it('yields nothing when the array is absent', () => {
    expect(transform.buildChildRows(child, {}, 'aaaaaaaaaaaaaaaaaaaaaaaa').rows).toEqual([]);
  });
});

describe('junction rows', () => {
  const junction = {
    table: 'invoice_payments',
    mongoPath: 'payments',
    parentColumn: 'invoice_id',
    targetColumn: 'payment_id',
  };

  it('keeps a repeated reference once and reports it', () => {
    // The junction key is (parent, target); a duplicate would abort the batch.
    const id = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const { rows, problems } = transform.buildJunctionRows(
      junction, { payments: [id, id] }, 'aaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(rows).toHaveLength(1);
    expect(problems.join(' ')).toMatch(/duplicate reference/);
  });

  it('reports a malformed member rather than dropping it silently', () => {
    const { rows, problems } = transform.buildJunctionRows(
      junction, { payments: ['nope'] }, 'aaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(rows).toHaveLength(0);
    expect(problems).toHaveLength(1);
  });
});

describe('row -> document mapping (the shape the API returns)', () => {
  const departments = mapperFor('Department');

  it('emits _id, not id — clients already hold these ids', () => {
    const doc = departments.toDocument({ id: '69cfcaf15ed0c70cee242e38', name: 'Ortho' });
    expect(doc._id).toBe('69cfcaf15ed0c70cee242e38');
    expect(doc.id).toBeUndefined();
  });

  it('trims char(24) padding off ids', () => {
    // char(24) pads on read; untrimmed it compares unequal to the Mongo id and
    // breaks any client doing a string comparison.
    const doc = departments.toDocument({ id: '69cfcaf15ed0c70cee242e38  ', name: 'Ortho' });
    expect(doc._id).toBe('69cfcaf15ed0c70cee242e38');
  });

  it('rebuilds nested objects from flattened columns', () => {
    const patients = mapperFor('Patient');
    const doc = patients.toDocument({
      id: '69cfcaf15ed0c70cee242e38', address_city: 'Pune', address_state: 'MH',
    });
    expect(doc.address).toEqual({ city: 'Pune', state: 'MH' });
  });

  it('omits a nested object whose every leaf is null, as Mongo would', () => {
    // `{ address: {} }` is not the same as no address: clients test truthiness.
    const patients = mapperFor('Patient');
    const doc = patients.toDocument({
      id: '69cfcaf15ed0c70cee242e38', address_city: null, address_state: null,
    });
    expect(doc.address).toBeUndefined();
  });

  it('returns numeric columns as numbers', () => {
    const invoices = mapperFor('Invoice');
    const doc = invoices.toDocument({ id: '69cfcaf15ed0c70cee242e38', total_amount: '1234.56' });
    expect(doc.totalAmount).toBe(1234.56);
  });

  it('maps an API field name back to its column, so modules never name columns', () => {
    expect(departments.columnFor('isActive')).toBe('is_active');
    expect(departments.columnFor('branch')).toBe('branch_id');
  });
});
