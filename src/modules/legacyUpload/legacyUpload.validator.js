'use strict';

const Joi = require('joi');

const createUploadSchema = Joi.object({
  fileName: Joi.string().trim().required(),
  originalName: Joi.string().trim(),
  fileSize: Joi.number().min(0),
  fileType: Joi.string().valid('csv', 'xlsx').default('csv'),
  entityType: Joi.string()
    .valid('patients', 'appointments', 'invoices', 'doctors', 'staff')
    .required(),
  content: Joi.string().required(), // base64 encoded CSV content
  columnMapping: Joi.object(),
});

const processUploadSchema = Joi.object({});

const idParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid upload ID format',
    'string.length': 'Invalid upload ID format',
  }),
});

const listUploadsQuery = Joi.object({
  entityType: Joi.string().valid('patients', 'appointments', 'invoices', 'doctors', 'staff'),
  status: Joi.string().valid('pending', 'validating', 'processing', 'completed', 'failed', 'partial'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1),
  sort: Joi.string().trim(),
});

module.exports = {
  createUploadSchema,
  processUploadSchema,
  idParamSchema,
  listUploadsQuery,
};
