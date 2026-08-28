'use strict';

/**
 * Promotion & Rebate service — CRUD + validation engine for discount codes.
 */

const ApiError = require('../utils/ApiError');
const { parsePagination } = require('../utils/pagination');
const Promotion = require('../models/platform/Promotion');
const Rebate = require('../models/platform/Rebate');
const Clinic = require('../models/platform/Clinic');

// ─── Promotions ─────────────────────────────────────────

async function listPromotions(query) {
  const { skip, limit, page, sort } = parsePagination(query);
  const filter = {};

  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { code: { $regex: escaped, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Promotion.find(filter).sort(sort).skip(skip).limit(limit),
    Promotion.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPromotionById(id) {
  const promo = await Promotion.findById(id);
  if (!promo) throw ApiError.notFound('Promotion not found');
  return promo;
}

async function createPromotion(data, userId) {
  const existing = await Promotion.findOne({ code: data.code.toUpperCase() });
  if (existing) throw ApiError.conflict('Promotion code already exists');

  return Promotion.create({ ...data, createdBy: userId });
}

async function updatePromotion(id, data) {
  // Don't allow changing the code after creation
  delete data.code;

  const promo = await Promotion.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!promo) throw ApiError.notFound('Promotion not found');
  return promo;
}

async function deletePromotion(id) {
  const promo = await Promotion.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!promo) throw ApiError.notFound('Promotion not found');
  return promo;
}

/**
 * Validate a promo code without applying it.
 * Returns the promotion details if valid, or throws.
 */
async function validatePromoCode(code, planId, billingCycle, clinicSlug) {
  if (!code) throw ApiError.badRequest('Promo code is required');

  const now = new Date();
  const promo = await Promotion.findOne({
    code: code.toUpperCase(),
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
  });

  if (!promo) throw ApiError.notFound('Invalid or expired promotion code');

  // Check usage limits
  if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) {
    throw ApiError.badRequest('Promotion code has reached its redemption limit');
  }

  // Check plan applicability
  if (planId && promo.applicablePlans.length > 0) {
    if (!promo.applicablePlans.some((p) => p.toString() === planId)) {
      throw ApiError.badRequest('Promotion code is not applicable to this plan');
    }
  }

  // Check billing cycle
  if (billingCycle && promo.applicableBillingCycles.length > 0) {
    if (!promo.applicableBillingCycles.includes(billingCycle)) {
      throw ApiError.badRequest('Promotion code is not applicable to this billing cycle');
    }
  }

  // Check clinic targeting (tenant-specific promotions)
  if (clinicSlug && promo.targetClinics && promo.targetClinics.length > 0) {
    const clinic = await Clinic.findOne({ slug: clinicSlug });
    if (!clinic || !promo.targetClinics.some((c) => c.toString() === clinic._id.toString())) {
      throw ApiError.badRequest('Promotion code is not available for this clinic');
    }
  }

  return {
    code: promo.code,
    name: promo.name,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    durationMonths: promo.durationMonths,
    expiresAt: promo.expiresAt,
    isGlobal: !promo.targetClinics || promo.targetClinics.length === 0,
  };
}

/**
 * Record a promotion redemption for a clinic.
 */
async function redeemPromotion(promoCode, clinicSlug, subscriptionId) {
  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const promo = await Promotion.findOne({ code: promoCode.toUpperCase(), isActive: true });
  if (!promo) throw ApiError.notFound('Promotion not found');

  // Atomic per-clinic limit check + redemption to prevent race conditions
  const updated = await Promotion.findOneAndUpdate(
    {
      _id: promo._id,
      isActive: true,
      $expr: {
        $lt: [
          { $size: { $filter: { input: '$redemptions', as: 'r', cond: { $eq: ['$$r.clinic', clinic._id] } } } },
          promo.maxPerClinic,
        ],
      },
    },
    {
      $push: { redemptions: { clinic: clinic._id, subscriptionId, redeemedAt: new Date() } },
      $inc: { currentRedemptions: 1 },
    },
    { new: true },
  );
  if (!updated) {
    throw ApiError.badRequest('Promotion already redeemed for this clinic');
  }

  return updated;
}

// ─── Rebates ────────────────────────────────────────────

async function listRebates(query) {
  const { skip, limit, page, sort } = parsePagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.type) filter.type = query.type;

  const [items, total] = await Promise.all([
    Rebate.find(filter).sort(sort).skip(skip).limit(limit),
    Rebate.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function createRebate(data, userId) {
  return Rebate.create({ ...data, createdBy: userId });
}

async function updateRebate(id, data) {
  const rebate = await Rebate.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!rebate) throw ApiError.notFound('Rebate not found');
  return rebate;
}

async function deleteRebate(id) {
  const rebate = await Rebate.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!rebate) throw ApiError.notFound('Rebate not found');
  return rebate;
}

async function getRebateById(id) {
  const rebate = await Rebate.findById(id);
  if (!rebate) throw ApiError.notFound('Rebate not found');
  return rebate;
}

// ─── Apply Promotion ───────────────────────────────────

/**
 * Apply a promotion code to a subscription.
 * Validates eligibility, calculates discount, records redemption.
 *
 * @param {object} params
 * @param {string} params.promoCode
 * @param {string} params.clinicSlug
 * @param {string} params.planId — ObjectId string
 * @param {string} params.billingCycle — 'monthly' | 'yearly'
 * @param {number} params.baseAmount — price before promo discount
 * @param {string} [params.subscriptionId]
 * @returns {{ appliedPromotion, discountedAmount, discount }}
 */
async function applyPromotion({ promoCode, clinicSlug, planId, billingCycle, baseAmount, subscriptionId }) {
  if (!promoCode) throw ApiError.badRequest('Promo code is required');

  const now = new Date();
  const promo = await Promotion.findOne({
    code: promoCode.toUpperCase(),
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
  });

  if (!promo) throw ApiError.notFound('Invalid or expired promotion code');

  // Usage limits
  if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) {
    throw ApiError.badRequest('Promotion code has reached its redemption limit');
  }

  // Plan applicability
  if (planId && promo.applicablePlans.length > 0) {
    if (!promo.applicablePlans.some((p) => p.toString() === planId.toString())) {
      throw ApiError.badRequest('Promotion code is not applicable to this plan');
    }
  }

  // Billing cycle
  if (billingCycle && promo.applicableBillingCycles.length > 0) {
    if (!promo.applicableBillingCycles.includes(billingCycle)) {
      throw ApiError.badRequest('Promotion code is not applicable to this billing cycle');
    }
  }

  // Clinic targeting
  const clinic = clinicSlug ? await Clinic.findOne({ slug: clinicSlug }) : null;

  if (clinic && promo.targetClinics && promo.targetClinics.length > 0) {
    if (!promo.targetClinics.some((c) => c.toString() === clinic._id.toString())) {
      throw ApiError.badRequest('Promotion code is not available for this clinic');
    }
  }

  // Calculate discount
  let discount;
  if (promo.discountType === 'percentage') {
    discount = Math.round(baseAmount * Math.min(promo.discountValue, 100) / 100 * 100) / 100;
  } else {
    discount = Math.min(promo.discountValue, baseAmount);
  }
  const discountedAmount = Math.max(0, Math.round((baseAmount - discount) * 100) / 100);

  // Record redemption atomically to prevent race conditions on per-clinic limit
  if (clinic) {
    const updated = await Promotion.findOneAndUpdate(
      {
        _id: promo._id,
        isActive: true,
        // Atomic per-clinic limit check: count existing redemptions for this clinic
        $expr: {
          $lt: [
            { $size: { $filter: { input: '$redemptions', as: 'r', cond: { $eq: ['$$r.clinic', clinic._id] } } } },
            promo.maxPerClinic,
          ],
        },
      },
      {
        $push: { redemptions: { clinic: clinic._id, subscriptionId: subscriptionId || null, redeemedAt: now } },
        $inc: { currentRedemptions: 1 },
      },
      { new: true },
    );
    if (!updated) {
      throw ApiError.badRequest('Promotion already redeemed for this clinic');
    }
  }

  return {
    appliedPromotion: {
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      remainingCycles: promo.durationMonths || 1,
    },
    discountedAmount,
    discount,
  };
}

// ─── Automatic Expiry ──────────────────────────────────

/**
 * Auto-deactivate expired promotions.
 * Called by the subscription lifecycle worker.
 */
async function processPromotionExpiry() {
  const now = new Date();
  const result = await Promotion.updateMany(
    { isActive: true, expiresAt: { $lt: now } },
    { $set: { isActive: false } },
  );
  return { deactivated: result.modifiedCount || 0 };
}

// ─── Referral Code System ──────────────────────────────

/**
 * Generate and assign a referral code to a clinic.
 * Returns existing code if already assigned.
 */
async function generateReferralCode(clinicSlug) {
  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  if (clinic.referralCode) {
    return { referralCode: clinic.referralCode, clinicSlug: clinic.slug };
  }

  const prefix = clinic.slug.replace(/-/g, '').slice(0, 6).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  clinic.referralCode = `REF-${prefix}-${random}`;
  await clinic.save();

  return { referralCode: clinic.referralCode, clinicSlug: clinic.slug };
}

/**
 * Look up a clinic by its referral code.
 */
async function lookupReferralCode(referralCode) {
  if (!referralCode) throw ApiError.badRequest('Referral code is required');

  const clinic = await Clinic.findOne({
    referralCode: referralCode.toUpperCase(),
    isActive: true,
  });
  if (!clinic) throw ApiError.notFound('Invalid referral code');

  return {
    referralCode: clinic.referralCode,
    clinicId: clinic._id,
    clinicName: clinic.name,
    clinicSlug: clinic.slug,
  };
}

/**
 * Apply a referral code — sets referredBy on the target clinic.
 */
async function applyReferralCode(targetClinicSlug, referralCode) {
  const referrer = await Clinic.findOne({
    referralCode: referralCode.toUpperCase(),
    isActive: true,
  });
  if (!referrer) throw ApiError.notFound('Invalid referral code');

  const target = await Clinic.findOne({ slug: targetClinicSlug });
  if (!target) throw ApiError.notFound('Target clinic not found');
  if (target.referredBy) throw ApiError.conflict('Clinic already has a referral source');
  if (referrer._id.toString() === target._id.toString()) {
    throw ApiError.badRequest('A clinic cannot refer itself');
  }

  target.referredBy = referrer._id;
  await target.save();

  return { targetClinic: target.slug, referredBy: referrer.slug };
}

// ─── Promotion Analytics ───────────────────────────────

/**
 * Get aggregate analytics for promotions.
 * If promoId provided, returns detailed stats for a single promo.
 */
async function getPromotionAnalytics(promoId) {
  if (promoId) {
    const promo = await Promotion.findById(promoId).populate('redemptions.clinic', 'name slug');
    if (!promo) throw ApiError.notFound('Promotion not found');

    return {
      code: promo.code,
      name: promo.name,
      isActive: promo.isActive,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      maxRedemptions: promo.maxRedemptions,
      currentRedemptions: promo.currentRedemptions,
      remainingRedemptions: promo.maxRedemptions
        ? promo.maxRedemptions - promo.currentRedemptions
        : null,
      utilizationRate: promo.maxRedemptions
        ? Math.round((promo.currentRedemptions / promo.maxRedemptions) * 100 * 100) / 100
        : null,
      startsAt: promo.startsAt,
      expiresAt: promo.expiresAt,
      isExpired: promo.expiresAt < new Date(),
      targetClinicsCount: promo.targetClinics?.length || 0,
      redemptions: promo.redemptions,
      createdAt: promo.createdAt,
    };
  }

  const [totalPromotions, activePromotions, stats] = await Promise.all([
    Promotion.countDocuments(),
    Promotion.countDocuments({ isActive: true }),
    Promotion.aggregate([
      {
        $project: {
          code: 1,
          name: 1,
          isActive: 1,
          discountType: 1,
          discountValue: 1,
          maxRedemptions: 1,
          currentRedemptions: 1,
          startsAt: 1,
          expiresAt: 1,
          redemptionCount: { $size: '$redemptions' },
          targetClinicsCount: { $size: { $ifNull: ['$targetClinics', []] } },
        },
      },
      { $sort: { currentRedemptions: -1 } },
    ]),
  ]);

  const totalRedemptions = stats.reduce((sum, p) => sum + p.currentRedemptions, 0);

  return { totalPromotions, activePromotions, totalRedemptions, promotionStats: stats };
}

module.exports = {
  // Promotions
  listPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion,
  validatePromoCode,
  redeemPromotion,
  applyPromotion,
  processPromotionExpiry,
  getPromotionAnalytics,
  // Rebates
  listRebates,
  getRebateById,
  createRebate,
  updateRebate,
  deleteRebate,
  // Referrals
  generateReferralCode,
  lookupReferralCode,
  applyReferralCode,
};
