'use strict';

const Joi = require('joi');
const { STAFF_ROLES } = require('../../config/constants');

const createUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid(...STAFF_ROLES).required(),
  specialization: Joi.string().trim().max(100),
  licenseNumber: Joi.string().trim().max(50),
  consultationFee: Joi.number().min(0),
});

const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  phone: Joi.string().trim().min(10).max(15),
  role: Joi.string().valid(...STAFF_ROLES),
  specialization: Joi.string().trim().max(100),
  licenseNumber: Joi.string().trim().max(50),
  consultationFee: Joi.number().min(0),
  isActive: Joi.boolean(),
}).min(1);

const userIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid user ID format',
    'string.length': 'Invalid user ID format',
  }),
});

module.exports = { createUserSchema, updateUserSchema, userIdParamSchema };
