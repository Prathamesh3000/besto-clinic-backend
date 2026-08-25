'use strict';

/**
 * Pure document-analysis functions used by the CP-1 profiler.
 *
 * Separated from scripts/sql/profile-mongo.js so the logic that decides column
 * types and nullability can be unit-tested against known documents, rather than
 * only observed by pointing it at a live database. The rules encoded here are
 * what the DDL is derived from — they need to be verifiable in isolation.
 */

/** Distinct-value tracking stops here; beyond it a field is not enum-shaped. */
const CARDINALITY_CAP = 50;

/** Nesting deeper than this explodes the field table without informing the DDL. */
const MAX_DEPTH = 4;

/**
 * Report the storage type of a value as the migration cares about it.
 *
 * `int` and `double` are reported separately because they map to different SQL
 * column types. A field holding both is a decision to make deliberately, not to
 * discover when a numeric cast fails mid-load.
 */
function bsonType(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return 'binary';
  if (v && typeof v === 'object' && v._bsontype) {
    return String(v._bsontype).toLowerCase() === 'objectid' ? 'objectId' : String(v._bsontype).toLowerCase();
  }
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'object') return 'object';
  return typeof v; // string | boolean
}

/** A fresh accumulator for one field path. */
function newField() {
  return {
    present: 0,
    types: {},
    nulls: 0,
    emptyStrings: 0,
    emptyArrays: 0,
    maxStringLength: 0,
    arrayLengths: { max: 0, sum: 0, count: 0 },
    distinct: new Set(),
  };
}

/**
 * Walk one document, accumulating statistics for every field path it contains.
 *
 * Arrays are recorded twice over: the array field itself carries length
 * statistics (which drive the child-table vs JSONB decision), and its elements
 * are profiled under a `[]` path segment — so `payments[].amount` becomes a
 * field in its own right.
 *
 * @param {object} doc     document to walk
 * @param {object} fields  accumulator map, mutated in place
 */
function walk(doc, fields, prefix = '', depth = 0) {
  if (depth > MAX_DEPTH || !doc || typeof doc !== 'object') return;

  for (const [key, value] of Object.entries(doc)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    const field = (fields[dotted] ||= newField());
    const type = bsonType(value);

    field.present += 1;
    field.types[type] = (field.types[type] || 0) + 1;

    if (type === 'null') {
      field.nulls += 1;
      continue;
    }

    if (type === 'string') {
      if (value === '') field.emptyStrings += 1;
      if (value.length > field.maxStringLength) field.maxStringLength = value.length;
      if (field.distinct.size < CARDINALITY_CAP) field.distinct.add(value);
      continue;
    }

    if (type === 'array') {
      if (value.length === 0) field.emptyArrays += 1;
      field.arrayLengths.count += 1;
      field.arrayLengths.sum += value.length;
      if (value.length > field.arrayLengths.max) field.arrayLengths.max = value.length;

      for (const element of value) {
        const elementType = bsonType(element);
        const elementField = (fields[`${dotted}[]`] ||= newField());
        elementField.present += 1;
        elementField.types[elementType] = (elementField.types[elementType] || 0) + 1;
        if (elementType === 'object') walk(element, fields, `${dotted}[]`, depth + 1);
      }
      continue;
    }

    if (type === 'object') {
      walk(value, fields, dotted, depth + 1);
      continue;
    }

    if (type === 'boolean' || type === 'int') {
      if (field.distinct.size < CARDINALITY_CAP) field.distinct.add(value);
    }
  }
}

/**
 * Classify what a field holding several types actually means for the DDL.
 *
 * Not all type mixing is drift. MongoDB stores the JavaScript number `100` as
 * int32 and `100.50` as a double, so every money column in the database reports
 * both — that is normal encoding, and `numeric` holds it losslessly.
 *
 * An ObjectId field that also contains strings is a different matter entirely:
 * something wrote a different kind of value, and the migration must decide what
 * to do with it. Reporting both cases with equal alarm buries the real problem
 * among dozens of benign ones.
 *
 * @returns {'none'|'numeric'|'real'}
 */
function classifyMixedTypes(nonNullTypes) {
  if (nonNullTypes.length <= 1) return 'none';

  const NUMERIC = new Set(['int', 'double', 'decimal', 'long']);
  if (nonNullTypes.every((t) => NUMERIC.has(t))) return 'numeric';

  return 'real';
}

/**
 * Turn raw accumulators into the reported shape.
 *
 * `mixedTypes` is the most consequential output: more than one non-null type on
 * a path means no single SQL column can hold it as it stands, and the migration
 * must either coerce the values or widen the column.
 *
 * @param {object} fields   accumulator map from walk()
 * @param {number} scanned  documents examined, for presence percentages
 * @param {Set<string>} declaredPaths  paths the Mongoose schema declares
 */
function summarizeFields(fields, scanned, declaredPaths = new Set()) {
  const out = {};

  for (const [pathName, f] of Object.entries(fields)) {
    const types = Object.entries(f.types).sort((a, b) => b[1] - a[1]);
    const nonNullTypes = types.filter(([t]) => t !== 'null');

    out[pathName] = {
      presencePct: scanned === 0 ? 0 : Number(((f.present / scanned) * 100).toFixed(2)),
      mixedTypes: nonNullTypes.length > 1,
      mixedTypeSeverity: classifyMixedTypes(nonNullTypes.map(([t]) => t)),
      types: Object.fromEntries(types),
      nulls: f.nulls,
      emptyStrings: f.emptyStrings || undefined,
      maxStringLength: f.maxStringLength || undefined,
      arrayStats: f.arrayLengths.count
        ? {
          max: f.arrayLengths.max,
          avg: Number((f.arrayLengths.sum / f.arrayLengths.count).toFixed(2)),
          emptyCount: f.emptyArrays,
        }
        : undefined,
      lowCardinalityValues:
        f.distinct.size > 0 && f.distinct.size < CARDINALITY_CAP ? [...f.distinct].slice(0, 25) : undefined,
      declaredInSchema:
        declaredPaths.has(pathName) || declaredPaths.has(pathName.replace(/\[\]/g, '')),
    };
  }

  return out;
}

/**
 * Recommend a PostgreSQL column type for a profiled field.
 *
 * Advisory only — the DDL is written by hand against the profile. This exists
 * so the mapping document starts from measured data rather than a blank page,
 * and so any field it cannot resolve is surfaced rather than assumed.
 */
function suggestColumnType(report) {
  const nonNull = Object.keys(report.types).filter((t) => t !== 'null');

  if (nonNull.length === 0) return { type: 'text', note: 'only nulls observed — verify before choosing' };

  // int + double together is MongoDB's normal number encoding, not drift.
  if (report.mixedTypeSeverity === 'numeric') {
    return { type: 'numeric', note: 'int and double are how Mongo stores whole vs fractional numbers — numeric holds both losslessly' };
  }
  if (report.mixedTypeSeverity === 'real') {
    return { type: 'jsonb', note: `genuinely mixed types: ${nonNull.join(', ')} — needs an explicit decision` };
  }

  switch (nonNull[0]) {
    case 'objectId':
      return { type: 'uuid', note: 'ObjectId mapped through the id translation table' };
    case 'date':
      return { type: 'timestamptz', note: 'verify against the fake-UTC convention for scheduledAt' };
    case 'boolean':
      return { type: 'boolean' };
    case 'int':
      return { type: 'integer' };
    case 'double':
      return { type: 'numeric', note: 'numeric, not float — money and measurements must not drift' };
    case 'array':
      return report.arrayStats && report.arrayStats.max > 0
        ? { type: 'child table or jsonb', note: `max ${report.arrayStats.max}, avg ${report.arrayStats.avg} elements` }
        : { type: 'jsonb', note: 'always empty in the sample' };
    case 'object':
      return { type: 'jsonb', note: 'nested object — flatten to columns only if the shape is stable' };
    case 'string': {
      if (report.lowCardinalityValues && report.lowCardinalityValues.length <= 25) {
        return { type: 'text + CHECK constraint', note: `enum-shaped: ${report.lowCardinalityValues.length} distinct values` };
      }
      return { type: 'text', note: report.maxStringLength ? `longest observed: ${report.maxStringLength}` : undefined };
    }
    default:
      return { type: 'text', note: `unrecognised type: ${nonNull[0]}` };
  }
}

module.exports = {
  CARDINALITY_CAP,
  MAX_DEPTH,
  bsonType,
  newField,
  walk,
  classifyMixedTypes,
  summarizeFields,
  suggestColumnType,
};
