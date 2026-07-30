'use strict';

const Joi = require('joi');
const { NOTIFICATION_TYPE } = require('../../config/constants');

const notificationIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid notification ID format',
    'string.length': 'Invalid notification ID format',
  }),
});

const listNotificationsQuery = Joi.object({
  type: Joi.string().valid(...Object.values(NOTIFICATION_TYPE)),
  isRead: Joi.boolean(),
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
