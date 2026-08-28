'use strict';

/**
 * PostgreSQL row <-> API document.
 *
 * Built from sql/schema/manifest.json, so the mapping and the DDL cannot drift:
 * both are generated from the same description of every column, including which
 * Mongo path it came from. Hand-maintaining a second copy of 1,581 column names
 * is how a renamed column silently starts returning `undefined` in an API
 * response that still has the right shape.
 *
 * The direction that matters is row -> document. CP-6 compares the Mongo-backed
 * and SQL-backed responses field by field after normalising only key order and
 * absent-vs-null, so anything this gets wrong shows up there as a diff rather
 * than as a plausible-looking response.
 */

const manifest = require('../../../sql/schema/manifest.json');

/* ── Value conversion ──────────────────────────────────────── */

/**
 * `char(24)` pads on read, so every ObjectId comes back with trailing spaces.
 *
 * Left untrimmed it compares unequal to the same id from Mongo, and -- worse --
 * is returned to clients as a 24-character id with padding that breaks any
 * caller doing a string comparison.
 */
const trimId = (v) => (typeof v === 'string' ? v.trim() : v);

/**
 * `numeric` arrives as a string, because a JavaScript number cannot represent
 * every value it can hold. These columns carry invoice totals, so the conversion
 * is deliberate: `Number` is what the Mongo path returned and what CP-6 compares
 * against, and the values in this system are well inside the safe range.
 *
 * If a column ever needs more precision than a double, it should be returned as
 * a string and its consumers taught to handle it -- silently rounding here would
 * be undetectable.
 */
function fromNumeric(v) {
  if (v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function convertOut(col, value) {
  if (value === null || value === undefined) return null;
  switch (col.type) {
    case 'objectid': return trimId(value);
    case 'numeric': return fromNumeric(value);
    case 'jsonb': return typeof value === 'string' ? safeParse(value) : value;
    default: return value;
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

/* ── Path assembly ─────────────────────────────────────────── */

/** Write `address.city` into a nested object, creating levels as needed. */
function setPath(target, mongoPath, value) {
  const parts = mongoPath.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function readPath(source, mongoPath) {
  let cur = source;
  for (const part of mongoPath.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Drop nested objects whose every leaf is null.
 *
 * A row with no address produces `{ address: { street: null, city: null, ... } }`,
 * where Mongo simply omits the field. CP-6 forgives absent-vs-null on a single
 * value but not an object that should not be there, and clients that test
 * `if (patient.address)` would see one that is empty rather than missing.
 */
function pruneEmptyObjects(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      pruneEmptyObjects(v);
      if (Object.keys(v).length === 0) delete obj[k];
    }
  }
  return obj;
}

/* ── Table mappers ─────────────────────────────────────────── */

function buildMapper(spec) {
  const columns = spec.columns.filter((c) => c.mongoPath || c.column === 'clinic_id');

  /** One PostgreSQL row -> the document shape the API already returns. */
  function toDocument(row, { includeClinicId = false } = {}) {
    if (!row) return null;
    const doc = {};

    for (const col of columns) {
      if (col.column === 'clinic_id' && !col.mongoPath) {
        if (includeClinicId) doc.clinicId = trimId(row.clinic_id);
        continue;
      }
      if (!(col.column in row)) continue;

      const value = convertOut(col, row[col.column]);

      // `_id` is the identity the whole application uses, and every client
      // already stores it. It is emitted as `_id`, not `id`, so a ported module's
      // response is indistinguishable from the Mongo one.
      if (col.mongoPath === '_id') { doc._id = value; continue; }

      if (value === null) continue;
      setPath(doc, col.mongoPath, value);
    }
    return pruneEmptyObjects(doc);
  }

  /** A document (or patch) -> the columns to write. */
  function toRow(doc, { clinicId = null } = {}) {
    const row = {};
    for (const col of columns) {
      if (col.column === 'clinic_id' && !col.mongoPath) {
        if (clinicId) row.clinic_id = clinicId;
        continue;
      }
      const value = readPath(doc, col.mongoPath);
      if (value === undefined) continue;
      row[col.column] = col.type === 'jsonb' && value !== null ? JSON.stringify(value) : value;
    }
    return row;
  }

  /**
   * API field name -> column, for callers that filter or sort by name.
   *
   * Exposed so a repository can translate `{ isActive: true }` without any module
   * knowing that the column is `is_active` — rule 2 again.
   */
  const columnFor = (mongoPath) => {
    const col = columns.find((c) => c.mongoPath === mongoPath);
    return col ? col.column : null;
  };

  return { spec, toDocument, toRow, columnFor };
}

/* ── Registry ──────────────────────────────────────────────── */

const byModel = {};
for (const spec of manifest.tables) {
  byModel[spec.model] = buildMapper(spec);
}

/** Mapper for a Mongoose model name, e.g. `mapperFor('Department')`. */
function mapperFor(modelName) {
  const m = byModel[modelName];
  if (!m) throw new Error(`No SQL mapping for model "${modelName}" — is it in the manifest?`);
  return m;
}

module.exports = { mapperFor, buildMapper, convertOut, setPath, readPath, pruneEmptyObjects };
