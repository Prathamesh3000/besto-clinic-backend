'use strict';

/**
 * Mongoose path  ->  PostgreSQL column.
 *
 * Pure functions, no I/O. `build.js` supplies the inputs and writes the output;
 * everything that *decides* anything lives here so it can be unit-tested, in the
 * same spirit as `sql/analyze.js`. The DDL is generated from the output of this
 * module, so a wrong rule here is a wrong column in 74 tables.
 *
 * Two inputs decide every column:
 *
 *   1. the Mongoose path   - what the code *intends* (type, ref, enum, required)
 *   2. the profile evidence - what the data *is* (presence %, observed types, nulls)
 *
 * Where they disagree, the profile wins. That is SQL_MIGRATION_PLAN.md section 4
 * step 2 and it is the entire reason CP-1 runs before any DDL is written: a
 * NOT NULL derived from `required: true` will fail to load against documents
 * written before that validator existed.
 */

/* ── Identifiers ───────────────────────────────────────────── */

/**
 * PostgreSQL folds unquoted identifiers to lower case, so `scheduledAt` and
 * `scheduledat` are the same column and `createdAt`/`createdat` would collide
 * silently. Everything is emitted snake_case and quoted nowhere, which keeps
 * hand-written SQL in the repository layer readable.
 */
function snake(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * PostgreSQL truncates identifiers at 63 bytes *silently*. Two long names that
 * share a prefix then become one object and the second CREATE fails with a
 * confusing duplicate error. Truncating deliberately with a hash suffix keeps
 * them distinct and keeps the failure legible if one ever does collide.
 */
const MAX_IDENT = 63;
function fitIdentifier(name) {
  if (name.length <= MAX_IDENT) return name;
  let h = 5381;
  for (let i = 0; i < name.length; i += 1) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  const suffix = `_${h.toString(36)}`;
  return name.slice(0, MAX_IDENT - suffix.length) + suffix;
}

/** `address.street` -> `address_street`; `items[]` -> `items`. */
function columnName(mongoPath) {
  return fitIdentifier(snake(String(mongoPath).replace(/\[\]$/, '').replace(/\./g, '_')));
}

/**
 * Reference columns carry an `_id` suffix: `session` -> `session_id`,
 * `createdBy` -> `created_by_id`.
 *
 * Mongo names a reference after the thing it points at, because the value can be
 * either an id or — after `populate()` — the whole document. SQL has no such
 * ambiguity and the column only ever holds a key, so the name should say so.
 *
 * The suffix is applied without exception rather than only where it reads well.
 * `created_by_id` is slightly clumsy next to `created_by`, but a rule with
 * aesthetic exceptions is one nobody can predict, and the repository layer maps
 * these names back to the API's field names in one place anyway.
 */
function referenceColumnName(mongoPath) {
  const base = columnName(mongoPath);
  return /_id$/.test(base) ? base : fitIdentifier(`${base}_id`);
}

/**
 * Collection name -> table name.
 *
 * Mongo collection names are already lower-case plurals (`patientledgers`), which
 * are hard to read unsegmented, so the table name is built from the *model* name
 * instead: snake_case it, then pluralise.
 *
 * The pluraliser is Mongoose's own rather than a hand-rolled `+ 's'`. English
 * plurals are irregular in exactly the places this schema lives -- `Branch` ->
 * `branches`, `UserDirectory` -> `user_directories`, `ClinicBookingPolicy` ->
 * `clinic_booking_policies` -- and a naive rule produced `branchs`,
 * `user_directorys` and `clinic_booking_policys`. Using the same function that
 * named the collections also guarantees the table and the collection pluralise
 * the same way, which matters when the ETL maps one to the other.
 */
const mongoosePluralize = require('mongoose').pluralize();

function tableName(modelName, collectionName) {
  if (!modelName) return fitIdentifier(snake(collectionName));
  return fitIdentifier(mongoosePluralize(snake(modelName)));
}

/**
 * Reserved words are quoted rather than renamed. Renaming would make the column
 * no longer match the JSON field the API returns, which CP-6 compares field by
 * field.
 */
const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'authorization',
  'binary', 'both', 'case', 'cast', 'check', 'collate', 'column', 'constraint',
  'create', 'cross', 'current_date', 'current_role', 'current_time',
  'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct',
  'do', 'else', 'end', 'except', 'false', 'for', 'foreign', 'freeze', 'from',
  'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner',
  'intersect', 'into', 'is', 'isnull', 'join', 'leading', 'left', 'like', 'limit',
  'localtime', 'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset',
  'on', 'only', 'or', 'order', 'outer', 'overlaps', 'placing', 'primary',
  'references', 'right', 'select', 'session_user', 'similar', 'some', 'symmetric',
  'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using',
  'verbose', 'when', 'where', 'window', 'with',
]);
const isReserved = (n) => RESERVED.has(String(n).toLowerCase());
const quoteIdent = (n) => (isReserved(n) ? `"${n}"` : n);

/* ── Types ─────────────────────────────────────────────────── */

/**
 * ObjectIds are preserved as their 24-character hex form rather than converted
 * to uuid.
 *
 * The conversion is tempting and wrong here. Every one of the 213 `ref:`
 * declarations, every id embedded inside a Mixed/JSONB field (F-6 records two of
 * them), and every id already returned to and stored by API clients would have
 * to be rewritten consistently in one pass, and any id the mapping missed would
 * become a silent dangling reference. Keeping the value identical makes the ETL
 * a copy, makes foreign keys line up without a translation table, and lets CP-6
 * compare responses byte for byte.
 *
 * A domain rather than a bare char(24) so the shape is enforced once, centrally,
 * and shows up as a named type in the schema.
 */
const OBJECTID_DOMAIN = 'objectid';

/**
 * Every Date becomes `timestamptz` holding the *same instant* as Mongo.
 *
 * This is the decision behind the plan's 5.5-hour risk, so it is worth stating
 * exactly. `scheduledAt` holds clinic wall-clock time labelled as UTC. That
 * convention is wrong, but it is the convention the whole application already
 * renders through (`sql/lib/fakeUtcTime.js`). Migrating the instant unchanged
 * keeps every existing appointment displaying what it displays today. Correcting
 * the convention is a separate, application-level change with its own backfill.
 *
 * Doing both at once is how the 5.5-hour shift happens: the "fix" lands, the
 * renderer still applies the old offset, and every appointment moves. CP-5
 * exists to fail loudly if this file ever stops holding that line.
 */
const TIMESTAMP_TYPE = 'timestamptz';

/**
 * Numbers are `numeric` unless a rule says otherwise.
 *
 * F-7 measured 18 fields reporting both int and double, which is just Mongo's
 * number encoding (`100` is an int32, `100.50` a double) rather than drift.
 * `numeric` holds both losslessly. It is slower than `bigint` or `double
 * precision`, and for money that is the correct trade: these columns carry
 * invoice totals and payment amounts, and binary floating point cannot represent
 * 0.10 exactly.
 */
const NUMBER_TYPE = 'numeric';

/**
 * Arrays default to `jsonb`.
 *
 * The plan requires an explicit documented decision for each of the 237 embedded
 * arrays (section 4 step 3). That decision is expressed as a *rule plus an
 * override list* rather than 237 individual hand calls, because a rule is
 * reviewable in one sitting and 237 scattered choices are not.
 *
 * The rule: an embedded array stays JSONB unless it is independently queried,
 * independently written, or needs a foreign key -- in which case it is promoted
 * to a child table in `overrides.js` with the reason recorded.
 *
 * JSONB is the right default here specifically because these arrays are almost
 * always read as part of their parent document (an invoice's line items are
 * fetched with the invoice, never queried across invoices) and Mongo has been
 * enforcing no shape on them, so a child table would need a column per observed
 * key and would reject the rows that lack one.
 */
const ARRAY_TYPE = 'jsonb';

const INSTANCE_TO_PG = {
  ObjectID: OBJECTID_DOMAIN,
  ObjectId: OBJECTID_DOMAIN,
  String: 'text',
  Number: NUMBER_TYPE,
  Boolean: 'boolean',
  Date: TIMESTAMP_TYPE,
  Buffer: 'bytea',
  Decimal128: NUMBER_TYPE,
  Map: 'jsonb',
  Mixed: 'jsonb',
  Array: ARRAY_TYPE,
  Embedded: 'jsonb',
  UUID: 'uuid',
  BigInt: 'bigint',
};

/**
 * When the schema says nothing (a field present in data but undeclared -- 29
 * collections carry these), the observed types decide. A field seen as exactly
 * one kind gets that kind; a field seen as several gets jsonb, which holds any
 * of them. This is the F-6 rule generalised: do not force a shape the data does
 * not have.
 */
const OBSERVED_TO_PG = {
  objectId: OBJECTID_DOMAIN,
  string: 'text',
  int: NUMBER_TYPE,
  long: NUMBER_TYPE,
  double: NUMBER_TYPE,
  decimal: NUMBER_TYPE,
  bool: 'boolean',
  boolean: 'boolean',
  date: TIMESTAMP_TYPE,
  binData: 'bytea',
  array: ARRAY_TYPE,
  object: 'jsonb',
  regex: 'text',
};

/** Types that are only ever an absence, so they say nothing about the column. */
const NON_INFORMATIVE = new Set(['null', 'undefined', 'missing']);

/**
 * Reduce observed type counts to one PostgreSQL type.
 *
 * `int` + `double` is benign (F-7) and collapses to numeric via the table above.
 * Genuinely different kinds -- F-5's `boolean x 7, int x 1` in `featureflags` --
 * do not collapse, and the caller is told so it can attach a coercion rather
 * than silently widening the column to jsonb and hiding the problem.
 */
function typeFromObserved(types) {
  const informative = Object.entries(types || {})
    .filter(([k, n]) => n > 0 && !NON_INFORMATIVE.has(k));
  if (informative.length === 0) return { type: 'jsonb', ambiguous: false, observed: [] };

  const mapped = new Set(informative.map(([k]) => OBSERVED_TO_PG[k] || 'jsonb'));
  const observed = informative
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}x${n}`);

  if (mapped.size === 1) return { type: [...mapped][0], ambiguous: false, observed };
  return { type: 'jsonb', ambiguous: true, observed };
}

/* ── Nullability ───────────────────────────────────────────── */

/**
 * NOT NULL requires the schema to demand it *and* the data to already satisfy
 * it, in every scope profiled.
 *
 * The asymmetry is deliberate and is the point of the whole profiling step.
 * `required: true` describes the validator that runs on writes made *today*; it
 * says nothing about documents written before it existed. F-2 is exactly this
 * case -- `ChatMessage.session` is `required: true` and 100% of the rows in
 * every clinic that has chat data violate it. A schema-derived NOT NULL would
 * have failed the load, at which point the pressure is to fix it in a hurry
 * rather than decide it properly.
 *
 * `evidence` is the merged view across every profiled scope. A field that is
 * complete in one clinic and sparse in another is nullable: the DDL is one
 * template applied to all of them.
 */
function decideNullability(pathType, evidence, override) {
  if (override && typeof override.notNull === 'boolean') {
    return { notNull: override.notNull, reason: override.reason || 'explicit override' };
  }

  const required = Boolean(pathType && pathType.isRequired);

  // No evidence at all: an empty collection, or a field never seen. 13
  // collections are empty. Trusting `required` there is the *safe* direction --
  // there are no rows to reject -- but it is still a guess, so it is recorded.
  if (!evidence || evidence.docsSeen === 0) {
    return {
      notNull: required,
      reason: required
        ? 'schema requires it; no data profiled to contradict it'
        : 'schema does not require it; no data profiled',
    };
  }

  if (!required) return { notNull: false, reason: 'schema does not require it' };

  const complete = evidence.presencePct >= 100 && evidence.nulls === 0;
  if (complete) {
    return { notNull: true, reason: `required, and present in 100% of ${evidence.docsSeen} documents` };
  }

  return {
    notNull: false,
    reason:
      `RELAXED: schema says required, but data disagrees -- `
      + `present in ${evidence.presencePct}% of ${evidence.docsSeen} documents`
      + `${evidence.nulls ? `, ${evidence.nulls} explicit nulls` : ''}`,
  };
}

/* ── Enums ─────────────────────────────────────────────────── */

/**
 * Enums become CHECK constraints over `text`, not native PG enum types.
 *
 * Native enums need `ALTER TYPE ... ADD VALUE`, which until recently could not
 * run inside a transaction and still cannot be removed. These lists change with
 * ordinary product work -- appointment statuses, payment methods -- and a CHECK
 * constraint is dropped and recreated in one migration.
 *
 * The constraint is only emitted when the observed values are a subset of the
 * declared ones. A value in the data that the enum does not list means the enum
 * is out of date, and declaring it would reject rows at load; the caller gets
 * told instead.
 */
function decideEnum(pathType, evidence, override) {
  if (override && override.enum === false) return { values: null, reason: 'suppressed by override' };

  const declared = (pathType && pathType.enumValues) || [];
  if (!declared.length) return { values: null, reason: null };

  const seen = (evidence && evidence.values) || [];
  const unlisted = seen.filter((v) => v !== null && v !== '' && !declared.includes(v));

  if (unlisted.length) {
    return {
      values: null,
      violations: unlisted,
      reason: `NOT ENFORCED: data holds values the enum does not declare (${unlisted.slice(0, 5).join(', ')})`,
    };
  }
  return { values: declared, reason: `declared enum, ${seen.length} distinct values observed and all listed` };
}

/* ── The column decision ───────────────────────────────────── */

/**
 * Produce one column spec.
 *
 * `pathType`  a Mongoose SchemaType, or null for an undeclared field
 * `evidence`  merged profile evidence for this path, or null
 * `override`  an explicit decision from overrides.js, or null
 */
function mapColumn(mongoPath, pathType, evidence, override) {
  const declaredRef = (pathType && pathType.options && pathType.options.ref)
    || (override && override.ref)
    || null;
  const name = (override && override.column)
    || (declaredRef ? referenceColumnName(mongoPath) : columnName(mongoPath));
  const notes = [];

  let type;
  let source;

  if (override && override.type) {
    type = override.type;
    source = 'override';
    if (override.reason) notes.push(override.reason);
  } else if (pathType) {
    const instance = pathType.instance || (pathType.$isSingleNested ? 'Embedded' : 'Mixed');
    type = INSTANCE_TO_PG[instance] || 'jsonb';
    source = 'schema';

    // A declared ref is an ObjectId regardless of how Mongoose reports it.
    if (pathType.options && pathType.options.ref) type = OBJECTID_DOMAIN;

    // Cross-check the declared type against what is stored. This is where F-5
    // surfaces: `defaultValue` is declared Boolean and one document holds an
    // int. The column stays boolean and the ETL is told to coerce, because
    // widening to jsonb to accommodate a single bad document would make every
    // consumer of the column handle two shapes forever.
    if (evidence && evidence.types) {
      const observed = typeFromObserved(evidence.types);
      if (observed.observed.length && observed.type !== type && !observed.ambiguous
          && type !== 'jsonb' && observed.type !== 'jsonb') {
        notes.push(`DRIFT: schema says ${type}, data holds ${observed.observed.join(', ')} -- ETL must coerce`);
      } else if (observed.ambiguous && type !== 'jsonb') {
        notes.push(`DRIFT: mixed kinds in data (${observed.observed.join(', ')}) -- ETL must coerce to ${type}`);
      }
    }
  } else {
    const observed = typeFromObserved(evidence && evidence.types);
    type = observed.type;
    source = 'observed';
    notes.push(
      `UNDECLARED: absent from the Mongoose schema, typed from data (${observed.observed.join(', ') || 'no values'})`
    );
  }

  const nullability = decideNullability(pathType, evidence, override);
  if (/^RELAXED/.test(nullability.reason)) notes.push(nullability.reason);

  const enumDecision = decideEnum(pathType, evidence, override);
  if (enumDecision.reason && enumDecision.violations) notes.push(enumDecision.reason);

  return {
    column: name,
    mongoPath,
    type,
    typeSource: source,
    notNull: nullability.notNull,
    nullReason: nullability.reason,
    enum: enumDecision.values,
    ref: declaredRef,
    default: override && 'default' in override ? override.default : undefined,
    notes,
  };
}

module.exports = {
  snake,
  fitIdentifier,
  columnName,
  referenceColumnName,
  tableName,
  quoteIdent,
  isReserved,
  typeFromObserved,
  decideNullability,
  decideEnum,
  mapColumn,
  OBJECTID_DOMAIN,
  TIMESTAMP_TYPE,
  NUMBER_TYPE,
  ARRAY_TYPE,
  INSTANCE_TO_PG,
  OBSERVED_TO_PG,
  MAX_IDENT,
};
