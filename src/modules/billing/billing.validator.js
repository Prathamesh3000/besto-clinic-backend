'use strict';

const Joi = require('joi');
const { PAYMENT_MODE, SERVICE_ITEM_CATEGORY } = require('../../config/constants');

const enhancedInvoiceItemSchema = Joi.object({
  serviceItem: Joi.string().hex().length(24),
  description: Joi.string().trim().min(1).max(500)
    .when('serviceItem', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
  quantity: Joi.number().integer().min(1).default(1),
  unitPrice: Joi.number().min(0).max(9999999.99)
    .when('serviceItem', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
  discount: Joi.number().min(0).max(9999999.99).default(0),
  itemType: Joi.string().valid('treatment', 'medicine', 'equipment', 'lab', 'consultation', 'other'),
}).custom((value, helpers) => {
  if (value.unitPrice != null && value.discount > value.quantity * value.unitPrice) {
    return helpers.message('Discount cannot exceed item subtotal (quantity × unitPrice)');
  }
  return value;
});

const createEnhancedInvoiceSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  doctor: Joi.string().hex().length(24),
  appointment: Joi.string().hex().length(24),
  branch: Joi.string().hex().length(24),
  items: Joi.array().items(enhancedInvoiceItemSchema).min(1).required(),
  gstType: Joi.string().valid('intrastate', 'interstate').default('intrastate'),
  // promotionCode removed — patient-invoice discount codes were never
  // implemented and the endpoint silently ignored the value. See
  // billing.service.js createEnhancedInvoice and defect register §2.7.
  dueDate: Joi.date().iso(),
  notes: Joi.string().trim().max(2000),
});

const recordPaymentSchema = Joi.object({
  mode: Joi.string()
    .valid(...Object.values(PAYMENT_MODE))
    .required(),
  amount: Joi.number().min(0.01).max(9999999.99).required(),
  reference: Joi.string().trim().max(200),
  notes: Joi.string().trim().max(2000),
  cashRegister: Joi.string().hex().length(24),
  insuranceClaim: Joi.string().hex().length(24),
  idempotencyKey: Joi.string().trim().min(8).max(100),
});

const serviceItemSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  code: Joi.string().trim().uppercase().min(2).max(50).required(),
  category: Joi.string()
    .valid(...Object.values(SERVICE_ITEM_CATEGORY))
    .required(),
  description: Joi.string().trim().max(1000),
  defaultPrice: Joi.number().min(0).max(9999999.99).required(),
  taxRate: Joi.number().min(0).max(100).default(0),
  taxType: Joi.string().valid('inclusive', 'exclusive').default('exclusive'),
  hsnCode: Joi.string().trim(),
  unit: Joi.string().trim().default('unit'),
  branch: Joi.string().hex().length(24),
  department: Joi.string().hex().length(24),
});

const updateServiceItemSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  code: Joi.string().trim().uppercase().min(2).max(50),
  category: Joi.string()
    .valid(...Object.values(SERVICE_ITEM_CATEGORY)),
  description: Joi.string().trim().max(1000),
  defaultPrice: Joi.number().min(0).max(9999999.99),
  taxRate: Joi.number().min(0).max(100),
  taxType: Joi.string().valid('inclusive', 'exclusive'),
  hsnCode: Joi.string().trim(),
  unit: Joi.string().trim(),
  branch: Joi.string().hex().length(24),
  department: Joi.string().hex().length(24),
}).min(1);

const advancePaymentSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  amount: Joi.number().min(0.01).max(9999999.99).required(),
  mode: Joi.string()
    .valid(...Object.values(PAYMENT_MODE))
    .required(),
  reference: Joi.string().trim().max(200),
  notes: Joi.string().trim().max(500),
  branch: Joi.string().hex().length(24),
});

const ledgerAdjustmentSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  type: Joi.string().valid('debit', 'credit').required(),
  amount: Joi.number().min(0.01).max(9999999.99).required(),
  description: Joi.string().trim().min(1).max(500).required(),
  branch: Joi.string().hex().length(24),
});

const revenueQuerySchema = Joi.object({
  branch: Joi.string().hex().length(24),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  doctor: Joi.string().hex().length(24),
});

const invoiceIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid invoice ID format',
    'string.length': 'Invalid invoice ID format',
  }),
});

const serviceItemIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid service item ID format',
    'string.length': 'Invalid service item ID format',
  }),
});

const patientIdParamSchema = Joi.object({
  patientId: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid patient ID format',
    'string.length': 'Invalid patient ID format',
  }),
});

const writeOffSchema = Joi.object({
  invoiceId: Joi.string().hex().length(24).required(),
  amount: Joi.number().min(0.01).max(9999999.99),
  reason: Joi.string().trim().min(1).max(500).required(),
});

module.exports = {
  createEnhancedInvoiceSchema,
  recordPaymentSchema,
  serviceItemSchema,
  updateServiceItemSchema,
  advancePaymentSchema,
  ledgerAdjustmentSchema,
  revenueQuerySchema,
  invoiceIdParamSchema,
  serviceItemIdParamSchema,
  patientIdParamSchema,
  writeOffSchema,
};
