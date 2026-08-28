'use strict';

const mongoose = require('mongoose');
const { PAYSLIP_STATUS } = require('../../config/constants');

const payslipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    salaryStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryStructure',
    },

    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },

    earnings: {
      base: { type: Number, required: true, min: 0 },
      allowances: [
        {
          name: String,
          amount: { type: Number, min: 0 },
        },
      ],
      grossPay: { type: Number, required: true, min: 0 },
    },

    deductions: {
      items: [
        {
          name: String,
          amount: { type: Number, min: 0 },
        },
      ],
      totalDeductions: { type: Number, default: 0, min: 0 },
    },

    netPay: {
      type: Number,
      required: [true, 'Net pay is required'],
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(PAYSLIP_STATUS),
      default: PAYSLIP_STATUS.DRAFT,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    paidAt: Date,
    paymentMethod: { type: String, trim: true },
    paymentReference: { type: String, trim: true },

    notes: { type: String, trim: true },

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
payslipSchema.index({ user: 1, year: 1, month: 1 }, { unique: true });
payslipSchema.index({ status: 1 });
payslipSchema.index({ deletedAt: 1 });

// Soft-delete filter
payslipSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = payslipSchema;
