'use strict';

const subscriptionService = require('./subscription.service');
const { verifyWebhookSignature } = require('../../services/payment.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

exports.getCurrent = async (req, res) => {
  const subscription = await subscriptionService.getCurrentSubscription(req.tenantSlug);
  res.json(ApiResponse.success('Subscription retrieved', subscription));
};

exports.create = async (req, res) => {
  const subscription = await subscriptionService.createSubscription(req.tenantSlug, req.body);
  res.status(201).json(ApiResponse.created('Subscription created', subscription));
};

exports.changePlan = async (req, res) => {
  const subscription = await subscriptionService.changePlan(req.tenantSlug, req.body);
  res.json(ApiResponse.success('Subscription plan updated', subscription));
};

exports.cancel = async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.tenantSlug, req.body.cancelReason);
  res.json(ApiResponse.success('Subscription cancelled', subscription));
};

exports.webhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  // In production, signature is mandatory (also enforced by route middleware).
  // In development, skip verification to allow testing with tools like Postman.
  if (signature) {
    verifyWebhookSignature(req.rawBody || req.body, signature);
  } else if (process.env.NODE_ENV === 'production') {
    throw ApiError.unauthorized('Missing webhook signature');
  }

  logger.info('Webhook verified: %s', req.body.event);
  const { event, payload } = req.body;
  await subscriptionService.handleWebhook(event, payload);
  res.json(ApiResponse.success('Webhook processed'));
};
