'use strict';

/**
 * JobPosting — clinic-created job listings published on the platform career portal.
 *
 * Lifecycle: draft → active → closed | filled
 * Credits are deducted on publish (draft → active transition).
 * Featured listings cost additional credits.
 */

const mongoose = require('mongoose');
const {
  JOB_STATUS,
  JOB_EMPLOYMENT_TYPE,
  JOB_EXPERIENCE_LEVEL,
  JOB_LOCATION_TYPE,
} = require('../../config/constants');

const jobPostingSchema = new mongoose.Schema(
  {
    /** Clinic that created this posting */
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: [true, 'Clinic reference is required'],
      index: true,
    },

    /** Denormalized clinic info for public listing (avoids joins) */
    clinicName: { type: String, trim: true },
    clinicLogo: { type: String },
    clinicLocation: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: 'IN' },
    },

    // ─── Job Details ──────────────────────────────────

    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      maxlength: 100,
    },
    employmentType: {
      type: String,
      enum: Object.values(JOB_EMPLOYMENT_TYPE),
      required: [true, 'Employment type is required'],
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      maxlength: 10000,
    },

    // ─── Compensation ─────────────────────────────────

    compensation: {
      salaryMin: { type: Number, min: 0, default: 0 },
      salaryMax: { type: Number, min: 0, default: 0 },
      currency: { type: String, default: 'INR', uppercase: true, maxlength: 3 },
      showSalary: { type: Boolean, default: true },
      hasBenefits: { type: Boolean, default: false },
    },

    // ─── Requirements ─────────────────────────────────

    requirements: {
      experienceLevel: {
        type: String,
        enum: Object.values(JOB_EXPERIENCE_LEVEL),
        default: JOB_EXPERIENCE_LEVEL.ENTRY,
      },
      certifications: [{ type: String, trim: true, maxlength: 100 }],
      skills: [{ type: String, trim: true, maxlength: 100 }],
    },

    // ─── Location ─────────────────────────────────────

    location: {
      type: {
        type: String,
        enum: Object.values(JOB_LOCATION_TYPE),
        default: JOB_LOCATION_TYPE.ON_SITE,
      },
      city: { type: String, trim: true, maxlength: 100 },
      state: { type: String, trim: true, maxlength: 100 },
    },

    // ─── Status & Lifecycle ───────────────────────────

    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.DRAFT,
      index: true,
    },
    isFeatured: { type: Boolean, default: false },

    /** Number of credits consumed when this job was published */
    creditCost: { type: Number, default: 0, min: 0 },

    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    // ─── Stats (denormalized counters) ────────────────

    stats: {
      views: { type: Number, default: 0, min: 0 },
      applications: { type: Number, default: 0, min: 0 },
    },

    /** userId from the tenant DB who created this posting */
    createdBy: { type: String },

    /** Soft delete */
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

// ─── Indexes ────────────────────────────────────────

jobPostingSchema.index({ clinic: 1, status: 1 });
jobPostingSchema.index({ status: 1, publishedAt: -1 });
jobPostingSchema.index({ slug: 1 }, { unique: true });
jobPostingSchema.index({ expiresAt: 1 });
jobPostingSchema.index({ 'location.city': 1, department: 1 });
jobPostingSchema.index({ isFeatured: -1, publishedAt: -1 });

// ─── Soft-delete filter ─────────────────────────────

jobPostingSchema.pre(/^find/, function () {
  if (this.getOptions().skipSoftDelete) return;
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// ─── Auto-generate slug ─────────────────────────────

jobPostingSchema.pre('save', function (next) {
  if (!this.slug && this.title) {
    const base = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
    this.slug = `${base}-${Date.now().toString(36)}`;
  }
  next();
});

module.exports = mongoose.model('JobPosting', jobPostingSchema);
