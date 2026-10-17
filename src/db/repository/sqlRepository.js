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
const { applyBeforeCreate, applyBeforeUpdate, hasUpdateGuard } = require('./behaviours');

class SqlRepository {
  constructor(modelName) {
    this.mapper = mapperFor(modelName);
    this.table = this.mapper.spec.table;
    this.modelName = modelName;
    this.hasSoftDelete = this.mapper.spec.columns.some((c) => c.column === 'deleted_at');

    /**
     * Columns Mongoose declares `select: false` — password hashes, reset and
     * verification tokens, encrypted OAuth credentials, the tenant database URI.
     *
     * Mongoose withholds them unless a query names them, and the models back
     * that with a `toJSON` transform that deletes them from responses. Selecting
     * `table.*` here would reinstate every one of them, and nothing would fail:
     * the API would simply start returning more fields than before, password
     * hashes among them.
     *
     * So the default select is explicit rather than `*`, and a caller that
     * genuinely needs one — authentication comparing a hash — asks for it by
     * name, exactly as it does today with `.select('+password')`.
     */
    this.hiddenColumns = this.mapper.spec.columns.filter((c) => c.hidden).map((c) => c.column);
    this.visibleColumns = this.mapper.spec.columns
      .filter((c) => !c.hidden)
      .map((c) => c.column);
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

  /**
   * Translate an API-shaped filter into column predicates.
   *
   * The filter language is Mongo's, because that is what the 48 modules already
   * write and the Mongo half of the seam passes straight to Mongoose. A module
   * that had to phrase its filters differently per backend would defeat the
   * seam, so the translation lives here.
   *
   * Counted across the services rather than guessed at: `$in` 120, `$gte` 100,
   * `$lte` 83, `$regex` 49, `$or` 42, `$ne` 35, `$gt` 15, `$nin` 13, `$lt` 10,
   * `$exists` 6. Those are handled. `$expr` (5), `$type` (3), `$size` (3),
   * `$text` (1) and `$nor` (1) are not, and throw rather than being ignored —
   * a filter that silently stops filtering returns other people's rows.
   */
  applyFilter(qb, filter = {}) {
    this.applyConditions(qb, filter);
    return qb;
  }

  /** One filter object, as a group of AND-ed predicates on `qb`. */
  applyConditions(qb, filter = {}) {
    for (const [field, value] of Object.entries(filter)) {
      if (field === '$or' || field === '$and') {
        this.applyLogical(qb, field, value);
      } else if (field === '$nor' || field === '$expr' || field === '$text' || field === '$where') {
        throw new Error(`SQL repository: unsupported filter operator "${field}"`);
      } else {
        this.applyField(qb, field, value);
      }
    }
    return qb;
  }

  /**
   * `$or` / `$and` as a parenthesised group.
   *
   * The grouping is not cosmetic. `where a and (b or c)` and `where a and b or c`
   * select different rows, and the second is what you get by adding `orWhere`
   * clauses to the outer builder. A callback pushes them into their own group.
   */
  applyLogical(qb, op, branches) {
    if (!Array.isArray(branches) || !branches.length) {
      throw new Error(`SQL repository: "${op}" needs a non-empty array`);
    }
    const self = this;
    qb.where(function group() {
      branches.forEach((branch, i) => {
        const add = (sub) => self.applyConditions(sub, branch);
        if (op === '$or' && i > 0) this.orWhere(add);
        else this.andWhere(add);
      });
    });
  }

  /**
   * A field name as a qualified column, or an error naming what went wrong.
   *
   * The fallback used to be the field name itself, which produced SQL against a
   * column that does not exist and an error from PostgreSQL reading
   * `column appointments.appointmentDate does not exist` — true, but it does not
   * say which model, which caller, or that the field was never mapped in the
   * first place. During a module port that is the difference between a one-line
   * fix and a debugging session.
   *
   * It fails rather than ignoring the clause, because a filter that silently
   * stops filtering returns rows the caller meant to exclude.
   */
  resolveColumn(field, role) {
    const column = this.mapper.columnFor(field);
    if (!column) {
      throw new Error(
        `SQL repository: ${this.modelName} has no column for ${role} field "${field}" `
        + `(table ${this.table}) — check the field name against the Mongoose schema`,
      );
    }
    return `${this.table}.${column}`;
  }

  /** One `field: value` or `field: { $op: ... }` entry. */
  applyField(qb, field, value) {
    const column = this.resolveColumn(field, 'filter');

    // `{ field: null }` matches missing *or* null in Mongo. A column that was
    // never written is null here, so the two agree.
    if (value === null || value === undefined) return qb.whereNull(column);
    if (Array.isArray(value)) return qb.whereIn(column, value);
    if (!(value && typeof value === 'object') || value instanceof Date) {
      return qb.where(column, value);
    }

    const ops = Object.keys(value);
    if (!ops.length) return qb.where(column, value);
    if (!ops.every((k) => k.startsWith('$'))) {
      // A plain object that is not an operator expression is Mongo's exact
      // subdocument match. Nested paths are flattened into columns here, so
      // there is nothing to match against and guessing would be worse.
      throw new Error(`SQL repository: cannot match subdocument on "${field}"`);
    }

    for (const op of ops) {
      const operand = value[op];
      switch (op) {
        case '$in': qb.whereIn(column, operand); break;
        case '$nin': qb.whereNotIn(column, operand); break;
        case '$gt': qb.where(column, '>', operand); break;
        case '$gte': qb.where(column, '>=', operand); break;
        case '$lt': qb.where(column, '<', operand); break;
        case '$lte': qb.where(column, '<=', operand); break;

        /**
         * `$ne` must keep null rows, which `<>` does not.
         *
         * Mongo's `{ status: { $ne: 'paid' } }` matches documents where status is
         * 'pending' *and* those where it is absent. SQL's `status <> 'paid'`
         * evaluates to NULL for a null column, and a NULL predicate is not true,
         * so those rows vanish. `is distinct from` is the three-valued-logic-safe
         * form and the one that matches Mongo.
         */
        case '$ne':
          if (operand === null) qb.whereNotNull(column);
          else qb.whereRaw('?? is distinct from ?', [column, operand]);
          break;

        /**
         * Mongo separates "field missing" from "field present and null"; a
         * column cannot. `$exists: true` therefore means "not null" here, which
         * is the intent at every call site that uses it — none of them stores an
         * explicit null to mean something different from absent.
         */
        case '$exists':
          if (operand) qb.whereNotNull(column); else qb.whereNull(column);
          break;

        /**
         * `~`/`~*` rather than LIKE, because the operand is a regular
         * expression at every call site, not a LIKE pattern. The services build
         * these by escaping user input and occasionally anchoring with `^`,
         * which POSIX and JavaScript spell the same way. Constructs that differ
         * between the two dialects — lookahead, `\d`, lazy quantifiers — do not
         * appear, and would be a porting decision rather than a translation.
         */
        case '$regex': {
          const insensitive = String(value.$options || '').includes('i');
          const pattern = operand instanceof RegExp ? operand.source : String(operand);
          qb.where(column, insensitive ? '~*' : '~', pattern);
          break;
        }

        case '$options': break; // consumed by $regex

        // `$not` deliberately absent: its operand is an operator expression
        // (`{ $not: { $gte: 5 } }`), not a value, so the obvious `whereNot(col,
        // operand)` would quietly match the wrong rows. It appears nowhere in
        // the services, so it throws with everything else unhandled.
        default:
          throw new Error(`SQL repository: unsupported filter operator "${op}" on "${field}"`);
      }
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

  /**
   * Strip hidden columns from a row a write returned.
   *
   * `returning('*')` ignores the select list, so a create or update would hand
   * back the password hash it just stored even though no read ever would. The
   * value is needed inside the statement — `RETURNING` is how the row's
   * generated id comes back — so it is removed here rather than by narrowing
   * the RETURNING clause, which would cost a second query.
   */
  stripHidden(row) {
    if (!row || !this.hiddenColumns.length) return row;
    const out = { ...row };
    for (const c of this.hiddenColumns) delete out[c];
    return out;
  }

  /**
   * The columns to read, with hidden ones withheld unless named.
   *
   * `select: ['+password']` mirrors Mongoose's own opt-in syntax, so a service
   * moving to SQL keeps the shape of the call it already makes.
   */
  selectList(select = []) {
    if (!this.hiddenColumns.length) return [`${this.table}.*`];

    const requested = (Array.isArray(select) ? select : [select])
      .filter((f) => typeof f === 'string' && f.startsWith('+'))
      .map((f) => this.mapper.columnFor(f.slice(1)) || f.slice(1));

    const allowed = requested.filter((c) => this.hiddenColumns.includes(c));
    return [...this.visibleColumns, ...allowed].map((c) => `${this.table}.${c}`);
  }

  async findById(id, { includeDeleted = false, populate = [], select = [] } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table).select(this.selectList(select)).where(`${this.table}.id`, id);
      this.applyLive(qb, includeDeleted);
      this.applyJoins(qb, joins);
      const row = await qb.first();
      return this.nestJoins(this.mapper.toDocument(row), row || {}, joins);
    });
  }

  async findOne(filter = {}, { includeDeleted = false, populate = [], select = [] } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table).select(this.selectList(select));
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
    sort, skip = 0, limit = 20, search, searchFields = [], includeDeleted = false,
    populate = [], select = [],
  } = {}) {
    return withTenantScope(async (trx) => {
      const joins = this.resolveJoins(populate);
      const qb = trx(this.table)
        .select(this.selectList(select))
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
            sub.orWhere(this.resolveColumn(field, 'search'), 'ilike', `%${search}%`);
          }
        });
      }

      for (const [field, dir] of Object.entries(sort || { createdAt: -1 })) {
        qb.orderBy(this.resolveColumn(field, 'sort'), dir === -1 || dir === 'desc' ? 'desc' : 'asc');
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

      // What Mongoose would have done in pre('save'). Inside this transaction,
      // so anything the behaviour writes - a counter increment, for one -
      // commits or rolls back with the row that caused it. The Mongoose hook it
      // replaces had no such guarantee: a failed insert left the counter
      // advanced and burned a number.
      const doc = await applyBeforeCreate(this.modelName, data, {
        trx, schema: ctx.schema, clinicId: ctx.clinicId,
      });

      const row = this.mapper.toRow(
        { createdAt: now, updatedAt: now, ...doc },
        { clinicId: ctx.clinicId }
      );
      if (!row.id) row.id = newObjectId();
      const [inserted] = await trx(this.table).insert(row).returning('*');
      return this.mapper.toDocument(this.stripHidden(inserted));
    });
  }

  async updateById(id, patch) {
    return withTenantScope(async (trx) => {
      /**
       * Some models refuse an update based on what is already stored — an
       * invoice that has received payments will not let its line items change.
       * Mongoose expresses that as a pre('save') hook reading the loaded
       * document; here it costs an extra read, inside the same transaction so
       * the row cannot change between the check and the write.
       *
       * Only for models that declare a guard. Reading every row before every
       * update to serve one rule would be a poor trade.
       */
      if (hasUpdateGuard(this.modelName)) {
        const current = await trx(this.table).where('id', id).first();
        if (current) {
          await applyBeforeUpdate(this.modelName, this.mapper.toDocument(current), patch);
        }
      }

      const row = this.mapper.toRow({ ...patch, updatedAt: new Date() });
      delete row.id; // the key is not patchable
      const qb = trx(this.table).where('id', id);
      if (this.hasSoftDelete) qb.whereNull('deleted_at');
      const [updated] = await qb.update(row).returning('*');
      return this.mapper.toDocument(this.stripHidden(updated));
    });
  }

  /**
   * Update the row matching `filter`, or insert it if there is none.
   *
   * Two statements inside one transaction rather than `ON CONFLICT`, because
   * the singleton documents this serves have no unique constraint to conflict
   * on — they are singletons by convention, one row per tenant schema, not by
   * declaration. The transaction is what makes the read-then-write safe.
   */
  async upsertOne(filter, patch) {
    return withTenantScope(async (trx, ctx) => {
      const now = new Date();
      const qb = trx(this.table);
      this.applyFilter(qb, filter);
      if (this.hasSoftDelete) qb.whereNull(`${this.table}.deleted_at`);

      const existing = await qb.clone().first();
      if (existing) {
        const row = this.mapper.toRow({ ...patch, updatedAt: now });
        delete row.id;
        const [updated] = await trx(this.table)
          .where('id', existing.id).update(row).returning('*');
        return this.mapper.toDocument(this.stripHidden(updated));
      }

      const doc = await applyBeforeCreate(this.modelName, { ...filter, ...patch }, {
        trx, schema: ctx.schema, clinicId: ctx.clinicId,
      });
      const row = this.mapper.toRow(
        { createdAt: now, updatedAt: now, ...doc },
        { clinicId: ctx.clinicId },
      );
      if (!row.id) row.id = newObjectId();
      const [inserted] = await trx(this.table).insert(row).returning('*');
      return this.mapper.toDocument(this.stripHidden(inserted));
    });
  }

  /**
   * Update the first row matching `filter` — Mongoose's `findOneAndUpdate`
   * without the upsert.
   *
   * 71 call sites use this shape, almost all of them to scope a write by
   * ownership as well as id: `{ _id: id, recipient: userId }`. That is a
   * security property, not a convenience — doing it as a separate read followed
   * by `updateById` opens a window where the two can disagree, and drops the
   * ownership clause from the statement that actually writes.
   *
   * Returns the updated document, or null when nothing matched.
   */
  async updateOne(filter, patch) {
    return withTenantScope(async (trx) => {
      const find = trx(this.table).select(`${this.table}.id`);
      this.applyFilter(find, filter);
      this.applyLive(find, false);
      const target = await find.first();
      if (!target) return null;

      if (hasUpdateGuard(this.modelName)) {
        const current = await trx(this.table).where('id', target.id).first();
        if (current) {
          await applyBeforeUpdate(this.modelName, this.mapper.toDocument(current), patch);
        }
      }

      const row = this.mapper.toRow({ ...patch, updatedAt: new Date() });
      delete row.id;
      const [updated] = await trx(this.table)
        .where('id', target.id).update(row).returning('*');
      return updated ? this.mapper.toDocument(this.stripHidden(updated)) : null;
    });
  }

  /**
   * Update every row matching `filter`. Returns `{ modifiedCount }`, the shape
   * Mongoose returns, so a ported call site reads the same property.
   *
   * Refused for models with an update guard. A guard decides per row from what
   * is already stored — an invoice that has taken a payment will not let its
   * line items change — and a single UPDATE statement cannot consult it. The
   * alternatives are to read every row first, which turns a bulk update into N+1
   * queries, or to skip the guard, which is how a rule that exists to protect
   * financial records gets bypassed by the one caller that updates in bulk.
   */
  async updateMany(filter, patch) {
    if (hasUpdateGuard(this.modelName)) {
      throw new Error(
        `${this.modelName} declares an update guard, so it cannot be updated in bulk. `
        + 'Update each row through updateById or updateOne so the guard can run.',
      );
    }
    return withTenantScope(async (trx) => {
      const row = this.mapper.toRow({ ...patch, updatedAt: new Date() });
      delete row.id;
      const qb = trx(this.table);
      this.applyFilter(qb, filter);
      this.applyLive(qb, false);
      const modifiedCount = await qb.update(row);
      return { modifiedCount: Number(modifiedCount) };
    });
  }

  /**
   * Insert many rows in one statement, each through the create behaviours.
   *
   * The behaviours run in sequence rather than in parallel, deliberately: the
   * ones that matter here allocate sequence numbers (patient ids, invoice
   * numbers) from a counter row, and running them concurrently inside one
   * transaction would have them contend on it.
   */
  async insertMany(docs = []) {
    if (!Array.isArray(docs) || !docs.length) return [];
    return withTenantScope(async (trx, ctx) => {
      const now = new Date();
      const rows = [];
      for (const data of docs) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await applyBeforeCreate(this.modelName, data, {
          trx, schema: ctx.schema, clinicId: ctx.clinicId,
        });
        const row = this.mapper.toRow(
          { createdAt: now, updatedAt: now, ...doc },
          { clinicId: ctx.clinicId },
        );
        if (!row.id) row.id = newObjectId();
        rows.push(row);
      }
      const inserted = await trx(this.table).insert(rows).returning('*');
      return inserted.map((r) => this.mapper.toDocument(this.stripHidden(r)));
    });
  }

  /**
   * The distinct values of one field among the rows matching `filter`.
   *
   * Mongo omits null and missing from `distinct`; `select distinct` does not, so
   * nulls are dropped here to match. Without that a caller building a filter
   * chip list gets an empty entry that selects nothing.
   */
  async distinct(field, filter = {}) {
    const column = this.resolveColumn(field, 'distinct');
    return withTenantScope(async (trx) => {
      const qb = trx(this.table).distinct(column).whereNotNull(column);
      this.applyFilter(qb, filter);
      this.applyLive(qb, false);
      const rows = await qb;
      const key = column.split('.').pop();
      return rows.map((r) => r[key]);
    });
  }

  /** Soft delete, matching the Mongo behaviour rather than removing the row. */
  async softDeleteById(id) {
    // Not every model soft-deletes. Without this the query reaches PostgreSQL
    // and fails with `column "deleted_at" does not exist`, which reads like a
    // schema problem rather than what it is: the wrong method for this model.
    if (!this.hasSoftDelete) {
      throw new Error(
        `${this.modelName} has no deletedAt field — it cannot be soft-deleted. `
        + 'Use a hard delete, or add soft-delete to the model.',
      );
    }
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
