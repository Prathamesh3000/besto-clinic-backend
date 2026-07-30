'use strict';

const JobPosting = require('../../models/platform/JobPosting');
const JobApplication = require('../../models/platform/JobApplication');
const CreditWallet = require('../../models/platform/CreditWallet');
const CreditTransaction = require('../../models/platform/CreditTransaction');
const Clinic = require('../../models/platform/Clinic');
const creditService = require('../../services/credit.service');
const { invalidateClinicFeatureCache } = require('../../middleware/featureGuard');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');

/**
 * List all job postings across the platform.
 */
exports.listAllJobs = async (req, res) => {
  const { skip, limit, page } = parsePagination(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.clinicId) filter.clinic = req.query.clinicId;

  const [items, total] = await Promise.all([
    JobPosting.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    JobPosting.countDocuments(filter),
  ]);

  res.json(ApiResponse.paginated('Job postings retrieved', items, { page, limit, total }));
};

/**
 * Platform-level job portal analytics.
 */
exports.getJobAnalytics = async (_req, res) => {
  const [
    totalPostings,
    activePostings,
    totalApplications,
    hiredCount,
    clinicsWithJobs,
  ] = await Promise.all([
    JobPosting.countDocuments(),
    JobPosting.countDocuments({ status: 'active' }),
    JobApplication.countDocuments(),
    JobApplication.countDocuments({ stage: 'hired' }),
    JobPosting.distinct('clinic').then((ids) => ids.length),
  ]);

  res.json(ApiResponse.success('Job analytics retrieved', {
    totalPostings,
    activePostings,
    totalApplications,
    hiredCount,
    conversionRate: totalApplications > 0
      ? ((hiredCount / totalApplications) * 100).toFixed(1)
      : '0.0',
    clinicsWithJobs,
  }));
};

/**
 * Credit system overview.
 */
exports.getCreditOverview = async (_req, res) => {
  const [wallets, totalTransactions] = await Promise.all([
    CreditWallet.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalPurchased: { $sum: '$totalPurchased' },
          totalConsumed: { $sum: '$totalConsumed' },
          walletCount: { $sum: 1 },
        },
      },
    ]),
    CreditTransaction.countDocuments(),
  ]);

  const stats = wallets[0] || {
    totalBalance: 0, totalPurchased: 0, totalConsumed: 0, walletCount: 0,
  };

  res.json(ApiResponse.success('Credit overview retrieved', {
    ...stats,
    totalTransactions,
  }));
};

/**
 * Admin adjustment of a clinic's credits.
 */
exports.adjustClinicCredits = async (req, res) => {
  const { clinicSlug } = req.params;
  const { amount, description } = req.body;

  if (!amount || amount === 0) throw ApiError.badRequest('Amount must be a non-zero number');

  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const transaction = await creditService.adminAdjustCredits(
    clinic._id,
    amount,
    req.user.userId || 'platform_admin',
    description,
  );

  res.json(ApiResponse.success('Credits adjusted', transaction));
};

// ─── Per-Tenant Job Portal Management ─────────────────────

/**
 * Get job portal status for a specific clinic.
 * Returns: enabled flag, wallet balance, recent transactions, job counts.
 */
exports.getClinicJobPortalStatus = async (req, res) => {
  const clinic = await Clinic.findOne({ slug: req.params.slug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const wallet = await CreditWallet.findOne({ clinic: clinic._id }).lean();

  const [jobCounts, recentTransactions] = await Promise.all([
    JobPosting.aggregate([
      { $match: { clinic: clinic._id, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    wallet
      ? CreditTransaction.find({ clinic: clinic._id })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
      : Promise.resolve([]),
  ]);

  const jobCountMap = {};
  for (const jc of jobCounts) jobCountMap[jc._id] = jc.count;

  const applicationCount = await JobApplication.countDocuments({ clinic: clinic._id });

  res.json(ApiResponse.success('Clinic job portal status', {
    enabled: !!clinic.features?.jobPortalEnabled,
    wallet: wallet ? {
      balance: wallet.balance,
      totalPurchased: wallet.totalPurchased,
      totalConsumed: wallet.totalConsumed,
      lastTopUpAt: wallet.lastTopUpAt,
    } : null,
    jobs: {
      active: jobCountMap.active || 0,
      draft: jobCountMap.draft || 0,
      closed: jobCountMap.closed || 0,
      filled: jobCountMap.filled || 0,
    },
    applications: applicationCount,
    transactions: recentTransactions,
  }));
};

/**
 * Enable job portal for a clinic — sets feature flag + auto-provisions wallet.
 */
exports.enableJobPortal = async (req, res) => {
  const { initialCredits } = req.body;

  const clinic = await Clinic.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: { 'features.jobPortalEnabled': true } },
    { new: true },
  );
  if (!clinic) throw ApiError.notFound('Clinic not found');

  // Invalidate feature cache so routes allow access immediately
  await invalidateClinicFeatureCache(req.params.slug, 'jobPortalEnabled');

  // Auto-provision wallet
  const wallet = await creditService.getOrCreateWallet(clinic._id);

  // Grant initial credits if specified
  let transaction = null;
  if (initialCredits && initialCredits > 0) {
    transaction = await creditService.addCredits(
      clinic._id,
      initialCredits,
      'plan_grant',
      'plan_monthly_grant',
      { },
      req.user.userId || 'platform_admin',
      `Job portal enabled — initial grant of ${initialCredits} credits`,
    );
  }

  res.json(ApiResponse.success('Job portal enabled', {
    enabled: true,
    wallet: { balance: transaction ? transaction.balanceAfter : wallet.balance },
    initialCreditsGranted: initialCredits || 0,
  }));
};

/**
 * Disable job portal for a clinic.
 */
exports.disableJobPortal = async (req, res) => {
  const clinic = await Clinic.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: { 'features.jobPortalEnabled': false } },
    { new: true },
  );
  if (!clinic) throw ApiError.notFound('Clinic not found');

  // Invalidate feature cache so routes block access immediately
  await invalidateClinicFeatureCache(req.params.slug, 'jobPortalEnabled');

  res.json(ApiResponse.success('Job portal disabled', { enabled: false }));
};

/**
 * Grant credits to a specific clinic (always positive — platform admin action).
 */
exports.grantClinicCredits = async (req, res) => {
  const { amount, description } = req.body;

  if (!amount || amount <= 0) throw ApiError.badRequest('Amount must be a positive number');

  const clinic = await Clinic.findOne({ slug: req.params.slug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const transaction = await creditService.adminAdjustCredits(
    clinic._id,
    amount,
    req.user.userId || 'platform_admin',
    description || `Platform admin granted ${amount} credits`,
  );

  res.json(ApiResponse.success('Credits granted', {
    creditsGranted: amount,
    newBalance: transaction.balanceAfter,
    transaction,
  }));
};

/**
 * List all clinic wallets with balances (for platform-wide credit overview).
 */
exports.listClinicWallets = async (req, res) => {
  const { skip, limit, page } = parsePagination(req.query);

  const [wallets, total] = await Promise.all([
    CreditWallet.find()
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CreditWallet.countDocuments(),
  ]);

  // Enrich with clinic names
  const clinicIds = wallets.map((w) => w.clinic);
  const clinics = await Clinic.find({ _id: { $in: clinicIds } })
    .select('name slug features.jobPortalEnabled')
    .lean();
  const clinicMap = {};
  for (const c of clinics) clinicMap[c._id.toString()] = c;

  const enriched = wallets.map((w) => {
    const c = clinicMap[w.clinic.toString()] || {};
    return {
      ...w,
      clinicName: c.name || 'Unknown',
      clinicSlug: c.slug || '',
      jobPortalEnabled: !!c.features?.jobPortalEnabled,
    };
  });

  res.json(ApiResponse.paginated('Clinic wallets', enriched, { page, limit, total }));
};
