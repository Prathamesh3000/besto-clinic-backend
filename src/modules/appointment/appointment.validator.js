'use strict';

const Joi = require('joi');
const { APPOINTMENT_STATUS } = require('../../config/constants');

const createAppointmentSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  doctor: Joi.string().hex().length(24).required(),
  scheduledAt: Joi.date().iso().greater('now').required()
    .messages({ 'date.greater': 'Appointment must be in the future' }),
  duration: Joi.number().integer().min(10).max(240).default(30),
  type: Joi.string().valid('consultation', 'follow_up', 'emergency', 'teleconsult').default('consultation'),
  reason: Joi.string().trim().max(500),
  notes: Joi.string().trim().max(2000),
  branch: Joi.string().hex().length(24),
  source: Joi.string().valid('general', 'chatbot', 'walk_in', 'portal', 'follow_up', 'doctor_mobile').default('general'),
  reminderTimings: Joi.array().items(
    Joi.number().integer().min(0).max(10080),
  ).max(5).optional(),
});

const updateAppointmentSchema = Joi.object({
  scheduledAt: Joi.date().iso(),
  duration: Joi.number().integer().min(10).max(240),
  type: Joi.string().valid('consultation', 'follow_up', 'emergency', 'teleconsult'),
  status: Joi.string().valid(...Object.values(APPOINTMENT_STATUS)),
  reason: Joi.string().trim().max(500),
  notes: Joi.string().trim().max(2000),
  cancelReason: Joi.string().trim().max(500),
  reminderTimings: Joi.array().items(
    Joi.number().integer().min(0).max(10080),
  ).max(5).optional(),
}).min(1);

const appointmentIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

module.exports = { createAppointmentSchema, updateAppointmentSchema, appointmentIdParamSchema };
