'use strict';

const Joi = require('joi');
const { INTEGRATION_TYPES } = require('../../config/constants');

const upsertIntegrationSchema = Joi.object({
  type: Joi.string().valid(...INTEGRATION_TYPES).required(),
  config: Joi.object({
    baseUrl: Joi.string().uri().required(),
    apiVersion: Joi.string().trim().default('v1'),
    syncInterval: Joi.number().integer().min(5).max(1440).default(60),
    syncEnabled: Joi.boolean().default(false),
  }).required(),
});

const storeCredentialsSchema = Joi.object({
  authType: Joi.string().valid('api_key', 'oauth2').required(),
  apiKey: Joi.when('authType', {
    is: 'api_key',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  clientId: Joi.when('authType', {
    is: 'oauth2',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  clientSecret: Joi.when('authType', {
    is: 'oauth2',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  scopes: Joi.array().items(Joi.string().trim()),
});

const triggerSyncSchema = Joi.object({
  fullSync: Joi.boolean().default(false),
});

const integrationTypeParamSchema = Joi.object({
  type: Joi.string().valid(...INTEGRATION_TYPES).required(),
});

const syncLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('started', 'in_progress', 'completed', 'partial', 'failed'),
  integrationType: Joi.string().valid(...INTEGRATION_TYPES),
});

module.exports = {
  upsertIntegrationSchema,
  storeCredentialsSchema,
  triggerSyncSchema,
  integrationTypeParamSchema,
  syncLogQuerySchema,
};
