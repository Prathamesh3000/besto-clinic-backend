'use strict';

const Joi = require('joi');

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const createBranchSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  code: Joi.string().trim().max(20).uppercase().required(),
  address: Joi.object({
    street: Joi.string().trim(),
    city: Joi.string().trim(),
    state: Joi.string().trim(),
    zipCode: Joi.string().trim(),
    country: Joi.string().trim().default('IN'),
  }),
  phone: Joi.string().trim(),
  email: Joi.string().email().lowercase().trim(),
  manager: Joi.string().hex().length(24),
  operatingHours: Joi.array().items(
    Joi.object({
      day: Joi.string().valid(...WEEKDAYS).required(),
      openTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
        'string.pattern.base': 'Time must be in HH:mm format (00:00-23:59)',
      }),
      closeTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
        'string.pattern.base': 'Time must be in HH:mm format (00:00-23:59)',
      }),
      isClosed: Joi.boolean(),
    }),
  ),
});

const updateBranchSchema = createBranchSchema.fork(
  ['name', 'code'],
  (field) => field.optional(),
);

const branchIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid branch ID format',
    'string.length': 'Invalid branch ID format',
  }),
});

const bulkCreateBranchSchema = Joi.object({
  rows: Joi.array().items(createBranchSchema).min(1).max(500).required(),
});

module.exports = { createBranchSchema, updateBranchSchema, branchIdParamSchema, bulkCreateBranchSchema };
