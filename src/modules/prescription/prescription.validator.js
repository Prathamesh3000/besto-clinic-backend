'use strict';

const Joi = require('joi');
const { PRESCRIPTION_STATUS } = require('../../config/constants');

const medicationSchema = Joi.object({
  name: Joi.string().trim().required(),
  dosage: Joi.string().trim().required(),
  frequency: Joi.string().trim().required(),
  duration: Joi.string().trim(),
  instructions: Joi.string().trim(),
});

const createPrescriptionSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  doctor: Joi.string().hex().length(24),
  appointment: Joi.string().hex().length(24),
  branch: Joi.string().hex().length(24),
  diagnosis: Joi.string().trim(),
  medications: Joi.array().items(medicationSchema).min(1).required(),
  notes: Joi.string().trim().max(2000),
  validUntil: Joi.date().iso(),
});

const updatePrescriptionSchema = Joi.object({
  diagnosis: Joi.string().trim(),
  medications: Joi.array().items(medicationSchema).min(1),
  notes: Joi.string().trim().max(2000),
  validUntil: Joi.date().iso(),
  status: Joi.string().valid(...Object.values(PRESCRIPTION_STATUS)),
}).min(1);

const prescriptionIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid prescription ID format',
    'string.length': 'Invalid prescription ID format',
  }),
});

module.exports = { createPrescriptionSchema, updatePrescriptionSchema, prescriptionIdParamSchema };
