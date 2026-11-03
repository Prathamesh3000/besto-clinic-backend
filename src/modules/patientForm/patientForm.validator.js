'use strict';

const Joi = require('joi');

// Shape only — the rules (locked fields, unique keys, options, built-in key set)
// live in patientForm.logic.validateConfigInput so they can be unit-tested.
const optionSchema = Joi.object({
  value: Joi.string().trim().max(50).required(),
  label: Joi.string().trim().max(100).required(),
});

const fieldSchema = Joi.object({
  key: Joi.string().trim().max(60).required(),
  label: Joi.string().trim().max(100).required(),
  type: Joi.string().valid('text', 'textarea', 'phone', 'number', 'radio', 'select', 'checkbox', 'signature'),
  enabled: Joi.boolean(),
  required: Joi.boolean(),
  order: Joi.number(),
  options: Joi.array().items(optionSchema).max(20),
});

const updatePatientFormSchema = Joi.object({
  title: Joi.string().trim().max(120).required(),
  consentText: Joi.string().trim().allow('').max(2000).default(''),
  fields: Joi.array().items(fieldSchema).max(30).required(),
});

const toggleQrSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

module.exports = { updatePatientFormSchema, toggleQrSchema };
