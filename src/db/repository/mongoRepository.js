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
}

module.exports = { MongoRepository };
