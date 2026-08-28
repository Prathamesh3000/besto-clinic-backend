'use strict';

/**
 * A SQL-backed repository for one tenant entity.
 *
 * Implements the same interface as mongoRepository.js, so a module can move from
 * one to the other without changing a line — which is what "port a module at a
 * time" actually requires.
 *
 * Every method goes through `withTenantScope`, so no query here mentions a schema
 * or a clinic. Rule 2 of section 2.2 holds one level down as well: not only do
 * modules not scope their queries, this file does not either.
 */

const crypto = require('crypto');

const { withTenantScope } = require('./sqlConnection');
const { mapperFor } = require('./mapping');

class SqlRepository {
  constructor(modelName) {
    this.mapper = mapperFor(modelName);
    this.table = this.mapper.spec.table;
    this.modelName = modelName;
    this.hasSoftDelete = this.mapper.spec.columns.some((c) => c.column === 'deleted_at');
  }

  /* ── populate() -> LEFT JOIN ─────────────────────────────── */

  /**
   * The plan counts 291 `populate()` calls and warns that "silent behaviour
   * changes hide here". Three of them are worth stating, because each is easy to
   * get wrong and none surfaces as an error:
   *
   * 1. **LEFT join, never inner.** `populate()` on a dangling reference yields
   *    null and keeps the parent document; an inner join drops the parent row.
   *    With 4,779 orphaned rows measured in one clinic this is not hypothetical
   *    — an inner join would silently shorten list responses.
   *
   * 2. **The populated object carries `_id`.** Mongo returns a subdocument that
   *    always has one, and callers use it to link or re-fetch. Selecting only the
   *    named fields returns `{ name }` where Mongo returns `{ _id, name }`.
   *
   * 3. **A soft-deleted referent does NOT populate**, and the join must say so.
   *
   *    This one was written the other way round first, on the assumption that a
   *    `pre(/^find/)` hook filters only the collection being queried. It does not:
   *    `populate()` issues its own `find` against the referenced model, so that
   *    model's hook runs too. Three departments in the pilot clinic point at
   *    soft-deleted doctors, and Mongo returns `undefined` for all three while an
   *    unfiltered join returned the doctor — caught by CP-6, not by review.
   *
   *    The predicate belongs in the JOIN condition, never in WHERE. In WHERE it
   *    would discard the department as well; in the join it nulls the populated
   *    field and keeps the row, which is what Mongo does.
   */
  resolveJoins(paths = []) {
    return paths.map((entry) => {
      const path = typeof entry === 'string' ? entry : entry.path;
      const select = (typeof entry === 'string' ? [] : entry.select) || [];
      const column = this.mapper.columnFor(path);
      const fk = this.mapper.spec.foreignKeys.find((f) => f.column === column);

      if (!column || !fk || !fk.referencesTable) {
        throw new Error(
          `Cannot populate "${path}" on ${this.modelName}: no foreign key for it in the manifest`
        );
      }
      const target = mapperFor(fk.references);
      return {
        path,
        column,
        alias: `j_${path}`,
        table: fk.referencesTable,
        select,
        target,
        // Only if the referenced table actually has the column — not every entity
        // is soft-deletable, and joining on a missing column is a hard error.
        targetSoftDeletes: target.spec.columns.some((c) => c.column === 'deleted_at'),
      };
    });
  }

  applyJoins(qb, joins) {
    const parentTable = this.table;
    for (const j of joins) {
      qb.leftJoin(`${j.table} as ${j.alias}`, function onClause() {
        this.on(`${j.alias}.id`, '=', `${parentTable}.${j.column}`);
        // Point 3 above: the soft-delete predicate goes in the JOIN, not WHERE,
        // so a deleted referent nulls the populated field instead of dropping
        // the parent row.
        if (j.targetSoftDeletes) this.onNull(`${j.alias}.deleted_at`);
      });
      qb.select(`${j.alias}.id as ${j.alias}__id`);
      for (const field of j.select) {
        const col = j.target.columnFor(field);
        if (col) qb.select(`${j.alias}.${col} as ${j.alias}__${field}`);
      }
    }
    return qb;
  }

  /** Replace each populated id with the joined subdocument, as Mongo would. */
  nestJoins(doc, row, joins) {
    if (!doc) return doc;
    for (const j of joins) {
      const id = row[`${j.alias}__id`];
      if (id === null || id === undefined) { doc[j.path] = null; continue; }
      const sub = { _id: String(id).trim() };
      for (const field of j.select) {
        const key = `${j.alias}__${field}`;
        if (key in row) sub[field] = row[key];
      }
      doc[j.path] = sub;
    }
    return doc;
  }

  /* ── Reads ───────────────────────────────────────────────── */

  /** Translate an API-shaped filter into column predicates. */
  applyFilter(qb, filter = {}) {
    for (const [field, value] of Object.entries(filter)) {
      const column = `${this.table}.${this.mapper.columnFor(field) || field}`;
      if (value === null) qb.whereNull(column);
      else if (Array.isArray(value)) qb.whereIn(column, value);
      else if (value && typeof value === 'object' && Array.isArray(value.$nin)) qb.whereNotIn(column, value.$nin);
      else if (value && typeof value === 'object' && Array.isArray(value.$in)) qb.whereIn(column, value.$in);
      else qb.where(column, value);
    }
    return qb;
  }

  /**
   * Soft delete is `deleted_at is null`, applied by default on every read.
   *
   * In Mongo this is invisible: a `pre(/^find/)` hook adds it to every query, one
   * of the 83 hooks the plan counts as business logic hidden from call sites.
   * Making it explicit is the point — but it belongs *here* rather than in
   * modules, or porting each module means rediscovering the rule, and one of them
   * will forget and start returning deleted patients.
   */
  applyLive(qb, includeDeleted) {
    if (this.hasSoftDelete && !includeDeleted) qb.whereNull(`${this.table}.deleted_at`);
    return qb;
  }

  async findById(id, { includeDeleted = false, populate = [] } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table).select(`${this.table}.*`).where(`${this.table}.id`, id);
      this.applyLive(qb, includeDeleted);
      this.applyJoins(qb, joins);
      const row = await qb.first();
      return this.nestJoins(this.mapper.toDocument(row), row || {}, joins);
    });
  }

  async findOne(filter = {}, { includeDeleted = false, populate = [] } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table).select(`${this.table}.*`);
      this.applyFilter(qb, filter);
      this.applyLive(qb, includeDeleted);
      this.applyJoins(qb, joins);
      const row = await qb.first();
      return this.nestJoins(this.mapper.toDocument(row), row || {}, joins);
    });
  }

  /**
   * Returns `{ items, total }` in one round trip.
   *
   * `total` is a window function rather than a second query: two statements can
   * disagree if a row is written between them, which is how a paginated list
   * reports 41 results and returns 40.
   */
  async find(filter = {}, {
    sort, skip = 0, limit = 20, search, searchFields = [], includeDeleted = false, populate = [],
  } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table)
        .select(`${this.table}.*`)
        .select(trx.raw('count(*) over() as __total'));

      this.applyFilter(qb, filter);
      this.applyLive(qb, includeDeleted);
      this.applyJoins(qb, joins);

      if (search && searchFields.length) {
        // ILIKE rather than a regex. Mongo's $regex with 'i' is a case-insensitive
        // substring match here, and the callers escape the input first; ILIKE with
        // a bound parameter is the same behaviour without the escaping burden.
        qb.where((sub) => {
          for (const field of searchFields) {
            const column = `${this.table}.${this.mapper.columnFor(field) || field}`;
            sub.orWhere(column, 'ilike', `%${search}%`);
          }
        });
      }

      for (const [field, dir] of Object.entries(sort || { createdAt: -1 })) {
        const column = `${this.table}.${this.mapper.columnFor(field) || field}`;
        qb.orderBy(column, dir === -1 || dir === 'desc' ? 'desc' : 'asc');
      }

      // Mongo's natural order is not a contract the SQL port inherits, so a stable
      // tiebreak is added. Without it two rows sharing a sort key can swap between
      // pages, and a client paginating sees one twice and another never.
      qb.orderBy(`${this.table}.id`, 'asc');

      const rows = await qb.offset(skip).limit(limit);
      return {
        items: rows.map((r) => this.nestJoins(this.mapper.toDocument(r), r, joins)),
        total: rows.length ? Number(rows[0].__total) : 0,
      };
    });
  }

  async count(filter = {}, { includeDeleted = false } = {}) {
    return withTenantScope(async (trx) => {
      const qb = trx(this.table).count({ n: '*' }).first();
      this.applyFilter(qb, filter);
      this.applyLive(qb, includeDeleted);
      return Number((await qb).n);
    });
  }

  /* ── Writes ──────────────────────────────────────────────── */

  /**
   * `_id` and the timestamps are generated here.
   *
   * In Mongo the driver assigns `_id` and a `timestamps: true` schema maintains
   * `createdAt`/`updatedAt` — more behaviour invisible at the call site. The
   * column deliberately has no DEFAULT, because the ETL supplies real ids, so
   * something has to produce one and doing it here keeps every writer consistent.
   */
  async create(data) {
    return withTenantScope(async (trx, ctx) => {
      const now = new Date();
      const row = this.mapper.toRow(
        { createdAt: now, updatedAt: now, ...data },
        { clinicId: ctx.clinicId }
      );
      if (!row.id) row.id = newObjectId();
      const [inserted] = await trx(this.table).insert(row).returning('*');
      return this.mapper.toDocument(inserted);
    });
  }

  async updateById(id, patch) {
    return withTenantScope(async (trx) => {
      const row = this.mapper.toRow({ ...patch, updatedAt: new Date() });
      delete row.id; // the key is not patchable
      const qb = trx(this.table).where('id', id);
      if (this.hasSoftDelete) qb.whereNull('deleted_at');
      const [updated] = await qb.update(row).returning('*');
      return this.mapper.toDocument(updated);
    });
  }

  /** Soft delete, matching the Mongo behaviour rather than removing the row. */
  async softDeleteById(id) {
    return withTenantScope(async (trx) => {
      const now = new Date();
      const [updated] = await trx(this.table)
        .where('id', id)
        .whereNull('deleted_at')
        .update({ deleted_at: now, updated_at: now })
        .returning('*');
      return this.mapper.toDocument(updated);
    });
  }
}

/**
 * A new ObjectId, in Mongo's format.
 *
 * Ids keep that format for the whole migration: existing rows keep the ids
 * clients already hold, and new rows must be indistinguishable from them — the
 * `objectid` domain rejects anything else, and code that reads an id's embedded
 * timestamp would break on rows written after the cutover.
 */
const MACHINE = crypto.randomBytes(5).toString('hex');
let counter = crypto.randomBytes(3).readUIntBE(0, 3);

function newObjectId() {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  counter = (counter + 1) % 0xffffff;
  return `${ts}${MACHINE}${counter.toString(16).padStart(6, '0')}`;
}

module.exports = { SqlRepository, newObjectId };
