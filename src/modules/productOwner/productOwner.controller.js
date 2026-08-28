'use strict';

const service = require('./productOwner.service');
const pricingService = require('../../services/pricing.service');
const promotionService = require('../../services/promotion.service');
const ApiResponse = require('../../utils/ApiResponse');

// ─── Tenant Management ──────────────────────────────────

exports.listTenants = async (req, res) => {
  const { items, total, page, limit } = await service.listTenants(req.query);
  res.json(ApiResponse.paginated('Tenants retrieved', items, { page, limit, total }));
};

exports.getTenant = async (req, res) => {
  const tenant = await service.getTenantBySlug(req.params.slug);
  res.json(ApiResponse.success('Tenant retrieved', tenant));
};

exports.updateTenant = async (req, res) => {
  const tenant = await service.updateTenant(req.params.slug, req.body);
  res.json(ApiResponse.success('Tenant updated', tenant));
};

exports.toggleTenantStatus = async (req, res) => {
  const tenant = await service.toggleTenantStatus(req.params.slug, req.body.isActive);
  res.json(ApiResponse.success(`Tenant ${req.body.isActive ? 'activated' : 'deactivated'}`, tenant));
};

exports.updateTenantFeatures = async (req, res) => {
  const tenant = await service.updateTenantFeatures(req.params.slug, req.body.features);
  res.json(ApiResponse.success('Tenant features updated', tenant));
};

// ─── Plan Management ────────────────────────────────────

exports.listPlans = async (req, res) => {
  const { items, total, page, limit } = await service.listPlans(req.query);
  res.json(ApiResponse.paginated('Plans retrieved', items, { page, limit, total }));
};

exports.getPlan = async (req, res) => {
  const plan = await service.getPlanById(req.params.id);
  res.json(ApiResponse.success('Plan retrieved', plan));
};

exports.createPlan = async (req, res) => {
  const plan = await service.createPlan(req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Plan created', plan));
};

exports.updatePlan = async (req, res) => {
  const plan = await service.updatePlan(req.params.id, req.body);
  res.json(ApiResponse.success('Plan updated', plan));
};

exports.deletePlan = async (req, res) => {
  await service.deletePlan(req.params.id);
  res.json(ApiResponse.deleted('Plan deactivated'));
};

exports.createCustomPlan = async (req, res) => {
  const plan = await service.createCustomPlan(req.params.slug, req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Custom plan created', plan));
};

// ─── Pricing ────────────────────────────────────────────

exports.calculatePrice = async (req, res) => {
  const result = await pricingService.calculatePrice(req.body);
  res.json(ApiResponse.success('Price calculated', result));
};

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
  const result = await promotionService.validatePromoCode(req.body.code, req.body.planId, req.body.billingCycle);
  res.json(ApiResponse.success('Promotion code validated', result));
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

// ─── Feature Flags ──────────────────────────────────────

exports.listFeatureFlags = async (req, res) => {
  const FeatureFlag = require('../../models/platform/FeatureFlag');
  const flags = await FeatureFlag.find({}).sort({ category: 1, key: 1 });
  res.json(ApiResponse.success('Feature flags retrieved', flags));
};

exports.createFeatureFlag = async (req, res) => {
  const FeatureFlag = require('../../models/platform/FeatureFlag');
  const flag = await FeatureFlag.create({ ...req.body, createdBy: req.user.userId });
  res.status(201).json(ApiResponse.created('Feature flag created', flag));
};

exports.updateFeatureFlag = async (req, res) => {
  const FeatureFlag = require('../../models/platform/FeatureFlag');
  const flag = await FeatureFlag.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!flag) return res.status(404).json({ success: false, message: 'Feature flag not found' });
  res.json(ApiResponse.success('Feature flag updated', flag));
};

exports.setTenantOverride = async (req, res) => {
  const FeatureFlag = require('../../models/platform/FeatureFlag');
  const { flagId, clinicSlug, value } = req.body;
  const flag = await FeatureFlag.findById(flagId);
  if (!flag) return res.status(404).json({ success: false, message: 'Feature flag not found' });

  flag.tenantOverrides.set(clinicSlug, value);
  await flag.save();
  res.json(ApiResponse.success('Tenant override set', flag));
};

// ─── Dashboard / Analytics ──────────────────────────────

exports.getDashboard = async (_req, res) => {
  const stats = await service.getDashboardStats();
  res.json(ApiResponse.success('Dashboard data retrieved', stats));
};

exports.getRevenueAnalytics = async (req, res) => {
  const data = await service.getRevenueAnalytics(req.query);
  res.json(ApiResponse.success('Revenue analytics retrieved', data));
};

// ─── Subscription Lifecycle ─────────────────────────────

exports.listSubscriptions = async (req, res) => {
  const { items, total, page, limit } = await service.getSubscriptionsByStatus(
    req.query.status,
    req.query,
  );
  res.json(ApiResponse.paginated('Subscriptions retrieved', items, { page, limit, total }));
};

exports.getExpiringTrials = async (req, res) => {
  const days = parseInt(req.query.days, 10) || 7;
  const trials = await service.getExpiringTrials(days);
  res.json(ApiResponse.success('Expiring trials retrieved', trials));
};

exports.extendTrial = async (req, res) => {
  const sub = await service.extendTrial(req.params.id, req.body.additionalDays);
  res.json(ApiResponse.success('Trial extended', sub));
};

// ─── Platform Users ─────────────────────────────────────

exports.listPlatformUsers = async (_req, res) => {
  const users = await service.listPlatformUsers();
  res.json(ApiResponse.success('Platform users retrieved', users));
};

exports.createPlatformUser = async (req, res) => {
  const user = await service.createPlatformUser(req.body);
  res.status(201).json(ApiResponse.created('Platform user created', user));
};
