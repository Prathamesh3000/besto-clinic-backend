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
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(typeof body === 'string' ? body : body.toString())
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = {
  createOrder,
  createPaymentLink,
  verifyPaymentSignature,
  verifyPaymentLinkSignature,
  fetchPayment,
  initiateRefund,
  verifyWebhookSignature,
};
