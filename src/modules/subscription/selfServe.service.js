'use strict';

/**
 * Clinic-facing subscription self-service.
 *
 * Everything here is driven by a tenant-authenticated clinic admin, in contrast
 * to subscription.service.js whose change-plan / cancel entry points are
 * platform-only. A clinic can:
 *
 *   1. see its plan, usage against every limit, and renewal date  (getOverview)
 *   2. price an upgrade / renewal / add-on bundle                 (quote)
 *   3. pay for it through Razorpay                                (createOrder)
 *   4. have it applied the moment the payment verifies            (verifyAndApply)
 *
 * Money rules:
 *   - The amount charged is always recomputed on the server. The client sends
 *     *what* it wants (plan, cycle, add-ons), never *how much* it costs.
 *   - At verification the captured amount is read back from Razorpay and must
 *     cover the freshly recomputed quote, so a client cannot pay for Starter
 *     and claim Professional.
 */

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const razorpay = require('../../utils/razorpay');
const pricingService = require('../../services/pricing.service');
const subscriptionService = require('./subscription.service');
const {
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  PRICEABLE_FEATURES,
} = require('../../config/constants');

const Clinic = () => mongoose.model('Clinic');
const Plan = () => mongoose.model('Plan');
const Subscription = () => mongoose.model('Subscription');

/** Statuses a clinic can still upgrade from without re-purchasing outright. */
const LIVE_STATUSES = [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL];

/**
 * The Free plan is a first-registration offer only — see
 * registration.service.checkFreePlanEligibility. Once a clinic exists it can
 * never move onto Free, whether by upgrade, renewal or scheduled downgrade.
 * A clinic that registered on Free keeps it until it moves off.
 */
const FREE_PLAN = 'free';
const FREE_PLAN_MESSAGE =
  'The Free plan is only available when you first register a clinic. Choose a paid plan to continue.';

function _rejectFreePlan(planSlug) {
  if (planSlug === FREE_PLAN) throw ApiError.badRequest(FREE_PLAN_MESSAGE);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function _findClinic(slug) {
  const clinic = await Clinic().findOne({ slug, deletedAt: null });
  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

/** Latest subscription for a clinic, whatever its status. */
async function _latestSubscription(clinicId) {
  return Subscription().findOne({ clinic: clinicId }).sort({ createdAt: -1 });
}

/**
 * Mongo filter for the plans a clinic is allowed to see and to buy.
 *
 * Public plans are open to everyone. A custom plan is built for exactly one
 * clinic — productOwner.service.createCustomPlan sets isPublic:false — so it has
 * to be offered to that clinic and hidden from every other one. Before this the
 * catalogue's blanket isPublic filter dropped a clinic's own custom plan from
 * its list, while quote() looked plans up by slug alone with no ownership check
 * at all, and would price and sell another clinic's custom plan to anyone who
 * guessed the slug.
 */
function _availablePlanFilter(clinicId) {
  return {
    isActive: true,
    $or: [
      { isCustom: { $ne: true }, isPublic: { $ne: false } },
      { isCustom: true, customForClinic: clinicId },
    ],
  };
}

function _normaliseAddOns(input = {}) {
  const allowedFeatures = new Set(PRICEABLE_FEATURES);
  return {
    extraDoctors: Math.max(0, Number(input.extraDoctors) || 0),
    extraStorageUnits: Math.max(0, Number(input.extraStorageUnits) || 0),
    enabledFeatures: (input.enabledFeatures || []).filter((f) => allowedFeatures.has(f)),
    enabledModules: input.enabledModules || [],
  };
}

/* ── 1. Overview ─────────────────────────────────────────────────────── */

/**
 * Everything the clinic's subscription page needs in one call: the current
 * plan, live usage against each limit, lifecycle dates, and the catalogue of
 * plans and add-ons available to move to.
 */
async function getOverview(tenantSlug) {
  const clinic = await _findClinic(tenantSlug);
  const subscription = await _latestSubscription(clinic._id);
  const plans = await Plan().find(_availablePlanFilter(clinic._id))
    .sort({ tier: 1 })
    .lean();

  // Clinics provisioned before the Subscription collection existed carry their
  // plan on the Clinic document alone. Treat that as the source of truth when
  // there is no Subscription doc, otherwise a healthy clinic reads as expired.
  const legacy = !subscription && clinic.subscription?.plan
    ? {
      plan: clinic.subscription.plan,
      status: clinic.subscription.status || SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: clinic.subscription.billingCycle || 'monthly',
      amount: null,
      currentPeriodEnd: clinic.subscription.currentPeriodEnd || null,
      trialEnd: clinic.subscription.trialEndsAt || null,
    }
    : null;

  const effective = subscription || legacy;

  const currentPlan = effective
    ? plans.find((p) => p.slug === effective.plan)
      || await Plan().findOne({ slug: effective.plan }).lean()
    : null;

  const features = clinic.features || {};
  const usage = clinic.usage || {};

  // Limits the clinic can actually hit — surfaced so the page can warn before
  // an action fails with a bare 403 deep inside another module.
  const limits = [
    { key: 'doctors', label: 'Doctors', used: usage.doctorsCount || 0, limit: features.maxDoctors ?? null },
    { key: 'staff', label: 'Staff', used: usage.staffCount || 0, limit: features.maxStaff ?? null },
    { key: 'branches', label: 'Branches', used: usage.branchesCount || 0, limit: features.maxBranches ?? null },
    { key: 'storage', label: 'Storage (MB)', used: usage.storageUsedMB || 0, limit: features.maxStorageMB ?? null },
  ].map((l) => ({
    ...l,
    percent: l.limit ? Math.min(100, Math.round((l.used / l.limit) * 100)) : null,
    atLimit: l.limit ? l.used >= l.limit : false,
  }));

  const now = new Date();
  const status = effective?.status || 'none';
  const periodEnd = effective?.currentPeriodEnd || null;
  const trialEnd = effective?.trialEnd || null;
  const expiresAt = status === SUBSCRIPTION_STATUS.TRIAL ? trialEnd : periodEnd;
  const daysRemaining = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS)
    : null;

  // Cancelled, suspended, or past its date — needs paying for again rather than
  // upgrading in place. An open-ended record with no expiry date is left alone.
  const needsRenewal = !effective
    || [SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.CANCELLED].includes(status)
    || (daysRemaining !== null && daysRemaining <= 0);

  return {
    subscription: effective
      ? {
        plan: effective.plan,
        planName: currentPlan?.name || effective.plan,
        tier: currentPlan?.tier ?? null,
        status,
        billingCycle: effective.billingCycle,
        amount: effective.amount,
        amountBreakdown: subscription?.amountBreakdown || null,
        currentPeriodStart: subscription?.currentPeriodStart || null,
        currentPeriodEnd: periodEnd,
        trialEnd,
        gracePeriodEndsAt: subscription?.gracePeriodEndsAt || null,
        scheduledChange: subscription?.scheduledChange || null,
        isLegacy: !subscription,
      }
      : null,
    state: {
      status,
      expiresAt,
      daysRemaining,
      needsRenewal,
      isTrial: status === SUBSCRIPTION_STATUS.TRIAL,
      isSuspended: status === SUBSCRIPTION_STATUS.SUSPENDED,
      expiringSoon: daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 7,
    },
    features,
    limits,
    // Free is a first-registration offer and can never be chosen from here, so
    // it is left out of the catalogue entirely. A clinic that signed up on it
    // still sees it named as its current plan above.
    plans: plans
      .filter((p) => p.slug !== FREE_PLAN)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        tier: p.tier,
        pricing: p.pricing,
        features: p.features,
        addOns: p.addOns,
        // Which individual features this plan actually sells. Without it the
        // page had to guess, and offered add-ons no plan could charge for.
        featurePricing: (p.featurePricing || [])
          .filter((f) => f.isActive)
          .map((f) => ({
            featureKey: f.featureKey,
            label: f.label,
            monthlyPrice: f.monthlyPrice,
            yearlyPrice: f.yearlyPrice,
          })),
        isCurrent: effective?.plan === p.slug,
        isUpgrade: currentPlan ? p.tier > currentPlan.tier : true,
      })),
  };
}

/* ── 2. Quote ────────────────────────────────────────────────────────── */

/**
 * Price a prospective change without touching anything.
 *
 * An in-period upgrade is prorated — the clinic only pays the difference for
 * the days it has left. A renewal (expired / suspended / cancelled) is charged
 * in full for a fresh period, because there is nothing left to credit.
 */
async function quote(tenantSlug, input) {
  _rejectFreePlan(input.plan);

  const clinic = await _findClinic(tenantSlug);
  const subscription = await _latestSubscription(clinic._id);

  const targetPlan = await Plan().findOne({
    slug: input.plan,
    ..._availablePlanFilter(clinic._id),
  });
  if (!targetPlan) throw ApiError.notFound(`Plan "${input.plan}" is not available`);

  const billingCycle = input.billingCycle || subscription?.billingCycle || 'monthly';
  const addOns = _normaliseAddOns(input.addOns);

  const composed = targetPlan.getComposablePrice(billingCycle, addOns);
  const currentPlan = subscription
    ? await Plan().findOne({ slug: subscription.plan })
    : null;

  const isLive = subscription && LIVE_STATUSES.includes(subscription.status);
  const notExpired = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd) > new Date()
    : false;

  const sameSelection = subscription
    && subscription.plan === input.plan
    && subscription.billingCycle === billingCycle
    && addOns.extraDoctors === 0
    && addOns.extraStorageUnits === 0
    && addOns.enabledFeatures.length === 0;

  let intent = 'renew';
  if (isLive && notExpired) {
    if (sameSelection) intent = 'renew';           // extend the same plan early
    else if (!currentPlan || currentPlan.isUpgradeTo(targetPlan)) intent = 'upgrade';
    else intent = 'downgrade';
  }

  // Downgrades take effect at period end and are never charged now.
  if (intent === 'downgrade') {
    return {
      intent,
      plan: { slug: targetPlan.slug, name: targetPlan.name, tier: targetPlan.tier },
      billingCycle,
      addOns,
      basePrice: composed.basePrice,
      addOnBreakdown: composed.addOnBreakdown,
      addOnTotal: composed.addOnTotal,
      subtotal: composed.totalBeforeDiscounts,
      proration: null,
      amountDue: 0,
      amountDuePaise: 0,
      effectiveAt: subscription?.currentPeriodEnd || null,
      currency: 'INR',
      requiresPayment: false,
    };
  }

  let proration = null;
  let amountDue = composed.totalBeforeDiscounts;

  if (intent === 'upgrade' && subscription?.status === SUBSCRIPTION_STATUS.ACTIVE) {
    try {
      proration = await pricingService.calculateProration(
        subscription._id, targetPlan._id, billingCycle, addOns,
      );
      // Never refund on an upgrade — a negative net just means "nothing to pay".
      amountDue = Math.max(0, proration.netAmount);
    } catch (err) {
      logger.warn('Proration failed for %s (%s) — charging full price', tenantSlug, err.message);
    }
  }

  amountDue = round2(amountDue);

  return {
    intent,
    plan: { slug: targetPlan.slug, name: targetPlan.name, tier: targetPlan.tier },
    billingCycle,
    addOns,
    basePrice: composed.basePrice,
    addOnBreakdown: composed.addOnBreakdown,
    addOnTotal: composed.addOnTotal,
    subtotal: composed.totalBeforeDiscounts,
    proration,
    amountDue,
    amountDuePaise: Math.round(amountDue * 100),
    currency: 'INR',
    requiresPayment: amountDue > 0,
  };
}

/* ── 3. Order ────────────────────────────────────────────────────────── */

/**
 * Open a Razorpay order for the server-computed quote. The caller never gets to
 * name a price — only a plan, cycle and add-on set.
 */
async function createOrder(tenantSlug, input) {
  // A clinic suspended or cancelled by the product owner stays locked out no
  // matter what it pays: _syncToClinic writes the subscription and features but
  // never clears clinic.status / clinic.isActive, so taking money here would buy
  // nothing. Subscription-level suspension is deliberately still sellable —
  // renewing is precisely how a clinic gets itself out of that one.
  const clinic = await _findClinic(tenantSlug);
  if (
    clinic.isActive === false
    || clinic.status === TENANT_STATUS.SUSPENDED
    || clinic.status === TENANT_STATUS.CANCELLED
  ) {
    throw ApiError.forbidden(
      'This clinic has been suspended by support. Please get in touch to restore '
      + 'access — paying again will not lift the suspension.',
    );
  }

  const priced = await quote(tenantSlug, input);

  if (!priced.requiresPayment) {
    throw ApiError.badRequest(
      priced.intent === 'downgrade'
        ? 'Downgrades take effect at the end of the current period and are not charged'
        : 'Nothing to pay for this change',
    );
  }

  const gatewayConfig = razorpay.checkConfig();
  if (!gatewayConfig.ok) {
    logger.error('Subscription order aborted — gateway not configured [%s]: %s', tenantSlug, gatewayConfig.reason);
    throw ApiError.serviceUnavailable(`Payment gateway is not configured: ${gatewayConfig.reason}`);
  }

  const receipt = `sub_${tenantSlug}_${Date.now()}`.slice(0, 40);
  let order;
  try {
    order = await razorpay.createOrder(priced.amountDuePaise, 'INR', receipt, {
      tenantSlug,
      purpose: 'subscription',
      plan: priced.plan.slug,
      billingCycle: priced.billingCycle,
    });
  } catch (err) {
    const detail = err?.error?.description || err.message;
    logger.error('Subscription order failed [%s] plan=%s: %s', tenantSlug, priced.plan.slug, detail);
    if (err?.statusCode === 401) {
      throw ApiError.serviceUnavailable(
        'Payment gateway rejected our credentials — check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET',
      );
    }
    throw ApiError.serviceUnavailable(`Payment gateway error: ${detail}`);
  }

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: require('../../config/env').RAZORPAY_KEY_ID,
    quote: priced,
  };
}

/* ── 4. Verify and apply ─────────────────────────────────────────────── */

/**
 * Confirm a checkout and put the clinic on the plan it paid for.
 *
 * The selection is re-priced here rather than trusted from the request, and the
 * captured amount is read back from Razorpay, so the only thing that can be
 * applied is something the payment actually covers.
 */
async function verifyAndApply(tenantSlug, payload, user) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

  if (!razorpay.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    throw ApiError.badRequest('Invalid payment signature — verification failed');
  }

  const priced = await quote(tenantSlug, payload);
  if (!priced.requiresPayment) {
    throw ApiError.badRequest('This change does not require a payment');
  }

  // Authoritative amount, straight from the gateway.
  let paidPaise = null;
  try {
    const rzPayment = await razorpay.fetchPayment(razorpay_payment_id);
    if (rzPayment.order_id && rzPayment.order_id !== razorpay_order_id) {
      throw ApiError.badRequest('Payment does not belong to this order');
    }
    if (!['captured', 'authorized'].includes(rzPayment.status)) {
      throw ApiError.badRequest(`Payment is not captured at the gateway (status: ${rzPayment.status})`);
    }
    paidPaise = rzPayment.amount;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('Could not confirm subscription payment %s: %s', razorpay_payment_id, err.message);
    throw ApiError.serviceUnavailable('Could not confirm the payment with the gateway — please retry');
  }

  // Allow a rupee of slack for rounding between quote and order.
  if (paidPaise + 100 < priced.amountDuePaise) {
    logger.error(
      'Subscription payment short for %s: paid %d paise, plan %s requires %d',
      tenantSlug, paidPaise, priced.plan.slug, priced.amountDuePaise,
    );
    throw ApiError.badRequest('The payment does not cover the selected plan');
  }

  const subscription = await _applyPaidPlan(tenantSlug, priced, {
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    paidAmount: round2(paidPaise / 100),
    actor: user?.userId || 'clinic',
  });

  logger.info(
    'Subscription %s for %s: now on "%s" (%s), paid ₹%s',
    priced.intent, tenantSlug, priced.plan.slug, priced.billingCycle, round2(paidPaise / 100),
  );

  return { subscription, quote: priced, overview: await getOverview(tenantSlug) };
}

/**
 * Move the clinic onto the paid plan and start a fresh billing period.
 *
 * Covers all three entry states with one path — upgrading mid-period,
 * reactivating a suspended subscription, and reviving one the lifecycle worker
 * cancelled after a trial — because in every case the outcome is the same:
 * active, on this plan, with these features, until the new period ends.
 */
async function _applyPaidPlan(tenantSlug, priced, payment) {
  const clinic = await _findClinic(tenantSlug);
  const targetPlan = await Plan().findOne({ slug: priced.plan.slug });
  if (!targetPlan) throw ApiError.notFound('Plan disappeared while applying the payment');

  let subscription = await _latestSubscription(clinic._id);
  const now = new Date();
  const periodMs = priced.billingCycle === 'yearly' ? 365 * DAY_MS : 30 * DAY_MS;

  // Extend from the existing period end when it is still in the future, so an
  // early renewal adds time rather than throwing away what is already paid for.
  const existingEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;
  const startFrom = priced.intent === 'renew' && existingEnd && existingEnd > now ? existingEnd : now;

  const fields = {
    plan: targetPlan.slug,
    planRef: targetPlan._id,
    billingCycle: priced.billingCycle,
    amount: priced.subtotal,
    amountBreakdown: {
      basePrice: priced.basePrice,
      addOns: priced.addOnBreakdown,
      addOnTotal: priced.addOnTotal,
    },
    currentPeriodStart: now,
    currentPeriodEnd: new Date(startFrom.getTime() + periodMs),
    gracePeriodEndsAt: undefined,
    scheduledChange: undefined,
  };

  // A cancelled subscription is terminal — transition() refuses to move it
  // anywhere at all. Renewing off the back of one therefore has to open a fresh
  // record, or the clinic is charged and this throws 422 with the payment
  // already captured. Now that /subscriptions is reachable while cancelled, that
  // is a path real clinics take.
  if (!subscription || subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
    subscription = new (Subscription())({
      clinic: clinic._id,
      ...fields,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      statusHistory: [{
        from: 'none',
        to: SUBSCRIPTION_STATUS.ACTIVE,
        reason: `Self-serve ${priced.intent} — ${targetPlan.slug}`,
        triggeredBy: 'clinic',
        timestamp: now,
      }],
    });
  } else {
    if (subscription.plan !== targetPlan.slug) subscription.previousPlan = subscription.plan;
    Object.assign(subscription, fields);

    if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
      // transition() enforces the state machine and writes the audit entry.
      subscription.transition(
        SUBSCRIPTION_STATUS.ACTIVE,
        `Self-serve ${priced.intent} — ${targetPlan.slug}`,
        'clinic',
      );
    } else {
      subscription.statusHistory.push({
        from: SUBSCRIPTION_STATUS.ACTIVE,
        to: SUBSCRIPTION_STATUS.ACTIVE,
        reason: `Self-serve ${priced.intent} — ${targetPlan.slug}`,
        triggeredBy: 'clinic',
        timestamp: now,
      });
    }
  }

  subscription.razorpay = {
    ...(subscription.razorpay || {}),
    paymentMethodId: payment.razorpayPaymentId,
  };

  await subscription.save();

  // Push the plan's features onto the clinic and drop the feature caches, so
  // the new limits take effect on the very next request.
  await subscriptionService.syncSubscriptionToClinic(clinic._id, subscription, targetPlan);

  return subscription;
}

/* ── 5. Scheduled downgrade (no payment) ─────────────────────────────── */

/**
 * Queue a downgrade for the end of the current period. Nothing is charged and
 * nothing changes today — the lifecycle worker applies it when the period ends.
 */
async function scheduleDowngrade(tenantSlug, input) {
  _rejectFreePlan(input.plan);

  const clinic = await _findClinic(tenantSlug);
  const subscription = await _latestSubscription(clinic._id);
  if (!subscription || !LIVE_STATUSES.includes(subscription.status)) {
    throw ApiError.badRequest('No active subscription to change');
  }

  const targetPlan = await Plan().findOne({ slug: input.plan, isActive: true });
  if (!targetPlan) throw ApiError.notFound(`Plan "${input.plan}" is not available`);

  const effectiveAt = subscription.currentPeriodEnd || subscription.trialEnd || new Date();

  subscription.scheduledChange = {
    plan: targetPlan.slug,
    planRef: targetPlan._id,
    billingCycle: input.billingCycle || subscription.billingCycle,
    effectiveAt,
    addOnQuantities: _normaliseAddOns(input.addOns),
    scheduledAt: new Date(),
    reason: `Self-serve downgrade: ${subscription.plan} → ${targetPlan.slug}`,
  };
  await subscription.save();

  logger.info('Self-serve downgrade scheduled for %s: %s → %s (effective %s)',
    tenantSlug, subscription.plan, targetPlan.slug, effectiveAt.toISOString());

  return { scheduledChange: subscription.scheduledChange };
}

/** Drop a pending scheduled downgrade. */
async function cancelScheduledDowngrade(tenantSlug) {
  const clinic = await _findClinic(tenantSlug);
  const subscription = await _latestSubscription(clinic._id);
  if (!subscription?.scheduledChange?.plan) {
    throw ApiError.badRequest('No scheduled change to cancel');
  }
  subscription.scheduledChange = undefined;
  await subscription.save();
  return { cancelled: true };
}

module.exports = {
  getOverview,
  quote,
  createOrder,
  verifyAndApply,
  scheduleDowngrade,
  cancelScheduledDowngrade,
};
