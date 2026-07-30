'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function listDepartments(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Department = conn.model('Department');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.status === 'active' || query.isActive === 'true') {
    filter.isActive = true;
  } else if (query.status === 'inactive' || query.isActive === 'false') {
    filter.isActive = false;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Department.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('branch', 'name')
      .populate('headOfDepartment', 'name email'),
    Department.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getDepartmentById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Department = conn.model('Department');
  const department = await Department.findById(id)
    .populate('branch', 'name')
    .populate('headOfDepartment', 'name email');
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function createDepartment(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const branch = await Branch.findById(data.branch);
  if (!branch) throw ApiError.notFound('Branch not found');
  if (!branch.isActive) throw ApiError.badRequest('Cannot add department to inactive branch');

  const Department = conn.model('Department');
  return Department.create(data);
}

async function updateDepartment(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Department = conn.model('Department');
  const department = await Department.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function deleteDepartment(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Department = conn.model('Department');
  const department = await Department.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

async function bulkCreateDepartments(rows, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const results = { totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [] };

  // Pre-resolve branchCodes to ObjectIDs
  const branchCodes = [...new Set(rows.map((r) => r.branchCode).filter(Boolean))];
  const branchMap = {};
  if (branchCodes.length > 0) {
    const branches = await Branch.find({ code: { $in: branchCodes }, deletedAt: null });
    for (const b of branches) branchMap[b.code] = b._id.toString();
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = { ...rows[i] };
      if (row.branchCode && !row.branch) {
        const resolved = branchMap[row.branchCode.toUpperCase()] || branchMap[row.branchCode];
        if (!resolved) throw new Error(`Branch code "${row.branchCode}" not found`);
        row.branch = resolved;
      }
      delete row.branchCode;
      const dept = await createDepartment(row, tenantSlug);
      results.successCount++;
      results.created.push(dept);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = { listDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment, bulkCreateDepartments };
