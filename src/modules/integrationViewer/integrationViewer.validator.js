'use strict';

const Joi = require('joi');

const syncLogIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid sync log ID format',
    'string.length': 'Invalid sync log ID format',
  }),
});

const patientIdParamSchema = Joi.object({
  patientId: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid patient ID format',
    'string.length': 'Invalid patient ID format',
  }),
});

const listSyncLogsQuerySchema = Joi.object({
  integrationType: Joi.string().valid('rioview', 'romexis'),
  status: Joi.string().valid('started', 'in_progress', 'completed', 'partial', 'failed'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  syncLogIdParamSchema,
  patientIdParamSchema,
  listSyncLogsQuerySchema,
};
