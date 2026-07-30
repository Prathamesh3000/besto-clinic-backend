'use strict';

const Joi = require('joi');

const allowanceSchema = Joi.object({
  name: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  isFixed: Joi.boolean().default(true),
}).custom((value, helpers) => {
  if (!value.isFixed && value.amount > 100) {
    return helpers.error('any.invalid', { message: 'Percentage allowance must be 0-100' });
  }
  return value;
});

const deductionSchema = Joi.object({
  name: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  isFixed: Joi.boolean().default(true),
}).custom((value, helpers) => {
  if (!value.isFixed && value.amount > 100) {
    return helpers.error('any.invalid', { message: 'Percentage deduction must be 0-100' });
  }
  return value;
});

const createSalaryStructureSchema = Joi.object({
  user: Joi.string().hex().length(24).required(),
  baseSalary: Joi.number().min(0).required(),
  allowances: Joi.array().items(allowanceSchema),
  deductions: Joi.array().items(deductionSchema),
  currency: Joi.string().max(3).default('INR'),
  effectiveFrom: Joi.date().iso().required(),
  effectiveTo: Joi.date().iso(),
});

const updateSalaryStructureSchema = Joi.object({
  user: Joi.string().hex().length(24),
  baseSalary: Joi.number().min(0),
  allowances: Joi.array().items(allowanceSchema),
  deductions: Joi.array().items(deductionSchema),
  currency: Joi.string().max(3),
  effectiveFrom: Joi.date().iso(),
  effectiveTo: Joi.date().iso(),
}).min(1);

const generatePayslipsSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
});

const markPayslipPaidSchema = Joi.object({
  paymentMethod: Joi.string().trim().valid(
    'bank_transfer', 'cheque', 'cash', 'upi', 'neft', 'rtgs', 'other'
  ).required(),
  paymentReference: Joi.string().trim().max(100),
});

const idParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid ID format',
    'string.length': 'Invalid ID format',
  }),
});

module.exports = {
  createSalaryStructureSchema,
  updateSalaryStructureSchema,
  generatePayslipsSchema,
  markPayslipPaidSchema,
  idParamSchema,
};
