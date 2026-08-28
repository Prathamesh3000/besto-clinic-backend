'use strict';

const Joi = require('joi');

// ─── Tenant Validators ─────────────────────────────────

const createTenantSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(60).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().max(20).allow('', null),
  address: Joi.object({
    street: Joi.string().trim().max(200),
    locality: Joi.string().trim().max(200),
    city: Joi.string().trim().max(100),
    state: Joi.string().trim().max(100),
    zipCode: Joi.string().trim().max(20),
    country: Joi.string().trim().length(2).uppercase().default('IN'),
  }),
  logo: Joi.string().uri().allow('', null),
  plan: Joi.string().trim().lowercase().allow('', null),
  superAdmin: Joi.object({
    name: Joi.string().trim().max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().trim().max(20).allow('', null),
  }).required(),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().trim().max(200),
  email: Joi.string().email(),
  phone: Joi.string().trim().max(20),
  address: Joi.object({
    street: Joi.string().trim().max(200),
    locality: Joi.string().trim().max(200),
    city: Joi.string().trim().max(100),
    state: Joi.string().trim().max(100),
    zipCode: Joi.string().trim().max(20),
    country: Joi.string().trim().length(2).uppercase(),
  }),
  logo: Joi.string().uri().allow('', null),
  website: Joi.string().uri().allow('', null),
}).min(1);

const assignSuperAdminSchema = Joi.object({
  userId: Joi.string().trim().allow('', null),
  name: Joi.string().trim().max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().max(20).allow('', null),
});

const suspendTenantSchema = Joi.object({
  reason: Joi.string().trim().max(500).required(),
});

const deleteTenantSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow('', null),
});

const syncUsageSchema = Joi.object({
  doctorsCount: Joi.number().integer().min(0),
  staffCount: Joi.number().integer().min(0),
  branchesCount: Joi.number().integer().min(0),
  patientsCount: Joi.number().integer().min(0),
  storageUsedMB: Joi.number().min(0),
  smsUsedThisMonth: Joi.number().integer().min(0),
}).min(1);

const updateFeaturesSchema = Joi.object({
  features: Joi.object({
    maxDoctors: Joi.number().integer().min(0),
    maxStaff: Joi.number().integer().min(0),
    maxBranches: Joi.number().integer().min(0),
    maxStorageMB: Joi.number().integer().min(0),
    maxSmsPerMonth: Joi.number().integer().min(0),
    smsEnabled: Joi.boolean(),
    teleHealthEnabled: Joi.boolean(),
    customBranding: Joi.boolean(),
    apiAccess: Joi.boolean(),
    prioritySupport: Joi.boolean(),
    advancedReports: Joi.boolean(),
    whiteLabeling: Joi.boolean(),
  }).required(),
});

// ─── Shared Add-on Sub-schemas ─────────────────────────

const PRICEABLE_FEATURE_KEYS = [
  'smsEnabled', 'teleHealthEnabled', 'customBranding',
  'apiAccess', 'prioritySupport', 'advancedReports', 'whiteLabeling',
];

const storageAddOnSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  pricePerUnitMonthly: Joi.number().min(0).default(0),
  pricePerUnitYearly: Joi.number().min(0).default(0),
  unitSizeMB: Joi.number().integer().min(1).default(1024),
  maxUnits: Joi.number().integer().min(0).default(0),
});

const doctorAddOnSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  pricePerDoctorMonthly: Joi.number().min(0).default(0),
  pricePerDoctorYearly: Joi.number().min(0).default(0),
  maxAdditional: Joi.number().integer().min(0).default(0),
});

const featurePricingItemSchema = Joi.object({
  featureKey: Joi.string().valid(...PRICEABLE_FEATURE_KEYS).required(),
  label: Joi.string().trim().max(100).allow('', null),
  monthlyPrice: Joi.number().min(0).required(),
  yearlyPrice: Joi.number().min(0).required(),
  isActive: Joi.boolean().default(true),
});

const moduleConfigItemSchema = Joi.object({
  moduleKey: Joi.string().trim().pattern(/^[a-z][a-zA-Z0-9_]*$/).required(),
  name: Joi.string().trim().max(100).required(),
  description: Joi.string().trim().max(300).allow('', null),
  featureKeys: Joi.array().items(Joi.string().trim()),
  includedInPlan: Joi.boolean().default(false),
  monthlyPrice: Joi.number().min(0).default(0),
  yearlyPrice: Joi.number().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

/** Reusable add-on quantity fields for pricing endpoints */
const addOnQuantityFields = {
  extraDoctors: Joi.number().integer().min(0).default(0),
  extraStorageUnits: Joi.number().integer().min(0).default(0),
  enabledFeatures: Joi.array().items(Joi.string().valid(...PRICEABLE_FEATURE_KEYS)).default([]),
  enabledModules: Joi.array().items(Joi.string().trim()).default([]),
};

// ─── Plan Validators ────────────────────────────────────

const createPlanSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).required(),
  description: Joi.string().trim().max(500).allow(''),
  tier: Joi.number().integer().min(0).required(),
  downgradeTo: Joi.string().hex().length(24).allow(null),
  pricing: Joi.object({
    monthly: Joi.number().min(0).max(999999).required(),
    yearly: Joi.number().min(0).max(999999).required(),
    currency: Joi.string().length(3).uppercase().default('INR'),
  }).required(),
  razorpay: Joi.object({
    monthlyPlanId: Joi.string().allow('', null),
    yearlyPlanId: Joi.string().allow('', null),
  }),
  features: Joi.object({
    maxDoctors: Joi.number().integer().min(0).default(1),
    maxStaff: Joi.number().integer().min(0).default(5),
    maxBranches: Joi.number().integer().min(0).default(1),
    maxStorageMB: Joi.number().integer().min(0).default(500),
    maxSmsPerMonth: Joi.number().integer().min(0).default(0),
    smsEnabled: Joi.boolean().default(false),
    teleHealthEnabled: Joi.boolean().default(false),
    customBranding: Joi.boolean().default(false),
    apiAccess: Joi.boolean().default(false),
    prioritySupport: Joi.boolean().default(false),
    advancedReports: Joi.boolean().default(false),
    whiteLabeling: Joi.boolean().default(false),
  }),
  addOns: Joi.object({
    storage: storageAddOnSchema,
    doctors: doctorAddOnSchema,
  }),
  featurePricing: Joi.array().items(featurePricingItemSchema),
  moduleConfig: Joi.array().items(moduleConfigItemSchema),
  trial: Joi.object({
    enabled: Joi.boolean().default(true),
    durationDays: Joi.number().integer().min(0).default(14),
  }),
  displayOrder: Joi.number().integer().min(0).default(0),
  isPublic: Joi.boolean().default(true),
  highlights: Joi.array().items(Joi.string().trim().max(200)),
  badge: Joi.string().trim().max(50).allow('', null),
});

const updatePlanSchema = Joi.object({
  name: Joi.string().trim().max(100),
  description: Joi.string().trim().max(500).allow(''),
  tier: Joi.number().integer().min(0),
  downgradeTo: Joi.string().hex().length(24).allow(null),
  pricing: Joi.object({
    monthly: Joi.number().min(0),
    yearly: Joi.number().min(0),
    currency: Joi.string().length(3).uppercase(),
  }),
  razorpay: Joi.object({
    monthlyPlanId: Joi.string().allow('', null),
    yearlyPlanId: Joi.string().allow('', null),
  }),
  features: Joi.object({
    maxDoctors: Joi.number().integer().min(0),
    maxStaff: Joi.number().integer().min(0),
    maxBranches: Joi.number().integer().min(0),
    maxStorageMB: Joi.number().integer().min(0),
    maxSmsPerMonth: Joi.number().integer().min(0),
    smsEnabled: Joi.boolean(),
    teleHealthEnabled: Joi.boolean(),
    customBranding: Joi.boolean(),
    apiAccess: Joi.boolean(),
    prioritySupport: Joi.boolean(),
    advancedReports: Joi.boolean(),
    whiteLabeling: Joi.boolean(),
  }),
  addOns: Joi.object({
    storage: storageAddOnSchema,
    doctors: doctorAddOnSchema,
  }),
  featurePricing: Joi.array().items(featurePricingItemSchema),
  moduleConfig: Joi.array().items(moduleConfigItemSchema),
  trial: Joi.object({
    enabled: Joi.boolean(),
    durationDays: Joi.number().integer().min(0),
  }),
  displayOrder: Joi.number().integer().min(0),
  isPublic: Joi.boolean(),
  isActive: Joi.boolean(),
  highlights: Joi.array().items(Joi.string().trim().max(200)),
  badge: Joi.string().trim().max(50).allow('', null),
}).min(1);

// ─── Subscription Validators ───────────────────────────

const createSubscriptionSchema = Joi.object({
  plan: Joi.string().trim().lowercase().required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),
  promoCode: Joi.string().trim().uppercase().allow('', null),
});

const changePlanSchema = Joi.object({
  plan: Joi.string().trim().lowercase().required(),
  billingCycle: Joi.string().valid('monthly', 'yearly'),
  promoCode: Joi.string().trim().uppercase().allow('', null),
  reason: Joi.string().trim().max(500).allow('', null),
  ...addOnQuantityFields,
});

const setCustomPricingSchema = Joi.object({
  enabled: Joi.boolean().required(),
  amount: Joi.when('enabled', {
    is: true,
    then: Joi.number().min(0).max(999999).required(),
    otherwise: Joi.number().min(0).max(999999).allow(null),
  }),
  reason: Joi.string().trim().max(500).allow('', null),
});

const cancelSubscriptionSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow('', null),
});

// ─── Promotion Validators ───────────────────────────────

const createPromotionSchema = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]+$/).max(30).required(),
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(500).allow(''),
  discountType: Joi.string().valid('percentage', 'flat').required(),
  discountValue: Joi.when('discountType', {
    is: 'percentage',
    then: Joi.number().min(0).max(100).required(),
    otherwise: Joi.number().min(0).max(999999).required(),
  }),
  applicablePlans: Joi.array().items(Joi.string().hex().length(24)),
  applicableBillingCycles: Joi.array().items(Joi.string().valid('monthly', 'yearly')),
  targetClinics: Joi.array().items(Joi.string().hex().length(24)),
  durationMonths: Joi.number().integer().min(1).default(1),
  startsAt: Joi.date().iso().required(),
  expiresAt: Joi.date().iso().greater(Joi.ref('startsAt')).required(),
  maxRedemptions: Joi.number().integer().min(1).allow(null),
  maxPerClinic: Joi.number().integer().min(1).default(1),
  isActive: Joi.boolean().default(true),
});

const updatePromotionSchema = Joi.object({
  name: Joi.string().trim().max(200),
  description: Joi.string().trim().max(500).allow(''),
  discountType: Joi.string().valid('percentage', 'flat'),
  discountValue: Joi.number().min(0),
  applicablePlans: Joi.array().items(Joi.string().hex().length(24)),
  applicableBillingCycles: Joi.array().items(Joi.string().valid('monthly', 'yearly')),
  targetClinics: Joi.array().items(Joi.string().hex().length(24)),
  durationMonths: Joi.number().integer().min(1),
  startsAt: Joi.date().iso(),
  expiresAt: Joi.date().iso(),
  maxRedemptions: Joi.number().integer().min(1).allow(null),
  maxPerClinic: Joi.number().integer().min(1),
  isActive: Joi.boolean(),
}).min(1);

// ─── Rebate Validators ──────────────────────────────────

const createRebateSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(500).allow(''),
  type: Joi.string().valid('loyalty', 'volume', 'referral', 'annual_commitment').required(),
  discountType: Joi.string().valid('percentage', 'flat').required(),
  discountValue: Joi.when('discountType', {
    is: 'percentage',
    then: Joi.number().min(0).max(100).required(),
    otherwise: Joi.number().min(0).max(999999).required(),
  }),
  conditions: Joi.object({
    minSubscriptionMonths: Joi.number().integer().min(0).default(0),
    minDoctors: Joi.number().integer().min(0).default(0),
    minBranches: Joi.number().integer().min(0).default(0),
    minReferrals: Joi.number().integer().min(0).default(0),
    requiresYearlyBilling: Joi.boolean().default(false),
  }),
  applicablePlans: Joi.array().items(Joi.string().hex().length(24)),
  stackable: Joi.boolean().default(false),
  priority: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const updateRebateSchema = Joi.object({
  name: Joi.string().trim().max(200),
  description: Joi.string().trim().max(500).allow(''),
  discountType: Joi.string().valid('percentage', 'flat'),
  discountValue: Joi.number().min(0),
  conditions: Joi.object({
    minSubscriptionMonths: Joi.number().integer().min(0),
    minDoctors: Joi.number().integer().min(0),
    minBranches: Joi.number().integer().min(0),
    minReferrals: Joi.number().integer().min(0),
    requiresYearlyBilling: Joi.boolean(),
  }),
  applicablePlans: Joi.array().items(Joi.string().hex().length(24)),
  stackable: Joi.boolean(),
  priority: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
}).min(1);

// ─── Feature Flag Validators ────────────────────────────

const createFeatureFlagSchema = Joi.object({
  key: Joi.string().trim().pattern(/^[a-z][a-zA-Z0-9_]*$/).required(),
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(500).allow(''),
  valueType: Joi.string().valid('boolean', 'number', 'string').required(),
  defaultValue: Joi.alternatives()
    .conditional('valueType', {
      switch: [
        { is: 'boolean', then: Joi.boolean().required() },
        { is: 'number', then: Joi.number().required() },
        { is: 'string', then: Joi.string().required() },
      ],
    })
    .required(),
  category: Joi.string().valid('core', 'communication', 'billing', 'clinical', 'integration', 'ui').default('core'),
  isActive: Joi.boolean().default(true),
});

const updateFeatureFlagSchema = Joi.object({
  name: Joi.string().trim().max(200),
  description: Joi.string().trim().max(500).allow(''),
  defaultValue: Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string()),
  planDefaults: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string())),
  category: Joi.string().valid('core', 'communication', 'billing', 'clinical', 'integration', 'ui'),
  isActive: Joi.boolean(),
}).min(1);

const tenantOverrideSchema = Joi.object({
  flagId: Joi.string().hex().length(24).required(),
  clinicSlug: Joi.string().trim().required(),
  value: Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string()).required(),
});

const removeTenantOverrideSchema = Joi.object({
  flagId: Joi.string().hex().length(24).required(),
  clinicSlug: Joi.string().trim().required(),
});

// ─── Pricing Validators ────────────────────────────────

const calculatePriceSchema = Joi.object({
  planId: Joi.string().hex().length(24).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').required(),
  promoCode: Joi.string().trim().uppercase().allow('', null),
  clinicSlug: Joi.string().trim().allow('', null),
  ...addOnQuantityFields,
});

const calculateProrationSchema = Joi.object({
  newPlanId: Joi.string().hex().length(24).required(),
  newBillingCycle: Joi.string().valid('monthly', 'yearly'),
  ...addOnQuantityFields,
});

const comparePlansSchema = Joi.object({
  planIdA: Joi.string().hex().length(24).required(),
  planIdB: Joi.string().hex().length(24).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),
  ...addOnQuantityFields,
});

// ─── Misc Validators ────────────────────────────────────

const extendTrialSchema = Joi.object({
  additionalDays: Joi.number().integer().min(1).max(90).required(),
});

const createPlatformUserSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

const validatePromoCodeSchema = Joi.object({
  code: Joi.string().trim().uppercase().required(),
  planId: Joi.string().hex().length(24).allow(null),
  billingCycle: Joi.string().valid('monthly', 'yearly').allow(null),
  clinicSlug: Joi.string().trim().allow(null),
});

// ─── Referral Validators ──────────────────────────────

const lookupReferralCodeSchema = Joi.object({
  referralCode: Joi.string().trim().uppercase().required(),
});

const applyReferralCodeSchema = Joi.object({
  referralCode: Joi.string().trim().uppercase().required(),
});

// ─── Analytics Validators ─────────────────────────────

const analyticsQuerySchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().when('startDate', {
    is: Joi.exist(),
    then: Joi.date().greater(Joi.ref('startDate')),
  }),
  days: Joi.number().integer().min(1).max(365).default(30),
});

const uploadLogoSchema = Joi.object({
  imageData: Joi.string().required(),
  mimeType: Joi.string().valid('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml').default('image/png'),
});

module.exports = {
  // Tenant
  createTenantSchema,
  updateTenantSchema,
  assignSuperAdminSchema,
  suspendTenantSchema,
  deleteTenantSchema,
  syncUsageSchema,
  updateFeaturesSchema,
  // Plan
  createPlanSchema,
  updatePlanSchema,
  // Subscription
  createSubscriptionSchema,
  changePlanSchema,
  setCustomPricingSchema,
  cancelSubscriptionSchema,
  // Promotion
  createPromotionSchema,
  updatePromotionSchema,
  // Rebate
  createRebateSchema,
  updateRebateSchema,
  // Feature Flag
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  tenantOverrideSchema,
  removeTenantOverrideSchema,
  // Pricing
  calculatePriceSchema,
  calculateProrationSchema,
  comparePlansSchema,
  // Referral
  lookupReferralCodeSchema,
  applyReferralCodeSchema,
  // Analytics
  analyticsQuerySchema,
  // Misc
  extendTrialSchema,
  createPlatformUserSchema,
  validatePromoCodeSchema,
  uploadLogoSchema,
};
