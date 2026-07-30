'use strict';

const Joi = require('joi');

const createPatientSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().trim().min(10).max(15).required(),
  dateOfBirth: Joi.date().iso(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
  bloodGroup: Joi.string().trim(),
  address: Joi.object({
    street: Joi.string().trim(),
    city: Joi.string().trim(),
    state: Joi.string().trim(),
    zipCode: Joi.string().trim(),
    country: Joi.string().trim().default('IN'),
  }),
  medicalHistory: Joi.object({
    allergies: Joi.array().items(Joi.string()),
    medications: Joi.array().items(Joi.string()),
    conditions: Joi.array().items(Joi.string()),
    notes: Joi.string().trim().max(2000),
  }),
  insurance: Joi.object({
    provider: Joi.string().trim(),
    policyNumber: Joi.string().trim(),
    groupNumber: Joi.string().trim(),
    validTill: Joi.date().iso(),
  }),
  emergencyContact: Joi.object({
    name: Joi.string().trim(),
    phone: Joi.string().trim(),
    relationship: Joi.string().trim(),
  }),
});

const updatePatientSchema = createPatientSchema.fork(
  ['name', 'phone'],
  (field) => field.optional(),
);

const patientIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid patient ID format',
    'string.length': 'Invalid patient ID format',
  }),
});

const bulkCreatePatientSchema = Joi.object({
  rows: Joi.array().items(createPatientSchema).min(1).max(500).required(),
});

module.exports = { createPatientSchema, updatePatientSchema, patientIdParamSchema, bulkCreatePatientSchema };
