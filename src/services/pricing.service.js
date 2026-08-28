'use strict';

/**
 * Pricing Service — composite discount engine with proration.
 *
 * Pipeline: base price → promo discount → rebate discounts → floor at 0
 *
 * Supports:
 *  - Percentage and flat-amount promotions
 *  - Loyalty, volume, referral, annual commitment rebates
 *  - Stacking rules (non-stackable rebates are mutually exclusive)
 *  - Mid-cycle proration for upgrade/downgrade
 *  - Upgrade/downgrade direction detection via Plan.tier
 */

const ApiError = require('../utils/ApiError');
const Plan = require('../models/platform/Plan');
const Promotion = require('../models/platform/Promotion');
const Rebate = require('../models/platform/Rebate');
const Clinic = require('../models/platform/Clinic');
const Subscription = require('../models/platform/Subscription');
const { SUBSCRIPTION_STATUS } = require('../config/constants');

/**
 * Calculate the effective price for a plan + billing cycle + add-ons.
 * Pipeline: (base + add-ons) → promo discount → rebate discounts → floor at 0
 *
 * @param {object} params
 * @param {string} params.planId — ObjectId of the Plan
 * @param {string} params.billingCycle — 'monthly' | 'yearly'
 * @param {string} [params.promoCode]
 * @param {string} [params.clinicSlug] — for rebate eligibility checks
 * @param {number} [params.extraDoctors=0] — additional doctors beyond plan limit
 * @param {number} [params.extraStorageUnits=0] — additional storage units
 * @param {string[]} [params.enabledFeatures=[]] — feature keys to price as add-ons
 * @param {string[]} [params.enabledModules=[]] — module keys to price as add-ons
 * @returns {{ basePrice, addOns[], addOnTotal, grossPrice, discounts[], finalPrice, savings, currency, billingCycle }}
 */
async function calculatePrice({
  planId,
  billingCycle,
  promoCode,
  clinicSlug,
  extraDoctors = 0,
  extraStorageUnits = 0,
  enabledFeatures = [],
  enabledModules = [],
}) {
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) throw ApiError.notFound('Plan not found or inactive');

  const currency = plan.pricing.currency;

  // Composable add-on calculation
  const composable = plan.getComposablePrice(billingCycle, {
    extraDoctors,
    extraStorageUnits,
    enabledFeatures,
    enabledModules,
  });

  const grossPrice = composable.totalBeforeDiscounts;

  const discounts = [];
  let runningPrice = grossPrice;

  // 1. Apply promo code (against gross price including add-ons)
  if (promoCode) {
    const promo = await _resolvePromotion(promoCode, planId, billingCycle, clinicSlug);
    if (promo) {
      const promoDiscount = _applyDiscount(runningPrice, promo.discountType, promo.discountValue);
      discounts.push({
        type: 'promotion',
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        amount: promoDiscount,
        durationMonths: promo.durationMonths,
      });
      runningPrice -= promoDiscount;
    }
  }

  // 2. Apply qualifying rebates
  if (clinicSlug) {
    const rebateDiscounts = await _resolveRebates(clinicSlug, planId, runningPrice);
    for (const rb of rebateDiscounts) {
      discounts.push(rb);
      runningPrice -= rb.amount;
    }
  }

  // Ensure price doesn't go below zero
  const finalPrice = Math.max(0, Math.round(runningPrice * 100) / 100);
  const savings = Math.round((grossPrice - finalPrice) * 100) / 100;

  return {
    basePrice: composable.basePrice,
    addOns: composable.addOnBreakdown,
    addOnTotal: composable.addOnTotal,
    grossPrice,
    discounts,
    finalPrice,
    savings,
    currency,
    billingCycle,
  };
}

/**
 * Calculate proration when upgrading/downgrading mid-cycle.
 * Also determines direction (upgrade vs downgrade) using Plan.tier.
 *
 * @param {string} subscriptionId
 * @param {string} newPlanId — ObjectId of the target Plan
 * @param {string} [newBillingCycle]
 * @param {object} [addOnQuantities] — optional add-on quantities for the new plan
 * @returns {{ direction, proratedCredit, proratedCharge, netAmount, daysRemaining, currentPlan, newPlan }}
 */
async function calculateProration(subscriptionId, newPlanId, newBillingCycle, addOnQuantities = {}) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw ApiError.notFound('Subscription not found');

  const [currentPlan, newPlan] = await Promise.all([
    sub.planRef ? Plan.findById(sub.planRef) : Plan.findOne({ slug: sub.plan }),
    Plan.findById(newPlanId),
  ]);

  if (!newPlan) throw ApiError.notFound('New plan not found');

  // Determine direction using tier
  const direction = currentPlan && currentPlan.isUpgradeTo(newPlan) ? 'upgrade' : 'downgrade';

  const now = new Date();
  const periodStart = sub.currentPeriodStart;
  const periodEnd = sub.currentPeriodEnd;

  if (!periodStart || !periodEnd) {
    return { direction, proratedCredit: 0, proratedCharge: 0, netAmount: 0, daysRemaining: 0, currentPlan: sub.plan, newPlan: newPlan.slug };
  }

  const totalDays = (periodEnd - periodStart) / (1000 * 60 * 60 * 24);
  const daysUsed = Math.max(0, (now - periodStart) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, totalDays - daysUsed);

  if (totalDays <= 0) {
    return { direction, proratedCredit: 0, proratedCharge: 0, netAmount: 0, daysRemaining: 0, currentPlan: sub.plan, newPlan: newPlan.slug };
  }

  // Credit for unused portion of current plan
  const dailyRateCurrent = sub.amount / totalDays;
  const proratedCredit = Math.round(dailyRateCurrent * daysRemaining * 100) / 100;

  // Charge for new plan for remaining days (including add-ons)
  const cycle = newBillingCycle || sub.billingCycle;
  const newPlanPricing = newPlan.getComposablePrice(cycle, addOnQuantities);
  const newPrice = newPlanPricing.totalBeforeDiscounts;
  const dailyRateNew = newPrice / totalDays;
  const proratedCharge = Math.round(dailyRateNew * daysRemaining * 100) / 100;

  const netAmount = Math.round((proratedCharge - proratedCredit) * 100) / 100;

  return {
    direction,
    proratedCredit,
    proratedCharge,
    netAmount,
    daysRemaining: Math.round(daysRemaining),
    currentPlan: sub.plan,
    newPlan: newPlan.slug,
    currentTier: currentPlan?.tier,
    newTier: newPlan.tier,
  };
}

// ─── Internals ──────────────────────────────────────────

async function _resolvePromotion(code, planId, billingCycle, clinicSlug) {
  const now = new Date();
  const promo = await Promotion.findOne({
    code: code.toUpperCase(),
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
  });

  if (!promo) return null;

  // Check usage limits
  if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) return null;

  // Check plan applicability
  if (promo.applicablePlans.length > 0 && !promo.applicablePlans.some((p) => p.toString() === planId)) {
    return null;
  }

  // Check billing cycle applicability
  if (promo.applicableBillingCycles.length > 0 && !promo.applicableBillingCycles.includes(billingCycle)) {
    return null;
  }

  // Resolve clinic once for targeting + per-clinic limit checks
  let clinic = null;
  if (clinicSlug) {
    clinic = await Clinic.findOne({ slug: clinicSlug });
  }

  // Check clinic targeting (tenant-specific promotions)
  if (clinic && promo.targetClinics && promo.targetClinics.length > 0) {
    if (!promo.targetClinics.some((c) => c.toString() === clinic._id.toString())) {
      return null;
    }
  }

  // Check per-clinic limit
  if (clinic) {
    const clinicRedemptions = promo.redemptions.filter(
      (r) => r.clinic.toString() === clinic._id.toString(),
    ).length;
    if (clinicRedemptions >= promo.maxPerClinic) return null;
  }

  return promo;
}

async function _resolveRebates(clinicSlug, planId, currentPrice) {
  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) return [];

  // Get oldest subscription for age calculation
  const sub = await Subscription.findOne({
    clinic: clinic._id,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
  }).sort({ createdAt: 1 });

  const monthsSubscribed = sub
    ? Math.floor((Date.now() - sub.createdAt.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
    : 0;

  // Count referrals for referral-type rebates
  const referralCount = await Clinic.countDocuments({ referredBy: clinic._id });

  const rebates = await Rebate.find({ isActive: true }).sort({ priority: -1 });
  const applied = [];
  let hasNonStackable = false;

  for (const rebate of rebates) {
    // Check plan applicability
    if (rebate.applicablePlans.length > 0 && !rebate.applicablePlans.some((p) => p.toString() === planId)) {
      continue;
    }

    // Check trigger conditions
    const cond = rebate.conditions;
    if (cond.minSubscriptionMonths > 0 && monthsSubscribed < cond.minSubscriptionMonths) continue;
    if (cond.minDoctors > 0 && (sub?.usage?.doctorsCount || 0) < cond.minDoctors) continue;
    if (cond.minBranches > 0 && (clinic.features?.maxBranches || 0) < cond.minBranches) continue;
    if (cond.minReferrals > 0 && referralCount < cond.minReferrals) continue;
    if (cond.requiresYearlyBilling && sub?.billingCycle !== 'yearly') continue;

    // Stacking check
    if (!rebate.stackable && hasNonStackable) continue;
    if (!rebate.stackable) hasNonStackable = true;

    const amount = _applyDiscount(currentPrice, rebate.discountType, rebate.discountValue);
    applied.push({
      type: 'rebate',
      name: rebate.name,
      rebateType: rebate.type,
      discountType: rebate.discountType,
      discountValue: rebate.discountValue,
      amount,
    });
  }

  return applied;
}

function _applyDiscount(price, discountType, discountValue) {
  if (discountType === 'percentage') {
    return Math.round((price * Math.min(discountValue, 100)) / 100 * 100) / 100;
  }
  return Math.min(discountValue, price);
}

module.exports = { calculatePrice, calculateProration };
