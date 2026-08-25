'use strict';

/**
 * Departments — ported to the repository seam (Phase 0, deliverable 8).
 *
 * This module no longer knows which database it is talking to. It does not call
 * `getTenantConnection`, does not take a `tenantSlug`, and contains no query
 * syntax belonging to either engine. Whether a call reaches MongoDB or
 * PostgreSQL is decided by `SQL_ENTITIES` at the seam.
 *
 * What changed and why it is the interesting half
 * -----------------------------------------------
 * The signatures lost their trailing `tenantSlug`. Tenant identity now comes
 * from request-scoped context (rule 2 of plan section 2.2), which is what lets
 * the isolation model change later without touching ~1,200 call sites. It also
 * removes a class of bug the old signature invited: forgetting the argument gave
 * `undefined`, which resolved to *some* tenant rather than failing.
 *
 * Two behaviours that used to be implicit are now visible:
 *
 * - `deletedAt: null` was on every filter by hand here, *and* applied again by a
 *   `pre(/^find/)` hook. The repository owns it now, so it cannot be forgotten
 *   by the next module to be ported.
 * - `populate('branch', 'name')` became `populate: [{ path: 'branch', select:
 *   ['name'] }]`. Same result on both backends; on SQL it is a LEFT JOIN, which
 *   matters because an inner join would drop departments whose branch reference
 *   is dangling.
 *
 * This module is one of the two pilots that produce the measured throughput
 * figure the plan needs in order to replace its estimated day-rates (section 9,
 * deliverable 8).
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');

/** Populated exactly as before, so responses are unchanged either side of the port. */
const WITH_REFS = [
  { path: 'branch', select: ['name'] },
  { path: 'headOfDepartment', select: ['name', 'email'] },
];

async function listDepartments(query) {
  const departments = repo('Department');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.branch) filter.branch = query.branch;
  if (query.status === 'active' || query.isActive === 'true') {
    filter.isActive = true;
  } else if (query.status === 'inactive' || query.isActive === 'false') {
    filter.isActive = false;
  }

  // `search` is passed through rather than turned into a regex here. The two
  // backends implement it differently — $regex on Mongo, ILIKE on PostgreSQL —
  // and choosing between them is the seam's job, not this module's.
  const { items, total } = await departments.find(filter, {
    sort,
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'code'],
    populate: WITH_REFS,
  });

  return { items, total, page, limit };
}

async function getDepartmentById(id) {
  const department = await repo('Department').findById(id, { populate: WITH_REFS });
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function createDepartment(data) {
  const branch = await repo('Branch').findById(data.branch);
  if (!branch) throw ApiError.notFound('Branch not found');
  if (!branch.isActive) throw ApiError.badRequest('Cannot add department to inactive branch');

  return repo('Department').create(data);
}

async function updateDepartment(id, data) {
  const department = await repo('Department').updateById(id, data);
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function deleteDepartment(id) {
  const department = await repo('Department').softDeleteById(id);
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function bulkCreateDepartments(rows) {
  const branches = repo('Branch');
  const results = {
    totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [],
  };

  // Pre-resolve branch codes to ids in one query rather than per row.
  const branchCodes = [...new Set(rows.map((r) => r.branchCode).filter(Boolean))];
  const branchMap = {};
  if (branchCodes.length > 0) {
    const { items } = await branches.find({ code: branchCodes }, { limit: branchCodes.length });
    for (const b of items) branchMap[b.code] = String(b._id);
  }

  for (let i = 0; i < rows.length; i += 1) {
    try {
      const row = { ...rows[i] };
      if (row.branchCode && !row.branch) {
        const resolved = branchMap[row.branchCode.toUpperCase()] || branchMap[row.branchCode];
        if (!resolved) throw new Error(`Branch code "${row.branchCode}" not found`);
        row.branch = resolved;
      }
      delete row.branchCode;
      // eslint-disable-next-line no-await-in-loop
      const dept = await createDepartment(row);
      results.successCount += 1;
      results.created.push(dept);
    } catch (err) {
      results.errorCount += 1;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = {
  listDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  bulkCreateDepartments,
};
