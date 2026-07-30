'use strict';

const Joi = require('joi');
const { PAYMENT_MODE } = require('../../config/constants');

/* ── Reusable helpers ──────────────────────────────────────────────── */

const objectId = Joi.string().hex().length(24);

/* ── Create manual payment (cash / UPI / card / etc.) ──────────────── */

const createPaymentSchema = Joi.object({
  invoice: objectId.required(),
  patient: objectId.required(),
  amount: Joi.number().min(0.01).max(9999999.99).required(),
  mode: Joi.string()
    .valid(...Object.values(PAYMENT_MODE))
    .required(),
  reference: Joi.string().trim().max(200),
  notes: Joi.string().trim().max(2000),
  branch: objectId,
  cashRegister: objectId,
  insuranceClaim: objectId,
});

/* ── Create Razorpay gateway order ─────────────────────────────────── */

const createGatewayOrderSchema = Joi.object({
  invoiceId: objectId.required(),
  amount: Joi.number().integer().min(1).max(999999999).required(), // amount in paise
  currency: Joi.string().default('INR'),
});

/* ── Verify Razorpay gateway payment ───────────────────────────────── */

const verifyGatewayPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  invoiceId: objectId.required(),
  amount: Joi.number().required(),
});

/* ── Refund payment ────────────────────────────────────────────────── */

const refundPaymentSchema = Joi.object({
  amount: Joi.number().min(0.01).max(9999999.99),
  reason: Joi.string().trim().max(500).required(),
});

/* ── Param schemas ─────────────────────────────────────────────────── */

const paymentIdParamSchema = Joi.object({
  id: objectId.required().messages({
    'string.hex': 'Invalid payment ID format',
    'string.length': 'Invalid payment ID format',
  }),
});

const invoiceIdParamSchema = Joi.object({
  invoiceId: objectId.required().messages({
    'string.hex': 'Invalid invoice ID format',
    'string.length': 'Invalid invoice ID format',
  }),
});

module.exports = {
  createPaymentSchema,
  createGatewayOrderSchema,
  verifyGatewayPaymentSchema,
  refundPaymentSchema,
  paymentIdParamSchema,
  invoiceIdParamSchema,
};
