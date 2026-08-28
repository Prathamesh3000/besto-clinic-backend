'use strict';

const Joi = require('joi');

// Role validation moved to service layer (reads from Role collection).
// Joi only enforces format here; business validation is in staff.service.js.

const createStaffSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
  role: Joi.string().trim().lowercase().min(1).max(50).required(),
  branch: Joi.string().hex().length(24),
  department: Joi.string().hex().length(24),
  employeeId: Joi.string().trim(),
});

const updateStaffSchema = createStaffSchema.fork(
  ['name', 'email', 'role'],
  (field) => field.optional(),
).keys({
  password: Joi.forbidden(),
  role: Joi.forbidden(),
}).min(1);

const staffIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid staff ID format',
    'string.length': 'Invalid staff ID format',
  }),
});

const bulkStaffRowSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
  role: Joi.string().trim().lowercase().min(1).max(50).required(),
  branch: Joi.string().hex().length(24),
  branchCode: Joi.string().trim(),
  department: Joi.string().hex().length(24),
  employeeId: Joi.string().trim(),
});

const bulkCreateStaffSchema = Joi.object({
  rows: Joi.array().items(bulkStaffRowSchema).min(1).max(500).required(),
});

const changeRoleSchema = Joi.object({
  role: Joi.string().trim().lowercase().min(1).max(50).required(),
});

module.exports = { createStaffSchema, updateStaffSchema, staffIdParamSchema, bulkCreateStaffSchema, changeRoleSchema };
