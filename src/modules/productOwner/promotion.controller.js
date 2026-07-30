'use strict';

/**
 * Promotion Controller — handles promotions, rebates, and feature flags.
 */

const promotionService = require('../../services/promotion.service');
const featureFlagService = require('../../services/featureFlag.service');
const FeatureFlag = require('../../models/platform/FeatureFlag');
const ApiResponse = require('../../utils/ApiResponse');

// ─── Promotions ─────────────────────────────────────────

exports.listPromotions = async (req, res) => {
  const { items, total, page, limit } = await promotionService.listPromotions(req.query);
  res.json(ApiResponse.paginated('Promotions retrieved', items, { page, limit, total }));
};

exports.getPromotion = async (req, res) => {
  const promo = await promotionService.getPromotionById(req.params.id);
  res.json(ApiResponse.success('Promotion retrieved', promo));
};

exports.createPromotion = async (req, res) => {
  const promo = await promotionService.createPromotion(req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Promotion created', promo));
};

exports.updatePromotion = async (req, res) => {
  const promo = await promotionService.updatePromotion(req.params.id, req.body);
  res.json(ApiResponse.success('Promotion updated', promo));
};

exports.deletePromotion = async (req, res) => {
  await promotionService.deletePromotion(req.params.id);
  res.json(ApiResponse.deleted('Promotion deactivated'));
};

exports.validatePromoCode = async (req, res) => {
  const result = await promotionService.validatePromoCode(req.body.code, req.body.planId, req.body.billingCycle, req.body.clinicSlug);
  res.json(ApiResponse.success('Promotion code validated', result));
};

exports.getPromotionAnalytics = async (req, res) => {
  const analytics = await promotionService.getPromotionAnalytics(req.query.promoId);
  res.json(ApiResponse.success('Promotion analytics retrieved', analytics));
};

// ─── Rebates ────────────────────────────────────────────

exports.listRebates = async (req, res) => {
  const { items, total, page, limit } = await promotionService.listRebates(req.query);
  res.json(ApiResponse.paginated('Rebates retrieved', items, { page, limit, total }));
};

exports.createRebate = async (req, res) => {
  const rebate = await promotionService.createRebate(req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Rebate created', rebate));
};

exports.updateRebate = async (req, res) => {
  const rebate = await promotionService.updateRebate(req.params.id, req.body);
  res.json(ApiResponse.success('Rebate updated', rebate));
};

exports.deleteRebate = async (req, res) => {
  await promotionService.deleteRebate(req.params.id);
  res.json(ApiResponse.deleted('Rebate deactivated'));
};

exports.getRebate = async (req, res) => {
  const rebate = await promotionService.getRebateById(req.params.id);
  res.json(ApiResponse.success('Rebate retrieved', rebate));
};

// ─── Referrals ─────────────────────────────────────────

exports.generateReferralCode = async (req, res) => {
  const result = await promotionService.generateReferralCode(req.params.slug);
  res.json(ApiResponse.success('Referral code generated', result));
};

exports.lookupReferralCode = async (req, res) => {
  const result = await promotionService.lookupReferralCode(req.body.referralCode);
  res.json(ApiResponse.success('Referral code found', result));
};

exports.applyReferralCode = async (req, res) => {
  const result = await promotionService.applyReferralCode(req.params.slug, req.body.referralCode);
  res.json(ApiResponse.success('Referral code applied', result));
};

// ─── Feature Flags ──────────────────────────────────────

exports.listFeatureFlags = async (_req, res) => {
  const flags = await FeatureFlag.find({}).sort({ category: 1, key: 1 });
  res.json(ApiResponse.success('Feature flags retrieved', flags));
};

exports.createFeatureFlag = async (req, res) => {
  const flag = await FeatureFlag.create({ ...req.body, createdBy: req.user.userId });
  res.status(201).json(ApiResponse.created('Feature flag created', flag));
};

exports.updateFeatureFlag = async (req, res) => {
  const flag = await FeatureFlag.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!flag) {
    return res.status(404).json(ApiResponse.success('Feature flag not found', null));
  }
  res.json(ApiResponse.success('Feature flag updated', flag));
};

exports.deleteFeatureFlag = async (req, res) => {
  const flag = await FeatureFlag.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!flag) {
    return res.status(404).json(ApiResponse.success('Feature flag not found', null));
  }
  res.json(ApiResponse.deleted('Feature flag deactivated'));
};

exports.setTenantOverride = async (req, res) => {
  const { flagId, clinicSlug, value } = req.body;
  const flag = await FeatureFlag.findById(flagId);
  if (!flag) {
    return res.status(404).json(ApiResponse.success('Feature flag not found', null));
  }

  flag.tenantOverrides.set(clinicSlug, value);
  await flag.save();
  await featureFlagService.invalidateCache(clinicSlug);
  res.json(ApiResponse.success('Tenant override set', flag));
};

exports.removeTenantOverride = async (req, res) => {
  const { flagId, clinicSlug } = req.body;
  const flag = await FeatureFlag.findById(flagId);
  if (!flag) {
    return res.status(404).json(ApiResponse.success('Feature flag not found', null));
  }

  flag.tenantOverrides.delete(clinicSlug);
  await flag.save();
  await featureFlagService.invalidateCache(clinicSlug);
  res.json(ApiResponse.success('Tenant override removed', flag));
};

exports.resolveFlags = async (req, res) => {
  const result = await featureFlagService.resolveAllFlags(req.params.slug);
  res.json(ApiResponse.success('Feature flags resolved', result));
};

exports.resolveSingleFlag = async (req, res) => {
  const value = await featureFlagService.resolveFlag(req.params.flagKey, req.params.slug);
  res.json(ApiResponse.success('Feature flag resolved', { key: req.params.flagKey, value }));
};
