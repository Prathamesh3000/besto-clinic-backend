'use strict';

/**
 * Rebate — volume/loyalty-based discounts applied automatically.
 */

const mongoose = require('mongoose');

const rebateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Rebate name is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    /** Rebate type */
    type: {
      type: String,
      enum: ['loyalty', 'volume', 'referral', 'annual_commitment'],
      required: true,
    },

    /** Discount */
    discountType: {
      type: String,
      enum: ['percentage', 'flat'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    /** Trigger conditions */
    conditions: {
      /** Loyalty: minimum months subscribed */
      minSubscriptionMonths: { type: Number, default: 0 },
      /** Volume: minimum number of active branches/doctors */
      minDoctors: { type: Number, default: 0 },
      minBranches: { type: Number, default: 0 },
      /** Referral: minimum referrals made */
      minReferrals: { type: Number, default: 0 },
      /** Annual commitment */
      requiresYearlyBilling: { type: Boolean, default: false },
    },

    /** Applicable plans (empty = all plans) */
    applicablePlans: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
    }],

    /** Stacking — can this rebate be combined with other rebates/promotions? */
    stackable: { type: Boolean, default: false },

    /** Priority for non-stackable conflicts (higher = applied first) */
    priority: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformUser',
    },
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

rebateSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('Rebate', rebateSchema);
