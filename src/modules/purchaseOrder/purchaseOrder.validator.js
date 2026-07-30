'use strict';

const Joi = require('joi');
const { PURCHASE_ORDER_STATUS, PURCHASE_ORDER_URGENCY } = require('../../config/constants');

const objectId = Joi.string().hex().length(24);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

/* ── Vendor schemas ────────────────────────────── */

const createVendorSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  contactPerson: Joi.string().trim().max(200).allow('', null),
  email: Joi.string().trim().email().max(100).allow('', null),
  phone: Joi.string().trim().max(20).allow('', null),
  company: Joi.string().trim().max(200).allow('', null),
  address: Joi.string().trim().max(500).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  gstNumber: Joi.string().trim().max(50).allow('', null),
  notes: Joi.string().trim().max(1000).allow('', null),
  branch: objectId.required(),
});

const updateVendorSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  contactPerson: Joi.string().trim().max(200).allow('', null),
  email: Joi.string().trim().email().max(100).allow('', null),
  phone: Joi.string().trim().max(20).allow('', null),
  company: Joi.string().trim().max(200).allow('', null),
  address: Joi.string().trim().max(500).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  gstNumber: Joi.string().trim().max(50).allow('', null),
  notes: Joi.string().trim().max(1000).allow('', null),
  isActive: Joi.boolean(),
}).min(1);

/* ── Purchase Order schemas ────────────────────── */

const poItemSchema = Joi.object({
  inventoryItemId: objectId.required(),
  itemName: Joi.string().trim().max(200).allow('', null),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().min(0).default(0),
});

const createPOSchema = Joi.object({
  vendorId: objectId.required(),
  branch: objectId.required(),
  items: Joi.array().items(poItemSchema).min(1).required(),
  expectedDelivery: Joi.date().iso().allow(null),
  urgency: Joi.string().valid(...Object.values(PURCHASE_ORDER_URGENCY)).default(PURCHASE_ORDER_URGENCY.NORMAL),
  notes: Joi.string().trim().max(1000).allow('', null),
  requestedBy: objectId.allow(null),
  patient: objectId.allow(null, ''),
});

const receivedItemSchema = Joi.object({
  inventoryItemId: objectId.required(),
  receivedQty: Joi.number().integer().min(0).required(),
});

const updatePOStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(PURCHASE_ORDER_STATUS)).required(),
  note: Joi.string().trim().max(500).allow('', null),
  items: Joi.array().items(receivedItemSchema).optional(),
});

const updatePOSchema = Joi.object({
  vendorId: objectId,
  branch: objectId,
  items: Joi.array().items(poItemSchema).min(1),
  expectedDelivery: Joi.date().iso().allow(null),
  urgency: Joi.string().valid(...Object.values(PURCHASE_ORDER_URGENCY)),
  notes: Joi.string().trim().max(1000).allow('', null),
  requestedBy: objectId.allow(null),
  patient: objectId.allow(null, ''),
}).min(1);

const listVendorQuerySchema = Joi.object({
  branch: objectId,
  search: Joi.string().trim().max(200),
  isActive: Joi.boolean(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

const listPOQuerySchema = Joi.object({
  branch: objectId,
  vendor: objectId,
  status: Joi.string().valid(...Object.values(PURCHASE_ORDER_STATUS)),
  urgency: Joi.string().valid(...Object.values(PURCHASE_ORDER_URGENCY)),
  patient: objectId,
  search: Joi.string().trim().max(200),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

module.exports = {
  idParamSchema,
  createVendorSchema,
  updateVendorSchema,
  createPOSchema,
  updatePOSchema,
  updatePOStatusSchema,
  listVendorQuerySchema,
  listPOQuerySchema,
};
