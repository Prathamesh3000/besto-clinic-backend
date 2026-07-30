'use strict';

const Joi = require('joi');
const { PROCEDURE_CATEGORY } = require('../../config/constants');

const objectId = Joi.string().hex().length(24);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const createSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  code: Joi.string().trim().min(2).max(50).required(),
  category: Joi.string().valid(...Object.values(PROCEDURE_CATEGORY)).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  requiredMaterials: Joi.array().items(
    Joi.object({
      item: objectId.required(),
      itemName: Joi.string().trim().max(200),
      quantity: Joi.number().integer().min(1).required(),
      isOptional: Joi.boolean().default(false),
    }),
  ).min(1).required(),
  estimatedDuration: Joi.number().integer().min(1).max(1440),
  estimatedCost: Joi.number().min(0),
  department: objectId,
});

const updateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  category: Joi.string().valid(...Object.values(PROCEDURE_CATEGORY)),
  description: Joi.string().trim().max(1000).allow('', null),
  requiredMaterials: Joi.array().items(
    Joi.object({
      item: objectId.required(),
      itemName: Joi.string().trim().max(200),
      quantity: Joi.number().integer().min(1).required(),
      isOptional: Joi.boolean().default(false),
    }),
  ).min(1),
  estimatedDuration: Joi.number().integer().min(1).max(1440),
  estimatedCost: Joi.number().min(0),
  department: objectId,
  isActive: Joi.boolean(),
}).min(1);

const availabilityQuerySchema = Joi.object({
  branch: objectId.required(),
});

module.exports = {
  idParamSchema,
  createSchema,
  updateSchema,
  availabilityQuerySchema,
};
