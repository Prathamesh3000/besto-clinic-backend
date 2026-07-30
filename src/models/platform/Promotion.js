'use strict';

/**
 * Promotion — coupon/discount codes for subscription plans.
 */

const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Promotion code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]+$/, 'Code must contain only uppercase letters, numbers, hyphens, underscores'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    /** Discount type */
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

    /** Applicability */
    applicablePlans: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
    }], // empty = all plans
    applicableBillingCycles: [{
      type: String,
      enum: ['monthly', 'yearly'],
    }], // empty = both

    /** Tenant targeting — empty = global (all clinics), populated = only listed clinics */
    targetClinics: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
    }],

    /** Duration of discount */
    durationMonths: {
      type: Number,
      default: 1, // how many billing cycles the discount applies
      min: 1,
    },

    /** Validity */
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    /** Usage limits */
    maxRedemptions: { type: Number, default: null }, // null = unlimited
    currentRedemptions: { type: Number, default: 0, min: 0 },

    /** Per-clinic limit */
    maxPerClinic: { type: Number, default: 1, min: 1 },

    /** Track which clinics used this */
    redemptions: [{
      clinic: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' },
      redeemedAt: { type: Date, default: Date.now },
      subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    }],

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

promotionSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1 });
promotionSchema.index({ targetClinics: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
