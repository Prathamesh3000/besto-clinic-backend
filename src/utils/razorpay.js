'use strict';

/**
 * Razorpay SDK wrapper — provides helper functions for creating orders,
 * verifying payments, processing refunds, and validating webhook signatures.
 *
 * Uses lazy initialization so the server does not crash if the razorpay
 * npm package is not installed or the env keys are missing at import time.
 */

const crypto = require('crypto');
const env = require('../config/env');
const logger = require('./logger');

let Razorpay;
try {
  Razorpay = require('razorpay');
} catch {
  logger.warn('razorpay npm package is not installed — gateway features will be unavailable');
}

/* ── Lazy singleton ────────────────────────────────────────────────── */

let _instance = null;

function getInstance() {
  if (!_instance) {
    if (!Razorpay) {
      throw new Error('Razorpay SDK is not installed. Run: npm install razorpay');
    }
    _instance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return _instance;
}

/**
 * Whether the gateway is usable at all: SDK present and both keys configured.
 *
 * Callers should check this before creating an order. Without it a missing or
 * placeholder key surfaces as a raw Razorpay 401 from deep inside the payment
 * flow — and because the order call precedes the Payment insert, the attempt
 * leaves no trace in the database at all.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkConfig() {
  if (!Razorpay) return { ok: false, reason: 'Razorpay SDK is not installed' };
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { ok: false, reason: 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set' };
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    return { ok: false, reason: 'RAZORPAY_KEY_ID is not a valid key id (expected rzp_test_… or rzp_live_…)' };
  }
  // Razorpay secrets are 24 chars; anything much shorter is a placeholder.
  if (keySecret.length < 20) {
    return { ok: false, reason: 'RAZORPAY_KEY_SECRET looks like a placeholder (too short)' };
  }
  return { ok: true };
}

/** True when the gateway is configured well enough to attempt a call. */
function isConfigured() {
  return checkConfig().ok;
}

/**
 * Constant-time compare of two hex digests that tolerates a malformed input.
 * crypto.timingSafeEqual throws a RangeError when the buffers differ in
 * length, so a junk signature would surface as a 500 instead of "invalid".
 */
function _safeEqualHex(expected, actual) {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
}

/* ── Order creation ────────────────────────────────────────────────── */

/**
 * Create a Razorpay order.
 * @param {number}  amount   - Amount in smallest currency unit (paise for INR)
 * @param {string}  currency - ISO currency code (default 'INR')
 * @param {string}  receipt  - Unique receipt id for this order
 * @param {object}  [notes]  - Key-value metadata (max 15 keys)
 * @returns {Promise<object>} Razorpay order object
 */
async function createOrder(amount, currency = 'INR', receipt, notes = {}) {
  const rz = getInstance();
  return rz.orders.create({
    amount,
    currency,
    receipt,
    notes,
  });
}

/* ── Payment Link creation ────────────────────────────────────────── */

/**
 * Create a Razorpay Payment Link (hosted checkout page).
 * @param {object} params
 * @param {number} params.amount       - Amount in smallest currency unit (paise)
 * @param {string} params.currency     - ISO currency code (default 'INR')
 * @param {string} params.description  - Description shown on the payment page
 * @param {object} params.customer     - { name, email, contact }
 * @param {string} params.callbackUrl  - URL to redirect after payment
 * @param {object} [params.notes]      - Key-value metadata
 * @returns {Promise<object>} Razorpay payment link object (includes short_url)
 */
async function createPaymentLink({ amount, currency = 'INR', description, customer, callbackUrl, notes = {} }) {
  const rz = getInstance();
  const params = {
    amount,
    currency,
    accept_partial: false,
    description,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes,
    callback_url: callbackUrl,
    callback_method: 'get',
  };

  if (customer) {
    params.customer = {};
    if (customer.name) params.customer.name = customer.name;
    if (customer.email) params.customer.email = customer.email;
    if (customer.contact) params.customer.contact = customer.contact;
  }

  return rz.paymentLink.create(params);
}

/* ── Payment Link signature verification ─────────────────────────── */

/**
 * Verify the Razorpay Payment Link callback signature.
 * Signature body: payment_link_id|payment_link_reference_id|payment_link_status|razorpay_payment_id
 * @returns {boolean} true if signature is valid
 */
function verifyPaymentLinkSignature(paymentLinkId, paymentLinkRefId, paymentLinkStatus, paymentId, signature) {
  const body = `${paymentLinkId}|${paymentLinkRefId}|${paymentLinkStatus}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return _safeEqualHex(expected, signature);
}

/* ── Payment signature verification ────────────────────────────────── */

/**
 * Verify the Razorpay payment signature after checkout.
 * @param {string} orderId   - razorpay_order_id
 * @param {string} paymentId - razorpay_payment_id
 * @param {string} signature - razorpay_signature
 * @returns {boolean} true if signature is valid
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return _safeEqualHex(expected, signature);
}

/* ── Fetch a payment ───────────────────────────────────────────────── */

/**
 * Fetch payment details from Razorpay.
 * @param {string} paymentId - Razorpay payment ID (pay_xxx)
 * @returns {Promise<object>} Razorpay payment object
 */
async function fetchPayment(paymentId) {
  const rz = getInstance();
  return rz.payments.fetch(paymentId);
}

/* ── Refund ────────────────────────────────────────────────────────── */

/**
 * Initiate a refund on a captured payment.
 * @param {string} paymentId - Razorpay payment ID (pay_xxx)
 * @param {number} amount    - Refund amount in smallest currency unit (paise)
 * @param {object} [notes]   - Key-value metadata
 * @returns {Promise<object>} Razorpay refund object
 */
async function initiateRefund(paymentId, amount, notes = {}) {
  const rz = getInstance();
  return rz.payments.refund(paymentId, {
    amount,
    notes,
  });
}

/* ── Webhook signature verification ───────────────────────────────── */

/**
 * Verify Razorpay webhook signature.
 * @param {string|Buffer} body      - Raw request body
 * @param {string}        signature - X-Razorpay-Signature header value
 * @param {string}        [secret]  - Webhook secret (defaults to env)
 * @returns {boolean} true if signature is valid
 */
function verifyWebhookSignature(body, signature, secret) {
  const webhookSecret = secret || env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set — rejecting');
    return false;
  }
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(typeof body === 'string' ? body : body.toString())
    .digest('hex');
  return _safeEqualHex(expected, signature);
}

module.exports = {
  checkConfig,
  isConfigured,
  createOrder,
  createPaymentLink,
  verifyPaymentSignature,
  verifyPaymentLinkSignature,
  fetchPayment,
  initiateRefund,
  verifyWebhookSignature,
};
