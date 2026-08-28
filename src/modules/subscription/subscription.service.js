'use strict';

/**
 * Subscription Service — production-ready subscription lifecycle management.
 *
 * Uses the Subscription state machine (transition() method) for all status
 * changes, ensuring only valid transitions occur with full audit trail.
 *
 * Key capabilities:
 *  - Create subscription with trial or direct activation
 *  - Upgrade/downgrade with tier comparison and proration awareness
 *  - Promotion application with cycle-limited discounts
 *  - Cancellation with free-tier downgrade
 *  - Razorpay webhook processing
 *  - Lifecycle cron: trial expiry, grace period → suspension
 *  - Reactivation from suspended state
 */

const ApiError = require('../../utils/ApiError');
const Clinic = require('../../models/platform/Clinic');
const Subscription = require('../../models/platform/Subscription');
const Plan = require('../../models/platform/Plan');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LEGACY } = require('../../config/constants');
const pricingService = require('../../services/pricing.service');
const logger = require('../../utils/logger');

/** Grace period before suspension (days after entering grace_period) */
const GRACE_PERIOD_DAYS = 7;

/** Free-tier feature set used when downgrading or suspending */
const FREE_TIER_FEATURES = Object.freeze({
  maxDoctors: 1,
  maxStaff: 2,
  maxBranches: 1,
  maxStorageMB: 100,
  maxSmsPerMonth: 0,
  smsEnabled: false,
  teleHealthEnabled: false,
  customBranding: false,
  apiAccess: false,
  prioritySupport: false,
  advancedReports: false,
  whiteLabeling: false,
  jobPortalEnabled: false,
  jobPostingCredits: 0,
});

// ─── Helpers ────────────────────────────────────────────

async function _findClinic(slug) {
  // Use deletedAt: null (NOT isActive: true) so suspended clinics are found.
  // Suspended clinics have isActive: false — filtering by isActive: true would
  // return 404 instead of allowing reactivation, cancellation, etc.
  const clinic = await Clinic.findOne({ slug, deletedAt: null });
  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

async function _findActiveSubscription(clinicId) {
  return Subscription.findOne({
    clinic: clinicId,
    status: {
      $in: [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.TRIAL,
        SUBSCRIPTION_STATUS.GRACE_PERIOD,
        SUBSCRIPTION_STATUS_LEGACY.PAST_DUE,
      ],
    },
  }).sort({ createdAt: -1 });
}

/**
 * Sync subscription state and plan features to the Clinic document.
 */
async function _syncToClinic(clinicId, subscription, plan) {
  const update = {
    'subscription.plan': subscription.plan,
    'subscription.status': subscription.status,
    'subscription.currentPeriodEnd': subscription.currentPeriodEnd,
  };

  if (plan) {
    update['subscription.planRef'] = plan._id;
    update.features = plan.features;
  }

  if (subscription.trialEnd) {
    update['subscription.trialEndsAt'] = subscription.trialEnd;
  }

  const updated = await Clinic.findByIdAndUpdate(clinicId, update, { new: true }).select('slug');

  // Invalidate caches when plan/features/status change
  if (updated?.slug) {
    const featureFlagService = require('../../services/featureFlag.service');
    await featureFlagService.invalidateCache(updated.slug);
    const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
    await invalidateSubscriptionCache(updated.slug);
  }
}

// ─── Public API ─────────────────────────────────────────

/**
 * Get current subscription for a clinic by slug.
 */
async function getCurrentSubscription(slug) {
  const clinic = await _findClinic(slug);
  const subscription = await _findActiveSubscription(clinic._id);
  if (subscription) return subscription;

  // Clinics provisioned before the Subscription collection existed — and any
  // restored from a platform-registry repair — carry their plan on the Clinic
  // document alone. selfServe.getOverview() already treats that as the source of
  // truth; without the same fallback here this endpoint answered 404 for every
  // role, including super_admin, on a perfectly healthy clinic.
  const legacy = clinic.subscription?.plan;
  if (!legacy) throw ApiError.notFound('No active subscription found');

  return {
    clinic: clinic._id,
    plan: legacy,
    status: clinic.subscription.status || SUBSCRIPTION_STATUS.ACTIVE,
    billingCycle: clinic.subscription.billingCycle || 'monthly',
    amount: clinic.subscription.amount ?? null,
    currentPeriodEnd: clinic.subscription.currentPeriodEnd || null,
    trialEnd: clinic.subscription.trialEndsAt || null,
    // Flags the shape as reconstructed, so a caller can tell it apart from a
    // real Subscription document (no _id, no lifecycle history).
    isLegacy: true,
  };
}

/**
 * Create a new subscription for a clinic.
 * Resolves Plan for trial config, pricing, and features.
 * Optionally applies a promotion code.
 */
async function createSubscription(slug, data) {
  const clinic = await _findClinic(slug);

  // Check for existing active subscription
  const existing = await Subscription.findOne({
    clinic: clinic._id,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
  });

  if (existing) {
    throw ApiError.conflict('Clinic already has an active subscription. Use change plan instead.');
  }

  // Resolve plan
  const plan = await Plan.findOne({ slug: data.plan, isActive: true });
  if (!plan) throw ApiError.notFound(`Plan "${data.plan}" not found or inactive`);

  const trialDays = plan.trial?.enabled !== false ? (plan.trial?.durationDays || 14) : 0;
  const baseAmount = data.billingCycle === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly;

  const now = new Date();
  const trialEnd = trialDays > 0
    ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
    : now;

  const initialStatus = trialDays > 0 ? SUBSCRIPTION_STATUS.TRIAL : SUBSCRIPTION_STATUS.ACTIVE;

  // Build subscription data
  const subData = {
    clinic: clinic._id,
    plan: data.plan,
    planRef: plan._id,
    billingCycle: data.billingCycle || 'monthly',
    status: initialStatus,
    amount: baseAmount,
    trialStart: trialDays > 0 ? now : undefined,
    trialEnd: trialDays > 0 ? trialEnd : undefined,
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    statusHistory: [{
      from: 'none',
      to: initialStatus,
      reason: trialDays > 0 ? `Trial started (${trialDays} days)` : 'Direct activation',
      triggeredBy: 'system',
      timestamp: now,
    }],
  };

  // Apply promotion if provided
  if (data.promoCode) {
    const promotionService = require('../../services/promotion.service');
    try {
      const promoResult = await promotionService.applyPromotion({
        promoCode: data.promoCode,
        clinicSlug: slug,
        planId: plan._id.toString(),
        billingCycle: subData.billingCycle,
        baseAmount,
      });
      subData.appliedPromotion = promoResult.appliedPromotion;
      subData.amount = promoResult.discountedAmount;
    } catch (err) {
      logger.warn('Promo application failed for %s: %s', slug, err.message);
    }
  }

  const subscription = await Subscription.create(subData);

  // Sync to clinic
  await _syncToClinic(clinic._id, subscription, plan);

  logger.info('Subscription created for %s on plan %s (status: %s)', slug, data.plan, initialStatus);
  return subscription;
}

/**
 * Activate a trial subscription — transitions trial → active.
 * Sets billing period, clears trial dates, syncs to clinic.
 */
async function activateSubscription(slug, triggeredBy = 'admin') {
  const clinic = await _findClinic(slug);

  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: SUBSCRIPTION_STATUS.TRIAL,
  }).sort({ createdAt: -1 });

  if (!subscription) throw ApiError.notFound('No trial subscription found');

  const now = new Date();

  subscription.transition(SUBSCRIPTION_STATUS.ACTIVE, 'Activated by admin', triggeredBy);

  // Set billing period
  const periodMs = subscription.billingCycle === 'yearly'
    ? 365 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = new Date(now.getTime() + periodMs);

  await subscription.save();

  const plan = subscription.planRef
    ? await Plan.findById(subscription.planRef)
    : await Plan.findOne({ slug: subscription.plan, isActive: true });

  await _syncToClinic(clinic._id, subscription, plan);

  logger.info('Subscription activated for %s', slug);
  return subscription;
}

/**
 * Change subscription plan (upgrade or downgrade).
 *
 * - Upgrade:   Applied immediately with proration. New plan features sync to clinic.
 * - Downgrade: Deferred to next billing cycle via scheduledChange. Current plan stays active.
 */
async function changePlan(slug, data) {
  const clinic = await _findClinic(slug);

  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
  }).sort({ createdAt: -1 });

  if (!subscription) throw ApiError.notFound('No active subscription found');

  // Resolve current and target plans
  const currentPlan = await Plan.findOne({ slug: subscription.plan });
  const targetPlan = await Plan.findOne({ slug: data.plan, isActive: true });
  if (!targetPlan) throw ApiError.notFound(`Target plan "${data.plan}" not found or inactive`);

  const newBillingCycle = data.billingCycle || subscription.billingCycle;

  if (subscription.plan === data.plan && subscription.billingCycle === newBillingCycle) {
    throw ApiError.badRequest('Already on this plan and billing cycle');
  }

  const isUpgrade = currentPlan ? currentPlan.isUpgradeTo(targetPlan) : true;
  const direction = isUpgrade ? 'upgrade' : 'downgrade';

  const addOnQuantities = {
    extraDoctors: data.extraDoctors || 0,
    extraStorageUnits: data.extraStorageUnits || 0,
    enabledFeatures: data.enabledFeatures || [],
    enabledModules: data.enabledModules || [],
  };

  if (direction === 'upgrade') {
    // ── Immediate upgrade with proration ──
    let proration = null;

    if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE && subscription.currentPeriodEnd) {
      try {
        proration = await pricingService.calculateProration(
          subscription._id,
          targetPlan._id,
          newBillingCycle,
          addOnQuantities,
        );
      } catch (err) {
        logger.warn('Proration calculation failed for %s: %s', slug, err.message);
      }
    }

    subscription.previousPlan = subscription.plan;
    subscription.plan = data.plan;
    subscription.planRef = targetPlan._id;
    subscription.billingCycle = newBillingCycle;

    // Recalculate amount with add-ons
    const composed = targetPlan.getComposablePrice(newBillingCycle, addOnQuantities);
    subscription.amount = subscription.customPricing?.enabled
      ? subscription.customPricing.amount
      : composed.totalBeforeDiscounts;
    subscription.amountBreakdown = {
      basePrice: composed.basePrice,
      addOns: composed.addOnBreakdown,
      addOnTotal: composed.addOnTotal,
    };

    // Clear any pending scheduled downgrade
    subscription.scheduledChange = undefined;

    // Apply new promotion on upgrade, or clear existing one
    if (data.promoCode) {
      const promotionService = require('../../services/promotion.service');
      try {
        const promoResult = await promotionService.applyPromotion({
          promoCode: data.promoCode,
          clinicSlug: slug,
          planId: targetPlan._id.toString(),
          billingCycle: newBillingCycle,
          baseAmount: subscription.amount,
          subscriptionId: subscription._id,
        });
        subscription.appliedPromotion = promoResult.appliedPromotion;
        subscription.amount = promoResult.discountedAmount;
      } catch (err) {
        logger.warn('Promo application failed during upgrade for %s: %s', slug, err.message);
      }
    } else if (subscription.appliedPromotion?.code) {
      subscription.appliedPromotion.remainingCycles = 0;
    }

    // Audit entry
    subscription.statusHistory.push({
      from: subscription.status,
      to: subscription.status,
      reason: `Upgrade: ${subscription.previousPlan} → ${data.plan}`,
      triggeredBy: 'admin',
      timestamp: new Date(),
    });

    await subscription.save();
    await _syncToClinic(clinic._id, subscription, targetPlan);

    logger.info('Immediate upgrade for %s: %s → %s', slug, subscription.previousPlan, data.plan);
    return { subscription, direction, proration };
  }

  // ── Deferred downgrade (next billing cycle) ──
  const effectiveAt = subscription.currentPeriodEnd || new Date();

  subscription.scheduledChange = {
    plan: data.plan,
    planRef: targetPlan._id,
    billingCycle: newBillingCycle,
    effectiveAt,
    addOnQuantities,
    scheduledAt: new Date(),
    reason: data.reason || `Downgrade scheduled: ${subscription.plan} → ${data.plan}`,
  };

  // Audit entry
  subscription.statusHistory.push({
    from: subscription.status,
    to: subscription.status,
    reason: `Downgrade scheduled for ${effectiveAt.toISOString()}: ${subscription.plan} → ${data.plan}`,
    triggeredBy: 'admin',
    timestamp: new Date(),
  });

  await subscription.save();

  logger.info('Deferred downgrade for %s: %s → %s (effective %s)', slug, subscription.plan, data.plan, effectiveAt.toISOString());
  return {
    subscription,
    direction,
    scheduled: { newPlan: data.plan, effectiveAt },
  };
}

/**
 * Set or clear custom pricing on a subscription.
 * When enabled, overrides plan-based amount. When disabled, recalculates from plan.
 */
async function setCustomPricing(slug, pricingData, adminId) {
  const clinic = await _findClinic(slug);
  const subscription = await _findActiveSubscription(clinic._id);
  if (!subscription) throw ApiError.notFound('No active subscription found');

  if (pricingData.enabled) {
    subscription.customPricing = {
      enabled: true,
      amount: pricingData.amount,
      reason: pricingData.reason || 'Custom pricing applied',
      appliedBy: adminId,
      appliedAt: new Date(),
    };
    subscription.amount = pricingData.amount;
  } else {
    // Recalculate from plan
    const plan = subscription.planRef
      ? await Plan.findById(subscription.planRef)
      : await Plan.findOne({ slug: subscription.plan, isActive: true });

    if (plan) {
      const composed = plan.getComposablePrice(subscription.billingCycle);
      subscription.amount = composed.totalBeforeDiscounts;
      subscription.amountBreakdown = {
        basePrice: composed.basePrice,
        addOns: composed.addOnBreakdown,
        addOnTotal: composed.addOnTotal,
      };
    }
    subscription.customPricing = { enabled: false };
  }

  subscription.statusHistory.push({
    from: subscription.status,
    to: subscription.status,
    reason: pricingData.enabled
      ? `Custom pricing set: ${pricingData.amount} (${pricingData.reason || 'no reason'})`
      : 'Custom pricing removed — reverted to plan pricing',
    triggeredBy: 'admin',
    timestamp: new Date(),
  });

  await subscription.save();
  logger.info('Custom pricing %s for %s', pricingData.enabled ? 'set' : 'cleared', slug);
  return subscription;
}

/**
 * Cancel a pending scheduled change (deferred downgrade).
 */
async function cancelScheduledChange(slug) {
  const clinic = await _findClinic(slug);
  const subscription = await _findActiveSubscription(clinic._id);
  if (!subscription) throw ApiError.notFound('No active subscription found');

  if (!subscription.scheduledChange?.plan) {
    throw ApiError.badRequest('No scheduled change to cancel');
  }

  const cancelled = { ...subscription.scheduledChange.toObject() };

  subscription.scheduledChange = undefined;
  subscription.statusHistory.push({
    from: subscription.status,
    to: subscription.status,
    reason: `Scheduled downgrade cancelled (was: ${cancelled.plan} effective ${cancelled.effectiveAt?.toISOString()})`,
    triggeredBy: 'admin',
    timestamp: new Date(),
  });

  await subscription.save();
  logger.info('Scheduled change cancelled for %s', slug);
  return subscription;
}

/**
 * Cancel the subscription using the state machine.
 * Downgrades clinic to free-tier features.
 */
async function cancelSubscription(slug, cancelReason, triggeredBy = 'admin') {
  const clinic = await _findClinic(slug);

  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: {
      $in: [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.TRIAL,
        SUBSCRIPTION_STATUS.GRACE_PERIOD,
        SUBSCRIPTION_STATUS_LEGACY.PAST_DUE,
        SUBSCRIPTION_STATUS.SUSPENDED,
      ],
    },
  }).sort({ createdAt: -1 });

  if (!subscription) throw ApiError.notFound('No active subscription found');

  // Use state machine transition
  subscription.transition(
    SUBSCRIPTION_STATUS.CANCELLED,
    cancelReason || 'User requested cancellation',
    triggeredBy,
  );

  await subscription.save();

  // Downgrade clinic to free tier
  await Clinic.findByIdAndUpdate(clinic._id, {
    'subscription.status': SUBSCRIPTION_STATUS.CANCELLED,
    'subscription.plan': 'free',
    'subscription.planRef': null,
    features: { ...FREE_TIER_FEATURES },
  });

  logger.info('Subscription cancelled for %s (reason: %s)', slug, cancelReason);
  return subscription;
}

/**
 * Reactivate a suspended subscription.
 * Requires successful payment to have been received.
 */
async function reactivateSubscription(slug, triggeredBy = 'admin') {
  const clinic = await _findClinic(slug);

  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: SUBSCRIPTION_STATUS.SUSPENDED,
  }).sort({ createdAt: -1 });

  if (!subscription) throw ApiError.notFound('No suspended subscription found');

  // Use state machine transition
  subscription.transition(
    SUBSCRIPTION_STATUS.ACTIVE,
    'Reactivated after payment or admin action',
    triggeredBy,
  );

  subscription.gracePeriodEndsAt = undefined;
  await subscription.save();

  // Restore plan features
  const plan = subscription.planRef
    ? await Plan.findById(subscription.planRef)
    : await Plan.findOne({ slug: subscription.plan, isActive: true });

  await _syncToClinic(clinic._id, subscription, plan);

  logger.info('Subscription reactivated for %s', slug);
  return subscription;
}

/**
 * Handle incoming Razorpay webhook event.
 * Uses state machine for transitions with 'webhook' trigger.
 */
async function handleWebhook(event, payload) {
  const subEntity = payload.subscription?.entity;
  if (!subEntity || !subEntity.id) {
    throw ApiError.badRequest('Missing subscription entity in webhook payload');
  }

  const subscription = await Subscription.findOne({
    'razorpay.subscriptionId': subEntity.id,
  });

  if (!subscription) {
    throw ApiError.notFound(`Subscription not found for Razorpay ID: ${subEntity.id}`);
  }

  switch (event) {
    case 'subscription.activated':
      subscription.transition(SUBSCRIPTION_STATUS.ACTIVE, 'Razorpay subscription activated', 'webhook');
      if (subEntity.current_start) {
        subscription.currentPeriodStart = new Date(subEntity.current_start * 1000);
      }
      if (subEntity.current_end) {
        subscription.currentPeriodEnd = new Date(subEntity.current_end * 1000);
      }
      break;

    case 'subscription.charged': {
      // Successful payment clears grace_period (or legacy past_due)
      if (subscription.status === SUBSCRIPTION_STATUS.GRACE_PERIOD ||
          subscription.status === SUBSCRIPTION_STATUS_LEGACY.PAST_DUE) {
        subscription.transition(SUBSCRIPTION_STATUS.ACTIVE, 'Payment received — cleared grace period', 'webhook');
      }

      // Reset renewal tracking
      subscription.lastRenewalAttempt = new Date();
      subscription.renewalFailCount = 0;

      const paymentEntity = payload.payment?.entity;
      if (paymentEntity) {
        subscription.invoiceHistory.push({
          invoiceId: paymentEntity.invoice_id,
          amount: paymentEntity.amount / 100, // paise → rupees
          status: paymentEntity.status,
          paidAt: new Date(),
        });
      }
      if (subEntity.current_end) {
        subscription.currentPeriodEnd = new Date(subEntity.current_end * 1000);
      }

      // Decrement promotion remaining cycles
      if (subscription.appliedPromotion?.remainingCycles > 0) {
        subscription.appliedPromotion.remainingCycles -= 1;
      }

      break;
    }

    case 'subscription.pending':
      // Track renewal attempt
      subscription.lastRenewalAttempt = new Date();
      subscription.renewalFailCount = (subscription.renewalFailCount || 0) + 1;

      // Only transition to grace_period if currently active
      if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE) {
        subscription.transition(SUBSCRIPTION_STATUS.GRACE_PERIOD, 'Payment pending — Razorpay notification', 'webhook');
      }
      break;

    case 'subscription.halted':
      subscription.transition(SUBSCRIPTION_STATUS.SUSPENDED, 'Razorpay halted — payment failed', 'webhook');
      break;

    case 'subscription.cancelled':
      subscription.transition(SUBSCRIPTION_STATUS.CANCELLED, 'Cancelled via Razorpay', 'webhook');
      break;

    default:
      logger.warn('Unhandled webhook event: %s', event);
      break;
  }

  await subscription.save();

  // Sync status to clinic record
  const clinicUpdate = {
    'subscription.status': subscription.status,
    'subscription.currentPeriodEnd': subscription.currentPeriodEnd,
  };

  // On suspension or cancellation, restrict features
  if (subscription.status === SUBSCRIPTION_STATUS.SUSPENDED ||
      subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
    clinicUpdate.features = { ...FREE_TIER_FEATURES };
    clinicUpdate['subscription.plan'] = 'free';
    clinicUpdate['subscription.planRef'] = null;
    logger.warn('Clinic restricted due to %s: %s', subscription.status, subscription.clinic);
  }

  const updatedClinic = await Clinic.findByIdAndUpdate(subscription.clinic, clinicUpdate, { new: true }).select('slug');

  // Invalidate Redis cache so subsequent requests see updated status immediately
  if (updatedClinic?.slug) {
    const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
    await invalidateSubscriptionCache(updatedClinic.slug);
  }

  return subscription;
}

/**
 * Lifecycle cron job — call periodically to handle:
 *  1. Expired trials → cancel via state machine
 *  2. Grace period subs past deadline → suspend via state machine
 *  3. Scheduled downgrades past effectiveAt → apply plan change
 *  4. Deactivate expired promotions
 *
 * Uses gracePeriodEndsAt for precise suspension timing.
 */
async function processSubscriptionLifecycle() {
  const now = new Date();
  const results = {
    expiredTrials: 0,
    lapsedToGrace: 0,
    suspendedGracePeriod: 0,
    appliedDowngrades: 0,
    deactivatedPromotions: 0,
    errors: [],
  };

  // 1. Expire trials
  const expiredTrials = await Subscription.find({
    status: SUBSCRIPTION_STATUS.TRIAL,
    trialEnd: { $lte: now },
  });

  for (const sub of expiredTrials) {
    try {
      sub.transition(SUBSCRIPTION_STATUS.CANCELLED, 'Trial expired — no payment method added', 'cron');
      await sub.save();

      const expiredClinic = await Clinic.findByIdAndUpdate(sub.clinic, {
        'subscription.status': SUBSCRIPTION_STATUS.CANCELLED,
        'subscription.plan': 'free',
        'subscription.planRef': null,
        features: { ...FREE_TIER_FEATURES },
      }, { new: true }).select('slug');

      // Invalidate Redis cache immediately
      if (expiredClinic?.slug) {
        const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
        await invalidateSubscriptionCache(expiredClinic.slug);
      }

      results.expiredTrials += 1;
      logger.info('Trial expired for clinic %s', sub.clinic);
    } catch (err) {
      results.errors.push({ subscriptionId: sub._id, error: err.message });
      logger.error('Failed to expire trial for %s: %s', sub.clinic, err.message);
    }
  }

  // 2. Active subscriptions whose billing period has ended → grace period.
  //
  // Nothing used to make this transition: the worker expired trials and
  // suspended subscriptions *already* in grace, but only a Razorpay
  // payment-failure webhook ever set grace in the first place. With no
  // recurring billing configured, an active plan simply ran past its period end
  // forever, fully featured and unbilled. The state machine has always allowed
  // active → grace_period; this is the step that uses it.
  const lapsed = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $ne: null, $lte: now },
  });

  for (const sub of lapsed) {
    try {
      sub.transition(
        SUBSCRIPTION_STATUS.GRACE_PERIOD,
        'Billing period ended without renewal',
        'cron',
      );
      // Suspension is handled by the next step once this deadline passes, so
      // the clinic keeps working for GRACE_PERIOD_DAYS and gets warned first.
      sub.gracePeriodEndsAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      await sub.save();

      const lapsedClinic = await Clinic.findByIdAndUpdate(
        sub.clinic,
        { 'subscription.status': SUBSCRIPTION_STATUS.GRACE_PERIOD },
        { new: true },
      ).select('slug');

      if (lapsedClinic?.slug) {
        const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
        await invalidateSubscriptionCache(lapsedClinic.slug);
      }

      results.lapsedToGrace += 1;
      logger.warn(
        'Subscription lapsed into grace for clinic %s — period ended %s',
        sub.clinic, sub.currentPeriodEnd?.toISOString(),
      );
    } catch (err) {
      results.errors.push({ subscriptionId: sub._id, error: err.message });
      logger.error('Failed to lapse subscription %s: %s', sub._id, err.message);
    }
  }

  // 3. Suspend grace_period (and legacy past_due) subscriptions past deadline
  const gracePeriodSubs = await Subscription.find({
    status: { $in: [SUBSCRIPTION_STATUS.GRACE_PERIOD, SUBSCRIPTION_STATUS_LEGACY.PAST_DUE] },
    $or: [
      { gracePeriodEndsAt: { $lte: now } },
      // Legacy fallback: no gracePeriodEndsAt → use GRACE_PERIOD_DAYS from updatedAt
      {
        gracePeriodEndsAt: { $exists: false },
        updatedAt: { $lte: new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) },
      },
    ],
  });

  for (const sub of gracePeriodSubs) {
    try {
      sub.transition(SUBSCRIPTION_STATUS.SUSPENDED, 'Suspended after grace period expiry', 'cron');
      await sub.save();

      const suspendedClinic = await Clinic.findByIdAndUpdate(sub.clinic, {
        'subscription.status': SUBSCRIPTION_STATUS.SUSPENDED,
        features: { ...FREE_TIER_FEATURES },
      }, { new: true }).select('slug');

      // Invalidate Redis cache immediately
      if (suspendedClinic?.slug) {
        const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
        await invalidateSubscriptionCache(suspendedClinic.slug);
      }

      results.suspendedGracePeriod += 1;
      logger.warn('Clinic suspended after grace period: %s', sub.clinic);
    } catch (err) {
      results.errors.push({ subscriptionId: sub._id, error: err.message });
      logger.error('Failed to suspend %s: %s', sub.clinic, err.message);
    }
  }

  // 3. Apply scheduled downgrades whose effectiveAt has passed
  const pendingDowngrades = await Subscription.find({
    'scheduledChange.effectiveAt': { $lte: now },
    status: SUBSCRIPTION_STATUS.ACTIVE,
  });

  for (const sub of pendingDowngrades) {
    try {
      const sc = sub.scheduledChange;
      const targetPlan = await Plan.findById(sc.planRef);
      if (!targetPlan) {
        logger.error('Scheduled downgrade target plan not found: %s (sub %s)', sc.planRef, sub._id);
        results.errors.push({ subscriptionId: sub._id, error: 'Target plan not found' });
        continue;
      }

      sub.previousPlan = sub.plan;
      sub.plan = sc.plan;
      sub.planRef = sc.planRef;
      sub.billingCycle = sc.billingCycle || sub.billingCycle;

      // Recalculate amount from new plan
      const composed = targetPlan.getComposablePrice(sub.billingCycle, sc.addOnQuantities || {});
      sub.amount = sub.customPricing?.enabled
        ? sub.customPricing.amount
        : composed.totalBeforeDiscounts;
      sub.amountBreakdown = {
        basePrice: composed.basePrice,
        addOns: composed.addOnBreakdown,
        addOnTotal: composed.addOnTotal,
      };

      // New billing period
      const periodMs = sub.billingCycle === 'yearly'
        ? 365 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd = new Date(now.getTime() + periodMs);

      // Clear scheduled change
      sub.scheduledChange = undefined;

      sub.statusHistory.push({
        from: sub.status,
        to: sub.status,
        reason: `Scheduled downgrade applied: ${sub.previousPlan} → ${sc.plan}`,
        triggeredBy: 'cron',
        timestamp: now,
      });

      await sub.save();
      await _syncToClinic(sub.clinic, sub, targetPlan);

      results.appliedDowngrades += 1;
      logger.info('Scheduled downgrade applied for clinic %s: → %s', sub.clinic, sc.plan);
    } catch (err) {
      results.errors.push({ subscriptionId: sub._id, error: err.message });
      logger.error('Failed to apply scheduled downgrade for %s: %s', sub.clinic, err.message);
    }
  }

  // 4. Deactivate expired promotions
  try {
    const promotionService = require('../../services/promotion.service');
    const promoResult = await promotionService.processPromotionExpiry();
    results.deactivatedPromotions = promoResult.deactivated;
    if (promoResult.deactivated > 0) {
      logger.info('Deactivated %d expired promotions', promoResult.deactivated);
    }
  } catch (err) {
    results.errors.push({ phase: 'promotionExpiry', error: err.message });
    logger.error('Failed to process promotion expiry: %s', err.message);
  }

  return results;
}

module.exports = {
  /** Exposed so the clinic-facing self-serve flow applies features identically. */
  syncSubscriptionToClinic: _syncToClinic,
  getCurrentSubscription,
  createSubscription,
  activateSubscription,
  changePlan,
  setCustomPricing,
  cancelScheduledChange,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
  processSubscriptionLifecycle,
  GRACE_PERIOD_DAYS,
  FREE_TIER_FEATURES,
};
