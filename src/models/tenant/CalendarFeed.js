'use strict';

const mongoose = require('mongoose');

const calendarFeedSchema = new mongoose.Schema(
  {
    /** Doctor (for doctor feeds) */
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /** Patient (for patient feeds) */
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
    },

    feedType: {
      type: String,
      enum: ['doctor', 'patient'],
      required: [true, 'Feed type is required'],
    },

    /** Unique token used in the public ICS URL */
    token: {
      type: String,
      required: true,
      unique: true,
    },

    isEnabled: {
      type: Boolean,
      default: true,
    },

    /** Whether to include patient names in doctor feed events */
    showPatientNames: {
      type: Boolean,
      default: false,
    },

    /** Whether to include leave events */
    includeLeaves: {
      type: Boolean,
      default: true,
    },

    /** Scope to a specific branch (null = all branches) */
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },

    lastAccessedAt: {
      type: Date,
      default: null,
    },

    accessCount: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

calendarFeedSchema.index({ token: 1 }, { unique: true });
calendarFeedSchema.index({ doctor: 1, feedType: 1 });
calendarFeedSchema.index({ patient: 1, feedType: 1 });
calendarFeedSchema.index({ deletedAt: 1 });

calendarFeedSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = calendarFeedSchema;
