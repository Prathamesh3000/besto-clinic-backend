'use strict';

const Joi = require('joi');

// Answers are validated against the clinic's CURRENT form config in the service
// (types / options / required / unknown keys), so only the envelope is checked here.
// Joi's max length of 420k chars is a cheap guard; the 300 KB decoded cap is enforced in the logic layer.
const submitRegistrationSchema = Joi.object({
  formVersion: Joi.number().integer().min(1),
  answers: Joi.object().unknown(true).max(40).required(),
  signature: Joi.string().max(420000).allow('', null),
});

const registrationIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid registration ID format',
    'string.length': 'Invalid registration ID format',
  }),
});

module.exports = { submitRegistrationSchema, registrationIdParamSchema };
