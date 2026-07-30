'use strict';

/**
 * Payment service — Razorpay integration for SaaS subscription billing.
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

let instance = null;

function _getInstance() {
  if (instance) return instance;
  const env = require('../config/env');
  instance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return instance;
}

/**
 * Create a Razorpay customer.
 */
async function createCustomer({ name, email, phone }) {
  const rzp = _getInstance();
  const customer = await rzp.customers.create({
    name,
    email,
    contact: phone,
    notes: { source: 'bestoclinic' },
  });
  logger.info('Razorpay customer created: %s', customer.id);
  return customer;
}

/**
 * Create a subscription on a Razorpay plan.
 */
async function createSubscription({ planId, customerId, totalCount = 12 }) {
  const rzp = _getInstance();
  const subscription = await rzp.subscriptions.create({
    plan_id: planId,
    customer_id: customerId,
    total_count: totalCount,
    customer_notify: 1,
  });
  logger.info('Razorpay subscription created: %s', subscription.id);
  return subscription;
}

/**
 * Cancel a subscription.
 */
async function cancelSubscription(subscriptionId, cancelAtEnd = true) {
  const rzp = _getInstance();
  const subscription = await rzp.subscriptions.cancel(subscriptionId, cancelAtEnd);
  logger.info('Razorpay subscription cancelled: %s', subscriptionId);
  return subscription;
}

/**
 * Fetch subscription details.
 */
async function fetchSubscription(subscriptionId) {
  const rzp = _getInstance();
  return rzp.subscriptions.fetch(subscriptionId);
}

/**
 * Verify Razorpay webhook signature.
 */
function verifyWebhookSignature(body, signature) {
  const env = require('../config/env');

  // Use raw body string if available (from express.raw middleware), otherwise stringify
  const payload = typeof body === 'string' || Buffer.isBuffer(body)
    ? body
    : JSON.stringify(body);

  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSignature, 'hex');
  const received = Buffer.from(signature, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw ApiError.unauthorized('Invalid webhook signature');
  }
  return true;
}

module.exports = {
  createCustomer,
  createSubscription,
  cancelSubscription,
  fetchSubscription,
  verifyWebhookSignature,
};
