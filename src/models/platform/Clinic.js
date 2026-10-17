'use strict';

const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LEGACY, TENANT_STATUS, TENANT_TRANSITIONS } = require('../../config/constants');

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Clinic name is required'],
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      street: String,
      locality: String, // e.g. "Viman Nagar", "Karve Nagar" — sub-city area
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'IN' },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    logo: String,
    website: String,

    /**
     * Human-readable clinic code (e.g. SMILE2847, HEALTH1034).
     * Auto-generated during provisioning. Used by patients to identify
     * their clinic without exposing internal slugs.
     */
    clinicCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3,6}\d{4}$/, 'Clinic code must be 3-6 uppercase letters followed by 4 digits'],
    },

    /** Subdomain for this tenant (e.g. "my-clinic" → my-clinic.bestoclinic.com) */
    subdomain: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Subdomain: lowercase letters, numbers, hyphens only'],
    },

    /** Optional custom domain (e.g. "appointments.myclinic.com") */
    customDomain: {
      type: String,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    /** Registration documents uploaded during self-service signup */
    documents: [{
      name: { type: String, required: true },
      type: {
        type: String,
        enum: ['business_registration', 'medical_license', 'tax_certificate', 'insurance', 'other'],
        required: true,
      },
      url: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    }],

    /** How this clinic was registered */
    registrationSource: {
      type: String,
      enum: ['platform_admin', 'self_service'],
      default: 'platform_admin',
    },

    /** MongoDB connection URI for this tenant's isolated database */
    /**
     * Which entities this clinic reads and writes from PostgreSQL.
     *
     * The migration cuts over one clinic at a time (plan phase 7). Before this,
     * the only switch was the global `SQL_ENTITIES` environment variable, which
     * moves every clinic together — a big-bang cutover, and the opposite of
     * what a rehearsed rollback needs.
     *
     * Held on the clinic rather than in configuration so the state survives a
     * restart, is visible to anyone reading the registry, and can be rolled
     * back for one clinic without redeploying or disturbing the others.
     *
     * `cutoverAt` and `rolledBackAt` are kept rather than inferred from the
     * list being empty: "never cut over" and "cut over and reverted" are
     * different facts, and the second is the one worth knowing afterwards.
     */
    migration: {
      sqlEntities: { type: [String], default: [] },
      cutoverAt: { type: Date, default: null },
      rolledBackAt: { type: Date, default: null },
      rollbackReason: { type: String, trim: true, maxlength: 500 },
      lastVerifiedAt: { type: Date, default: null },
    },

    dbUri: {
      type: String,
      required: true,
      select: false, // never leak in normal queries
    },

    // ─── Tenant Lifecycle ─────────────────────────────────

    /**
     * Tenant status — independent of subscription status.
     * pending  → just created, awaiting activation
     * active   → fully operational
     * suspended → temporarily disabled (billing, policy, etc.)
     * cancelled → permanently decommissioned
     */
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.PENDING,
      index: true,
    },

    /** Lifecycle timestamps */
    activatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, trim: true, maxlength: 500, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, maxlength: 500, default: null },

    /**
     * SuperAdmin — the clinic owner provisioned in the tenant DB.
     * userId is a String (NOT ObjectId) because the super_admin User
     * document lives in the tenant's own database, not the platform DB.
     */
    superAdmin: {
      userId: { type: String },
      name: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
      provisionedAt: { type: Date },
    },

    /**
     * Referral tracking — which clinic referred this one.
     * Used by the rebate engine for referral-based discounts.
     */
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
    },

    /**
     * Unique referral code for this clinic.
     * Other clinics use this code during signup to link referredBy.
     */
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]+$/, 'Referral code must contain only uppercase letters, numbers, hyphens, underscores'],
    },

    /** SaaS subscription info (denormalised from Subscription doc) */
    subscription: {
      plan: {
        type: String,
        default: 'free',
      },
      /** ObjectId ref to the Plan document */
      planRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
      },
      status: {
        type: String,
        enum: [...Object.values(SUBSCRIPTION_STATUS), ...Object.values(SUBSCRIPTION_STATUS_LEGACY)],
        default: SUBSCRIPTION_STATUS.TRIAL,
      },
      trialEndsAt: Date,
      currentPeriodEnd: Date,
      razorpaySubscriptionId: String,
      razorpayCustomerId: String,
    },

    /** Feature flags per clinic (synced from Plan on subscription change) */
    features: {
      maxDoctors: { type: Number, default: 1 },
      maxStaff: { type: Number, default: 2 },
      maxBranches: { type: Number, default: 1 },
      maxStorageMB: { type: Number, default: 250 },
      maxSmsPerMonth: { type: Number, default: 0 },
      smsEnabled: { type: Boolean, default: false },
      teleHealthEnabled: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      advancedReports: { type: Boolean, default: false },
      whiteLabeling: { type: Boolean, default: false },
      jobPortalEnabled: { type: Boolean, default: false },
      jobPostingCredits: { type: Number, default: 0 },
    },

    // ─── Usage Tracking (denormalised for fast dashboard queries) ──

    usage: {
      doctorsCount: { type: Number, default: 0, min: 0 },
      staffCount: { type: Number, default: 0, min: 0 },
      branchesCount: { type: Number, default: 0, min: 0 },
      patientsCount: { type: Number, default: 0, min: 0 },
      storageUsedMB: { type: Number, default: 0, min: 0 },
      smsUsedThisMonth: { type: Number, default: 0, min: 0 },
      lastSyncedAt: { type: Date },
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /** Onboarding metadata */
    onboarding: {
      completedAt: Date,
      steps: {
        profileComplete: { type: Boolean, default: false },
        firstDoctorAdded: { type: Boolean, default: false },
        firstPatientAdded: { type: Boolean, default: false },
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformUser',
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.dbUri; // double guard — never serialize dbUri
        delete ret.__v;
        return ret;
      },
    },
  },
);

// ─── Indexes ────────────────────────────────────────────

clinicSchema.index({ 'subscription.status': 1 });
clinicSchema.index({ 'subscription.currentPeriodEnd': 1 });
clinicSchema.index({ isActive: 1 });
clinicSchema.index({ deletedAt: 1 });
clinicSchema.index({ location: '2dsphere' });
clinicSchema.index({ 'address.locality': 1, 'address.city': 1 });

// ─── Soft-delete filter ─────────────────────────────────

clinicSchema.pre(/^find/, function () {
  // Allow bypassing soft-delete filter with setOptions({ skipSoftDelete: true })
  if (this.getOptions().skipSoftDelete) return;
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// ─── Tenant Status Transition ───────────────────────────

/**
 * Transition tenant to a new status with validation.
 * Throws if the transition is not allowed.
 *
 * @param {string} newStatus — target tenant status
 * @param {string} [reason] — human-readable reason
 * @returns {Clinic} — this (unsaved — caller must .save())
 */
clinicSchema.methods.transitionStatus = function (newStatus, reason) {
  const current = this.status;
  const allowed = TENANT_TRANSITIONS[current];

  if (!allowed || !allowed.includes(newStatus)) {
    const err = new Error(
      `Invalid tenant transition: ${current} → ${newStatus}. ` +
      `Allowed from "${current}": [${(allowed || []).join(', ')}]`,
    );
    err.statusCode = 422;
    throw err;
  }

  const now = new Date();
  this.status = newStatus;

  switch (newStatus) {
    case TENANT_STATUS.ACTIVE:
      this.activatedAt = this.activatedAt || now;
      this.isActive = true;
      this.suspendedAt = null;
      this.suspensionReason = null;
      break;
    case TENANT_STATUS.SUSPENDED:
      this.suspendedAt = now;
      this.suspensionReason = reason || null;
      this.isActive = false;
      break;
    case TENANT_STATUS.CANCELLED:
      this.cancelledAt = now;
      this.cancellationReason = reason || null;
      this.isActive = false;
      this.deletedAt = now;
      break;
    default:
      break;
  }

  return this;
};

// countDocuments/distinct are not matched by the pre(/^find/) hook above.
clinicSchema.plugin(require('../plugins/softDeleteCount'));

module.exports = mongoose.model('Clinic', clinicSchema);
