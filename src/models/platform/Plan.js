'use strict';

/**
 * Plan — configurable subscription plan definitions with tier ranking.
 *
 * Key features:
 *  - Tier ranking for upgrade/downgrade logic
 *  - Automatic downgrade target when plan is retired
 *  - Custom plans scoped to a single clinic
 *  - isUpgradeTo() instance method for comparison
 */

const mongoose = require('mongoose');
const { PRICEABLE_FEATURES } = require('../../config/constants');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    /**
     * Tier rank — higher number = higher tier.
     * Used by subscription service to determine upgrade vs downgrade.
     * e.g. free=0, starter=10, professional=20, enterprise=30
     */
    tier: {
      type: Number,
      required: [true, 'Tier rank is required for upgrade/downgrade logic'],
      index: true,
    },

    /**
     * When this plan is retired, existing subscribers auto-downgrade here.
     * If null, subscriptions on this plan stay until they manually change.
     */
    downgradeTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },

    /** Pricing */
    pricing: {
      monthly: { type: Number, required: true, min: 0 },
      yearly: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR', uppercase: true },
    },

    /** Razorpay plan IDs (created via Razorpay dashboard or API) */
    razorpay: {
      monthlyPlanId: String,
      yearlyPlanId: String,
    },

    /** Feature limits for this plan */
    features: {
      maxDoctors: { type: Number, default: 1, min: 0 },
      maxStaff: { type: Number, default: 2, min: 0 },
      maxBranches: { type: Number, default: 1, min: 0 },
      maxStorageMB: { type: Number, default: 250, min: 0 },
      maxSmsPerMonth: { type: Number, default: 0, min: 0 },
      smsEnabled: { type: Boolean, default: false },
      teleHealthEnabled: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      advancedReports: { type: Boolean, default: false },
      whiteLabeling: { type: Boolean, default: false },
      jobPortalEnabled: { type: Boolean, default: false },
      jobPostingCredits: { type: Number, default: 0, min: 0 },
    },

    /** Composable add-on pricing — layered on top of base pricing */
    addOns: {
      storage: {
        enabled: { type: Boolean, default: false },
        pricePerUnitMonthly: { type: Number, default: 0, min: 0 },
        pricePerUnitYearly: { type: Number, default: 0, min: 0 },
        unitSizeMB: { type: Number, default: 1024, min: 1 },
        maxUnits: { type: Number, default: 0, min: 0 },
      },
      doctors: {
        enabled: { type: Boolean, default: false },
        pricePerDoctorMonthly: { type: Number, default: 0, min: 0 },
        pricePerDoctorYearly: { type: Number, default: 0, min: 0 },
        maxAdditional: { type: Number, default: 0, min: 0 },
      },
    },

    /**
     * Per-feature pricing — maps feature keys to individual prices.
     * Only applies to boolean features toggled ON.
     * Features included in plan with no entry here are free.
     */
    featurePricing: [
      {
        featureKey: {
          type: String,
          required: true,
          enum: PRICEABLE_FEATURES,
        },
        label: { type: String, trim: true, maxlength: 100 },
        monthlyPrice: { type: Number, required: true, min: 0 },
        yearlyPrice: { type: Number, required: true, min: 0 },
        isActive: { type: Boolean, default: true },
      },
    ],

    /**
     * Module configuration — groups features into named modules
     * for UI-level enable/disable and bundled pricing.
     */
    moduleConfig: [
      {
        moduleKey: {
          type: String,
          required: true,
          trim: true,
          match: [/^[a-z][a-zA-Z0-9_]*$/, 'Module key must be camelCase'],
        },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 300 },
        featureKeys: [{ type: String }],
        includedInPlan: { type: Boolean, default: false },
        monthlyPrice: { type: Number, default: 0, min: 0 },
        yearlyPrice: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true },
      },
    ],

    /** Trial configuration */
    trial: {
      enabled: { type: Boolean, default: true },
      durationDays: { type: Number, default: 14, min: 0 },
    },

    /** Display ordering (lower = first) */
    displayOrder: { type: Number, default: 0 },

    /** Whether this plan is visible on the pricing page */
    isPublic: { type: Boolean, default: true },

    /** Whether new subscriptions can be created on this plan */
    isActive: { type: Boolean, default: true },

    /** Custom plan — created for a specific tenant */
    isCustom: { type: Boolean, default: false },
    customForClinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
    },

    /** Metadata */
    highlights: [{ type: String, trim: true }], // marketing bullet points
    badge: { type: String, trim: true }, // e.g. "Most Popular", "Best Value"

    /** Audit trail */
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

planSchema.index({ isActive: 1, isPublic: 1, displayOrder: 1 });

/**
 * Determine whether upgrading from this plan to the target is an upgrade.
 * @param {object} targetPlan — Plan document or plain object with `tier`
 * @returns {boolean}
 */
planSchema.methods.isUpgradeTo = function (targetPlan) {
  return targetPlan.tier > this.tier;
};

/**
 * Calculate total plan price with add-ons for given quantities.
 * Does NOT include promo/rebate discounts (use pricing.service for that).
 *
 * @param {string} billingCycle — 'monthly' | 'yearly'
 * @param {object} [quantities]
 * @param {number} [quantities.extraDoctors=0]
 * @param {number} [quantities.extraStorageUnits=0]
 * @param {string[]} [quantities.enabledFeatures=[]]
 * @param {string[]} [quantities.enabledModules=[]]
 * @returns {{ basePrice, addOnBreakdown[], addOnTotal, totalBeforeDiscounts }}
 */
planSchema.methods.getComposablePrice = function (billingCycle, quantities = {}) {
  const isYearly = billingCycle === 'yearly';
  const basePrice = isYearly ? this.pricing.yearly : this.pricing.monthly;

  const breakdown = [];
  let addOnTotal = 0;

  // Doctor add-on
  const extraDoctors = quantities.extraDoctors || 0;
  if (this.addOns?.doctors?.enabled && extraDoctors > 0) {
    const cap = this.addOns.doctors.maxAdditional;
    const capped = cap > 0 ? Math.min(extraDoctors, cap) : extraDoctors;
    const perDoc = isYearly
      ? this.addOns.doctors.pricePerDoctorYearly
      : this.addOns.doctors.pricePerDoctorMonthly;
    const docCost = perDoc * capped;
    breakdown.push({ type: 'doctors', quantity: capped, unitPrice: perDoc, total: docCost });
    addOnTotal += docCost;
  }

  // Storage add-on
  const extraStorageUnits = quantities.extraStorageUnits || 0;
  if (this.addOns?.storage?.enabled && extraStorageUnits > 0) {
    const cap = this.addOns.storage.maxUnits;
    const capped = cap > 0 ? Math.min(extraStorageUnits, cap) : extraStorageUnits;
    const perUnit = isYearly
      ? this.addOns.storage.pricePerUnitYearly
      : this.addOns.storage.pricePerUnitMonthly;
    const storageCost = perUnit * capped;
    breakdown.push({
      type: 'storage',
      quantity: capped,
      unitSizeMB: this.addOns.storage.unitSizeMB,
      unitPrice: perUnit,
      total: storageCost,
    });
    addOnTotal += storageCost;
  }

  // Feature add-ons
  const enabledFeatures = quantities.enabledFeatures || [];
  for (const fp of this.featurePricing || []) {
    if (!fp.isActive) continue;
    if (enabledFeatures.includes(fp.featureKey)) {
      const fPrice = isYearly ? fp.yearlyPrice : fp.monthlyPrice;
      breakdown.push({ type: 'feature', featureKey: fp.featureKey, label: fp.label, total: fPrice });
      addOnTotal += fPrice;
    }
  }

  // Module add-ons
  const enabledModules = quantities.enabledModules || [];
  for (const mod of this.moduleConfig || []) {
    if (!mod.isActive || mod.includedInPlan) continue;
    if (enabledModules.includes(mod.moduleKey)) {
      const mPrice = isYearly ? mod.yearlyPrice : mod.monthlyPrice;
      breakdown.push({ type: 'module', moduleKey: mod.moduleKey, name: mod.name, total: mPrice });
      addOnTotal += mPrice;
    }
  }

  const totalBeforeDiscounts = Math.round((basePrice + addOnTotal) * 100) / 100;

  return { basePrice, addOnBreakdown: breakdown, addOnTotal, totalBeforeDiscounts };
};

module.exports = mongoose.model('Plan', planSchema);
