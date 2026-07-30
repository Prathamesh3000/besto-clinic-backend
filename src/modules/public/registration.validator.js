'use strict';

const Joi = require('joi');

const registerClinicSchema = Joi.object({
  clinicName: Joi.string().trim().min(2).max(200).required()
    .messages({ 'any.required': 'Clinic name is required' }),

  email: Joi.string().email().lowercase().trim().required()
    .messages({ 'any.required': 'Clinic email is required' }),

  phone: Joi.string().trim().max(20).allow('', null),

  address: Joi.object({
    street: Joi.string().trim().max(300).allow('', null),
    locality: Joi.string().trim().max(200).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    state: Joi.string().trim().max(100).allow('', null),
    zipCode: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).default('IN'),
  }).default({}),

  plan: Joi.string().lowercase().trim().max(60).default('free'),

  adminName: Joi.string().trim().min(2).max(100).required()
    .messages({ 'any.required': 'Admin name is required' }),

  adminEmail: Joi.string().email().lowercase().trim().required()
    .messages({ 'any.required': 'Admin email is required' }),

  adminPassword: Joi.string().min(8).max(128).required()
    .messages({
      'any.required': 'Admin password is required',
      'string.min': 'Password must be at least 8 characters',
    }),

  logo: Joi.string().allow('', null),

  subdomain: Joi.string().lowercase().trim().max(60)
    .pattern(/^[a-z0-9-]+$/)
    .messages({ 'string.pattern.base': 'Subdomain must contain only lowercase letters, numbers, and hyphens' })
    .allow('', null),

  documents: Joi.array().items(
    Joi.object({
      name: Joi.string().trim().max(200).required(),
      type: Joi.string().valid('business_registration', 'medical_license', 'tax_certificate', 'insurance', 'other').required(),
      url: Joi.string().trim().required(),
    }),
  ).default([]),

  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),

  referralCode: Joi.string().uppercase().trim().max(30).allow('', null),

  // Razorpay order-based payment fields (required for paid plans, optional for free)
  razorpayOrderId: Joi.string().trim().max(100).allow('', null),
  razorpayPaymentId: Joi.string().trim().max(100).allow('', null),
  razorpaySignature: Joi.string().trim().max(200).allow('', null),
});

const checkSlugSchema = Joi.object({
  slug: Joi.string().lowercase().trim().min(2).max(60)
    .pattern(/^[a-z0-9-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens',
      'any.required': 'Slug is required',
    }),
});

module.exports = {
  registerClinicSchema,
  checkSlugSchema,
};
