'use strict';

const Joi = require('joi');

const planSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  coverageType: Joi.string().valid('individual', 'family', 'group'),
  maxCoverage: Joi.number().min(0),
  copayPercent: Joi.number().min(0).max(100),
});

const addressSchema = Joi.object({
  street: Joi.string().trim().max(500),
  city: Joi.string().trim().max(200),
  state: Joi.string().trim().max(200),
  postalCode: Joi.string().trim().max(20),
  country: Joi.string().trim().max(100),
});

const documentSchema = Joi.object({
  fileName: Joi.string().trim().max(500),
  fileUrl: Joi.string().trim().max(2000),
  fileType: Joi.string().trim().max(100),
});

const createProviderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  code: Joi.string().trim().max(20).uppercase().required(),
  contactPerson: Joi.string().trim().max(200),
  phone: Joi.string().trim().max(50),
  email: Joi.string().trim().email().max(200),
  address: addressSchema,
  plans: Joi.array().items(planSchema),
  claimSubmissionProcess: Joi.string().trim().max(5000),
});

const updateProviderSchema = createProviderSchema.fork(
  ['name', 'code'],
  (schema) => schema.optional(),
).min(1);

const createClaimSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  appointment: Joi.string().hex().length(24),
  invoice: Joi.string().hex().length(24),
  provider: Joi.string().hex().length(24).required(),
  policyNumber: Joi.string().trim().min(1).max(200).required(),
  claimAmount: Joi.number().min(0).required(),
  diagnosis: Joi.string().trim().max(2000),
  documents: Joi.array().items(documentSchema),
  notes: Joi.string().trim().max(5000),
});

const updateClaimStatusSchema = Joi.object({
  status: Joi.string()
    .valid('submitted', 'under_review', 'approved', 'rejected', 'settled', 'appealed')
    .required(),
  approvedAmount: Joi.number().min(0),
  settledAmount: Joi.number().min(0),
  rejectionReason: Joi.string().trim().max(5000),
  notes: Joi.string().trim().max(5000),
});

const idParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid ID format',
    'string.length': 'Invalid ID format',
  }),
});

module.exports = {
  createProviderSchema,
  updateProviderSchema,
  createClaimSchema,
  updateClaimStatusSchema,
  idParamSchema,
};
