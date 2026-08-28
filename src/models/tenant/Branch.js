'use strict';

const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: [true, 'Branch code is required'],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'IN' },
    },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },

    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    operatingHours: [
      {
        day: {
          type: String,
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        },
        openTime: String,  // "09:00"
        closeTime: String, // "18:00"
        isClosed: { type: Boolean, default: false },
      },
    ],

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ isActive: 1 });
branchSchema.index({ deletedAt: 1 });

// Soft-delete filter
branchSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = branchSchema;
