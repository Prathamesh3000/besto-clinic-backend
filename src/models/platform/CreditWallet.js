'use strict';

/**
 * CreditWallet — per-clinic credit balance for the job portal.
 *
 * Each clinic has exactly one wallet. Credits are granted via plan subscription
 * and can be purchased as fixed packs. Credits are consumed when publishing
 * or featuring job postings.
 */

const mongoose = require('mongoose');

const creditWalletSchema = new mongoose.Schema(
  {
    /** Clinic that owns this wallet (one-to-one) */
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: [true, 'Clinic reference is required'],
      unique: true,
      index: true,
    },

    /** Current available credit balance */
    balance: { type: Number, default: 0, min: 0 },

    /** Lifetime credits purchased (plan grants + pack purchases) */
    totalPurchased: { type: Number, default: 0, min: 0 },

    /** Lifetime credits consumed (job publishes + features) */
    totalConsumed: { type: Number, default: 0, min: 0 },

    lastTopUpAt: { type: Date },
    lastDeductionAt: { type: Date },
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

creditWalletSchema.index({ clinic: 1 }, { unique: true });

module.exports = mongoose.model('CreditWallet', creditWalletSchema);
