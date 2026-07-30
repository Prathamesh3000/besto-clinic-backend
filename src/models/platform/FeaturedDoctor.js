'use strict';

const mongoose = require('mongoose');

const featuredDoctorSchema = new mongoose.Schema(
  {
    // ── Clinic reference (denormalized from platform Clinic model) ──
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    clinicSlug: { type: String, required: true, index: true },
    clinicName: { type: String, required: true },
    clinicLogo: String,
    clinicCity: String,

    // ── Branch reference (denormalized from tenant DB) ──
    branchId: { type: String },
    branchName: { type: String, trim: true },
    branchCode: { type: String, trim: true },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },

    // ── Doctor identity (from tenant DB User doc) ──
    tenantDoctorId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    avatar: String,

    // ── Profile (synced from tenant User.doctorProfile + top-level fields) ──
    specializations: { type: [String], index: true },
    bio: { type: String, trim: true, maxlength: 1000 },
    education: [{
      degree: String,
      institution: String,
      year: Number,
    }],
    experienceYears: Number,
    qualifications: [String],
    languages: [String],
    consultationFee: Number,
    acceptingNewPatients: { type: Boolean, default: true },

    // ── Ratings (aggregated from tenant Review collection) ──
    averageRating: { type: Number, min: 0, max: 5, default: 0 },
    totalReviews: { type: Number, default: 0 },

    // ── Lifecycle ──
    isActive: { type: Boolean, default: true },
    publishedAt: Date,
    verifiedByPlatform: { type: Boolean, default: false },
    verifiedAt: Date,

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes
featuredDoctorSchema.index({ specializations: 1, isActive: 1 });
featuredDoctorSchema.index({ clinicSlug: 1, tenantDoctorId: 1 }, { unique: true });
featuredDoctorSchema.index({ isActive: 1, averageRating: -1 });
featuredDoctorSchema.index({ clinicCity: 1, isActive: 1 });
featuredDoctorSchema.index({ location: '2dsphere' });
featuredDoctorSchema.index({ deletedAt: 1 });
featuredDoctorSchema.index({ branchId: 1, isActive: 1 });

// Soft-delete filter
featuredDoctorSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = mongoose.model('FeaturedDoctor', featuredDoctorSchema);
