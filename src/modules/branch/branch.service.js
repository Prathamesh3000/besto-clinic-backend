'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const FeaturedDoctor = require('../../models/platform/FeaturedDoctor');
const logger = require('../../utils/logger');

async function listBranches(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
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
      { 'address.city': { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Branch.find(filter).sort(sort).skip(skip).limit(limit).populate('manager', 'name email'),
    Branch.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getBranchById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const branch = await Branch.findById(id).populate('manager', 'name email');
  if (!branch) throw ApiError.notFound('Branch not found');
  return branch;
}

async function createBranch(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const Clinic = mongoose.model('Clinic');

  // Atomic limit enforcement: increment first, then check
  const clinic = await Clinic.findOneAndUpdate(
    { slug: tenantSlug },
    { $inc: { 'usage.branchesCount': 1 } },
    { new: true },
  );

  try {
    if (clinic.features?.maxBranches && clinic.usage.branchesCount > clinic.features.maxBranches) {
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.branchesCount': -1 } },
      );
      throw ApiError.forbidden('Branch limit reached. Upgrade your plan.');
    }

    const branch = await Branch.create(data);
    return branch;
  } catch (err) {
    if (!(err instanceof ApiError && err.statusCode === 403)) {
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.branchesCount': -1 } },
      );
    }
    throw err;
  }
}

async function updateBranch(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const branch = await Branch.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!branch) throw ApiError.notFound('Branch not found');

  // Sync denormalized branch fields to FeaturedDoctor records
  if (data.name || data.code) {
    try {
      const updates = {};
      if (data.name) updates.branchName = branch.name;
      if (data.code) updates.branchCode = branch.code;
      await FeaturedDoctor.updateMany(
        { clinicSlug: tenantSlug, branchId: String(id), isActive: true },
        { $set: updates },
      );
    } catch (err) {
      logger.error('Failed to sync branch %s to FeaturedDoctor: %s', id, err.message);
    }
  }

  return branch;
}

async function deleteBranch(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const Clinic = mongoose.model('Clinic');

  // Only delete if not already deleted — prevents double-decrement
  const branch = await Branch.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!branch) throw ApiError.notFound('Branch not found or already deleted');

  await Clinic.findOneAndUpdate(
    { slug: tenantSlug, 'usage.branchesCount': { $gt: 0 } },
    { $inc: { 'usage.branchesCount': -1 } },
  );

  // Clear branch reference from FeaturedDoctor records
  try {
    await FeaturedDoctor.updateMany(
      { clinicSlug: tenantSlug, branchId: String(id), isActive: true },
      { $set: { branchId: null, branchName: null, branchCode: null } },
    );
  } catch (err) {
    logger.error('Failed to clear branch %s from FeaturedDoctor: %s', id, err.message);
  }

  return branch;
}

async function bulkCreateBranches(rows, tenantSlug) {
  const results = { totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [] };

  for (let i = 0; i < rows.length; i++) {
    try {
      const branch = await createBranch(rows[i], tenantSlug);
      results.successCount++;
      results.created.push(branch);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = { listBranches, getBranchById, createBranch, updateBranch, deleteBranch, bulkCreateBranches };
