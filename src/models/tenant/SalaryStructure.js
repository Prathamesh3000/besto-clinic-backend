'use strict';

const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    baseSalary: {
      type: Number,
      required: [true, 'Base salary is required'],
      min: 0,
    },

    allowances: [
      {
        name: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        isFixed: { type: Boolean, default: true }, // false = percentage of base
      },
    ],

    deductions: [
      {
        name: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        isFixed: { type: Boolean, default: true },
      },
    ],

    currency: { type: String, default: 'INR', maxlength: 3 },

    effectiveFrom: {
      type: Date,
      required: [true, 'Effective from date is required'],
    },
    effectiveTo: Date,

    isActive: { type: Boolean, default: true },

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

// Indexes
salaryStructureSchema.index({ user: 1, effectiveFrom: -1 });
salaryStructureSchema.index({ deletedAt: 1 });

// Soft-delete filter
salaryStructureSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = salaryStructureSchema;
