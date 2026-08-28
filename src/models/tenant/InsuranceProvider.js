'use strict';

const mongoose = require('mongoose');

const insuranceProviderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Provider name is required'],
      trim: true,
      maxlength: 200,
    },
    code: {
      type: String,
      required: [true, 'Provider code is required'],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'IN' },
    },

    plans: [
      {
        name: { type: String, required: true },
        coverageType: {
          type: String,
          enum: ['individual', 'family', 'group'],
          default: 'individual',
        },
        maxCoverage: { type: Number, min: 0 },
        copayPercent: { type: Number, min: 0, max: 100 },
      },
    ],

    claimSubmissionProcess: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
insuranceProviderSchema.index({ code: 1 }, { unique: true });
insuranceProviderSchema.index({ isActive: 1 });
insuranceProviderSchema.index({ deletedAt: 1 });

// Soft-delete filter
insuranceProviderSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = insuranceProviderSchema;
