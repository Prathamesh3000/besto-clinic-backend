'use strict';

const Joi = require('joi');
const { CREDIT_NOTE_REASON } = require('../../config/constants');

const creditNoteItemSchema = Joi.object({
  description: Joi.string().trim().min(1).max(500).required(),
  quantity: Joi.number().integer().min(1).default(1),
  unitPrice: Joi.number().min(0).required(),
  tax: Joi.number().min(0).default(0),
});

const createCreditNoteSchema = Joi.object({
  invoice: Joi.string().hex().length(24).required(),
  patient: Joi.string().hex().length(24).required(),
  reason: Joi.string()
    .valid(...Object.values(CREDIT_NOTE_REASON))
    .required(),
  items: Joi.array().items(creditNoteItemSchema).min(1).required(),
  validUntil: Joi.date().iso(),
  notes: Joi.string().trim().max(2000),
});

const issueCreditNoteSchema = Joi.object({
  // empty — just transitions status
});

const applyCreditNoteSchema = Joi.object({
  invoiceId: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid invoice ID format',
    'string.length': 'Invalid invoice ID format',
  }),
  amount: Joi.number().min(0.01).required(),
});

const creditNoteIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid credit note ID format',
    'string.length': 'Invalid credit note ID format',
  }),
});

const patientIdParamSchema = Joi.object({
  patientId: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid patient ID format',
    'string.length': 'Invalid patient ID format',
  }),
});

module.exports = {
  createCreditNoteSchema,
  issueCreditNoteSchema,
  applyCreditNoteSchema,
  creditNoteIdParamSchema,
  patientIdParamSchema,
};
