'use strict';

/**
 * Unit tests for the CP-1 profiler's analysis rules.
 *
 * These matter more than their size suggests: the profile is the authority for
 * every nullability and column-type decision in the DDL. If the analysis is
 * wrong, the schema is wrong, and it is wrong quietly.
 *
 * Everything here runs against hand-built documents, so it needs no database.
 */

const {
  bsonType,
  walk,
  classifyMixedTypes,
  summarizeFields,
  suggestColumnType,
} = require('../../sql/analyze');

/** Stand-in for a BSON ObjectId — the driver tags them with `_bsontype`. */
function oid(hex = '507f1f77bcf86cd799439011') {
  return { _bsontype: 'ObjectId', toHexString: () => hex, toString: () => hex };
}

/** Walk a set of documents and return the summarised field report. */
function profile(docs, declared = new Set()) {
  const fields = {};
  for (const d of docs) walk(d, fields);
  return summarizeFields(fields, docs.length, declared);
}

describe('bsonType', () => {
  it('separates integers from doubles, because they map to different SQL types', () => {
    expect(bsonType(42)).toBe('int');
    expect(bsonType(42.5)).toBe('double');
  });

  it('reports null and undefined alike — both mean "absent" for nullability', () => {
    expect(bsonType(null)).toBe('null');
    expect(bsonType(undefined)).toBe('null');
  });

  it('recognises ObjectIds by their bson tag', () => {
    expect(bsonType(oid())).toBe('objectId');
  });

  it('distinguishes arrays, dates and plain objects', () => {
    expect(bsonType([])).toBe('array');
    expect(bsonType(new Date())).toBe('date');
    expect(bsonType({ a: 1 })).toBe('object');
  });
});

describe('presence and nullability', () => {
  it('computes the presence percentage a NOT NULL decision depends on', () => {
    const report = profile([
      { name: 'A', phone: '111' },
      { name: 'B', phone: '222' },
      { name: 'C' },                 // phone absent
      { name: 'D' },
    ]);

    expect(report.name.presencePct).toBe(100);
    expect(report.phone.presencePct).toBe(50);
  });

  it('counts an explicit null as present-but-null, not as absent', () => {
    // The distinction matters: an explicit null is a value the column must
    // accept, whereas an absent field may still permit NOT NULL with a default.
    const report = profile([{ email: null }, { email: 'a@b.c' }]);

    expect(report.email.presencePct).toBe(100);
    expect(report.email.nulls).toBe(1);
  });

  it('counts empty strings separately from nulls', () => {
    const report = profile([{ note: '' }, { note: 'text' }, { note: '' }]);

    expect(report.note.emptyStrings).toBe(2);
    expect(report.note.nulls).toBe(0);
  });
});

describe('mixed-type detection', () => {
  it('flags a field holding more than one non-null type', () => {
    // This is the headline failure the profiler exists to catch: a field the
    // schema calls a Number that contains strings in older documents.
    const report = profile([{ age: 30 }, { age: '31' }, { age: 32 }]);

    expect(report.age.mixedTypes).toBe(true);
    expect(report.age.types).toEqual({ int: 2, string: 1 });
  });

  it('does not flag a consistent field that merely contains nulls', () => {
    const report = profile([{ age: 30 }, { age: null }, { age: 32 }]);

    expect(report.age.mixedTypes).toBe(false);
  });

  it('routes a genuinely mixed field to jsonb rather than guessing a column type', () => {
    const report = profile([{ v: 1 }, { v: 'one' }]);

    const suggestion = suggestColumnType(report.v);
    expect(suggestion.type).toBe('jsonb');
    expect(suggestion.note).toMatch(/explicit decision/);
  });
});

describe('classifying what mixed types mean', () => {
  // Mongo stores 100 as int32 and 100.50 as a double, so every money column in
  // the database reports both. Treating that as drift buries the real findings
  // among dozens of harmless ones.
  it('treats int + double as benign numeric encoding, not drift', () => {
    expect(classifyMixedTypes(['int', 'double'])).toBe('numeric');
  });

  it('treats objectId + string as genuine drift', () => {
    expect(classifyMixedTypes(['objectId', 'string'])).toBe('real');
  });

  it('treats boolean + int as genuine drift', () => {
    expect(classifyMixedTypes(['boolean', 'int'])).toBe('real');
  });

  it('reports a single type as not mixed at all', () => {
    expect(classifyMixedTypes(['string'])).toBe('none');
    expect(classifyMixedTypes([])).toBe('none');
  });

  it('suggests numeric — not jsonb — for a money field spanning int and double', () => {
    const report = profile([{ subtotal: 100 }, { subtotal: 100.5 }, { subtotal: 250 }]);

    expect(report.subtotal.mixedTypeSeverity).toBe('numeric');
    expect(suggestColumnType(report.subtotal).type).toBe('numeric');
  });

  it('still routes an id field holding strings to jsonb for a decision', () => {
    const report = profile([{ appointmentId: oid() }, { appointmentId: '507f1f77bcf86cd799439011' }]);

    expect(report.appointmentId.mixedTypeSeverity).toBe('real');
    expect(suggestColumnType(report.appointmentId).type).toBe('jsonb');
  });
});

describe('reference deduplication (orphan detection)', () => {
  // Regression test for a real defect in the profiler: `new Set()` over ObjectId
  // *instances* does not deduplicate by value, because each is a distinct
  // object. countDocuments() counts distinct documents, so comparing the two
  // reported every repeated reference as missing — 500 access logs pointing at
  // 10 real users came back as "98% orphaned".
  function dedupeById(docs, field) {
    const byHex = new Map();
    for (const doc of docs) {
      const value = doc[field];
      for (const id of Array.isArray(value) ? value : [value]) {
        if (id) byHex.set(String(id), id);
      }
    }
    return [...byHex.values()];
  }

  it('deduplicates repeated ObjectId references by value', () => {
    const shared = () => oid('507f1f77bcf86cd799439011');
    const docs = [{ user: shared() }, { user: shared() }, { user: shared() }];

    // The naive approach the bug used:
    expect(new Set(docs.map((d) => d.user)).size).toBe(3);
    // The corrected one:
    expect(dedupeById(docs, 'user')).toHaveLength(1);
  });

  it('keeps genuinely distinct references separate', () => {
    const docs = [
      { user: oid('507f1f77bcf86cd799439011') },
      { user: oid('507f1f77bcf86cd799439022') },
      { user: oid('507f1f77bcf86cd799439011') },
    ];

    expect(dedupeById(docs, 'user')).toHaveLength(2);
  });

  it('flattens array-valued references', () => {
    const docs = [{ branches: [oid('aaa'), oid('bbb')] }, { branches: [oid('aaa')] }];

    expect(dedupeById(docs, 'branches')).toHaveLength(2);
  });
});

describe('nested objects and arrays', () => {
  it('profiles nested object fields by dotted path', () => {
    const report = profile([
      { address: { city: 'Pune', zip: '411001' } },
      { address: { city: 'Mumbai' } },
    ]);

    expect(report['address.city'].presencePct).toBe(100);
    expect(report['address.zip'].presencePct).toBe(50);
  });

  it('records array length statistics that drive the child-table decision', () => {
    const report = profile([
      { items: [1, 2, 3] },
      { items: [1] },
      { items: [] },
    ]);

    expect(report.items.arrayStats.max).toBe(3);
    expect(report.items.arrayStats.emptyCount).toBe(1);
  });

  it('profiles array element fields under a [] segment', () => {
    const report = profile([
      { payments: [{ amount: 100, mode: 'cash' }, { amount: 250, mode: 'card' }] },
    ]);

    expect(report['payments[].amount'].types).toEqual({ int: 2 });
    expect(report['payments[].mode'].types).toEqual({ string: 2 });
  });

  it('surfaces mixed types inside array elements, not just at the top level', () => {
    const report = profile([
      { lines: [{ qty: 2 }] },
      { lines: [{ qty: '3' }] },
    ]);

    expect(report['lines[].qty'].mixedTypes).toBe(true);
  });
});

describe('schema drift', () => {
  it('marks fields the Mongoose schema never declared', () => {
    // A schema-derived DDL would silently drop `legacyCode` and lose the data.
    const report = profile(
      [{ name: 'A', legacyCode: 'X-1' }],
      new Set(['name']),
    );

    expect(report.name.declaredInSchema).toBe(true);
    expect(report.legacyCode.declaredInSchema).toBe(false);
  });

  it('matches array element paths back to their declared parent', () => {
    const report = profile(
      [{ tags: ['a', 'b'] }],
      new Set(['tags']),
    );

    expect(report['tags[]'].declaredInSchema).toBe(true);
  });
});

describe('column-type suggestions', () => {
  it('maps ObjectId to uuid', () => {
    const report = profile([{ clinic: oid() }]);
    expect(suggestColumnType(report.clinic).type).toBe('uuid');
  });

  it('maps a double to numeric, not float, so money cannot drift', () => {
    const report = profile([{ total: 10.5 }]);
    const suggestion = suggestColumnType(report.total);

    expect(suggestion.type).toBe('numeric');
    expect(suggestion.note).toMatch(/must not drift/);
  });

  it('flags dates for review against the fake-UTC convention', () => {
    // scheduledAt stores clinic wall-clock time labelled UTC. Migrating it
    // without deciding shifts every appointment by 5.5 hours.
    const report = profile([{ scheduledAt: new Date('2026-06-12T10:00:00.000Z') }]);

    expect(suggestColumnType(report.scheduledAt).note).toMatch(/fake-UTC/);
  });

  it('recognises an enum-shaped string field', () => {
    const docs = ['pending', 'confirmed', 'cancelled', 'pending', 'confirmed']
      .map((status) => ({ status }));
    const report = profile(docs);

    expect(suggestColumnType(report.status).type).toMatch(/CHECK/);
  });

  it('does not treat a high-cardinality string as an enum', () => {
    const docs = Array.from({ length: 60 }, (_, i) => ({ email: `user${i}@example.com` }));
    const report = profile(docs);

    expect(suggestColumnType(report.email).type).toBe('text');
  });

  it('says so plainly when a field held nothing but nulls', () => {
    const report = profile([{ deletedAt: null }, { deletedAt: null }]);
    const suggestion = suggestColumnType(report.deletedAt);

    expect(suggestion.note).toMatch(/verify before choosing/);
  });
});
