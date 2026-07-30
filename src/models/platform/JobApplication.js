'use strict';

/**
 * JobApplication — tracks a public applicant's submission to a job posting.
 *
 * No candidate account required — applicant info is stored inline.
 * Clinics view a simple data table of applicants per job.
 */

const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema(
  {
    /** The job this application is for */
    jobPosting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPosting',
      required: [true, 'Job posting reference is required'],
      index: true,
    },

    /** Clinic that owns the job posting (denormalized for efficient queries) */
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: [true, 'Clinic reference is required'],
      index: true,
    },

    // ─── Applicant Info (inline — no account needed) ────

    applicantName: {
      type: String,
      required: [true, 'Applicant name is required'],
      trim: true,
      maxlength: 200,
    },

    applicantEmail: {
      type: String,
      required: [true, 'Applicant email is required'],
      lowercase: true,
      trim: true,
    },

    applicantPhone: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    // ─── Resume & Cover Letter ───────────────────────

    resume: {
      fileUrl: { type: String },
      fileName: { type: String },
    },

    coverLetter: { type: String, maxlength: 5000 },

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

jobApplicationSchema.index({ applicantEmail: 1, jobPosting: 1 }, { unique: true }); // prevent duplicate applications
jobApplicationSchema.index({ clinic: 1, createdAt: -1 });
jobApplicationSchema.index({ createdAt: -1 });

// ─── Soft-delete filter ─────────────────────────────

jobApplicationSchema.pre(/^find/, function () {
  if (this.getOptions().skipSoftDelete) return;
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
