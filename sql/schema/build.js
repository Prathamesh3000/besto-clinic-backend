#!/usr/bin/env node
'use strict';

/**
 * Build the relational schema manifest — Phase 0, deliverable 3.
 *
 * Walks all 73 Mongoose schemas, joins each path to the evidence CP-1 measured
 * for it, applies the rules in typeMap.js and the recorded decisions in
 * overrides.js, and writes one machine-readable description of the target
 * database to sql/schema/manifest.json.
 *
 * The migrations in sql/migrations/ are generated from that manifest and never
 * hand-edited, which is what keeps 73 tables, their columns, their foreign keys
 * and their indexes from drifting apart from the schemas they came from.
 *
 * Why generate rather than hand-write
 * -----------------------------------
 * Hand-writing 73 tables is roughly 7,000 lines of DDL in which every nullability
 * and type decision is invisible once made — the reasoning lives in whoever wrote
 * it. Generating them means the *rules* are what gets reviewed, each rule is
 * stated once, tested once (tests/unit/sqlSchema.test.js), and applied uniformly.
 * The exceptions are then small enough to read in one sitting, which is what
 * overrides.js is.
 *
 * It also makes the whole thing re-runnable. When the profile is refreshed
 * against a restored snapshot, the manifest is rebuilt and `git diff` shows
 * exactly which columns the new evidence changed.
 *
 * Run:
 *   node sql/schema/build.js              # write manifest.json + SCHEMA.md
 *   node sql/schema/build.js --census     # array/index/ref counts, write nothing
 *   node sql/schema/build.js --check      # rebuild and fail if manifest.json is stale
 */

const fs = require('fs');
const path = require('path');

const typeMap = require('./typeMap');
const overrides = require('./overrides');

const ROOT = path.resolve(__dirname, '../..');
const MODELS_DIR = path.join(ROOT, 'src/models');
const PROFILE_DIR = path.join(ROOT, 'sql/profile');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const DOC_PATH = path.join(__dirname, 'SCHEMA.md');

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);

/* ── Loading schemas ───────────────────────────────────────── */

/**
 * Tenant models export raw Schemas (the tenantConnectionManager registers them
 * per connection); platform models export compiled Models. Both are accepted so
 * this file does not have to care which convention a directory follows.
 */
function asSchema(mod) {
  if (!mod) return null;
  if (typeof mod.eachPath === 'function') return mod;
  if (mod.schema && typeof mod.schema.eachPath === 'function') return mod.schema;
  return null;
}

/**
 * Mongoose's own pluraliser, so the collection name this derives is the one the
 * driver actually used — guessing it would mis-key the profile lookup for
 * exactly the irregular names where the evidence matters most.
 */
const pluralize = require('mongoose').pluralize();

function loadModels() {
  const out = [];
  const failures = [];

  for (const scope of ['platform', 'tenant']) {
    const dir = path.join(MODELS_DIR, scope);
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.js') && f !== 'index.js')
      .sort();

    for (const file of files) {
      const modelName = file.replace(/\.js$/, '');
      let schema;
      try {
        schema = asSchema(require(path.join(dir, file)));
      } catch (err) {
        failures.push({ scope, modelName, error: err.message });
        continue;
      }
      if (!schema) {
        failures.push({ scope, modelName, error: 'module exports neither a Schema nor a Model' });
        continue;
      }
      const collection = (schema.options && schema.options.collection) || pluralize(modelName.toLowerCase());
      out.push({ scope, modelName, collection, schema });
    }
  }
  return { models: out, failures };
}

/* ── Joining the profile ───────────────────────────────────── */

/**
 * Merge every profiled scope for one collection into a single view.
 *
 * The DDL is one template applied to every clinic, so a field must be described
 * by the union of what all of them hold. Merging takes the *weakest* claim at
 * every point: lowest presence, any null anywhere, every observed type, the
 * union of distinct values. A field complete in one clinic and sparse in another
 * has to be nullable, and taking the strongest claim would produce a template
 * that loads the clinic it was measured against and rejects the next one.
 */
function loadProfileIndex() {
  if (!fs.existsSync(PROFILE_DIR)) return {};
  const index = {};

  for (const file of fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.json'))) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, file), 'utf8')); } catch { continue; }
    if (!doc || !doc.collection) continue;

    const bucket = index[doc.collection] || (index[doc.collection] = {
      collection: doc.collection,
      scopes: [],
      docsSeen: 0,
      fields: {},
      orphanedReferences: {},
      drift: { undeclaredInSchema: new Set(), declaredButNeverPresent: new Set() },
    });

    bucket.scopes.push(doc.scope || file);
    bucket.docsSeen += doc.documentsScanned || 0;

    for (const [fieldPath, ev] of Object.entries(doc.fields || {})) {
      const merged = bucket.fields[fieldPath] || (bucket.fields[fieldPath] = {
        presencePct: 100, nulls: 0, types: {}, values: new Set(), docsSeen: 0, maxStringLength: 0,
      });
      merged.presencePct = Math.min(merged.presencePct, ev.presencePct ?? 100);
      merged.nulls += ev.nulls || 0;
      merged.docsSeen += doc.documentsScanned || 0;
      merged.maxStringLength = Math.max(merged.maxStringLength, ev.maxStringLength || 0);
      for (const [t, n] of Object.entries(ev.types || {})) merged.types[t] = (merged.types[t] || 0) + n;
      for (const v of ev.lowCardinalityValues || []) merged.values.add(v);
    }

    for (const [f, info] of Object.entries(doc.orphanedReferences || {})) {
      // Keep the worst observation across clinics: a reference sound in one
      // clinic and broken in another is a broken reference for the template.
      const prev = bucket.orphanedReferences[f];
      if (!prev || (info.missing || 0) > (prev.missing || 0)) bucket.orphanedReferences[f] = info;
    }
    for (const f of (doc.drift && doc.drift.undeclaredInSchema) || []) bucket.drift.undeclaredInSchema.add(f);
    for (const f of (doc.drift && doc.drift.declaredButNeverPresent) || []) bucket.drift.declaredButNeverPresent.add(f);
  }

  for (const b of Object.values(index)) {
    for (const f of Object.values(b.fields)) f.values = [...f.values];
    b.drift.undeclaredInSchema = [...b.drift.undeclaredInSchema];
    b.drift.declaredButNeverPresent = [...b.drift.declaredButNeverPresent];
  }
  return index;
}

/* ── Indexes ───────────────────────────────────────────────── */

/**
 * Translate one Mongo index declaration into a PostgreSQL index.
 *
 * The plan counts 225 index declarations and warns that losing them silently is
 * how the migration lands and the product is slow the same day. So every
 * declaration produces either an index or an explicit `unsupported` record that
 * CP-2 can count — never nothing.
 */
function mapIndex(tableName, spec, options, columnByPath, containerPaths = [], promotedPaths = {}) {
  const opts = options || {};
  const entries = Object.entries(spec);

  /**
   * An index declared on an array that was promoted to its own table follows the
   * data there.
   *
   * `Promotion.targetClinics` is an array of clinic references, so it became the
   * junction table `promotion_target_clinics` and `promotions.target_clinics` no
   * longer exists — the index that named it failed with `column ... does not
   * exist`. The intent behind the declaration ("find promotions by clinic") is
   * still valid and is still worth an index; it just belongs on the junction's
   * target column now.
   *
   * Relocating rather than dropping matters because the plan warns that silently
   * losing index declarations is how the migration lands and the product is slow
   * the same day.
   */
  const promoted = entries.length === 1 ? promotedPaths[entries[0][0]] : null;
  if (promoted) {
    return {
      kind: 'btree',
      relocatedTo: promoted.table,
      name: typeMap.fitIdentifier(`${promoted.table}_${promoted.column}_idx`),
      columns: [{ column: promoted.column, desc: false }],
      note: `Declared on ${tableName}.${entries[0][0]}, which became the ${promoted.kind} table `
        + `${promoted.table}. The index follows the data.`,
    };
  }
  const resolve = (p) => (columnByPath[p] ? columnByPath[p].column : typeMap.columnName(p));

  /**
   * Mongo indexes a path inside an array or map as if it were a top-level field —
   * `{ 'connectedClinics.clinic': 1 }` indexes that key in every element of the
   * array. There is no such column in PostgreSQL, so an index naming one fails
   * with `column ... does not exist`.
   *
   * The container it lives in decides the equivalent:
   *
   *   array   GIN over the whole jsonb column. That is what supports the
   *           containment query (`@>`) the ported code has to use, because
   *           "any element where clinic = X" is not a btree lookup.
   *   object  a btree expression index on the extracted key, which behaves like
   *           the original for equality and ordering.
   *
   * Either way the *query* has to be ported too — the index alone does not make
   * `where connected_clinics_clinic = X` work. The note says so rather than
   * leaving a plausible-looking index that nothing uses.
   */
  /**
   * A unique index over no fields is Mongo's non-working idiom for "at most one
   * row in this collection".
   *
   * `ClinicBookingPolicy` declares `index({}, { unique: true })` with the comment
   * "Singleton: at most one policy document per tenant database". MongoDB does not
   * accept an empty key pattern, so that index was never created and the
   * constraint has never been enforced -- nothing has stopped a second policy
   * document being written.
   *
   * PostgreSQL expresses it exactly: a unique index on a constant expression
   * permits one row and rejects the second. So the migration delivers the
   * guarantee the author asked for rather than faithfully reproducing a no-op.
   *
   * Safe to enforce: the collection is empty in every profiled clinic, so there is
   * no existing violation. If a clinic is later found holding two, the ETL fails
   * loudly on that clinic rather than silently keeping one of them.
   */
  if (entries.length === 0) {
    if (!opts.unique) {
      return {
        kind: 'unsupported',
        name: typeMap.fitIdentifier(`${tableName}_empty_idx`),
        spec,
        note: 'Index declared over no fields and not unique — no meaning to translate.',
      };
    }
    return {
      kind: 'unique',
      name: typeMap.fitIdentifier(`${tableName}_singleton_key`),
      expression: '((true))',
      columns: [],
      note: 'Mongo declared a unique index over an empty key pattern, which MongoDB '
        + 'silently never created — the intended "at most one row" constraint has never '
        + 'been enforced. A unique index on a constant expression enforces it here.',
    };
  }

  const containerFor = (p) => containerPaths.find((c) => p.startsWith(`${c.path}.`)) || null;
  const unresolved = entries
    .map(([f]) => f)
    .filter((f) => !columnByPath[f] && containerFor(f));

  if (unresolved.length) {
    const c = containerFor(unresolved[0]);
    const containerColumn = columnByPath[c.path] ? columnByPath[c.path].column : typeMap.columnName(c.path);
    const key = unresolved[0].slice(c.path.length + 1);

    if (c.instance === 'Array') {
      return {
        kind: 'gin',
        name: typeMap.fitIdentifier(`${tableName}_${containerColumn}_gin_idx`),
        expression: containerColumn,
        columns: [containerColumn],
        note: `Mongo indexed "${unresolved[0]}" inside the ${containerColumn} array. `
          + 'GIN over the whole jsonb column supports the containment query the port must use; '
          + 'a btree on an extracted key cannot serve "any element matches".',
      };
    }
    return {
      kind: opts.unique ? 'unique' : 'btree',
      name: typeMap.fitIdentifier(`${tableName}_${containerColumn}_${typeMap.snake(key)}_idx`),
      expression: `((${containerColumn} ->> '${key.replace(/'/g, "''")}'))`,
      columns: [],
      note: `Mongo indexed "${unresolved[0]}" inside the ${containerColumn} jsonb object. `
        + 'Expression index on the extracted key.',
    };
  }

  // Text indexes have no direct equivalent. Mongo's full-text index becomes a GIN
  // index over a concatenated tsvector, which is the closest behaviour available
  // without adding an extension.
  const textFields = entries.filter(([, dir]) => dir === 'text').map(([f]) => resolve(f));
  if (textFields.length) {
    const expr = textFields.map((c) => `coalesce(${c}, '')`).join(" || ' ' || ");
    return {
      kind: 'gin',
      name: typeMap.fitIdentifier(`${tableName}_${textFields.join('_')}_fts_idx`),
      expression: `to_tsvector('simple', ${expr})`,
      columns: textFields,
      note: "Mongo text index -> GIN over to_tsvector('simple', ...). Ranking behaviour differs; queries must be ported, not just the index.",
    };
  }

  const columns = entries
    .filter(([, dir]) => dir === 1 || dir === -1)
    .map(([f, dir]) => ({ column: resolve(f), desc: dir === -1 }));

  if (columns.length !== entries.length) {
    return {
      kind: 'unsupported',
      name: typeMap.fitIdentifier(`${tableName}_${entries.map(([f]) => resolve(f)).join('_')}_idx`),
      spec,
      note: `Index type not translatable automatically (${JSON.stringify(spec)}). Needs a hand-written equivalent.`,
    };
  }

  const index = {
    kind: opts.unique ? 'unique' : 'btree',
    name: typeMap.fitIdentifier(`${tableName}_${columns.map((c) => c.column).join('_')}${opts.unique ? '_key' : '_idx'}`),
    columns,
  };

  // A Mongo partial index becomes a PostgreSQL partial index. Only the shapes
  // actually present in these schemas are translated; anything else is recorded
  // as needing a hand-written predicate rather than quietly dropped, because a
  // unique index that loses its predicate stops rejecting nothing and starts
  // rejecting real rows.
  if (opts.partialFilterExpression) {
    const where = translatePartialFilter(opts.partialFilterExpression, resolve);
    if (where) {
      index.where = where;
    } else if (opts.unique) {
      /**
       * A UNIQUE index whose predicate could not be translated must NOT be created.
       *
       * Dropping the WHERE clause from a unique index does not weaken it -- it
       * *strengthens* it, over a larger set of rows than was ever intended, and it
       * starts rejecting data that has always been legal. `cash_registers` is the
       * worked example: Mongo declares unique on `branch` where
       * `status = 'open' and deletedAt is null`, meaning "at most one *open*
       * register per branch". Without the predicate it reads "at most one register
       * per branch, ever", and the load failed on a branch with five.
       *
       * Refusing to emit it is the safe direction: a missing index costs
       * performance and is caught by CP-2's manifest comparison, while a
       * wrong unique constraint silently rejects valid writes in production.
       */
      return {
        kind: 'unsupported',
        name: typeMap.fitIdentifier(`${tableName}_${columns.map((c) => c.column).join('_')}_key`),
        spec,
        partialFilterExpression: opts.partialFilterExpression,
        needsReview: true,
        note: 'UNIQUE index with an untranslatable partial filter '
          + `(${JSON.stringify(opts.partialFilterExpression)}). NOT created: without its predicate it `
          + 'would reject rows that are legal today. Needs a hand-written partial index.',
      };
    } else {
      // A non-unique partial index only narrows *which* rows are indexed, so
      // building it over all of them is a superset -- correct, just larger.
      index.needsReview = true;
      index.note = 'Mongo partial filter not translated '
        + `(${JSON.stringify(opts.partialFilterExpression)}); index built over all rows. `
        + 'Correct but broader than declared.';
    }
  }

  if (opts.expireAfterSeconds !== undefined) {
    index.note = `Mongo TTL index (expireAfterSeconds=${opts.expireAfterSeconds}). PostgreSQL has no TTL; `
      + 'this needs a scheduled delete job. Recorded so the expiry behaviour is not lost.';
    index.ttlSeconds = opts.expireAfterSeconds;
  }

  if (opts.sparse) {
    // A sparse unique index in Mongo ignores documents missing the field.
    // `WHERE col IS NOT NULL` is the exact equivalent.
    index.where = index.where || `${columns[0].column} is not null`;
  }

  return index;
}

function translatePartialFilter(expr, resolve) {
  const clauses = [];
  for (const [field, cond] of Object.entries(expr)) {
    const col = resolve(field);

    // `{ deletedAt: null }` is the soft-delete half of almost every partial index
    // here, and it is a bare null rather than an operator object -- which is what
    // the original object-only branch below skipped straight past.
    if (cond === null) { clauses.push(`${col} is null`); continue; }

    if (cond && typeof cond === 'object') {
      if (cond.$type === 'string' || cond.$exists === true) { clauses.push(`${col} is not null`); continue; }
      if (cond.$gt !== undefined && typeof cond.$gt === 'number') { clauses.push(`${col} > ${cond.$gt}`); continue; }
      if (cond.$ne === null) { clauses.push(`${col} is not null`); continue; }
      return null;
    }
    if (typeof cond === 'string') { clauses.push(`${col} = '${cond.replace(/'/g, "''")}'`); continue; }
    if (typeof cond === 'boolean') { clauses.push(`${col} is ${cond}`); continue; }
    return null;
  }
  return clauses.length ? clauses.join(' and ') : null;
}

/* ── Building one table ────────────────────────────────────── */

const SKIP_PATHS = new Set(['__v', 'id']);

/**
 * Mongoose represents a `Map` as two paths: the map itself, and a `$*` wildcard
 * describing its values (`planDefaults` and `planDefaults.$*`).
 *
 * The wildcard is a type declaration, not a field. Left in, it snake_cases to
 * `plan_defaults_` -> `plan_defaults` and collides with its own parent, which is
 * how `column "plan_defaults" specified more than once` reached the database.
 * The map is one jsonb column; its values live inside it.
 */
const isMapWildcard = (p) => p.includes('$*');

/**
 * Types whose column swallows everything nested beneath it. A path under one of
 * these is already stored — emitting it again as its own column duplicates the
 * data and lets the two copies disagree.
 */
const CONTAINER_TYPES = new Set(['Map', 'Mixed', 'Array']);

function buildTable(model, profile, registry) {
  const { scope, modelName, collection, schema } = model;
  const table = typeMap.tableName(modelName, collection);

  const columns = [];
  const columnByPath = {};
  const children = [];
  const junctions = [];
  const foreignKeys = [];
  const notes = [];

  const evidenceFor = (p) => (profile && profile.fields[p]) || null;

  /**
   * Rule 1 of plan section 2.2: `clinic_id` on every tenant table from day one,
   * even though schema-per-clinic does not need it.
   *
   * It holds one distinct value per schema and costs under a megabyte for a
   * 50,000-patient clinic. What it buys is that consolidating onto shared tables
   * later is `INSERT INTO shared.x SELECT * FROM <schema>.x` rather than
   * backfilling a column that does not exist across every clinic — and that RLS
   * policies can be written and tested now, as a second layer, instead of being
   * designed under pressure after the model has already been changed.
   */
  if (scope === 'tenant') {
    columns.push({
      column: 'clinic_id',
      mongoPath: null,
      type: typeMap.OBJECTID_DOMAIN,
      typeSource: 'tenancy-rule',
      notNull: true,
      nullReason: 'plan section 2.2 rule 1 — present on every tenant table from day one',
      enum: null,
      ref: 'Clinic',
      notes: ['Denormalised tenant discriminator. One distinct value per schema. Not used for filtering while the model is schema-per-clinic.'],
    });
  }

  const containerPaths = [];
  // path -> the table its data moved to, so an index declared on the array can
  // follow it instead of naming a column that no longer exists.
  const promotedPaths = {};

  schema.eachPath((mongoPath, pathType) => {
    if (SKIP_PATHS.has(mongoPath) || isMapWildcard(mongoPath)) return;
    if (CONTAINER_TYPES.has(pathType.instance)) containerPaths.push({ path: mongoPath, instance: pathType.instance });

    /**
     * `_id` becomes the primary key, keeping its value.
     *
     * Mongoose never declares `_id` required, so the ordinary nullability rule
     * would make the primary key nullable. It is special-cased rather than
     * patched in overrides.js because it is true of all 73 tables, not an
     * exception to anything.
     *
     * No `DEFAULT`. Rows arrive from the ETL carrying the id Mongo assigned, and
     * a default would quietly generate a different one for any insert that
     * forgot to supply it -- which is precisely the bug that would not surface
     * until something tried to follow a reference to the row.
     */
    if (mongoPath === '_id') {
      const idCol = {
        column: 'id',
        mongoPath: '_id',
        type: typeMap.OBJECTID_DOMAIN,
        typeSource: 'schema',
        notNull: true,
        primaryKey: true,
        nullReason: 'primary key — the Mongo _id, preserved rather than regenerated',
        enum: null,
        ref: null,
        notes: ['No default: the ETL supplies the original ObjectId.'],
      };
      columns.push(idCol);
      columnByPath[mongoPath] = idCol;
      return;
    }

    const ov = overrides.columnFor(scope, modelName, mongoPath);

    // Arrays: child table, junction table, or JSONB.
    if (pathType.instance === 'Array') {
      const child = overrides.childTableFor(scope, modelName, mongoPath);
      if (child && pathType.schema) {
        const built = buildChildTable({ scope, parentTable: table, mongoPath, sub: pathType.schema, spec: child, profile, registry });
        children.push(built);
        promotedPaths[mongoPath] = { table: built.table, column: built.columns[0].column, kind: 'child' };
        return;
      }
      const junction = overrides.junctionFor(scope, modelName, mongoPath);
      if (junction) {
        const targetColumn = `${typeMap.snake(junction.target)}_id`;
        promotedPaths[mongoPath] = { table: junction.table, column: targetColumn, kind: 'junction' };
        junctions.push({
          table: junction.table,
          parentTable: table,
          mongoPath,
          parentColumn: `${typeMap.snake(typeMap.tableName(modelName, collection)).replace(/s$/, '')}_id`,
          targetColumn,
          target: junction.target,
          targetTable: registry[junction.target] ? registry[junction.target].table : null,
          targetScope: registry[junction.target] ? registry[junction.target].scope : null,
          reason: 'array of ObjectId references — promoted so the relationship is enforced',
        });
        return;
      }
      const col = typeMap.mapColumn(mongoPath, pathType, evidenceFor(mongoPath), ov);
      col.type = typeMap.ARRAY_TYPE;
      col.default = "'[]'::jsonb";
      col.notes.push(
        pathType.schema
          ? 'Embedded object array kept as JSONB — nothing aggregates across it (see overrides.js).'
          : 'Scalar array kept as JSONB.'
      );
      columns.push(col);
      columnByPath[mongoPath] = col;
      return;
    }

    const col = typeMap.mapColumn(mongoPath, pathType, evidenceFor(mongoPath), ov);
    if (ov && ov.coerce) col.coerce = ov.coerce;
    if (ov && ov.sensitive) col.sensitive = true;

    // Foreign keys. A reference the data already violates is emitted NOT VALID:
    // enforced for every new row, tolerant of the existing damage, and promotable
    // with VALIDATE CONSTRAINT once the rows are decided. Dropping it instead
    // would preserve exactly the situation the migration exists to end.
    if (col.ref) {
      const deferred = overrides.deferredFkFor(scope, modelName, mongoPath);
      const orphan = profile && profile.orphanedReferences[mongoPath];
      const target = registry[col.ref];
      foreignKeys.push({
        column: col.column,
        references: col.ref,
        referencesTable: target ? target.table : null,
        referencesScope: target ? target.scope : null,
        // A tenant table pointing at a platform table crosses schemas. Postgres
        // supports that, but the per-tenant role must be granted REFERENCES on
        // the platform table for it to be creatable at all -- recorded here so
        // the grant is generated rather than discovered when the DDL fails.
        crossSchema: Boolean(target && target.scope !== scope),
        unresolved: target ? undefined : `no model named ${col.ref} -- FK cannot be created`,
        onDelete: col.notNull ? 'restrict' : 'set null',
        notValid: Boolean(deferred || orphan),
        finding: deferred ? deferred.finding : null,
        measured: deferred ? deferred.measured : (orphan ? `${orphan.missing} of ${orphan.total} ids missing` : null),
        decision: deferred ? deferred.decision : null,
      });
    }

    columns.push(col);
    columnByPath[mongoPath] = col;
  });

  // Undeclared fields: present in the data, absent from the schema. 29
  // collections carry these and a schema-derived DDL would drop them, taking the
  // data with it at cutover.
  if (profile) {
    for (const orphanPath of profile.drift.undeclaredInSchema) {
      if (columnByPath[orphanPath]) continue;
      if (isMapWildcard(orphanPath)) continue;
      const ev = evidenceFor(orphanPath);

      // Skip a parent whose leaves are already flattened into columns.
      const coveredByChildren = Object.keys(columnByPath).some((p) => p.startsWith(`${orphanPath}.`));
      if (coveredByChildren) continue;

      // Skip a leaf that is already inside a jsonb container. `planDefaults` is a
      // Map stored as one jsonb column, so `planDefaults.free` is not a missing
      // column — it is a key inside an existing one, and emitting it separately
      // stores the same value twice under two names that can drift apart.
      const container = containerPaths.find((c) => orphanPath.startsWith(`${c.path}.`));
      if (container) {
        notes.push(`Undeclared field ${orphanPath} lives inside the ${typeMap.columnName(container.path)} jsonb column — not emitted separately.`);
        continue;
      }
      const col = typeMap.mapColumn(orphanPath, null, ev, overrides.columnFor(scope, modelName, orphanPath));
      columns.push(col);
      columnByPath[orphanPath] = col;
      notes.push(`Undeclared field carried forward: ${orphanPath} -> ${col.column} (${col.type})`);
    }
  }

  /**
   * Two Mongo paths that snake_case to the same column name are a generator bug,
   * and PostgreSQL reports it as `column "x" specified more than once` from
   * inside a 40-line CREATE TABLE. Catching it here names both source paths.
   */
  const seen = new Map();
  for (const col of columns) {
    if (seen.has(col.column)) {
      throw new Error(
        `column name collision in ${scope}/${modelName}: `
        + `"${seen.get(col.column)}" and "${col.mongoPath}" both map to ${col.column}`
      );
    }
    seen.set(col.column, col.mongoPath);
  }

  const indexes = [];
  for (const [spec, options] of schema.indexes()) {
    indexes.push(mapIndex(table, spec, options, columnByPath, containerPaths, promotedPaths));
  }

  /**
   * Soft delete. 83 pre() hooks implement behaviour invisible at the call site
   * and the commonest is the `deletedAt: null` filter every find inherits. A
   * partial index over the live rows is what keeps those queries fast once the
   * filter becomes an explicit WHERE in the repository layer.
   */
  if (columnByPath.deletedAt) {
    indexes.push({
      kind: 'btree',
      name: typeMap.fitIdentifier(`${table}_live_idx`),
      columns: [{ column: 'deleted_at', desc: false }],
      where: 'deleted_at is null',
      note: 'Partial index over live rows — the soft-delete filter the pre(/^find/) hooks apply implicitly.',
    });
  }

  if (scope === 'tenant') {
    indexes.push({
      kind: 'btree',
      name: typeMap.fitIdentifier(`${table}_clinic_id_idx`),
      columns: [{ column: 'clinic_id', desc: false }],
      note: 'Supports the consolidation path in plan section 2.2 rule 1 without a later rebuild.',
    });
  }

  return {
    scope,
    model: modelName,
    collection,
    table,
    profiled: Boolean(profile),
    documentsProfiled: profile ? profile.docsSeen : 0,
    profiledScopes: profile ? profile.scopes : [],
    columns,
    childTables: children,
    junctionTables: junctions,
    foreignKeys,
    indexes,
    notes,
  };
}

/**
 * A promoted array becomes a table with its parent's key, a preserved ordinal,
 * and one column per sub-path.
 *
 * The ordinal matters more than it looks. A Mongo array is ordered and the API
 * returns it in that order; `SELECT * FROM invoice_items` has no order at all
 * unless one is stored. Without `line_no` the port passes its tests and then
 * returns invoice lines in a different order than the customer's last statement.
 * CP-6 compares array ordering strictly for this reason.
 */
function buildChildTable({ scope, parentTable, mongoPath, sub, spec, profile, registry }) {
  const columns = [{
    column: `${parentTable.replace(/s$/, '')}_id`,
    type: typeMap.OBJECTID_DOMAIN,
    notNull: true,
    parentKey: true,
    nullReason: 'parent key',
    notes: [],
  }];

  if (scope === 'tenant') {
    columns.push({
      column: 'clinic_id', type: typeMap.OBJECTID_DOMAIN, notNull: true,
      nullReason: 'plan section 2.2 rule 1', notes: [],
    });
  }

  columns.push({
    column: spec.orderColumn || 'line_no',
    type: 'integer',
    notNull: true,
    nullReason: 'array position — Mongo arrays are ordered and the API returns them in order',
    notes: ['Without this the child rows have no defined order and the port silently reorders API responses.'],
  });

  const foreignKeys = [];
  sub.eachPath((subPath, subType) => {
    if (SKIP_PATHS.has(subPath)) return;
    const ev = (profile && profile.fields[`${mongoPath}[].${subPath}`]) || null;
    const col = typeMap.mapColumn(subPath, subType, ev, null);

    // The subdocument's own `_id` is carried across as ordinary data under a
    // non-colliding name. It is not this table's key -- (parent, line_no) is --
    // but discarding it would break the ETL's ability to recognise a row it has
    // already loaded, and Mongo does return it in API responses.
    if (subPath === '_id') {
      col.column = 'mongo_subdoc_id';
      col.primaryKey = false;
      col.notes.push('The embedded subdocument _id, preserved for ETL idempotency and response parity. Not a key here.');
    }

    columns.push(col);
    if (col.ref) {
      const target = registry[col.ref];
      foreignKeys.push({
        column: col.column,
        references: col.ref,
        referencesTable: target ? target.table : null,
        referencesScope: target ? target.scope : null,
        crossSchema: Boolean(target && target.scope !== scope),
        unresolved: target ? undefined : `no model named ${col.ref} -- FK cannot be created`,
        onDelete: 'set null',
        notValid: true,
        measured: null,
        decision: 'child-table reference, validated after load',
      });
    }
  });

  return {
    table: spec.table,
    parentTable,
    mongoPath,
    reason: spec.reason,
    columns,
    foreignKeys,
    indexes: [{
      kind: 'unique',
      name: typeMap.fitIdentifier(`${spec.table}_parent_line_key`),
      columns: [{ column: columns[0].column, desc: false }, { column: spec.orderColumn || 'line_no', desc: false }],
      note: 'Parent + ordinal is the natural key and makes the ETL idempotent — a re-run upserts rather than duplicates.',
    }],
  };
}

/* ── Output ────────────────────────────────────────────────── */

function build() {
  const { models, failures } = loadModels();
  const profileIndex = loadProfileIndex();

  // Model name -> table, so a `ref: 'VideoSession'` can be resolved to the table
  // it actually points at instead of being carried around as a Mongoose name.
  const registry = {};
  for (const m of models) {
    registry[m.modelName] = { table: typeMap.tableName(m.modelName, m.collection), scope: m.scope };
  }

  const tables = models.map((m) => buildTable(m, profileIndex[m.collection] || null, registry));

  // Collections that exist in the data but have no model at all would be dropped
  // silently by a schema-derived DDL, so they are surfaced rather than skipped.
  const modelled = new Set(models.map((m) => m.collection));
  const unmodelled = Object.values(profileIndex)
    .filter((p) => !modelled.has(p.collection))
    .map((p) => ({ collection: p.collection, documents: p.docsSeen, scopes: p.scopes }));

  return {
    generatedBy: 'sql/schema/build.js',
    profileDir: path.relative(ROOT, PROFILE_DIR).replace(/\\/g, '/'),
    profileCollections: Object.keys(profileIndex).length,
    tenancy: 'schema-per-clinic with per-tenant roles (SQL_MIGRATION_PLAN.md section 2.2)',
    objectIdRepresentation: 'char(24) hex via the `objectid` domain — values preserved, not converted to uuid',
    tables,
    loadFailures: failures,
    unmodelledCollections: unmodelled,
  };
}

function summarise(manifest) {
  const t = manifest.tables;
  const count = (fn) => t.reduce((n, x) => n + fn(x), 0);
  return {
    tables: t.length,
    tablesWithoutPrimaryKey: t.filter((x) => !x.columns.some((c) => c.primaryKey)).length,
    platformTables: t.filter((x) => x.scope === 'platform').length,
    tenantTables: t.filter((x) => x.scope === 'tenant').length,
    childTables: count((x) => x.childTables.length),
    junctionTables: count((x) => x.junctionTables.length),
    columns: count((x) => x.columns.length) + count((x) => x.childTables.reduce((n, c) => n + c.columns.length, 0)),
    indexes: count((x) => x.indexes.length) + count((x) => x.childTables.reduce((n, c) => n + c.indexes.length, 0)),
    foreignKeys: count((x) => x.foreignKeys.length),
    foreignKeysNotValid: count((x) => x.foreignKeys.filter((f) => f.notValid).length),
    foreignKeysUnresolved: count((x) => x.foreignKeys.filter((f) => f.unresolved).length),
    foreignKeysCrossSchema: count((x) => x.foreignKeys.filter((f) => f.crossSchema).length),
    relaxedNotNull: count((x) => x.columns.filter((c) => /^RELAXED/.test(c.nullReason || '')).length),
    undeclaredColumns: count((x) => x.columns.filter((c) => c.typeSource === 'observed').length),
    unsupportedIndexes: count((x) => x.indexes.filter((i) => i.kind === 'unsupported' || i.needsReview).length),
    ttlIndexes: count((x) => x.indexes.filter((i) => i.ttlSeconds !== undefined).length),
    unprofiledTables: t.filter((x) => !x.profiled).length,
    loadFailures: manifest.loadFailures.length,
  };
}

function census(manifest) {
  process.stdout.write('\nSchema census\n' + '-'.repeat(64) + '\n');
  for (const [k, v] of Object.entries(summarise(manifest))) {
    process.stdout.write(`  ${k.padEnd(24)} ${v}\n`);
  }
  if (manifest.loadFailures.length) {
    process.stdout.write('\n  models that failed to load:\n');
    for (const f of manifest.loadFailures) process.stdout.write(`    ${f.scope}/${f.modelName}: ${f.error}\n`);
  }
  if (manifest.unmodelledCollections.length) {
    process.stdout.write('\n  profiled collections with no model:\n');
    for (const c of manifest.unmodelledCollections) process.stdout.write(`    ${c.collection} (${c.documents} docs)\n`);
  }
  process.stdout.write('\n');
}

function writeDoc(manifest) {
  const s = summarise(manifest);
  const L = [];
  L.push('# Relational schema — generated');
  L.push('');
  L.push('<!-- Generated by sql/schema/build.js. Do not edit by hand. -->');
  L.push('');
  L.push('Phase 0, deliverable 3. Every table below is derived from a Mongoose schema joined to the');
  L.push('CP-1 profile evidence for the same collection. Where the schema and the data disagree, the');
  L.push('data wins — that is the rule the profiling step exists to enforce.');
  L.push('');
  L.push('| | |');
  L.push('|---|---:|');
  for (const [k, v] of Object.entries(s)) L.push(`| ${k.replace(/([A-Z])/g, ' $1').toLowerCase()} | ${v} |`);
  L.push('');

  L.push('## Columns where the data overruled the schema');
  L.push('');
  L.push('Each of these is declared `required` in Mongoose and is nullable in PostgreSQL, because');
  L.push('existing rows do not satisfy it. A schema-derived DDL would have failed the load here.');
  L.push('');
  L.push('| Table | Column | Evidence |');
  L.push('|---|---|---|');
  for (const t of manifest.tables) {
    for (const c of t.columns) {
      if (/^RELAXED/.test(c.nullReason || '')) L.push(`| \`${t.table}\` | \`${c.column}\` | ${c.nullReason.replace(/^RELAXED: /, '')} |`);
    }
  }
  L.push('');

  L.push('## Foreign keys created NOT VALID');
  L.push('');
  L.push('Enforced for new rows, tolerant of existing violations. `VALIDATE CONSTRAINT` promotes each');
  L.push('one once its rows are decided.');
  L.push('');
  L.push('| Table | Column | References | Finding | Measured | Decision |');
  L.push('|---|---|---|---|---|---|');
  for (const t of manifest.tables) {
    for (const f of t.foreignKeys.filter((x) => x.notValid)) {
      L.push(`| \`${t.table}\` | \`${f.column}\` | ${f.references} | ${f.finding || '—'} | ${f.measured || '—'} | ${f.decision || 'validated after load'} |`);
    }
  }
  L.push('');

  L.push('## Arrays promoted out of JSONB');
  L.push('');
  for (const t of manifest.tables) {
    for (const c of t.childTables) {
      L.push(`### \`${c.table}\` — from \`${t.table}.${c.mongoPath}\``);
      L.push('');
      L.push(c.reason);
      L.push('');
    }
  }
  for (const t of manifest.tables) {
    for (const j of t.junctionTables) {
      L.push(`- \`${j.table}\` — \`${t.table}.${j.mongoPath}\` -> ${j.target} (${j.reason})`);
    }
  }
  L.push('');

  L.push('## Index declarations needing a hand-written equivalent');
  L.push('');
  L.push('| Table | Index | Why |');
  L.push('|---|---|---|');
  for (const t of manifest.tables) {
    for (const i of t.indexes.filter((x) => x.kind === 'unsupported' || x.needsReview || x.ttlSeconds !== undefined || x.kind === 'gin')) {
      L.push(`| \`${t.table}\` | \`${i.name}\` | ${(i.note || '').replace(/\|/g, '\\|')} |`);
    }
  }
  L.push('');

  L.push('## Tables with no profile evidence');
  L.push('');
  L.push('Nullability for these follows the Mongoose schema, because no data contradicted it. Safe');
  L.push('while the collections are empty; re-check after profiling a clinic that uses them.');
  L.push('');
  for (const t of manifest.tables.filter((x) => !x.profiled)) L.push(`- \`${t.table}\` (${t.scope}/${t.model})`);
  L.push('');

  fs.writeFileSync(DOC_PATH, L.join('\n'), 'utf8');
}

(function main() {
  const manifest = build();

  if (hasFlag('census')) { census(manifest); process.exit(0); }

  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (hasFlag('check')) {
    const existing = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
    if (existing !== json) {
      process.stderr.write('\nmanifest.json is stale — run `node sql/schema/build.js`\n\n');
      process.exit(1);
    }
    process.stdout.write('manifest.json is current\n');
    process.exit(0);
  }

  fs.writeFileSync(MANIFEST_PATH, json, 'utf8');
  writeDoc(manifest);
  census(manifest);
  process.stdout.write(`Wrote ${path.relative(ROOT, MANIFEST_PATH).replace(/\\/g, '/')} and ${path.relative(ROOT, DOC_PATH).replace(/\\/g, '/')}\n\n`);
})();
