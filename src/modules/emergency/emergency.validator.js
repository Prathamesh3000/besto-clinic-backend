'use strict';

const Joi = require('joi');

const createSessionSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  type: Joi.string().valid('chat', 'video').required(),
  branch: Joi.string().hex().length(24),
  reason: Joi.string().trim().max(1000),
  doctor: Joi.string().hex().length(24),
});

const endSessionSchema = Joi.object({
  notes: Joi.string().trim().max(2000),
});

const declineSessionSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow('', null),
});

const sessionIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = { createSessionSchema, endSessionSchema, declineSessionSchema, sessionIdParamSchema };
