'use strict';

const Joi = require('joi');
const { INVENTORY_CATEGORY } = require('../../config/constants');

const objectId = Joi.string().hex().length(24);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const createItemSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  code: Joi.string().trim().min(2).max(30).required(),
  category: Joi.string().valid(...Object.values(INVENTORY_CATEGORY)).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  unit: Joi.string().trim().max(50).default('piece'),
  currentStock: Joi.number().integer().min(0).default(0),
  minimumThreshold: Joi.number().integer().min(0).default(5),
  costPerUnit: Joi.number().min(0),
  currency: Joi.string().trim().max(10).default('INR'),
  supplier: Joi.object({
    name: Joi.string().trim().max(200),
    contactPhone: Joi.string().trim().max(20),
    contactEmail: Joi.string().trim().email().max(100),
    leadTimeDays: Joi.number().integer().min(0),
  }),
  expiryDate: Joi.date().iso(),
  branch: objectId.required(),
});

const updateItemSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  category: Joi.string().valid(...Object.values(INVENTORY_CATEGORY)),
  description: Joi.string().trim().max(1000).allow('', null),
  unit: Joi.string().trim().max(50),
  minimumThreshold: Joi.number().integer().min(0),
  costPerUnit: Joi.number().min(0),
  currency: Joi.string().trim().max(10),
  supplier: Joi.object({
    name: Joi.string().trim().max(200),
    contactPhone: Joi.string().trim().max(20),
    contactEmail: Joi.string().trim().email().max(100),
    leadTimeDays: Joi.number().integer().min(0),
  }),
  expiryDate: Joi.date().iso().allow(null),
  isActive: Joi.boolean(),
}).min(1);

const restockSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
  reason: Joi.string().trim().max(500),
  supplierNote: Joi.string().trim().max(500),
});

const bulkItemRowSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  code: Joi.string().trim().min(2).max(30).required(),
  category: Joi.string().valid(...Object.values(INVENTORY_CATEGORY)).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  unit: Joi.string().trim().max(50).default('piece'),
  currentStock: Joi.number().integer().min(0).default(0),
  minimumThreshold: Joi.number().integer().min(0).default(5),
  costPerUnit: Joi.number().min(0),
  currency: Joi.string().trim().max(10).default('INR'),
  supplier: Joi.object({
    name: Joi.string().trim().max(200),
    contactPhone: Joi.string().trim().max(20),
    contactEmail: Joi.string().trim().email().max(100),
    leadTimeDays: Joi.number().integer().min(0),
  }),
  expiryDate: Joi.date().iso(),
  branch: objectId,
  branchCode: Joi.string().trim(),
});

const bulkCreateItemsSchema = Joi.object({
  rows: Joi.array().items(bulkItemRowSchema).min(1).max(500).required(),
});

const listQuerySchema = Joi.object({
  branch: objectId,
  category: Joi.string().valid(...Object.values(INVENTORY_CATEGORY)),
  search: Joi.string().trim().max(200),
  lowStock: Joi.boolean(),
  expiring: Joi.boolean(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

module.exports = {
  idParamSchema,
  createItemSchema,
  updateItemSchema,
  restockSchema,
  bulkCreateItemsSchema,
  listQuerySchema,
};
