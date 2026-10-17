'use strict';

/**
 * Doctors — **partially** ported to the repository seam.
 *
 * The tenant-side reads and writes (`User`, `Branch`) go through the seam. The
 * platform-side ones — `Clinic.usage.doctorsCount`, `FeaturedDoctor` — stay on
 * Mongoose, and that is not an oversight.
 *
 * `SqlRepository` runs every statement through `withTenantScope`, which sets
 * `search_path` to the clinic's own schema. Platform tables are not in it.
 * There is a `withPlatformScope`, but the repository does not use it, so
 * `repo('Clinic')` would look right and query the wrong schema. Platform
 * entities move on the global `SQL_ENTITIES` switch instead, because one set of
 * rows shared by every clinic cannot be cut over one clinic at a time.
 *
 * So this module is a mixed-backend module for the duration, which is exactly
 * what a phased migration produces. The seam makes that safe: neither half
 * knows or cares what the other is talking to.
 *
 * Two things deliberately left alone
 * ----------------------------------
 * The doctor-limit enforcement still increments the clinic counter first and
 * rolls it back on failure. It reads oddly, but it is the only way to make
 * "check the limit, then create" atomic against two simultaneous requests
 * without a transaction spanning both databases — which is not available here
 * and would not be worth it if it were.
 *
 * `syncUserDirectory` and `syncFeaturedDoctor` remain fire-and-forget. Making
 * them awaited would change request latency and failure behaviour, which is a
 * product decision rather than part of moving a module across a seam.
 */

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');
const { syncUserDirectory } = require('../auth/auth.service');

const WITH_REFS = [
  { path: 'branch', select: ['name'] },
  { path: 'department', select: ['name'] },
];

async function listDoctors(query) {
  const users = repo('User');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { role: 'doctor' };
  if (query.branch) filter.branch = query.branch;
  if (query.department) filter.department = query.department;
  if (query.specialization) filter.specialization = query.specialization;

  const { items, total } = await users.find(filter, {
    sort,
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'email'],
    populate: WITH_REFS,
  });

  return { items, total, page, limit };
}

async function getDoctorById(id) {
  // `role: 'doctor'` stays in the filter rather than becoming a check on the
  // result. It is what makes this endpoint refuse to return a receptionist
  // given their id, and a post-hoc check would leak their record to the
  // comparison before rejecting it.
  const doctor = await repo('User').findOne({ _id: id, role: 'doctor' }, { populate: WITH_REFS });
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

async function createDoctor(data, tenantSlug) {
  const Clinic = mongoose.model('Clinic');

  // Force role to doctor regardless of what was sent
  const payload = { ...data, role: 'doctor' };

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

    const doctor = await repo('User').create(payload);

    // Sync to UserDirectory so email-first login flow can find this user
    syncUserDirectory(payload.email, tenantSlug, String(doctor._id), 'doctor').catch(() => {});

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
  const patch = { ...data };
  delete patch.role;
  delete patch.password;

  const doctor = await repo('User').updateOne({ _id: id, role: 'doctor' }, patch);
  if (!doctor) throw ApiError.notFound('Doctor not found');

  // Sync to platform directory if this doctor is featured
  if (doctor.isFeaturedOnPlatform) {
    const { syncFeaturedDoctor } = require('../featuredDoctor/featuredDoctor.service');
    syncFeaturedDoctor(id, tenantSlug); // fire-and-forget
  }

  return doctor;
}

async function deactivateDoctor(id, tenantSlug) {
  // Only deactivate if not already deleted — prevents double-decrement of the
  // clinic's doctor count. `updateOne` excludes soft-deleted rows itself, so the
  // `deletedAt: null` clause the Mongo version spelled out is now implicit.
  const doctor = await repo('User').updateOne(
    { _id: id, role: 'doctor' },
    { deletedAt: new Date() },
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
  const results = {
    totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [],
  };

  // Pre-resolve branchCodes to ObjectIDs in one query rather than per row.
  const branchCodes = [...new Set(rows.map((r) => r.branchCode).filter(Boolean))];
  const branchMap = {};
  if (branchCodes.length > 0) {
    const { items } = await repo('Branch').find(
      { code: { $in: branchCodes } },
      { limit: branchCodes.length },
    );
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
      if (row.consultationFee) row.consultationFee = Number(row.consultationFee);
      // eslint-disable-next-line no-await-in-loop
      const doctor = await createDoctor(row, tenantSlug);
      results.successCount += 1;
      results.created.push(doctor);
    } catch (err) {
      results.errorCount += 1;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = {
  listDoctors, getDoctorById, createDoctor, updateDoctor, deactivateDoctor, bulkCreateDoctors,
};
