'use strict';

const Joi = require('joi');
const { INVOICE_STATUS, PAYMENT_MODE } = require('../../config/constants');

const invoiceItemSchema = Joi.object({
  description: Joi.string().trim().min(1).max(500).required(),
  quantity: Joi.number().integer().min(1).default(1),
  unitPrice: Joi.number().min(0).required(),
  discount: Joi.number().min(0).default(0),
  tax: Joi.number().min(0).default(0),
});

const createInvoiceSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  appointment: Joi.string().hex().length(24),
  doctor: Joi.string().hex().length(24),
  items: Joi.array().items(invoiceItemSchema).min(1).required(),
  paymentMethod: Joi.string().valid(...Object.values(PAYMENT_MODE)),
  dueDate: Joi.date().iso(),
  notes: Joi.string().trim().max(2000),
});

const updateInvoiceSchema = Joi.object({
  items: Joi.array().items(invoiceItemSchema).min(1),
  status: Joi.string().valid(...Object.values(INVOICE_STATUS)),
  paymentMethod: Joi.string().valid(...Object.values(PAYMENT_MODE)),
  paymentReference: Joi.string().trim().max(200),
  dueDate: Joi.date().iso(),
  notes: Joi.string().trim().max(2000),
}).min(1);

const invoiceIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid invoice ID format',
    'string.length': 'Invalid invoice ID format',
  }),
});

module.exports = { createInvoiceSchema, updateInvoiceSchema, invoiceIdParamSchema };
