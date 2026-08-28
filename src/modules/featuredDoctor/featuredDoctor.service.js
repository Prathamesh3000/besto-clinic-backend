'use strict';

const FeaturedDoctor = require('../../models/platform/FeaturedDoctor');
const Clinic = require('../../models/platform/Clinic');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

/**
 * Aggregate average rating + review count for a doctor from the tenant Review collection.
 */
async function _aggregateRating(conn, doctorId) {
  const Review = conn.model('Review');
  const [result] = await Review.aggregate([
    { $match: { doctor: doctorId, status: 'approved', deletedAt: null } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return {
    averageRating: Math.round((result?.avg || 0) * 10) / 10,
    totalReviews: result?.count || 0,
  };
}

/**
 * Build a FeaturedDoctor upsert payload from tenant doctor + clinic data.
 */
function _buildPayload(doctor, clinic, ratings) {
  // Support multiple specializations — split comma-separated or use as-is
  let specializations = [];
  if (doctor.specialization) {
    specializations = doctor.specialization.includes(',')
      ? doctor.specialization.split(',').map((s) => s.trim()).filter(Boolean)
      : [doctor.specialization.trim()];
  }

  return {
    clinicId: clinic._id,
    clinicSlug: clinic.slug,
    clinicName: clinic.name,
    clinicLogo: clinic.logo || '',
    clinicCity: clinic.address?.city || '',
    location: clinic.location &&
      clinic.location.coordinates?.[0] !== 0 &&
      clinic.location.coordinates?.[1] !== 0
      ? clinic.location
      : undefined,
    tenantDoctorId: String(doctor._id),
    name: (doctor.name || '').replace(/^Dr\.?\s*/i, '').trim() || doctor.name,
    avatar: doctor.avatar || '',
    specializations,
    bio: doctor.doctorProfile?.bio || '',
    education: doctor.doctorProfile?.education || [],
    experienceYears: doctor.doctorProfile?.experienceYears || 0,
    qualifications: doctor.doctorProfile?.qualifications || [],
    languages: doctor.doctorProfile?.languages || [],
    consultationFee: doctor.consultationFee || 0,
    acceptingNewPatients: doctor.doctorProfile?.acceptingNewPatients ?? true,
    branchId: doctor.branch ? String(doctor.branch._id || doctor.branch) : null,
    branchName: doctor.branch?.name || null,
    branchCode: doctor.branch?.code || null,
    averageRating: ratings.averageRating,
    totalReviews: ratings.totalReviews,
    isActive: true,
    publishedAt: new Date(),
    deletedAt: null,
  };
}

/**
 * Toggle a doctor's featured status on the platform directory.
 * @param {string} doctorId - tenant User._id
 * @param {boolean} featured - true to feature, false to un-feature
 * @param {string} tenantSlug - clinic slug
 */
async function toggleFeature(doctorId, featured, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' })
    .populate('department', 'name')
    .populate('branch', 'name code');
  if (!doctor) throw ApiError.notFound('Doctor not found');

  if (featured) {
    const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null });
    if (!clinic) throw ApiError.notFound('Clinic not found');

    const ratings = await _aggregateRating(conn, doctor._id);
    const payload = _buildPayload(doctor, clinic, ratings);

    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: tenantSlug, tenantDoctorId: String(doctor._id) },
      payload,
      { upsert: true, new: true },
    );

    doctor.isFeaturedOnPlatform = true;
    await doctor.save();
  } else {
    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: tenantSlug, tenantDoctorId: String(doctorId) },
      { isActive: false, deletedAt: new Date() },
    );

    doctor.isFeaturedOnPlatform = false;
    await doctor.save();
  }

  return doctor;
}

/**
 * Re-sync a featured doctor's profile data after admin updates.
 * Called from doctor.service.updateDoctor() when isFeaturedOnPlatform is true.
 */
async function syncFeaturedDoctor(doctorId, tenantSlug) {
  try {
    const conn = await getTenantConnection(tenantSlug);
    const User = conn.model('User');
    const doctor = await User.findOne({ _id: doctorId, role: 'doctor' })
      .populate('branch', 'name code');
    if (!doctor || !doctor.isFeaturedOnPlatform) return;

    const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null });
    if (!clinic) return;

    const ratings = await _aggregateRating(conn, doctor._id);
    const payload = _buildPayload(doctor, clinic, ratings);

    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: tenantSlug, tenantDoctorId: String(doctor._id) },
      payload,
      { upsert: true },
    );
  } catch (err) {
    logger.error('Failed to sync featured doctor %s/%s: %s', tenantSlug, doctorId, err.message);
  }
}

/**
 * Refresh ratings for a single featured doctor.
 */
async function refreshDoctorRating(clinicSlug, tenantDoctorId) {
  try {
    const conn = await getTenantConnection(clinicSlug);
    const { ObjectId } = require('mongoose').Types;
    const ratings = await _aggregateRating(conn, new ObjectId(tenantDoctorId));

    await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug, tenantDoctorId, isActive: true },
      { averageRating: ratings.averageRating, totalReviews: ratings.totalReviews },
    );
  } catch (err) {
    logger.error('Failed to refresh rating for %s/%s: %s', clinicSlug, tenantDoctorId, err.message);
  }
}

/**
 * Refresh ratings for ALL active featured doctors.
 * Called by the repeatable BullMQ job.
 */
async function refreshAllRatings() {
  const docs = await FeaturedDoctor.find({ isActive: true })
    .select('clinicSlug tenantDoctorId')
    .lean();

  logger.info('Refreshing ratings for %d featured doctors', docs.length);

  // Group by clinic to minimize connection overhead
  const byClinic = {};
  for (const d of docs) {
    if (!byClinic[d.clinicSlug]) byClinic[d.clinicSlug] = [];
    byClinic[d.clinicSlug].push(d.tenantDoctorId);
  }

  for (const [slug, doctorIds] of Object.entries(byClinic)) {
    try {
      const conn = await getTenantConnection(slug);
      const { ObjectId } = require('mongoose').Types;

      for (const tenantDoctorId of doctorIds) {
        const ratings = await _aggregateRating(conn, new ObjectId(tenantDoctorId));
        await FeaturedDoctor.findOneAndUpdate(
          { clinicSlug: slug, tenantDoctorId, isActive: true },
          { averageRating: ratings.averageRating, totalReviews: ratings.totalReviews },
        );
      }
    } catch (err) {
      logger.error('Failed to refresh ratings for clinic %s: %s', slug, err.message);
    }
  }

  logger.info('Rating refresh complete');
}

module.exports = {
  toggleFeature,
  syncFeaturedDoctor,
  refreshDoctorRating,
  refreshAllRatings,
};
