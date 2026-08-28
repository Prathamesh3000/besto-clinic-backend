'use strict';

const mongoose = require('mongoose');
const { CASH_REGISTER_STATUS } = require('../../config/constants');

const cashRegisterSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      // Indexed below: a compound {branch, status} plus a partial unique index
      // enforcing one open register per branch. Declaring index: true here as
      // well produced a third, redundant index on the same key.
    },
    openedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    openingBalance: { type: Number, required: true, min: 0 },
    closingBalance: { type: Number, min: 0 },
    expectedBalance: { type: Number, min: 0 },
    variance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(CASH_REGISTER_STATUS),
      default: CASH_REGISTER_STATUS.OPEN,
    },
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: Date,
    reconciledAt: Date,
    reconciledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    /** Manager approval */
    managerApproval: {
      required: { type: Boolean, default: false },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedAt: Date,
      notes: { type: String, trim: true },
    },

    /** Running totals */
    cashIn: { type: Number, default: 0, min: 0 },
    cashOut: { type: Number, default: 0, min: 0 },
    transactionCount: { type: Number, default: 0, min: 0 },

    notes: { type: String, trim: true },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
cashRegisterSchema.index({ branch: 1, status: 1 });
cashRegisterSchema.index({ openedAt: -1 });
cashRegisterSchema.index({ deletedAt: 1 });
// Unique partial index: only one open register per branch at a time
cashRegisterSchema.index(
  { branch: 1 },
  { unique: true, partialFilterExpression: { status: 'open', deletedAt: null } },
);

// Soft-delete filter
cashRegisterSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = cashRegisterSchema;
