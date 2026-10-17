'use strict';

/**
 * Branches — ported to the repository seam (Phase 3).
 *
 * Same shape as the Department pilot: no `getTenantConnection`, no query syntax
 * belonging to either engine, and tenant identity from request-scoped context
 * rather than a threaded argument.
 *
 * Two things stay on Mongo deliberately, and are not oversights:
 *
 * - `Clinic` holds the plan limits and the usage counter. It is platform data,
 *   not tenant data, and is not part of the per-clinic port.
 * - `FeaturedDoctor` is also platform-scoped. The denormalised branch name it
 *   carries has to be kept in step wherever the branch itself lives.
 *
 * So a branch write touches two databases until the platform schema moves too.
 * That is visible here rather than hidden, because it is the reason a failure
 * midway can leave the counter and the rows disagreeing — which the decrement
 * on the error path exists to limit.
 */

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo, currentTenant } = require('../../db/repository');
const FeaturedDoctor = require('../../models/platform/FeaturedDoctor');
const logger = require('../../utils/logger');

/** Populated exactly as before, so responses are unchanged either side of the port. */
const WITH_REFS = [{ path: 'manager', select: ['name', 'email'] }];

async function listBranches(query) {
  const branches = repo('Branch');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.status === 'active' || query.isActive === 'true') {
    filter.isActive = true;
  } else if (query.status === 'inactive' || query.isActive === 'false') {
    filter.isActive = false;
  }

  // `search` is passed through rather than built into a regex here: Mongo does
  // $regex, PostgreSQL does ILIKE, and choosing is the seam's job. `address.city`
  // is a nested path in Mongo and the flattened `address_city` column in SQL;
  // the mapper resolves it either way.
  const { items, total } = await branches.find(filter, {
    sort,
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'code', 'address.city'],
    populate: WITH_REFS,
  });

  return { items, total, page, limit };
}

async function getBranchById(id) {
  const branch = await repo('Branch').findById(id, { populate: WITH_REFS });
  if (!branch) throw ApiError.notFound('Branch not found');
  return branch;
}

async function createBranch(data) {
  const { slug } = currentTenant();
  const Clinic = mongoose.model('Clinic');

  /**
   * Increment first, then check.
   *
   * Reading the count and then writing would let two concurrent creates both
   * see room for one more. `$inc` is applied by the server, so the second
   * caller sees the first one's value and the rollback below is what keeps the
   * counter honest when the limit is hit.
   */
  const clinic = await Clinic.findOneAndUpdate(
    { slug },
    { $inc: { 'usage.branchesCount': 1 } },
    { new: true },
  );

  try {
    if (clinic.features?.maxBranches && clinic.usage.branchesCount > clinic.features.maxBranches) {
      await Clinic.findOneAndUpdate({ slug }, { $inc: { 'usage.branchesCount': -1 } });
      throw ApiError.forbidden('Branch limit reached. Upgrade your plan.');
    }

    return await repo('Branch').create(data);
  } catch (err) {
    // A 403 already rolled its own increment back above; decrementing again
    // would take the counter below the real number of branches.
    if (!(err instanceof ApiError && err.statusCode === 403)) {
      await Clinic.findOneAndUpdate({ slug }, { $inc: { 'usage.branchesCount': -1 } });
    }
    throw err;
  }
}

async function updateBranch(id, data) {
  const { slug } = currentTenant();

  const branch = await repo('Branch').updateById(id, data);
  if (!branch) throw ApiError.notFound('Branch not found');

  // FeaturedDoctor carries a copy of the branch name and code for the public
  // directory. Left unsynced, a renamed branch shows its old name to patients
  // browsing doctors — wrong, but not worth failing the rename over, so the
  // error is logged and the update stands.
  if (data.name || data.code) {
    try {
      const updates = {};
      if (data.name) updates.branchName = branch.name;
      if (data.code) updates.branchCode = branch.code;
      await FeaturedDoctor.updateMany(
        { clinicSlug: slug, branchId: String(id), isActive: true },
        { $set: updates },
      );
    } catch (err) {
      logger.error('Failed to sync branch %s to FeaturedDoctor: %s', id, err.message);
    }
  }

  return branch;
}

async function deleteBranch(id) {
  const { slug } = currentTenant();
  const Clinic = mongoose.model('Clinic');

  // softDeleteById returns null for a branch already deleted, which is what
  // stops a repeated call decrementing the counter twice.
  const branch = await repo('Branch').softDeleteById(id);
  if (!branch) throw ApiError.notFound('Branch not found or already deleted');

  await Clinic.findOneAndUpdate(
    { slug, 'usage.branchesCount': { $gt: 0 } },
    { $inc: { 'usage.branchesCount': -1 } },
  );

  try {
    await FeaturedDoctor.updateMany(
      { clinicSlug: slug, branchId: String(id), isActive: true },
      { $set: { branchId: null, branchName: null, branchCode: null } },
    );
  } catch (err) {
    logger.error('Failed to clear branch %s from FeaturedDoctor: %s', id, err.message);
  }

  return branch;
}

/**
 * Sequential rather than parallel, deliberately.
 *
 * Each create checks the plan limit against a counter the previous one moved.
 * Running them concurrently would let a batch of ten past a limit of five,
 * because all ten would read the count before any of them wrote it.
 */
async function bulkCreateBranches(rows) {
  const results = {
    totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [],
  };

  for (let i = 0; i < rows.length; i += 1) {
    try {
      const branch = await createBranch(rows[i]);
      results.successCount += 1;
      results.created.push(branch);
    } catch (err) {
      results.errorCount += 1;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = {
  listBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  bulkCreateBranches,
};
