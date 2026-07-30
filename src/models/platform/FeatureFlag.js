'use strict';

/**
 * FeatureFlag — dynamic feature toggles at plan or tenant level.
 *
 * Hierarchy: tenant override > plan default > global default
 */

const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Feature flag key is required'],
      unique: true,
      trim: true,
      match: [/^[a-z][a-zA-Z0-9_]*$/, 'Key must be camelCase (e.g. teleHealthEnabled)'],
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

    /** Value type — determines how the flag is evaluated */
    valueType: {
      type: String,
      enum: ['boolean', 'number', 'string'],
      required: true,
    },

    /** Global default value (fallback if no plan/tenant override exists) */
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    /** Per-plan defaults: { planSlug: value } */
    planDefaults: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },

    /** Per-tenant overrides: { clinicSlug: value } */
    tenantOverrides: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },

    /** Grouping for UI */
    category: {
      type: String,
      enum: ['core', 'communication', 'billing', 'clinical', 'integration', 'ui'],
      default: 'core',
    },

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

featureFlagSchema.index({ category: 1, isActive: 1 });

/**
 * Resolve the effective value for a given clinic/plan context.
 */
featureFlagSchema.methods.resolve = function (clinicSlug, planSlug) {
  // 1. Tenant override takes priority
  if (clinicSlug && this.tenantOverrides.has(clinicSlug)) {
    return this.tenantOverrides.get(clinicSlug);
  }
  // 2. Plan default
  if (planSlug && this.planDefaults.has(planSlug)) {
    return this.planDefaults.get(planSlug);
  }
  // 3. Global default
  return this.defaultValue;
};

module.exports = mongoose.model('FeatureFlag', featureFlagSchema);
