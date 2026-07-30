'use strict';

const Joi = require('joi');

/* ── Reusable helpers ──────────────────────────────────────────────── */

const objectId = Joi.string().hex().length(24);

/* ── Open cash register ────────────────────────────────────────────── */

const openRegisterSchema = Joi.object({
  branch: objectId.required(),
  openingBalance: Joi.number().min(0).required(),
  notes: Joi.string().trim().max(1000),
});

/* ── Close cash register ───────────────────────────────────────────── */

const closeRegisterSchema = Joi.object({
  closingBalance: Joi.number().min(0).required(),
  notes: Joi.string().trim().max(1000),
});

/* ── Reconcile cash register ───────────────────────────────────────── */

const reconcileRegisterSchema = Joi.object({
  notes: Joi.string().trim().max(1000),
});

/* ── Param schemas ─────────────────────────────────────────────────── */

const registerIdParamSchema = Joi.object({
  id: objectId.required().messages({
    'string.hex': 'Invalid register ID format',
    'string.length': 'Invalid register ID format',
  }),
});

/* ── GET /current query ───────────────────────────────────────────── */

const getCurrentQuerySchema = Joi.object({
  branch: objectId.required().messages({
    'any.required': 'Branch is required to fetch current register',
    'string.hex': 'Invalid branch ID format',
    'string.length': 'Invalid branch ID format',
  }),
});

/* ── GET / list query ─────────────────────────────────────────────── */

const listRegistersQuerySchema = Joi.object({
  branch: objectId,
  status: Joi.string().valid('open', 'closed', 'reconciled'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  openRegisterSchema,
  closeRegisterSchema,
  reconcileRegisterSchema,
  registerIdParamSchema,
  getCurrentQuerySchema,
  listRegistersQuerySchema,
};
