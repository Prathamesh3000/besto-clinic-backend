'use strict';

/**
 * Analytics Controller — deep-dive revenue and subscription analytics.
 */

const analyticsService = require('../../services/analytics.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.getMrrBreakdown = async (_req, res) => {
  const data = await analyticsService.getMrrBreakdown();
  res.json(ApiResponse.success('MRR breakdown retrieved', data));
};

exports.getActiveSubscriptions = async (_req, res) => {
  const data = await analyticsService.getActiveSubscriptionAnalytics();
  res.json(ApiResponse.success('Active subscription analytics retrieved', data));
};

exports.getExpiringSubscriptions = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
  const data = await analyticsService.getExpiringSubscriptions(days);
  res.json(ApiResponse.success('Expiring subscriptions retrieved', data));
};

exports.getSuspendedTenants = async (_req, res) => {
  const data = await analyticsService.getSuspendedTenantReport();
  res.json(ApiResponse.success('Suspended tenant report retrieved', data));
};

exports.getPlanDistribution = async (_req, res) => {
  const data = await analyticsService.getPlanDistributionAnalytics();
  res.json(ApiResponse.success('Plan distribution analytics retrieved', data));
};

exports.getPromotionImpact = async (req, res) => {
  const data = await analyticsService.getPromotionImpactReport(req.query);
  res.json(ApiResponse.success('Promotion impact report retrieved', data));
};

exports.getTenantGrowth = async (req, res) => {
  const data = await analyticsService.getTenantGrowth(req.query);
  res.json(ApiResponse.success('Tenant growth analytics retrieved', data));
};

exports.getFeatureAdoption = async (_req, res) => {
  const data = await analyticsService.getFeatureAdoption();
  res.json(ApiResponse.success('Feature adoption analytics retrieved', data));
};

exports.getChurnAnalytics = async (req, res) => {
  const data = await analyticsService.getChurnAnalytics(req.query);
  res.json(ApiResponse.success('Churn analytics retrieved', data));
};
