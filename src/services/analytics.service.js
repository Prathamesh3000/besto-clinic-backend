'use strict';

/**
 * Analytics Service — deep aggregation queries for Product Owner dashboard.
 *
 * Provides:
 *  - MRR breakdown (by plan, billing cycle, add-ons, custom pricing)
 *  - Active subscription analytics (by plan/status/cycle, ARPS, promo usage)
 *  - Expiring subscription tracking (trials, renewals, grace period)
 *  - Suspended tenant report (revenue impact, reasons, durations)
 *  - Plan distribution analytics (conversion, upgrades/downgrades)
 *  - Promotion impact report (revenue impact, per-promo breakdown)
 */

const Subscription = require('../models/platform/Subscription');
const Plan = require('../models/platform/Plan');
const Promotion = require('../models/platform/Promotion');
const Rebate = require('../models/platform/Rebate');
const { SUBSCRIPTION_STATUS } = require('../config/constants');

// ─── MRR Breakdown ─────────────────────────────────────

/**
 * Monthly Recurring Revenue with full breakdown.
 *
 * @returns {{ totalMrr, byPlan[], byCycle, addOnRevenue, customPricingImpact, growth }}
 */
async function getMrrBreakdown() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [breakdown, previousMonthMrr] = await Promise.all([
    // Current MRR grouped by plan + billing cycle
    Subscription.aggregate([
      { $match: { status: SUBSCRIPTION_STATUS.ACTIVE } },
      {
        $group: {
          _id: { plan: '$plan', billingCycle: '$billingCycle' },
          count: { $sum: 1 },
          revenue: { $sum: '$amount' },
          addOnRevenue: { $sum: { $ifNull: ['$amountBreakdown.addOnTotal', 0] } },
          customPricingCount: {
            $sum: { $cond: [{ $eq: ['$customPricing.enabled', true] }, 1, 0] },
          },
        },
      },
      { $sort: { '_id.plan': 1, '_id.billingCycle': 1 } },
    ]),

    // Previous month MRR (subs that were active 30 days ago)
    Subscription.aggregate([
      {
        $match: {
          createdAt: { $lte: thirtyDaysAgo },
          $or: [
            { status: SUBSCRIPTION_STATUS.ACTIVE },
            { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: { $gt: thirtyDaysAgo } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  // Aggregate by plan
  const planMap = {};
  let totalMrr = 0;
  let totalAddOnRevenue = 0;
  let totalCustomPricingCount = 0;
  const byCycle = {
    monthly: { count: 0, mrr: 0 },
    yearly: { count: 0, mrr: 0, mrrEquivalent: 0 },
  };

  for (const row of breakdown) {
    const { plan, billingCycle } = row._id;
    const mrr = billingCycle === 'yearly'
      ? Math.round((row.revenue / 12) * 100) / 100
      : row.revenue;

    totalMrr += mrr;
    totalAddOnRevenue += row.addOnRevenue;
    totalCustomPricingCount += row.customPricingCount;

    // By plan
    if (!planMap[plan]) {
      planMap[plan] = { plan, count: 0, mrr: 0, revenue: 0 };
    }
    planMap[plan].count += row.count;
    planMap[plan].mrr += mrr;
    planMap[plan].revenue += row.revenue;

    // By cycle
    if (billingCycle === 'yearly') {
      byCycle.yearly.count += row.count;
      byCycle.yearly.mrr += row.revenue;
      byCycle.yearly.mrrEquivalent += mrr;
    } else {
      byCycle.monthly.count += row.count;
      byCycle.monthly.mrr += row.revenue;
    }
  }

  const byPlan = Object.values(planMap).sort((a, b) => b.mrr - a.mrr);
  const prevMrr = previousMonthMrr[0]?.total || 0;
  const growthAmount = Math.round((totalMrr - prevMrr) * 100) / 100;
  const growthRate = prevMrr > 0
    ? Math.round(((totalMrr - prevMrr) / prevMrr) * 10000) / 100
    : 0;

  return {
    totalMrr: Math.round(totalMrr * 100) / 100,
    byPlan,
    byCycle,
    addOnRevenue: Math.round(totalAddOnRevenue * 100) / 100,
    customPricingImpact: { count: totalCustomPricingCount },
    growth: {
      previousMrr: prevMrr,
      currentMrr: Math.round(totalMrr * 100) / 100,
      amount: growthAmount,
      rate: growthRate,
    },
  };
}

// ─── Active Subscription Analytics ─────────────────────

/**
 * Detailed active subscription metrics.
 *
 * @returns {{ summary, byPlan[], byCycle, arps, promotions, scheduledChanges }}
 */
async function getActiveSubscriptionAnalytics() {
  const [statusBreakdown, promoStats, scheduledCount] = await Promise.all([
    // Group by plan + status
    Subscription.aggregate([
      {
        $match: {
          status: {
            $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL, SUBSCRIPTION_STATUS.GRACE_PERIOD],
          },
        },
      },
      {
        $group: {
          _id: { plan: '$plan', status: '$status', billingCycle: '$billingCycle' },
          count: { $sum: 1 },
          revenue: { $sum: '$amount' },
        },
      },
    ]),

    // Promotion usage
    Subscription.aggregate([
      {
        $match: {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          'appliedPromotion.code': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withRemainingCycles: {
            $sum: { $cond: [{ $gt: ['$appliedPromotion.remainingCycles', 0] }, 1, 0] },
          },
        },
      },
    ]),

    // Scheduled changes
    Subscription.countDocuments({
      'scheduledChange.effectiveAt': { $exists: true },
      status: SUBSCRIPTION_STATUS.ACTIVE,
    }),
  ]);

  // Build plan breakdown
  const planMap = {};
  const summary = { active: 0, trial: 0, gracePeriod: 0, total: 0 };
  const byCycle = { monthly: 0, yearly: 0 };
  let totalRevenue = 0;

  for (const row of statusBreakdown) {
    const { plan, status, billingCycle } = row._id;

    if (!planMap[plan]) {
      planMap[plan] = { plan, active: 0, trial: 0, gracePeriod: 0, total: 0, revenue: 0 };
    }

    const statusKey = status === SUBSCRIPTION_STATUS.ACTIVE ? 'active'
      : status === SUBSCRIPTION_STATUS.TRIAL ? 'trial'
        : 'gracePeriod';

    planMap[plan][statusKey] += row.count;
    planMap[plan].total += row.count;
    planMap[plan].revenue += row.revenue;

    summary[statusKey] += row.count;
    summary.total += row.count;
    totalRevenue += row.revenue;

    if (billingCycle === 'yearly') {
      byCycle.yearly += row.count;
    } else {
      byCycle.monthly += row.count;
    }
  }

  const activeCount = summary.active || 1; // avoid division by 0

  return {
    summary,
    byPlan: Object.values(planMap).sort((a, b) => b.total - a.total),
    byCycle,
    arps: Math.round((totalRevenue / activeCount) * 100) / 100,
    promotions: {
      withPromotion: promoStats[0]?.total || 0,
      withRemainingCycles: promoStats[0]?.withRemainingCycles || 0,
    },
    scheduledChanges: scheduledCount,
  };
}

// ─── Expiring Subscriptions ────────────────────────────

/**
 * Subscriptions expiring within the next N days.
 *
 * @param {number} [daysAhead=30]
 * @returns {{ expiringTrials[], upcomingRenewals[], gracePeriodDeadlines[], summary }}
 */
async function getExpiringSubscriptions(daysAhead = 30) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const selectFields = 'plan billingCycle amount status trialEnd currentPeriodEnd gracePeriodEndsAt';
  const populateOpts = { path: 'clinic', select: 'name slug' };

  const [expiringTrials, upcomingRenewals, gracePeriodDeadlines] = await Promise.all([
    Subscription.find({
      status: SUBSCRIPTION_STATUS.TRIAL,
      trialEnd: { $gte: now, $lte: cutoff },
    })
      .select(selectFields)
      .populate(populateOpts)
      .sort({ trialEnd: 1 })
      .lean(),

    Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodEnd: { $gte: now, $lte: cutoff },
    })
      .select(selectFields)
      .populate(populateOpts)
      .sort({ currentPeriodEnd: 1 })
      .lean(),

    Subscription.find({
      status: SUBSCRIPTION_STATUS.GRACE_PERIOD,
      gracePeriodEndsAt: { $gte: now, $lte: cutoff },
    })
      .select(selectFields)
      .populate(populateOpts)
      .sort({ gracePeriodEndsAt: 1 })
      .lean(),
  ]);

  // Normalize output
  const normalize = (items, dateField) => items.map((item) => ({
    clinicSlug: item.clinic?.slug,
    clinicName: item.clinic?.name,
    plan: item.plan,
    status: item.status,
    expiresAt: item[dateField],
    amount: item.amount,
    billingCycle: item.billingCycle,
  }));

  return {
    expiringTrials: normalize(expiringTrials, 'trialEnd'),
    upcomingRenewals: normalize(upcomingRenewals, 'currentPeriodEnd'),
    gracePeriodDeadlines: normalize(gracePeriodDeadlines, 'gracePeriodEndsAt'),
    summary: {
      expiringTrials: expiringTrials.length,
      upcomingRenewals: upcomingRenewals.length,
      gracePeriodDeadlines: gracePeriodDeadlines.length,
      total: expiringTrials.length + upcomingRenewals.length + gracePeriodDeadlines.length,
    },
    daysAhead,
  };
}

// ─── Suspended Tenant Report ───────────────────────────

/**
 * Detailed suspended tenant report with revenue impact.
 *
 * @returns {{ tenants[], totalRevenueImpact, avgSuspensionDays, reasonBreakdown }}
 */
async function getSuspendedTenantReport() {
  const now = new Date();

  const suspended = await Subscription.find({
    status: SUBSCRIPTION_STATUS.SUSPENDED,
  })
    .populate('clinic', 'name slug subscription.plan')
    .lean();

  let totalRevenueImpact = 0;
  let totalSuspensionDays = 0;
  const reasonMap = {};

  const tenants = suspended.map((sub) => {
    // Find suspension event in status history
    const suspensionEvent = [...(sub.statusHistory || [])].reverse().find(
      (h) => h.to === SUBSCRIPTION_STATUS.SUSPENDED,
    );

    const suspendedAt = suspensionEvent?.timestamp || sub.updatedAt;
    const reason = suspensionEvent?.reason || sub.cancelReason || 'Unknown';
    const daysAsSuspended = Math.max(0, Math.floor((now - new Date(suspendedAt)) / (1000 * 60 * 60 * 24)));

    totalRevenueImpact += sub.amount || 0;
    totalSuspensionDays += daysAsSuspended;

    // Reason breakdown
    const reasonKey = reason.length > 60 ? reason.substring(0, 60) + '...' : reason;
    reasonMap[reasonKey] = (reasonMap[reasonKey] || 0) + 1;

    return {
      clinicSlug: sub.clinic?.slug,
      clinicName: sub.clinic?.name,
      plan: sub.plan,
      amount: sub.amount,
      billingCycle: sub.billingCycle,
      suspendedAt,
      daysAsSuspended,
      reason,
    };
  });

  const count = tenants.length || 1;

  return {
    tenants: tenants.sort((a, b) => b.amount - a.amount),
    count: tenants.length,
    totalRevenueImpact: Math.round(totalRevenueImpact * 100) / 100,
    avgSuspensionDays: Math.round(totalSuspensionDays / count),
    reasonBreakdown: Object.entries(reasonMap)
      .map(([reason, cnt]) => ({ reason, count: cnt }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Plan Distribution Analytics ───────────────────────

/**
 * Deep plan distribution with revenue contribution and conversion tracking.
 *
 * @returns {{ distribution[], totalMrr, upgradeDowngradeFlows[], conversionRates[] }}
 */
async function getPlanDistributionAnalytics() {
  const [planDistribution, plans, upgradeFlows, conversionData] = await Promise.all([
    // Subscription counts by plan + status
    Subscription.aggregate([
      {
        $match: {
          status: {
            $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL, SUBSCRIPTION_STATUS.GRACE_PERIOD],
          },
        },
      },
      {
        $group: {
          _id: '$plan',
          activeCount: { $sum: { $cond: [{ $eq: ['$status', SUBSCRIPTION_STATUS.ACTIVE] }, 1, 0] } },
          trialCount: { $sum: { $cond: [{ $eq: ['$status', SUBSCRIPTION_STATUS.TRIAL] }, 1, 0] } },
          gracePeriodCount: {
            $sum: { $cond: [{ $eq: ['$status', SUBSCRIPTION_STATUS.GRACE_PERIOD] }, 1, 0] },
          },
          totalRevenue: { $sum: '$amount' },
        },
      },
    ]),

    // Plan metadata
    Plan.find({}).select('slug name tier isActive isCustom').lean(),

    // Upgrade/downgrade flows
    Subscription.aggregate([
      { $match: { previousPlan: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { from: '$previousPlan', to: '$plan' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),

    // Conversion: trial → active (subscriptions that have both statuses in history)
    Subscription.aggregate([
      {
        $match: {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          'statusHistory.from': SUBSCRIPTION_STATUS.TRIAL,
          'statusHistory.to': SUBSCRIPTION_STATUS.ACTIVE,
        },
      },
      { $group: { _id: '$plan', convertedCount: { $sum: 1 } } },
    ]),
  ]);

  // Build plan metadata map
  const planMeta = {};
  for (const p of plans) {
    planMeta[p.slug] = { name: p.name, tier: p.tier, isCustom: p.isCustom || false };
  }

  // Conversion map
  const conversionMap = {};
  for (const c of conversionData) {
    conversionMap[c._id] = c.convertedCount;
  }

  // Calculate total MRR for percentage
  let totalMrr = 0;
  for (const d of planDistribution) {
    totalMrr += d.totalRevenue;
  }

  const distribution = planDistribution.map((d) => {
    const total = d.activeCount + d.trialCount + d.gracePeriodCount;
    const meta = planMeta[d._id] || { name: d._id, tier: 0, isCustom: false };
    const converted = conversionMap[d._id] || 0;
    const trialTotal = d.trialCount + d.activeCount; // trials that converted + current trials
    const conversionRate = trialTotal > 0
      ? Math.round((converted / trialTotal) * 10000) / 100
      : 0;

    return {
      plan: d._id,
      planName: meta.name,
      tier: meta.tier,
      isCustom: meta.isCustom,
      activeCount: d.activeCount,
      trialCount: d.trialCount,
      gracePeriodCount: d.gracePeriodCount,
      totalCount: total,
      mrr: Math.round(d.totalRevenue * 100) / 100,
      mrrPercentage: totalMrr > 0
        ? Math.round((d.totalRevenue / totalMrr) * 10000) / 100
        : 0,
      avgRevenuePerSub: total > 0
        ? Math.round((d.totalRevenue / total) * 100) / 100
        : 0,
      conversionRate,
    };
  }).sort((a, b) => a.tier - b.tier);

  const upgradeDowngradeFlows = upgradeFlows.map((f) => ({
    from: f._id.from,
    to: f._id.to,
    count: f.count,
    direction: (planMeta[f._id.to]?.tier || 0) > (planMeta[f._id.from]?.tier || 0)
      ? 'upgrade'
      : 'downgrade',
  }));

  return {
    distribution,
    totalMrr: Math.round(totalMrr * 100) / 100,
    upgradeDowngradeFlows,
  };
}

// ─── Promotion Impact Report ───────────────────────────

/**
 * Promotion and rebate impact on revenue.
 *
 * @param {object} [query]
 * @param {string} [query.startDate]
 * @param {string} [query.endDate]
 * @returns {{ summary, perPromotion[], topByImpact[], rebateSummary }}
 */
async function getPromotionImpactReport(query = {}) {
  const now = new Date();
  const start = query.startDate ? new Date(query.startDate) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const end = query.endDate ? new Date(query.endDate) : now;

  const [promoSubAgg, allPromos, activeRebates] = await Promise.all([
    // Subscriptions with active promotions
    Subscription.aggregate([
      {
        $match: {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          'appliedPromotion.code': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$appliedPromotion.code',
          affectedSubscriptions: { $sum: 1 },
          totalBilledAmount: { $sum: '$amount' },
          discountType: { $first: '$appliedPromotion.discountType' },
          discountValue: { $first: '$appliedPromotion.discountValue' },
        },
      },
    ]),

    // All promotions with redemption data
    Promotion.find({}).lean(),

    // Active rebates
    Rebate.find({ isActive: true }).lean(),
  ]);

  // Calculate per-promotion impact
  const promoMeta = {};
  for (const p of allPromos) {
    promoMeta[p.code] = p;
  }

  let totalDiscountImpact = 0;
  let totalAffected = 0;

  const perPromotion = promoSubAgg.map((agg) => {
    const meta = promoMeta[agg._id] || {};

    // Estimate discount per subscription
    let estimatedDiscount = 0;
    if (agg.discountType === 'percentage' && agg.discountValue > 0) {
      // Current amount = original * (1 - discount/100)
      // Original = current / (1 - discount/100)
      // Discount = original - current
      const factor = 1 - agg.discountValue / 100;
      if (factor > 0) {
        const originalTotal = agg.totalBilledAmount / factor;
        estimatedDiscount = Math.round((originalTotal - agg.totalBilledAmount) * 100) / 100;
      }
    } else if (agg.discountType === 'flat') {
      estimatedDiscount = Math.round(agg.discountValue * agg.affectedSubscriptions * 100) / 100;
    }

    totalDiscountImpact += estimatedDiscount;
    totalAffected += agg.affectedSubscriptions;

    // Count redemptions in date range
    const redemptionsInPeriod = (meta.redemptions || []).filter((r) => {
      const d = new Date(r.redeemedAt);
      return d >= start && d <= end;
    }).length;

    return {
      code: agg._id,
      name: meta.name || agg._id,
      discountType: agg.discountType,
      discountValue: agg.discountValue,
      isActive: meta.isActive || false,
      affectedSubscriptions: agg.affectedSubscriptions,
      totalBilledAmount: Math.round(agg.totalBilledAmount * 100) / 100,
      estimatedDiscount,
      redemptionsInPeriod,
      totalRedemptions: meta.currentRedemptions || 0,
    };
  });

  // Summary stats from all promotions
  const activePromoCount = allPromos.filter(
    (p) => p.isActive && new Date(p.expiresAt) > now,
  ).length;
  const totalRedemptions = allPromos.reduce((sum, p) => sum + (p.currentRedemptions || 0), 0);

  // Redemptions in date range across all promos
  const redemptionsInRange = allPromos.reduce((sum, p) => {
    return sum + (p.redemptions || []).filter((r) => {
      const d = new Date(r.redeemedAt);
      return d >= start && d <= end;
    }).length;
  }, 0);

  return {
    summary: {
      activePromotions: activePromoCount,
      totalPromotions: allPromos.length,
      totalRedemptions,
      redemptionsInPeriod: redemptionsInRange,
      affectedActiveSubscriptions: totalAffected,
      estimatedTotalDiscount: Math.round(totalDiscountImpact * 100) / 100,
    },
    perPromotion: perPromotion.sort((a, b) => b.estimatedDiscount - a.estimatedDiscount),
    topByImpact: perPromotion
      .filter((p) => p.estimatedDiscount > 0)
      .slice(0, 10),
    rebateSummary: {
      activeRebates: activeRebates.length,
      byType: _groupRebatesByType(activeRebates),
    },
    period: { start, end },
  };
}

// ─── Tenant Growth ─────────────────────────────────────

/**
 * Tenant growth over time with cumulative totals and status breakdown.
 *
 * @param {object} [query]
 * @param {number} [query.months=12]
 * @returns {{ dataPoints[], summary }}
 */
async function getTenantGrowth(query = {}) {
  const now = new Date();
  const monthsBack = parseInt(query.months, 10) || 12;
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  const Clinic = require('../models/platform/Clinic');

  const [growthData, totalClinics, statusBreakdown] = await Promise.all([
    Clinic.aggregate([
      { $match: { createdAt: { $gte: startDate }, deletedAt: null } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Clinic.countDocuments({ deletedAt: null }),
    Clinic.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // Build cumulative
  const baseCount = totalClinics - growthData.reduce((s, d) => s + d.count, 0);
  let cumulative = baseCount;
  const dataPoints = growthData.map((d) => {
    cumulative += d.count;
    return { period: d._id, newTenants: d.count, cumulativeTotal: cumulative };
  });

  const statusMap = {};
  for (const s of statusBreakdown) statusMap[s._id] = s.count;

  const thisMonth = growthData.find(
    (d) => d._id === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const lastMonth = growthData.find(
    (d) => {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d._id === `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
    },
  );

  return {
    dataPoints,
    summary: {
      totalTenants: totalClinics,
      newThisMonth: thisMonth?.count || 0,
      newLastMonth: lastMonth?.count || 0,
      growthRate: lastMonth?.count > 0
        ? Math.round(((thisMonth?.count || 0) - lastMonth.count) / lastMonth.count * 10000) / 100
        : 0,
      byStatus: statusMap,
    },
  };
}

// ─── Feature Adoption ──────────────────────────────────

/**
 * Feature flag adoption rates across active tenants.
 *
 * @returns {{ features[], totalActiveTenants }}
 */
async function getFeatureAdoption() {
  const FeatureFlag = require('../models/platform/FeatureFlag');
  const Clinic = require('../models/platform/Clinic');

  const [flags, totalClinics] = await Promise.all([
    FeatureFlag.find({}).lean(),
    Clinic.countDocuments({ status: 'active', deletedAt: null }),
  ]);

  const features = flags.map((f) => {
    const enabledCount = f.isGlobal ? totalClinics : (f.enabledForClinics || []).length;
    return {
      key: f.key,
      name: f.name || f.key,
      isGlobal: f.isGlobal || false,
      enabledCount,
      adoptionRate: totalClinics > 0
        ? Math.round((enabledCount / totalClinics) * 10000) / 100
        : 0,
    };
  });

  return {
    features: features.sort((a, b) => b.adoptionRate - a.adoptionRate),
    totalActiveTenants: totalClinics,
  };
}

// ─── Churn Analytics ───────────────────────────────────

/**
 * Churn and suspension analytics with cancel reason breakdown.
 *
 * @param {object} [query]
 * @param {number} [query.months=12]
 * @returns {{ dataPoints[], summary, cancelReasons[] }}
 */
async function getChurnAnalytics(query = {}) {
  const now = new Date();
  const monthsBack = parseInt(query.months, 10) || 12;
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  const [churnData, cancelReasons] = await Promise.all([
    Subscription.aggregate([
      {
        $match: {
          status: { $in: [SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.SUSPENDED] },
          updatedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: '%Y-%m', date: '$updatedAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
          revenueImpact: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]),

    Subscription.aggregate([
      {
        $match: {
          status: SUBSCRIPTION_STATUS.CANCELLED,
          cancelReason: { $exists: true, $ne: null },
          updatedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$cancelReason',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  // Get total active for churn rate calc
  const activeCount = await Subscription.countDocuments({
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
  });

  // Build monthly data
  const monthMap = {};
  for (const row of churnData) {
    const { period, status } = row._id;
    if (!monthMap[period]) monthMap[period] = { period, cancelled: 0, suspended: 0, revenueImpact: 0 };
    if (status === SUBSCRIPTION_STATUS.CANCELLED) {
      monthMap[period].cancelled += row.count;
    } else {
      monthMap[period].suspended += row.count;
    }
    monthMap[period].revenueImpact += row.revenueImpact;
  }

  const dataPoints = Object.values(monthMap).sort((a, b) => a.period.localeCompare(b.period));
  const totalChurned = dataPoints.reduce((s, d) => s + d.cancelled, 0);
  const totalSuspended = dataPoints.reduce((s, d) => s + d.suspended, 0);
  const totalRevenueImpact = dataPoints.reduce((s, d) => s + d.revenueImpact, 0);

  return {
    dataPoints,
    summary: {
      totalChurned,
      totalSuspended,
      totalRevenueImpact: Math.round(totalRevenueImpact * 100) / 100,
      monthlyChurnRate: activeCount > 0
        ? Math.round((totalChurned / monthsBack / activeCount) * 10000) / 100
        : 0,
      activeSubscriptions: activeCount,
    },
    cancelReasons: cancelReasons.map((r) => ({ reason: r._id, count: r.count })),
  };
}

// ─── Internals ─────────────────────────────────────────

function _groupRebatesByType(rebates) {
  const byType = {};
  for (const r of rebates) {
    if (!byType[r.type]) {
      byType[r.type] = { count: 0, rebates: [] };
    }
    byType[r.type].count += 1;
    byType[r.type].rebates.push({
      name: r.name,
      discountType: r.discountType,
      discountValue: r.discountValue,
      stackable: r.stackable,
    });
  }
  return byType;
}

module.exports = {
  getMrrBreakdown,
  getActiveSubscriptionAnalytics,
  getExpiringSubscriptions,
  getSuspendedTenantReport,
  getPlanDistributionAnalytics,
  getPromotionImpactReport,
  getTenantGrowth,
  getFeatureAdoption,
  getChurnAnalytics,
};
