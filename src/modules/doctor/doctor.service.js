'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { syncUserDirectory } = require('../auth/auth.service');

/** Escape special regex characters to prevent ReDoS / regex injection. */
function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listDoctors(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { role: 'doctor', deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.department) filter.department = query.department;
  if (query.specialization) filter.specialization = query.specialization;
  if (query.search) {
    const escaped = _escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('branch', 'name')
      .populate('department', 'name'),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getDoctorById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const doctor = await User.findOne({ _id: id, role: 'doctor' })
    .populate('branch', 'name')
    .populate('department', 'name');
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

async function createDoctor(data, tenantSlug) {
  const Clinic = mongoose.model('Clinic');

  // Force role to doctor regardless of what was sent
  data.role = 'doctor';

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  // Atomic limit enforcement: increment first, then check
  const clinic = await Clinic.findOneAndUpdate(
    { slug: tenantSlug },
    { $inc: { 'usage.doctorsCount': 1 } },
    { new: true },
  );
  if (!clinic) throw ApiError.internal('Clinic configuration not found');

  try {
    // Check if we exceeded the limit AFTER incrementing
    if (clinic.features?.maxDoctors && clinic.usage.doctorsCount > clinic.features.maxDoctors) {
      // Rollback the increment
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.doctorsCount': -1 } },
      );
      throw ApiError.forbidden('Doctor limit reached. Upgrade your plan.');
    }

    const doctor = await User.create(data);

    // Sync to UserDirectory so email-first login flow can find this user
    syncUserDirectory(data.email, tenantSlug, doctor._id.toString(), 'doctor').catch(() => {});

    return doctor;
  } catch (err) {
    // Rollback on any creation failure
    if (!(err instanceof ApiError && err.statusCode === 403)) {
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.doctorsCount': -1 } },
      );
    }
    throw err;
  }
}

async function updateDoctor(id, data, tenantSlug) {
  // Prevent role and password changes via this endpoint
  delete data.role;
  delete data.password;

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const doctor = await User.findOneAndUpdate(
    { _id: id, role: 'doctor' },
    data,
    { new: true, runValidators: true },
  );
  if (!doctor) throw ApiError.notFound('Doctor not found');

  // Sync to platform directory if this doctor is featured
  if (doctor.isFeaturedOnPlatform) {
    const { syncFeaturedDoctor } = require('../featuredDoctor/featuredDoctor.service');
    syncFeaturedDoctor(id, tenantSlug); // fire-and-forget
  }

  return doctor;
}

async function deactivateDoctor(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  // Only deactivate if not already deleted — prevents double-decrement
  const doctor = await User.findOneAndUpdate(
    { _id: id, role: 'doctor', deletedAt: null },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!doctor) throw ApiError.notFound('Doctor not found or already deactivated');

  // Remove from platform directory if featured
  if (doctor.isFeaturedOnPlatform) {
    const FeaturedDoctor = mongoose.model('FeaturedDoctor');
    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: tenantSlug, tenantDoctorId: String(id) },
      { isActive: false, deletedAt: new Date() },
    );
  }

  // Decrement clinic usage counter
  const Clinic = mongoose.model('Clinic');
  await Clinic.findOneAndUpdate(
    { slug: tenantSlug, 'usage.doctorsCount': { $gt: 0 } },
    { $inc: { 'usage.doctorsCount': -1 } },
  );

  return doctor;
}

async function bulkCreateDoctors(rows, tenantSlug) {
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
      if (row.consultationFee) row.consultationFee = Number(row.consultationFee);
      const doctor = await createDoctor(row, tenantSlug);
      results.successCount++;
      results.created.push(doctor);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = { listDoctors, getDoctorById, createDoctor, updateDoctor, deactivateDoctor, bulkCreateDoctors };
