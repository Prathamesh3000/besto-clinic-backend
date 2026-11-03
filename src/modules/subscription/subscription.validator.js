'use strict';

const Joi = require('joi');
const { SUBSCRIPTION_PLANS } = require('../../config/constants');

const createSubscriptionSchema = Joi.object({
  plan: Joi.string().valid(...Object.values(SUBSCRIPTION_PLANS)).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),
});

const updateSubscriptionSchema = Joi.object({
  plan: Joi.string().valid(...Object.values(SUBSCRIPTION_PLANS)),
  billingCycle: Joi.string().valid('monthly', 'yearly'),
  cancelReason: Joi.string().trim().max(500),
}).min(1);

const webhookPayloadSchema = Joi.object({
  event: Joi.string().required(),
  payload: Joi.object({
    subscription: Joi.object({
      entity: Joi.object({
        id: Joi.string().required(),
        plan_id: Joi.string(),
        status: Joi.string(),
        current_start: Joi.number(),
        current_end: Joi.number(),
      }).required(),
    }),
    payment: Joi.object({
      entity: Joi.object({
        id: Joi.string(),
        amount: Joi.number(),
        status: Joi.string(),
        invoice_id: Joi.string(),
      }),
    }),
  }).required(),
}).options({ allowUnknown: true });

/* ── Clinic self-service ───────────────────────────────────────────── */

// Plan slugs are validated against the live Plan collection in the service, not
// against the SUBSCRIPTION_PLANS constant, so custom plans remain purchasable.
const addOnsSchema = Joi.object({
  extraDoctors: Joi.number().integer().min(0).max(500).default(0),
  extraStorageUnits: Joi.number().integer().min(0).max(500).default(0),
  enabledFeatures: Joi.array().items(Joi.string().trim().max(60)).default([]),
  enabledModules: Joi.array().items(Joi.string().trim().max(60)).default([]),
}).default({});

const selfServeQuoteSchema = Joi.object({
  plan: Joi.string().trim().max(60).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly'),
  addOns: addOnsSchema,
});

// The amount is never accepted from the client — it is recomputed server-side.
const selfServeVerifySchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  plan: Joi.string().trim().max(60).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly'),
  addOns: addOnsSchema,
});

module.exports = {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  webhookPayloadSchema,
  selfServeQuoteSchema,
  selfServeVerifySchema,
};
