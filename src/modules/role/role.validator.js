'use strict';

const Joi = require('joi');

const ROLE_GROUPS = ['admin', 'clinical', 'front_desk', 'finance'];

const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string().trim().lowercase().min(2).max(50)
    .pattern(/^[a-z][a-z0-9_]*$/)
    .required()
    .messages({
      'string.pattern.base': 'Slug must start with a letter and contain only lowercase letters, numbers, and underscores',
    }),
  description: Joi.string().trim().max(500).allow('', null),
  group: Joi.string().valid(...ROLE_GROUPS).required(),
  permissions: Joi.array().items(Joi.string().trim()).default([]),
  displayOrder: Joi.number().integer().min(0).default(0),
});

const updateRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().trim().max(500).allow('', null),
  group: Joi.string().valid(...ROLE_GROUPS),
  permissions: Joi.array().items(Joi.string().trim()),
  isActive: Joi.boolean(),
  displayOrder: Joi.number().integer().min(0),
}).min(1);

const roleSlugParamSchema = Joi.object({
  slug: Joi.string().trim().lowercase().min(1).max(50).required().messages({
    'string.empty': 'Role slug is required',
    'any.required': 'Role slug is required',
  }),
});

module.exports = { createRoleSchema, updateRoleSchema, roleSlugParamSchema };
