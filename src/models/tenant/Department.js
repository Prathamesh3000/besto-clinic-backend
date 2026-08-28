'use strict';

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true,
    },
    headOfDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
departmentSchema.index({ branch: 1, code: 1 }, { unique: true });
departmentSchema.index({ deletedAt: 1 });

// Soft-delete filter
departmentSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = departmentSchema;
