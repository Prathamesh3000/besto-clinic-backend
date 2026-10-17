'use strict';

/**
 * Product Owner platform routes — all require platformAuthenticate().
 *
 * Mounted at: /api/v1/platform
 *
 * Uses separate controllers for clean separation of concerns:
 *  - tenantCtrl:     tenant CRUD, feature overrides
 *  - planCtrl:       plan CRUD, custom plans, pricing calculator
 *  - subCtrl:        subscription lifecycle, analytics, platform users
 *  - promoCtrl:      promotions, rebates, feature flags
 *  - analyticsCtrl:  deep-dive revenue & subscription analytics
 */

const express = require('express');
const router = express.Router();
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { platformAuthenticate } = require('../../middleware/authenticate');
const v = require('./productOwner.validator');

// Controllers
const tenantCtrl = require('./tenant.controller');
const planCtrl = require('./plan.controller');
const subCtrl = require('./subscription.controller');
const promoCtrl = require('./promotion.controller');
const analyticsCtrl = require('./analytics.controller');
const dentalScanCtrl = require('./dentalScanAnalytics.controller');

// Every route on this router requires product_owner authentication
router.use(platformAuthenticate());

// ─── Dashboard / Analytics ──────────────────────────────
router.get('/dashboard', asyncHandler(subCtrl.getDashboard));
router.get('/analytics/revenue', asyncHandler(subCtrl.getRevenueAnalytics));
router.get('/analytics/mrr', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getMrrBreakdown));
router.get('/analytics/subscriptions', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getActiveSubscriptions));
router.get('/analytics/expiring', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getExpiringSubscriptions));
router.get('/analytics/suspended', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getSuspendedTenants));
router.get('/analytics/plans', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getPlanDistribution));
router.get('/analytics/promotion-impact', validate(v.analyticsQuerySchema, { source: 'query' }), asyncHandler(analyticsCtrl.getPromotionImpact));
router.get('/analytics/tenant-growth', asyncHandler(analyticsCtrl.getTenantGrowth));
router.get('/analytics/feature-adoption', asyncHandler(analyticsCtrl.getFeatureAdoption));
router.get('/analytics/churn', asyncHandler(analyticsCtrl.getChurnAnalytics));
router.get('/analytics/dental-scans', asyncHandler(dentalScanCtrl.getDentalScanAnalytics));
router.get('/analytics/dental-scans/recent', asyncHandler(dentalScanCtrl.getRecentScans));

// ─── Tenant Management ──────────────────────────────────
router.post('/tenants', validate(v.createTenantSchema), asyncHandler(tenantCtrl.createTenant));
router.get('/tenants', asyncHandler(tenantCtrl.listTenants));
router.get('/tenants/:slug', asyncHandler(tenantCtrl.getTenant));
router.put('/tenants/:slug', validate(v.updateTenantSchema), asyncHandler(tenantCtrl.updateTenant));
router.put('/tenants/:slug/features', validate(v.updateFeaturesSchema), asyncHandler(tenantCtrl.updateTenantFeatures));

// ─── Tenant Lifecycle ───────────────────────────────────
router.post('/tenants/:slug/superadmin', validate(v.assignSuperAdminSchema), asyncHandler(tenantCtrl.assignSuperAdmin));
router.post('/tenants/:slug/activate', asyncHandler(tenantCtrl.activateTenant));
router.post('/tenants/:slug/suspend', validate(v.suspendTenantSchema), asyncHandler(tenantCtrl.suspendTenant));
router.delete('/tenants/:slug', validate(v.deleteTenantSchema), asyncHandler(tenantCtrl.deleteTenant));

// ─── Tenant Logo ────────────────────────────────────────
router.post('/tenants/:slug/logo', express.json({ limit: '5mb' }), validate(v.uploadLogoSchema), asyncHandler(tenantCtrl.uploadLogo));

// ─── Tenant Usage & Expiry ──────────────────────────────
router.get('/tenants/:slug/usage', asyncHandler(tenantCtrl.getTenantUsage));
router.get('/tenants/:slug/subscription-expiry', asyncHandler(tenantCtrl.getSubscriptionExpiry));
router.put('/tenants/:slug/usage', validate(v.syncUsageSchema), asyncHandler(tenantCtrl.syncTenantUsage));
router.get('/tenants/:slug/audit-log', asyncHandler(tenantCtrl.getTenantAuditLog));

// ─── Tenant Subscription Actions ────────────────────────
router.post('/tenants/:slug/subscription', validate(v.createSubscriptionSchema), asyncHandler(subCtrl.createSubscription));
router.put('/tenants/:slug/subscription/plan', validate(v.changePlanSchema), asyncHandler(subCtrl.changePlan));
router.post('/tenants/:slug/subscription/cancel', validate(v.cancelSubscriptionSchema), asyncHandler(subCtrl.cancelSubscription));
router.post('/tenants/:slug/subscription/reactivate', asyncHandler(subCtrl.reactivateSubscription));
router.post('/tenants/:slug/subscription/activate', asyncHandler(subCtrl.activateSubscription));
router.put('/tenants/:slug/subscription/custom-pricing', validate(v.setCustomPricingSchema), asyncHandler(subCtrl.setCustomPricing));
router.delete('/tenants/:slug/subscription/scheduled-change', asyncHandler(subCtrl.cancelScheduledChange));
router.post('/tenants/:slug/custom-plan', validate(v.createPlanSchema), asyncHandler(planCtrl.createCustomPlan));

// ─── Plan Management ────────────────────────────────────
router.get('/plans', asyncHandler(planCtrl.listPlans));
router.get('/plans/:id', asyncHandler(planCtrl.getPlan));
router.post('/plans', validate(v.createPlanSchema), asyncHandler(planCtrl.createPlan));
router.put('/plans/:id', validate(v.updatePlanSchema), asyncHandler(planCtrl.updatePlan));
router.delete('/plans/:id', asyncHandler(planCtrl.deletePlan));

// ─── Plan Comparison ───────────────────────────────────
router.post('/plans/compare', validate(v.comparePlansSchema), asyncHandler(planCtrl.comparePlans));

// ─── Pricing ────────────────────────────────────────────
router.post('/pricing/calculate', validate(v.calculatePriceSchema), asyncHandler(planCtrl.calculatePrice));
router.post('/pricing/proration/:subscriptionId', validate(v.calculateProrationSchema), asyncHandler(planCtrl.calculateProration));

// ─── Promotions ─────────────────────────────────────────
router.get('/promotions', asyncHandler(promoCtrl.listPromotions));
router.get('/promotions/analytics', asyncHandler(promoCtrl.getPromotionAnalytics));
router.get('/promotions/:id', asyncHandler(promoCtrl.getPromotion));
router.post('/promotions', validate(v.createPromotionSchema), asyncHandler(promoCtrl.createPromotion));
router.put('/promotions/:id', validate(v.updatePromotionSchema), asyncHandler(promoCtrl.updatePromotion));
router.delete('/promotions/:id', asyncHandler(promoCtrl.deletePromotion));
router.post('/promotions/validate', validate(v.validatePromoCodeSchema), asyncHandler(promoCtrl.validatePromoCode));

// ─── Rebates ────────────────────────────────────────────
router.get('/rebates', asyncHandler(promoCtrl.listRebates));
router.get('/rebates/:id', asyncHandler(promoCtrl.getRebate));
router.post('/rebates', validate(v.createRebateSchema), asyncHandler(promoCtrl.createRebate));
router.put('/rebates/:id', validate(v.updateRebateSchema), asyncHandler(promoCtrl.updateRebate));
router.delete('/rebates/:id', asyncHandler(promoCtrl.deleteRebate));

// ─── Referrals ─────────────────────────────────────────
router.post('/tenants/:slug/referral-code', asyncHandler(promoCtrl.generateReferralCode));
router.post('/referrals/lookup', validate(v.lookupReferralCodeSchema), asyncHandler(promoCtrl.lookupReferralCode));
router.post('/tenants/:slug/apply-referral', validate(v.applyReferralCodeSchema), asyncHandler(promoCtrl.applyReferralCode));

// ─── Feature Flags ──────────────────────────────────────
router.get('/feature-flags', asyncHandler(promoCtrl.listFeatureFlags));
router.post('/feature-flags', validate(v.createFeatureFlagSchema), asyncHandler(promoCtrl.createFeatureFlag));
router.put('/feature-flags/:id', validate(v.updateFeatureFlagSchema), asyncHandler(promoCtrl.updateFeatureFlag));
router.delete('/feature-flags/:id', asyncHandler(promoCtrl.deleteFeatureFlag));
router.get('/feature-flags/resolve/:slug', asyncHandler(promoCtrl.resolveFlags));
router.get('/feature-flags/resolve/:slug/:flagKey', asyncHandler(promoCtrl.resolveSingleFlag));
router.post('/feature-flags/tenant-override', validate(v.tenantOverrideSchema), asyncHandler(promoCtrl.setTenantOverride));
router.post('/feature-flags/tenant-override/remove', validate(v.removeTenantOverrideSchema), asyncHandler(promoCtrl.removeTenantOverride));

// ─── Provisioning Status ────────────────────────────
router.get('/tenants/:slug/provisioning', asyncHandler(tenantCtrl.getProvisioningStatus));
router.post('/tenants/:slug/provisioning/retry', asyncHandler(tenantCtrl.retryProvisioning));
router.post('/tenants/:slug/provisioning/rollback', asyncHandler(tenantCtrl.rollbackProvisioning));

// ─── Subscription Lifecycle ─────────────────────────────
router.get('/subscriptions', asyncHandler(subCtrl.listSubscriptions));
router.get('/subscriptions/expiring-trials', asyncHandler(subCtrl.getExpiringTrials));
router.post('/subscriptions/:id/extend-trial', validate(v.extendTrialSchema), asyncHandler(subCtrl.extendTrial));

// ─── Platform Users ─────────────────────────────────────
router.get('/users', asyncHandler(subCtrl.listPlatformUsers));
router.post('/users', validate(v.createPlatformUserSchema), asyncHandler(subCtrl.createPlatformUser));
router.put('/users/me', validate(v.updateMyPlatformProfileSchema), asyncHandler(subCtrl.updateMyPlatformProfile));

// ─── Job Portal Admin ───────────────────────────────────
const jobPortalAdminCtrl = require('./jobPortalAdmin.controller');
router.get('/jobs', asyncHandler(jobPortalAdminCtrl.listAllJobs));
router.get('/jobs/analytics', asyncHandler(jobPortalAdminCtrl.getJobAnalytics));
router.get('/credits/overview', asyncHandler(jobPortalAdminCtrl.getCreditOverview));
router.get('/credits/wallets', asyncHandler(jobPortalAdminCtrl.listClinicWallets));
router.post('/credits/:clinicSlug/adjust', asyncHandler(jobPortalAdminCtrl.adjustClinicCredits));

// Per-tenant job portal management
router.get('/tenants/:slug/job-portal', asyncHandler(jobPortalAdminCtrl.getClinicJobPortalStatus));
router.post('/tenants/:slug/job-portal/enable', asyncHandler(jobPortalAdminCtrl.enableJobPortal));
router.post('/tenants/:slug/job-portal/disable', asyncHandler(jobPortalAdminCtrl.disableJobPortal));
router.post('/tenants/:slug/job-portal/credits', asyncHandler(jobPortalAdminCtrl.grantClinicCredits));

module.exports = router;
