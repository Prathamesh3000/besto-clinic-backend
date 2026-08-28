'use strict';

const Joi = require('joi');

const globalSearchQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).max(100).required(),
  categories: Joi.string().trim().optional(),
  limit: Joi.number().integer().min(1).max(10).default(5),
  patientId: Joi.string().trim().optional(),
});

module.exports = { globalSearchQuerySchema };
