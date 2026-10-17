'use strict';

/**
 * The Mongo-backed half of the seam.
 *
 * Same interface as SqlRepository, over the tenant connection manager the
 * application uses today. This is what keeps the product working while modules
 * move across one at a time: a ported module talks to the repository, and which
 * database answers is a configuration decision (see index.js).
 *
 * It also gives CP-6 something to compare against. Parity is only meaningful if
 * both sides are reachable through the same interface from the same request —
 * otherwise the comparison is between the new code and a description of the old
 * behaviour rather than the behaviour itself.
 */

const { requireTenant } = require('./context');
const { getTenantConnection } = require('../tenantConnectionManager');

/** Plain objects, so callers cannot depend on Mongoose document methods that the
 *  SQL implementation has no way to provide. */
const LEAN = { lean: true, virtuals: false };

class MongoRepository {
  constructor(modelName) {
    this.modelName = modelName;
  }

  async model() {
    const tenant = requireTenant();
    const conn = await getTenantConnection(tenant.slug);
    return conn.model(this.modelName);
  }

  /**
   * Apply the same `populate` option the SQL repository accepts.
   *
   * Both sides must take the option in one shape, or a ported module has to know
   * which backend it is talking to -- which is the whole thing the seam exists to
   * prevent. `{ path, select: ['name'] }` becomes Mongoose's `('path', 'name')`.
   */
  static applyPopulate(query, populate = []) {
    for (const entry of populate) {
      const path = typeof entry === 'string' ? entry : entry.path;
      const select = (typeof entry === 'string' ? [] : entry.select) || [];
      query.populate(path, select.join(' ') || undefined);
    }
    return query;
  }

  async findById(id, { includeDeleted = false, populate = [] } = {}) {
    const Model = await this.model();
    const query = Model.findById(id);
    if (includeDeleted) query.setOptions({ includeDeleted: true });
    MongoRepository.applyPopulate(query, populate);
    return query.lean(LEAN.lean);
  }

  async findOne(filter = {}, { populate = [] } = {}) {
    const Model = await this.model();
    const query = Model.findOne(filter);
    MongoRepository.applyPopulate(query, populate);
    return query.lean(LEAN.lean);
  }

  async find(filter = {}, {
    sort, skip = 0, limit = 20, search, searchFields = [], populate = [],
  } = {}) {
    const Model = await this.model();
    const query = { ...filter };

    if (search && searchFields.length) {
      // The same escaping the existing services apply, kept here so both
      // implementations treat a search term identically.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = searchFields.map((f) => ({ [f]: { $regex: escaped, $options: 'i' } }));
    }

    const cursor = Model.find(query)
      .sort(sort || { createdAt: -1 })
      // The same stable tiebreak the SQL side adds. Mongo's natural order is not
      // a contract, and without a deterministic tiebreak two rows sharing a sort
      // key can swap between pages -- which would show up here as a parity
      // failure that is really nondeterminism on both sides.
      .sort(sort ? { ...sort, _id: 1 } : { createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit);
    MongoRepository.applyPopulate(cursor, populate);

    const [items, total] = await Promise.all([
      cursor.lean(LEAN.lean),
      Model.countDocuments(query),
    ]);
    return { items, total };
  }

  async count(filter = {}) {
    const Model = await this.model();
    return Model.countDocuments(filter);
  }

  async create(data) {
    const Model = await this.model();
    const created = await Model.create(data);
    return created.toObject();
  }

  async updateById(id, patch) {
    const Model = await this.model();
    return Model.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).lean(LEAN.lean);
  }

  async softDeleteById(id) {
    const Model = await this.model();
    return Model.findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true }).lean(LEAN.lean);
  }

  /**
   * Update the first document matching `filter`, or null.
   *
   * Distinct from `upsertOne`: this one never inserts. Most call sites use it to
   * scope a write by ownership as well as id — `{ _id: id, recipient: userId }`
   * — so the filter is a security boundary and must reach the write itself.
   */
  async updateOne(filter, patch) {
    const Model = await this.model();
    return Model.findOneAndUpdate(filter, patch, { new: true, runValidators: true })
      .lean(LEAN.lean);
  }

  /**
   * Update every document matching `filter`.
   *
   * `deletedAt: null` is added here rather than left to the model's
   * `pre(/^find/)` hook, because that regex does not match `updateMany` — it
   * covers `find`, `findOne` and `findOneAndUpdate` and stops there. Relying on
   * it would have this method update soft-deleted documents while the SQL side,
   * which applies the predicate itself, skipped them. Nothing would fail; the
   * two databases would simply drift apart one bulk update at a time.
   */
  async updateMany(filter, patch) {
    const Model = await this.model();
    const scoped = Model.schema.path('deletedAt') && filter.deletedAt === undefined
      ? { ...filter, deletedAt: null }
      : filter;
    const result = await Model.updateMany(scoped, { $set: patch });
    return { modifiedCount: result.modifiedCount };
  }

  async insertMany(docs = []) {
    if (!Array.isArray(docs) || !docs.length) return [];
    const Model = await this.model();
    // Not `insertMany`, which bypasses `pre('save')`. Several models depend on
    // those hooks for sequence numbers and password hashing, and a bulk path
    // that skipped them would write rows the single-document path never could.
    const created = [];
    for (const data of docs) {
      // eslint-disable-next-line no-await-in-loop
      created.push((await Model.create(data)).toObject());
    }
    return created;
  }

  async distinct(field, filter = {}) {
    const Model = await this.model();
    return Model.distinct(field, filter);
  }

  /**
   * Update the row matching `filter`, or insert it if there is none.
   *
   * For the singleton configuration documents several modules keep — a clinic's
   * booking policy, its branding — where "create it the first time someone
   * saves" is the whole lifecycle and a separate create call would race with
   * itself on first use.
   */
  async upsertOne(filter, patch) {
    const Model = await this.model();
    return Model.findOneAndUpdate(
      filter,
      { $set: patch },
      { new: true, upsert: true, runValidators: true },
    ).lean(LEAN.lean);
  }
}

module.exports = { MongoRepository };
