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

module.exports = { createSubscriptionSchema, updateSubscriptionSchema, webhookPayloadSchema };
