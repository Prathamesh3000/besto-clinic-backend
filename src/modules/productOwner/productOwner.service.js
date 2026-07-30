'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const Clinic = require('../../models/platform/Clinic');
const Subscription = require('../../models/platform/Subscription');
const Plan = require('../../models/platform/Plan');
const PlatformUser = require('../../models/platform/PlatformUser');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LEGACY } = require('../../config/constants');

// ─── Tenant Management ──────────────────────────────────

async function listTenants(query) {
  const { skip, limit, page, sort } = parsePagination(query);
  // Explicitly exclude soft-deleted records — countDocuments() bypasses
  // the Mongoose pre(/^find/) middleware that adds deletedAt: null to find().
  const filter = { deletedAt: null };

  if (query.status) filter['subscription.status'] = query.status;
  if (query.plan) filter['subscription.plan'] = query.plan;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Clinic.find(filter).sort(sort).skip(skip).limit(limit),
    Clinic.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getTenantBySlug(slug) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');
  return clinic;
}

async function updateTenant(slug, data) {
  // Prevent changing slug or dbUri
  delete data.slug;
  delete data.dbUri;

  const clinic = await Clinic.findOneAndUpdate({ slug }, data, {
    new: true,
    runValidators: true,
  });
  if (!clinic) throw ApiError.notFound('Tenant not found');
  return clinic;
}

async function toggleTenantStatus(slug, isActive) {
  const clinic = await Clinic.findOneAndUpdate(
    { slug },
    {
      isActive,
      ...(isActive ? {} : { deletedAt: new Date() }),
      ...(isActive ? { deletedAt: null } : {}),
    },
    { new: true },
  );
  if (!clinic) throw ApiError.notFound('Tenant not found');
  return clinic;
}

async function updateTenantFeatures(slug, features) {
  const clinic = await Clinic.findOneAndUpdate(
    { slug },
    { features },
    { new: true, runValidators: true },
  );
  if (!clinic) throw ApiError.notFound('Tenant not found');
  return clinic;
}

// ─── Plan Management ────────────────────────────────────

async function listPlans(query) {
  const { skip, limit, page, sort } = parsePagination(query);
  const filter = {};

  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.isPublic !== undefined) filter.isPublic = query.isPublic === 'true';
  if (query.isCustom !== undefined) filter.isCustom = query.isCustom === 'true';

  const [items, total] = await Promise.all([
    Plan.find(filter).sort(sort).skip(skip).limit(limit),
    Plan.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPlanById(id) {
  const plan = await Plan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
}

async function createPlan(data, userId) {
  const existing = await Plan.findOne({ slug: data.slug });
  if (existing) throw ApiError.conflict('Plan with this slug already exists');

  return Plan.create({ ...data, createdBy: userId });
}

async function updatePlan(id, data) {
  // Prevent changing slug once created
  delete data.slug;

  const plan = await Plan.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
}

async function deletePlan(id) {
  // Soft deactivate — don't hard delete (existing subscriptions reference this)
  const plan = await Plan.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
}

async function createCustomPlan(clinicSlug, data, userId) {
  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  return Plan.create({
    ...data,
    slug: `custom-${clinicSlug}-${Date.now()}`,
    isCustom: true,
    customForClinic: clinic._id,
    isPublic: false,
    createdBy: userId,
  });
}

// ─── Plan Comparison ───────────────────────────────────

/**
 * Compare two plans side-by-side: features, limits, pricing, add-ons.
 */
async function comparePlans(planIdA, planIdB, billingCycle = 'monthly', quantities = {}) {
  const [planA, planB] = await Promise.all([
    Plan.findById(planIdA),
    Plan.findById(planIdB),
  ]);

  if (!planA) throw ApiError.notFound('Plan A not found');
  if (!planB) throw ApiError.notFound('Plan B not found');

  // Pricing with add-ons
  const pricingA = planA.getComposablePrice(billingCycle, quantities);
  const pricingB = planB.getComposablePrice(billingCycle, quantities);

  // Boolean feature comparison
  const booleanKeys = [
    'smsEnabled', 'teleHealthEnabled', 'customBranding',
    'apiAccess', 'prioritySupport', 'advancedReports', 'whiteLabeling',
  ];
  const features = booleanKeys.map((key) => ({
    feature: key,
    planA: planA.features[key] || false,
    planB: planB.features[key] || false,
    advantage: planA.features[key] === planB.features[key]
      ? 'equal'
      : planB.features[key] ? 'planB' : 'planA',
  }));

  // Numeric limit comparison
  const numericKeys = ['maxDoctors', 'maxStaff', 'maxBranches', 'maxStorageMB', 'maxSmsPerMonth'];
  const limits = numericKeys.map((key) => ({
    limit: key,
    planA: planA.features[key] || 0,
    planB: planB.features[key] || 0,
    difference: (planB.features[key] || 0) - (planA.features[key] || 0),
  }));

  // Tier direction
  const tierDirection = planA.tier === planB.tier
    ? 'same'
    : planA.isUpgradeTo(planB) ? 'upgrade' : 'downgrade';

  // Add-on availability
  const isYearly = billingCycle === 'yearly';
  const addOns = {
    storage: {
      planA: {
        enabled: planA.addOns?.storage?.enabled || false,
        unitSizeMB: planA.addOns?.storage?.unitSizeMB || 0,
        pricePerUnit: isYearly
          ? (planA.addOns?.storage?.pricePerUnitYearly || 0)
          : (planA.addOns?.storage?.pricePerUnitMonthly || 0),
      },
      planB: {
        enabled: planB.addOns?.storage?.enabled || false,
        unitSizeMB: planB.addOns?.storage?.unitSizeMB || 0,
        pricePerUnit: isYearly
          ? (planB.addOns?.storage?.pricePerUnitYearly || 0)
          : (planB.addOns?.storage?.pricePerUnitMonthly || 0),
      },
    },
    doctors: {
      planA: {
        enabled: planA.addOns?.doctors?.enabled || false,
        pricePerDoctor: isYearly
          ? (planA.addOns?.doctors?.pricePerDoctorYearly || 0)
          : (planA.addOns?.doctors?.pricePerDoctorMonthly || 0),
      },
      planB: {
        enabled: planB.addOns?.doctors?.enabled || false,
        pricePerDoctor: isYearly
          ? (planB.addOns?.doctors?.pricePerDoctorYearly || 0)
          : (planB.addOns?.doctors?.pricePerDoctorMonthly || 0),
      },
    },
  };

  return {
    planA: { id: planA._id, name: planA.name, slug: planA.slug, tier: planA.tier, badge: planA.badge },
    planB: { id: planB._id, name: planB.name, slug: planB.slug, tier: planB.tier, badge: planB.badge },
    tierDirection,
    billingCycle,
    pricing: {
      planA: pricingA,
      planB: pricingB,
      difference: Math.round((pricingB.totalBeforeDiscounts - pricingA.totalBeforeDiscounts) * 100) / 100,
    },
    features,
    limits,
    addOns,
    highlights: {
      planA: planA.highlights || [],
      planB: planB.highlights || [],
    },
  };
}

// ─── Dashboard Analytics ────────────────────────────────

async function getDashboardStats() {
  const [
    totalTenants,
    activeTenants,
    trialTenants,
    gracePeriodTenants,
    planDistribution,
    recentSignups,
    mrr,
  ] = await Promise.all([
    // All countDocuments calls must include deletedAt: null — Mongoose pre(/^find/)
    // middleware does NOT apply to countDocuments(), so without it, soft-deleted
    // clinics are counted while find() excludes them.
    Clinic.countDocuments({ deletedAt: null }),
    Clinic.countDocuments({ deletedAt: null, isActive: true, 'subscription.status': SUBSCRIPTION_STATUS.ACTIVE }),
    Clinic.countDocuments({ deletedAt: null, 'subscription.status': SUBSCRIPTION_STATUS.TRIAL }),
    Clinic.countDocuments({
      deletedAt: null,
      'subscription.status': { $in: [SUBSCRIPTION_STATUS.GRACE_PERIOD, SUBSCRIPTION_STATUS_LEGACY.PAST_DUE] },
    }),
    Clinic.aggregate([
      { $match: { isActive: true, deletedAt: null } },
      { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
    ]),
    Clinic.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name slug email subscription.plan subscription.status createdAt'),
    Subscription.aggregate([
      { $match: { status: SUBSCRIPTION_STATUS.ACTIVE } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    totalTenants,
    activeTenants,
    trialTenants,
    gracePeriodTenants,
    suspendedTenants: await Clinic.countDocuments({ deletedAt: null, 'subscription.status': SUBSCRIPTION_STATUS.SUSPENDED }),
    planDistribution: planDistribution.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {}),
    mrr: mrr[0]?.total || 0,
    recentSignups,
  };
}

async function getRevenueAnalytics(query) {
  const { startDate, endDate } = query;
  const match = { status: SUBSCRIPTION_STATUS.ACTIVE };

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Monthly revenue trend
  const revenueTrend = await Subscription.aggregate([
    { $match: match },
    { $unwind: '$invoiceHistory' },
    {
      $match: {
        'invoiceHistory.paidAt': { $gte: start, $lte: end },
        'invoiceHistory.status': 'paid',
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$invoiceHistory.paidAt' },
          month: { $month: '$invoiceHistory.paidAt' },
        },
        revenue: { $sum: '$invoiceHistory.amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Churn (cancelled in period)
  const churned = await Subscription.countDocuments({
    status: SUBSCRIPTION_STATUS.CANCELLED,
    cancelledAt: { $gte: start, $lte: end },
  });

  // New subscriptions in period
  const newSubs = await Subscription.countDocuments({
    createdAt: { $gte: start, $lte: end },
  });

  return { revenueTrend, churned, newSubscriptions: newSubs, period: { start, end } };
}

// ─── Subscription Lifecycle ─────────────────────────────

async function getSubscriptionsByStatus(status, query) {
  const { skip, limit, page, sort } = parsePagination(query);
  const filter = {};
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Subscription.find(filter).populate('clinic', 'name slug email').sort(sort).skip(skip).limit(limit),
    Subscription.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getExpiringTrials(daysAhead = 7) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return Subscription.find({
    status: SUBSCRIPTION_STATUS.TRIAL,
    trialEnd: { $gte: now, $lte: cutoff },
  }).populate('clinic', 'name slug email');
}

async function extendTrial(subscriptionId, additionalDays) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw ApiError.notFound('Subscription not found');
  if (sub.status !== SUBSCRIPTION_STATUS.TRIAL) {
    throw ApiError.badRequest('Can only extend trials');
  }

  const newEnd = new Date(sub.trialEnd.getTime() + additionalDays * 24 * 60 * 60 * 1000);
  sub.trialEnd = newEnd;
  sub.currentPeriodEnd = newEnd;
  await sub.save();

  await Clinic.findByIdAndUpdate(sub.clinic, {
    'subscription.trialEndsAt': newEnd,
  });

  return sub;
}

// ─── Platform User Management ───────────────────────────

async function listPlatformUsers() {
  return PlatformUser.find({}).sort({ createdAt: -1 });
}

async function createPlatformUser(data) {
  const existing = await PlatformUser.findOne({ email: data.email });
  if (existing) throw ApiError.conflict('Email already registered');
  return PlatformUser.create(data);
}

module.exports = {
  // Tenants
  listTenants,
  getTenantBySlug,
  updateTenant,
  toggleTenantStatus,
  updateTenantFeatures,
  // Plans
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  createCustomPlan,
  comparePlans,
  // Dashboard
  getDashboardStats,
  getRevenueAnalytics,
  // Subscriptions
  getSubscriptionsByStatus,
  getExpiringTrials,
  extendTrial,
  // Platform Users
  listPlatformUsers,
  createPlatformUser,
};
