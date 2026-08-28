'use strict';

const Joi = require('joi');

const periodQuerySchema = Joi.object({
  period: Joi.string().valid('daily', 'weekly', 'monthly').default('monthly'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  branchId: Joi.string().hex().length(24),
  doctorId: Joi.string().hex().length(24),
}).options({ stripUnknown: true });

const doctorPerformanceSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  branchId: Joi.string().hex().length(24),
  doctorId: Joi.string().hex().length(24),
}).options({ stripUnknown: true });

module.exports = {
  periodQuerySchema,
  doctorPerformanceSchema,
};
