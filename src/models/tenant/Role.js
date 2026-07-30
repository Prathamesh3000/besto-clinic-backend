'use strict';

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: [true, 'Role slug is required'],
      lowercase: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    group: {
      type: String,
      enum: ['admin', 'clinical', 'front_desk', 'finance'],
      required: [true, 'Role group is required'],
    },
    permissions: [{ type: String, trim: true }],

    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
roleSchema.index({ slug: 1 }, { unique: true });
roleSchema.index({ deletedAt: 1 });
roleSchema.index({ isActive: 1, deletedAt: 1 });

// Soft-delete filter
roleSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = roleSchema;
