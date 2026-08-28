'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const createSessionSchema = Joi.object({
  patient: objectId.required(),
  doctor: objectId,
  branch: objectId,
  appointment: objectId,
  type: Joi.string().valid('emergency', 'scheduled', 'follow_up').required(),
  scheduledAt: Joi.date().iso().min('now'),
  maxDuration: Joi.number().integer().min(300).max(7200), // 5 min to 2 hours
  reason: Joi.string().trim().max(1000),
});

const endSessionSchema = Joi.object({
  notes: Joi.string().trim().max(5000).allow(''),
  diagnosis: Joi.string().trim().max(2000).allow(''),
});

const cancelSessionSchema = Joi.object({
  reason: Joi.string().trim().max(1000),
});

const consentSchema = Joi.object({
  consent: Joi.boolean().required(),
});

const sendMessageSchema = Joi.object({
  content: Joi.string().trim().min(1).max(5000).required(),
  type: Joi.string().valid('text', 'file', 'image', 'system').default('text'),
  // Client-generated correlation id, echoed back on the chat:message broadcast so
  // the sender can swap its optimistic message for the persisted one. Without it
  // declared here, validate()'s stripUnknown drops it and the bubble stays pending.
  clientId: Joi.string().trim().max(64),
  attachment: Joi.object({
    name: Joi.string().max(255).required(),
    url: Joi.string().uri().required(),
    mimeType: Joi.string().max(100).required(),
    size: Joi.number().integer().min(0).max(50 * 1024 * 1024), // 50MB max
  }).when('type', { is: Joi.valid('file', 'image'), then: Joi.required() }),
});

const shareFileSchema = Joi.object({
  name: Joi.string().max(255).required(),
  // Scheme allowlist: this URL is rendered directly into an <img src> and a
  // download link in the chat thread, and Joi's default uri() happily accepts
  // "javascript:alert(1)". http/https/data covers hosted files and the inline
  // base64 data: URIs the web client produces for small uploads.
  url: Joi.string().uri({ scheme: ['http', 'https', 'data'] }).required(),
  mimeType: Joi.string().max(100).required(),
  size: Joi.number().integer().min(0).max(50 * 1024 * 1024),
  clientId: Joi.string().trim().max(64),
});

const connectionEventSchema = Joi.object({
  event: Joi.string().valid('joined', 'left', 'reconnected', 'disconnected').required(),
  metadata: Joi.object().unknown(true),
});

const declineSessionSchema = Joi.object({
  reason: Joi.string().trim().max(500),
});

const markReadParamSchema = Joi.object({
  id: objectId.required(),
  msgId: objectId.required(),
});

const presenceSchema = Joi.object({
  status: Joi.string().valid('online', 'busy', 'dnd', 'offline').required(),
});

const sessionIdParamSchema = Joi.object({
  id: objectId.required(),
});

const sessionIdWithSubParamSchema = Joi.object({
  id: objectId.required(),
  subId: objectId,
});

const extendSessionSchema = Joi.object({});

module.exports = {
  createSessionSchema,
  endSessionSchema,
  cancelSessionSchema,
  consentSchema,
  sendMessageSchema,
  shareFileSchema,
  connectionEventSchema,
  declineSessionSchema,
  markReadParamSchema,
  presenceSchema,
  sessionIdParamSchema,
  sessionIdWithSubParamSchema,
  extendSessionSchema,
};
