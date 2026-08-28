'use strict';

const Joi = require('joi');

const createConsentSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  consentType: Joi.string()
    .valid('data_sharing', 'treatment', 'research', 'marketing')
    .required(),
  grantedTo: Joi.string().hex().length(24),
  scope: Joi.string().valid('read', 'read_write'),
  purpose: Joi.string().trim().max(500),
  expiresAt: Joi.date().iso(),
});

const updateConsentSchema = Joi.object({
  grantedTo: Joi.string().hex().length(24),
  scope: Joi.string().valid('read', 'read_write'),
  purpose: Joi.string().trim().max(500),
  expiresAt: Joi.date().iso(),
}).min(1);

const consentIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = { createConsentSchema, updateConsentSchema, consentIdParamSchema };
