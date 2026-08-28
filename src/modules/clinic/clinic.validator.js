'use strict';

const Joi = require('joi');

const updateClinicSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().trim().min(10).max(15),
  address: Joi.object({
    street: Joi.string().trim(),
    city: Joi.string().trim(),
    state: Joi.string().trim(),
    zipCode: Joi.string().trim(),
    country: Joi.string().trim(),
  }),
  logo: Joi.string().uri().trim(),
  website: Joi.string().uri().trim().allow(''),
  features: Joi.object({
    maxDoctors: Joi.number().integer().min(1),
    maxStaff: Joi.number().integer().min(1),
    smsEnabled: Joi.boolean(),
    teleHealthEnabled: Joi.boolean(),
    customBranding: Joi.boolean(),
  }),
}).min(1);

module.exports = { updateClinicSchema };
