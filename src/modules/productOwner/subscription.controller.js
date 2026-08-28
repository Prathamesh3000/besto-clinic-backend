'use strict';

/**
 * Subscription Controller — handles subscription lifecycle, plan changes,
 * trial management, and reactivation.
 */

const service = require('./productOwner.service');
const subscriptionService = require('../subscription/subscription.service');
const ApiResponse = require('../../utils/ApiResponse');

// ─── Listing & Queries ──────────────────────────────────

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

// ─── Subscription Actions ───────────────────────────────

exports.createSubscription = async (req, res) => {
  const subscription = await subscriptionService.createSubscription(req.params.slug, req.body);
  res.status(201).json(ApiResponse.created('Subscription created', subscription));
};

exports.changePlan = async (req, res) => {
  const result = await subscriptionService.changePlan(req.params.slug, req.body);
  res.json(ApiResponse.success(`Plan ${result.direction} successful`, result));
};

exports.activateSubscription = async (req, res) => {
  const subscription = await subscriptionService.activateSubscription(req.params.slug, 'admin');
  res.json(ApiResponse.success('Subscription activated', subscription));
};

exports.setCustomPricing = async (req, res) => {
  const subscription = await subscriptionService.setCustomPricing(
    req.params.slug,
    req.body,
    req.user.userId,
  );
  res.json(ApiResponse.success('Custom pricing updated', subscription));
};

exports.cancelScheduledChange = async (req, res) => {
  const subscription = await subscriptionService.cancelScheduledChange(req.params.slug);
  res.json(ApiResponse.success('Scheduled change cancelled', subscription));
};

exports.cancelSubscription = async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(
    req.params.slug,
    req.body.reason,
    'admin',
  );
  res.json(ApiResponse.success('Subscription cancelled', subscription));
};

exports.reactivateSubscription = async (req, res) => {
  const subscription = await subscriptionService.reactivateSubscription(req.params.slug, 'admin');
  res.json(ApiResponse.success('Subscription reactivated', subscription));
};

exports.extendTrial = async (req, res) => {
  const sub = await service.extendTrial(req.params.id, req.body.additionalDays);
  res.json(ApiResponse.success('Trial extended', sub));
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

// ─── Platform Users ─────────────────────────────────────

exports.listPlatformUsers = async (_req, res) => {
  const users = await service.listPlatformUsers();
  res.json(ApiResponse.success('Platform users retrieved', users));
};

exports.createPlatformUser = async (req, res) => {
  const user = await service.createPlatformUser(req.body);
  res.status(201).json(ApiResponse.created('Platform user created', user));
};
