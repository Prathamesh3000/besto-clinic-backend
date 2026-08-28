'use strict';

/**
 * Subscription — full state-machine model with audit trail.
 *
 * State machine enforces valid transitions only:
 *   trial → active | cancelled
 *   active → grace_period | cancelled
 *   grace_period → active | suspended | cancelled
 *   suspended → active | cancelled
 *   cancelled → (terminal)
 *
 * Legacy: existing documents with status 'past_due' can still transition
 * via the backwards-compatible entry in ALLOWED_TRANSITIONS.
 *
 * Every status change is recorded in statusHistory for audit.
 */

const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LEGACY } = require('../../config/constants');

/**
 * Allowed state transitions — source → [valid targets]
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [SUBSCRIPTION_STATUS.TRIAL]:        [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.ACTIVE]:       [SUBSCRIPTION_STATUS.GRACE_PERIOD, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.GRACE_PERIOD]: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.SUSPENDED]:    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.CANCELLED]:    [], // terminal state

  // Legacy: existing docs with status 'past_due' can still transition
  [SUBSCRIPTION_STATUS_LEGACY.PAST_DUE]: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.CANCELLED],
});

// All valid status strings (current + legacy) for Mongoose enums
const ALL_STATUS_VALUES = [
  ...Object.values(SUBSCRIPTION_STATUS),
  ...Object.values(SUBSCRIPTION_STATUS_LEGACY),
];

// ─── Sub-schemas ────────────────────────────────────────

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...ALL_STATUS_VALUES, 'none'], required: true },
    to: { type: String, enum: ALL_STATUS_VALUES, required: true },
    reason: { type: String, maxlength: 500 },
    // 'clinic' covers a self-serve purchase made by the clinic itself
    // (selfServe._applyPaidPlan). Without it every self-serve upgrade and renewal
    // failed validation on save().
    triggeredBy: { type: String, enum: ['system', 'admin', 'webhook', 'cron', 'clinic'], default: 'system' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const invoiceEntrySchema = new mongoose.Schema(
  {
    invoiceId: String,
    amount: Number,
    status: String,
    paidAt: Date,
    receiptUrl: String,
  },
  { _id: false },
);

// ─── Main Schema ────────────────────────────────────────

const subscriptionSchema = new mongoose.Schema(
  {
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },

    /** Plan slug (denormalised for fast queries) */
    plan: {
      type: String,
      required: true,
    },

    /** ObjectId reference to Plan document for joins & pricing lookups */
    planRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
    },

    /** Previous plan slug — set on upgrade/downgrade for audit */
    previousPlan: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ALL_STATUS_VALUES,
      default: SUBSCRIPTION_STATUS.TRIAL,
    },

    /** Audit trail of every status change */
    statusHistory: [statusHistoryEntrySchema],

    /** Applied promotion snapshot */
    appliedPromotion: {
      code: String,
      discountType: { type: String, enum: ['percentage', 'flat'] },
      discountValue: Number,
      /** Remaining billing cycles this discount is active */
      remainingCycles: { type: Number, default: 0 },
    },

    /** Razorpay integration fields */
    razorpay: {
      subscriptionId: String,
      customerId: String,
      planId: String,
      paymentMethodId: String,
    },

    /** Billing cycle */
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Breakdown of amount for audit / invoice purposes */
    amountBreakdown: {
      basePrice: { type: Number, default: 0 },
      addOns: [{
        type: { type: String },
        label: String,
        quantity: Number,
        unitPrice: Number,
        total: Number,
        _id: false,
      }],
      addOnTotal: { type: Number, default: 0 },
    },

    currency: {
      type: String,
      default: 'INR',
    },

    /** Period tracking */
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    trialStart: Date,
    trialEnd: Date,
    cancelledAt: Date,
    cancelReason: String,

    /**
     * Grace period deadline — if grace_period and this date passes,
     * the lifecycle cron suspends the subscription.
     */
    gracePeriodEndsAt: Date,

    /** Invoices from Razorpay */
    invoiceHistory: [invoiceEntrySchema],

    /** Usage tracking for metered features */
    usage: {
      doctorsCount: { type: Number, default: 0 },
      staffCount: { type: Number, default: 0 },
      storageUsedMB: { type: Number, default: 0 },
      smsCount: { type: Number, default: 0 },
    },

    /**
     * Deferred downgrade — applied at next billing cycle by lifecycle cron.
     * Set when a downgrade is requested; cleared once applied or cancelled.
     */
    scheduledChange: {
      plan: String,
      planRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
      billingCycle: { type: String, enum: ['monthly', 'yearly'] },
      effectiveAt: Date,
      addOnQuantities: {
        extraDoctors: { type: Number, default: 0 },
        extraStorageUnits: { type: Number, default: 0 },
        enabledFeatures: [String],
        enabledModules: [String],
      },
      scheduledAt: Date,
      reason: String,
    },

    /** Admin price override — bypasses plan-based pricing */
    customPricing: {
      enabled: { type: Boolean, default: false },
      amount: { type: Number, min: 0 },
      reason: String,
      appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformUser' },
      appliedAt: Date,
    },

    /** Renewal tracking for payment retry logic */
    lastRenewalAttempt: Date,
    renewalFailCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// ─── Indexes ────────────────────────────────────────────

subscriptionSchema.index({ clinic: 1, status: 1 });
subscriptionSchema.index({ 'razorpay.subscriptionId': 1 });
subscriptionSchema.index({ status: 1, trialEnd: 1 });
subscriptionSchema.index({ status: 1, gracePeriodEndsAt: 1 });
subscriptionSchema.index({ 'scheduledChange.effectiveAt': 1 }, { sparse: true });

// ─── State Machine Method ───────────────────────────────

/**
 * Transition the subscription to a new status with audit.
 * Throws if the transition is not allowed by the state machine.
 *
 * @param {string} newStatus — target status
 * @param {string} [reason] — human-readable reason
 * @param {'system'|'admin'|'webhook'|'cron'|'clinic'} [triggeredBy='system']
 * @returns {Subscription} — this (unsaved — caller must .save())
 */
subscriptionSchema.methods.transition = function (newStatus, reason, triggeredBy = 'system') {
  const current = this.status;

  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.includes(newStatus)) {
    const err = new Error(
      `Invalid subscription transition: ${current} → ${newStatus}. ` +
      `Allowed from "${current}": [${(allowed || []).join(', ')}]`,
    );
    err.statusCode = 422;
    throw err;
  }

  // Record audit entry
  this.statusHistory.push({
    from: current,
    to: newStatus,
    reason: reason || `Transitioned from ${current} to ${newStatus}`,
    triggeredBy,
    timestamp: new Date(),
  });

  this.status = newStatus;

  // Side-effects by target state
  if (newStatus === SUBSCRIPTION_STATUS.GRACE_PERIOD) {
    if (!this.gracePeriodEndsAt) {
      this.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  if (newStatus === SUBSCRIPTION_STATUS.ACTIVE) {
    this.gracePeriodEndsAt = null;
    this.renewalFailCount = 0;
    this.lastRenewalAttempt = null;
  }

  if (newStatus === SUBSCRIPTION_STATUS.CANCELLED) {
    this.cancelledAt = new Date();
    if (reason) this.cancelReason = reason;
  }

  return this;
};

// Export transitions map for external use (e.g. tests, services)
subscriptionSchema.statics.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

module.exports = mongoose.model('Subscription', subscriptionSchema);
