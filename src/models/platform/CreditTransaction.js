'use strict';

/**
 * CreditTransaction — immutable audit log of every credit movement.
 *
 * Each record snapshots the running balance at the time of the transaction.
 * Positive amounts = credits in, negative amounts = credits out.
 */

const mongoose = require('mongoose');
const {
  CREDIT_TRANSACTION_TYPE,
  CREDIT_ACTION,
} = require('../../config/constants');

const creditTransactionSchema = new mongoose.Schema(
  {
    /** Wallet this transaction belongs to */
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditWallet',
      required: [true, 'Wallet reference is required'],
      index: true,
    },

    /** Clinic (denormalized for efficient queries) */
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: [true, 'Clinic reference is required'],
      index: true,
    },

    // ─── Transaction Details ─────────────────────────

    /** High-level category */
    type: {
      type: String,
      enum: Object.values(CREDIT_TRANSACTION_TYPE),
      required: [true, 'Transaction type is required'],
    },

    /** Positive for credits in, negative for credits out */
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
    },

    /** Running balance snapshot after this transaction */
    balanceAfter: {
      type: Number,
      required: [true, 'Balance snapshot is required'],
    },

    /** Specific action that triggered this transaction */
    action: {
      type: String,
      enum: Object.values(CREDIT_ACTION),
    },

    // ─── References ──────────────────────────────────

    reference: {
      jobPosting: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'JobPosting',
      },
      razorpayPaymentId: { type: String },
      razorpayOrderId: { type: String },
    },

    /** Human-readable description */
    description: { type: String, maxlength: 500 },

    /** userId or 'system' */
    performedBy: { type: String },
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

creditTransactionSchema.index({ clinic: 1, createdAt: -1 });
creditTransactionSchema.index({ wallet: 1, type: 1 });
creditTransactionSchema.index({ 'reference.razorpayPaymentId': 1 }, { sparse: true });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
