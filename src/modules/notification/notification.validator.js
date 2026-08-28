'use strict';

const Joi = require('joi');
const { NOTIFICATION_TYPE } = require('../../config/constants');

const notificationIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid notification ID format',
    'string.length': 'Invalid notification ID format',
  }),
});

// Query validation runs with stripUnknown, so anything absent here is deleted
// before the service sees it. Omitting page/limit silently disabled pagination:
// the list was stuck on page 1 and the bell's `limit: 5` returned the default 20.
const listNotificationsQuery = Joi.object({
  // Accepts one type or a comma-separated set ("appointment,reminder") so a
  // filter chip covering several types doesn't 400.
  type: Joi.string().custom((value, helpers) => {
    const allowed = Object.values(NOTIFICATION_TYPE);
    const parts = value.split(',').map((t) => t.trim()).filter(Boolean);
    if (!parts.length || parts.some((t) => !allowed.includes(t))) {
      return helpers.error('any.invalid');
    }
    return parts.join(',');
  }).messages({ 'any.invalid': `type must be one or more of: ${Object.values(NOTIFICATION_TYPE).join(', ')}` }),
  isRead: Joi.boolean(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string().trim().max(60),
});

const createNotificationSchema = Joi.object({
  recipient: Joi.string().hex().length(24).required(),
  title: Joi.string().trim().max(200).required(),
  message: Joi.string().trim().max(1000).required(),
  type: Joi.string().valid(...Object.values(NOTIFICATION_TYPE)).default(NOTIFICATION_TYPE.SYSTEM),
  metadata: Joi.object(),
  expiresAt: Joi.date().iso(),
});

module.exports = { notificationIdParamSchema, listNotificationsQuery, createNotificationSchema };
