'use strict';

/**
 * MongoDB document -> PostgreSQL row.
 *
 * Pure functions, unit-tested in tests/unit/sqlEtl.test.js. The ETL runner does
 * the I/O; every decision about what a value *becomes* is here, so it can be
 * tested against a literal document rather than against a database.
 *
 * The governing rule is that a value is carried across unchanged unless there is
 * a recorded reason to change it. Every transform that is not the identity is
 * either a representation change the column type forces (ObjectId to hex, an
 * object to jsonb) or a coercion named in overrides.js with a CP-1 finding behind
 * it. Anything else is drift introduced by the migration itself, which is the one
 * class of defect no amount of row-count checking will find.
 */

/* ── Scalars ───────────────────────────────────────────────── */

const HEX24 = /^[0-9a-fA-F]{24}$/;

/**
 * ObjectId -> its 24-character hex string.
 *
 * Accepts a BSON ObjectId, a string that is already hex, and `{ $oid }` from an
 * extended-JSON export. Anything else returns null *and is reported* rather than
 * being coerced -- a reference that silently becomes null is a row that loses its
 * parent, which row counts and foreign keys both fail to notice.
 */
function toObjectId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return HEX24.test(value) ? value : undefined;
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return String(value);
  if (typeof value === 'object' && typeof value.$oid === 'string') {
    return HEX24.test(value.$oid) ? value.$oid : undefined;
  }
  return undefined;
}

/**
 * Dates pass through as Date objects and the driver writes the instant.
 *
 * No timezone arithmetic anywhere in this file, deliberately. `scheduledAt` holds
 * clinic wall-clock time labelled as UTC; that convention is wrong but it is the
 * one the whole application renders through, and moving the instant here would
 * shift every appointment by 5.5 hours while every row count and every foreign key
 * stayed perfectly green. CP-5 is the gate that catches it, and this comment is
 * the reason it should never have to.
 */
function toTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'object' && value.$date !== undefined) {
    const d = new Date(value.$date);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Numbers reach `numeric` as strings.
 *
 * A JavaScript number is a double, and passing one to a numeric column routes the
 * value through binary floating point on the way in -- which is how an invoice
 * total of 1234.56 can land as 1234.5599999999999. Formatting to a decimal string
 * first keeps the exact value the document held, which is the whole reason these
 * columns are `numeric` rather than `double precision`.
 */
function toNumeric(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'bigint') return value.toString();
  if (value && value._bsontype === 'Decimal128') return value.toString();
  if (value && typeof value.valueOf === 'function' && typeof value.valueOf() === 'number') {
    const n = value.valueOf();
    return Number.isFinite(n) ? String(n) : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return value.trim();
  return undefined;
}

function toBoolean(value, coerce) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;

  // F-5: `featureflags.defaultValue` is declared Boolean and one document holds
  // an int. Coercion happens only where a recorded finding asks for it, so an
  // unexpected int elsewhere is reported rather than quietly becoming `true`.
  if (coerce === 'intToBool' && (value === 0 || value === 1)) return value === 1;
  return undefined;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  return undefined;
}

/**
 * Anything jsonb-shaped is serialised with BSON types unwrapped.
 *
 * ObjectIds and Dates nested inside a Mixed field would otherwise serialise as
 * `{}` -- `JSON.stringify(new ObjectId())` has no useful default. F-6 records two
 * fields that hold ObjectIds inside Mixed metadata, so this is not hypothetical:
 * without the unwrapping those ids would arrive as empty objects and nothing
 * would report a problem.
 */
function toJsonb(value) {
  if (value === undefined) return null;
  return JSON.stringify(unwrapBson(value));
}

function unwrapBson(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value && value._bsontype === 'Decimal128') return value.toString();
  if (value && value._bsontype === 'Long') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(unwrapBson);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = unwrapBson(v);
    return out;
  }
  return value;
}

/**
 * F-5, applied to a Map's values rather than to a column.
 *
 * `planDefaults` is a Mongoose Map, so it is one jsonb column and the int/boolean
 * drift lives inside the JSON where no column type can reject it. Without this the
 * drift would survive the migration untouched and CP-4 would stay green, because
 * nothing it checks would notice.
 */
function coerceMapValues(value, coerce) {
  if (coerce !== 'intToBoolMapValues' || !value || typeof value !== 'object') return { value, changed: [] };
  const changed = [];
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === 0 || v === 1) { out[k] = v === 1; changed.push(k); } else out[k] = v;
  }
  return { value: out, changed };
}

/* ── Path resolution ───────────────────────────────────────── */

/** Read `address.city` out of a document. */
function readPath(doc, mongoPath) {
  if (!mongoPath) return undefined;
  let cur = doc;
  for (const part of mongoPath.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    // A Map arrives from the driver as a plain object; from Mongoose as a Map.
    if (cur instanceof Map) cur = cur.get(part);
    else if (typeof cur !== 'object') return undefined;
    else cur = cur[part];
  }
  return cur;
}

/* ── One column ────────────────────────────────────────────── */

/**
 * Convert one document value for one column spec.
 *
 * Returns `{ value, problem }`. `problem` is set when the value could not be
 * converted -- never thrown, because one malformed document out of 50,000 should
 * be reported alongside the other 49,999 rather than aborting the load and losing
 * the report.
 */
function convert(col, raw) {
  const missing = raw === undefined;
  const fail = (why) => ({ value: null, problem: `${col.column}: ${why} (${describe(raw)})` });

  if (missing || raw === null) {
    if (col.notNull && col.default === undefined) {
      return { value: null, problem: `${col.column}: NOT NULL but the document has no value` };
    }
    return { value: null, problem: null };
  }

  let value;
  switch (col.type) {
    case 'objectid':
      value = toObjectId(raw);
      return value === undefined ? fail('not a valid ObjectId') : { value, problem: null };

    case 'timestamptz':
      value = toTimestamp(raw);
      return value === undefined ? fail('not a valid date') : { value, problem: null };

    case 'numeric':
      value = toNumeric(raw);
      return value === undefined ? fail('not a valid number') : { value, problem: null };

    case 'boolean':
      value = toBoolean(raw, col.coerce);
      return value === undefined ? fail('not a boolean') : { value, problem: null };

    case 'integer': {
      const n = Number(raw);
      return Number.isInteger(n) ? { value: n, problem: null } : fail('not an integer');
    }

    case 'text':
      value = toText(raw);
      return value === undefined ? fail('not representable as text') : { value, problem: null };

    case 'bytea':
      if (Buffer.isBuffer(raw)) return { value: raw, problem: null };
      if (raw && raw.buffer) return { value: Buffer.from(raw.buffer), problem: null };
      return fail('not binary data');

    case 'jsonb': {
      const { value: coerced, changed } = coerceMapValues(raw, col.coerce);
      return {
        value: toJsonb(coerced),
        problem: null,
        note: changed.length ? `${col.column}: coerced int->bool for key(s) ${changed.join(', ')} (F-5)` : null,
      };
    }

    default:
      return { value: toJsonb(raw), problem: null };
  }
}

function describe(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (v instanceof Date) return 'Date';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (v && v._bsontype) return v._bsontype;
  return typeof v;
}

/* ── One row ───────────────────────────────────────────────── */

/**
 * Build the row for a table's own columns.
 *
 * `clinicId` is supplied by the caller rather than read from the document: tenant
 * documents do not carry it (each clinic has its own database today), and plan
 * section 2.2 rule 1 requires the column on every tenant table from day one.
 */
function buildRow(table, doc, { clinicId } = {}) {
  const row = {};
  const problems = [];
  const notes = [];

  for (const col of table.columns) {
    if (col.column === 'clinic_id' && !col.mongoPath) {
      row.clinic_id = clinicId || null;
      if (!clinicId) problems.push('clinic_id: no clinic id supplied for a tenant row');
      continue;
    }
    const { value, problem, note } = convert(col, readPath(doc, col.mongoPath));
    row[col.column] = value;
    if (problem) problems.push(problem);
    if (note) notes.push(note);
  }
  return { row, problems, notes };
}

/**
 * Rows for a promoted array.
 *
 * `line_no` preserves the array's position. A Mongo array is ordered and the API
 * returns it in that order; `select * from invoice_items` has no order at all
 * unless one is stored, so without this the port passes its tests and then returns
 * invoice lines in a different order than the customer's last statement.
 */
function buildChildRows(child, doc, parentId, { clinicId } = {}) {
  const source = readPath(doc, child.mongoPath);
  if (!Array.isArray(source)) return { rows: [], problems: [] };

  const parentColumn = child.columns[0].column;
  const orderColumn = child.columns.find((c) => c.column === 'line_no') ? 'line_no' : null;
  const rows = [];
  const problems = [];

  source.forEach((element, i) => {
    const row = { [parentColumn]: parentId };
    if (clinicId) row.clinic_id = clinicId;
    if (orderColumn) row[orderColumn] = i;

    for (const col of child.columns) {
      if (col.column === parentColumn || col.column === orderColumn || col.column === 'clinic_id') continue;
      const path = col.column === 'mongo_subdoc_id' ? '_id' : col.mongoPath;
      const { value, problem } = convert(col, readPath(element, path));
      row[col.column] = value;
      if (problem) problems.push(`${child.table}[${i}].${problem}`);
    }
    rows.push(row);
  });

  return { rows, problems };
}

/** Rows for an array of references promoted to a junction table. */
function buildJunctionRows(junction, doc, parentId, { clinicId } = {}) {
  const source = readPath(doc, junction.mongoPath);
  if (!Array.isArray(source)) return { rows: [], problems: [] };

  const rows = [];
  const problems = [];
  const seen = new Set();

  source.forEach((element, i) => {
    const target = toObjectId(element);
    if (target === undefined || target === null) {
      problems.push(`${junction.table}[${i}]: not a valid ObjectId (${describe(element)})`);
      return;
    }
    // The junction's primary key is (parent, target); Mongo arrays permit
    // duplicates and a repeated member would abort the whole batch on conflict.
    if (seen.has(target)) {
      problems.push(`${junction.table}[${i}]: duplicate reference ${target} in the source array, kept once`);
      return;
    }
    seen.add(target);

    const row = { [junction.parentColumn]: parentId, [junction.targetColumn]: target };
    if (clinicId) row.clinic_id = clinicId;
    rows.push(row);
  });

  return { rows, problems };
}

module.exports = {
  toObjectId,
  toTimestamp,
  toNumeric,
  toBoolean,
  toText,
  toJsonb,
  unwrapBson,
  coerceMapValues,
  readPath,
  convert,
  buildRow,
  buildChildRows,
  buildJunctionRows,
};
