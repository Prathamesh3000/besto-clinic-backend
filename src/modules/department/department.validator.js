'use strict';

const Joi = require('joi');

const createDepartmentSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  code: Joi.string().trim().max(20).uppercase().required(),
  branch: Joi.string().hex().length(24).required(),
  headOfDepartment: Joi.string().hex().length(24),
  description: Joi.string().trim().max(500).allow('', null),
});

const updateDepartmentSchema = createDepartmentSchema.fork(
  ['name', 'code', 'branch'],
  (field) => field.optional(),
);

const departmentIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid department ID format',
    'string.length': 'Invalid department ID format',
  }),
});

const bulkDepartmentRowSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  code: Joi.string().trim().max(20).uppercase().required(),
  branch: Joi.string().hex().length(24),
  branchCode: Joi.string().trim(),
  headOfDepartment: Joi.string().hex().length(24),
  description: Joi.string().trim().max(500).allow('', null),
});

const bulkCreateDepartmentSchema = Joi.object({
  rows: Joi.array().items(bulkDepartmentRowSchema).min(1).max(500).required(),
});

module.exports = { createDepartmentSchema, updateDepartmentSchema, departmentIdParamSchema, bulkCreateDepartmentSchema };
