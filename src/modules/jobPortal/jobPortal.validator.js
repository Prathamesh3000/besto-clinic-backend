'use strict';

const Joi = require('joi');

const createJobSchema = Joi.object({
  title: Joi.string().trim().max(200).required(),
  department: Joi.string().trim().max(100).required(),
  employmentType: Joi.string().valid('full_time', 'part_time', 'contract').required(),
  description: Joi.string().max(10000).required(),
  compensation: Joi.object({
    salaryMin: Joi.number().min(0).default(0),
    salaryMax: Joi.number().min(0).default(0),
    currency: Joi.string().length(3).uppercase().default('INR'),
    showSalary: Joi.boolean().default(true),
    hasBenefits: Joi.boolean().default(false),
  }),
  requirements: Joi.object({
    experienceLevel: Joi.string().valid('entry', 'mid', 'senior').default('entry'),
    certifications: Joi.array().items(Joi.string().trim().max(100)),
    skills: Joi.array().items(Joi.string().trim().max(100)),
  }),
  location: Joi.object({
    type: Joi.string().valid('on_site', 'remote', 'hybrid').default('on_site'),
    city: Joi.string().trim().max(100).allow('', null),
    state: Joi.string().trim().max(100).allow('', null),
  }),
  isFeatured: Joi.boolean().default(false),
});

const updateJobSchema = createJobSchema.fork(
  ['title', 'department', 'employmentType', 'description'],
  (field) => field.optional(),
);

const jobIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const applicationIdParamSchema = Joi.object({
  applicationId: Joi.string().hex().length(24).required(),
});

const closeJobSchema = Joi.object({
  reason: Joi.string().valid('closed', 'filled').default('closed'),
});

const listJobsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  status: Joi.string().valid('draft', 'active', 'closed', 'filled'),
  sort: Joi.string(),
  order: Joi.string().valid('asc', 'desc'),
});

const listApplicationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  search: Joi.string().trim().max(200).allow('', null),
});

const publicJobQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  employmentType: Joi.string().valid('full_time', 'part_time', 'contract'),
  experienceLevel: Joi.string().valid('entry', 'mid', 'senior'),
  department: Joi.string().trim().max(100).allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(12),
  sort: Joi.string().valid('newest', 'salary_high', 'salary_low').default('newest'),
});

const applyToJobSchema = Joi.object({
  name: Joi.string().trim().max(200).required()
    .messages({ 'string.empty': 'Full name is required', 'any.required': 'Full name is required' }),
  email: Joi.string().email().required()
    .messages({ 'string.email': 'Please enter a valid email address', 'any.required': 'Email is required' }),
  phone: Joi.string().trim().max(20).allow('', null),
  resumeData: Joi.string().required()
    .messages({ 'string.empty': 'Resume is required', 'any.required': 'Resume is required' }),
  resumeFileName: Joi.string().trim().max(255).required()
    .messages({ 'any.required': 'Resume file name is missing' }),
  resumeMimeType: Joi.string().valid(
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ).required()
    .messages({ 'any.only': 'Only PDF and DOC files are accepted', 'any.required': 'Resume file type is missing' }),
  coverLetter: Joi.string().max(5000).allow('', null),
});

const creditPurchaseSchema = Joi.object({
  packId: Joi.string().valid('pack_5', 'pack_10', 'pack_25').required(),
});

const creditVerifySchema = Joi.object({
  packId: Joi.string().valid('pack_5', 'pack_10', 'pack_25').required(),
  razorpayPaymentId: Joi.string().required(),
  razorpayOrderId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});

module.exports = {
  createJobSchema,
  updateJobSchema,
  jobIdParamSchema,
  applicationIdParamSchema,
  closeJobSchema,
  listJobsQuerySchema,
  listApplicationsQuerySchema,
  publicJobQuerySchema,
  applyToJobSchema,
  creditPurchaseSchema,
  creditVerifySchema,
};
