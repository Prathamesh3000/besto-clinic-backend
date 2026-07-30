'use strict';

const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid('patient', 'guardian').default('patient'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
  deviceId: Joi.string().trim().max(128),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(128).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required()
    .disallow(Joi.ref('currentPassword'))
    .messages({ 'any.invalid': 'New password must be different from current password' }),
});

const registerDeviceSchema = Joi.object({
  fcmToken: Joi.string().trim().required(),
  deviceId: Joi.string().trim().max(128).required(),
  platform: Joi.string().valid('android', 'ios', 'web').default('android'),
});

const reminderSettingsSchema = Joi.object({
  defaultReminderTimings: Joi.array().items(
    Joi.number().integer().min(0).max(10080),
  ).min(1).max(5).required(),
});

const testNotificationSchema = Joi.object({
  type: Joi.string().valid('appointment_reminder', 'care_reminder', 'general').default('general'),
  title: Joi.string().trim().max(200),
  body: Joi.string().trim().max(500),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  registerDeviceSchema,
  reminderSettingsSchema,
  testNotificationSchema,
};
