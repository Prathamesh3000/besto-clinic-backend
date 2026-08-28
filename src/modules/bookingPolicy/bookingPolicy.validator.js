'use strict';

const Joi = require('joi');

const updateBookingPolicySchema = Joi.object({
  // ── Scheduling Defaults ──
  slotDuration: Joi.number().integer().min(10).max(120).allow(null).optional(),
  bufferMinutes: Joi.number().integer().min(0).max(60).allow(null).optional(),
  minNoticeMinutes: Joi.number().integer().min(0).max(10080).allow(null).optional(),
  maxAdvanceDays: Joi.number().integer().min(1).max(365).allow(null).optional(),

  // ── Cancellation ──
  cancellationCutoffMin: Joi.number().integer().min(0).max(10080).allow(null).optional(),

  // ── Reschedule ──
  rescheduleCutoffMin: Joi.number().integer().min(0).max(10080).allow(null).optional(),
  maxReschedulesPerAppt: Joi.number().integer().min(1).max(50).allow(null).optional(),

  // ── No-Show ──
  noShowBlockThreshold: Joi.number().integer().min(1).max(100).allow(null).optional(),

  // ── Check-in Window ──
  checkInWindowBeforeMin: Joi.number().integer().min(5).max(1440).allow(null).optional(),
  checkInWindowAfterMin: Joi.number().integer().min(0).max(240).allow(null).optional(),

  // ── Confirmation ──
  autoConfirm: Joi.boolean().allow(null).optional(),

  // ── Appointment Type Durations ──
  appointmentTypeDurations: Joi.object().pattern(
    Joi.string().valid('consultation', 'follow_up', 'procedure', 'emergency', 'teleconsult'),
    Joi.number().integer().min(10).max(240),
  ).allow(null).optional(),

  // ── Reminders ──
  defaultReminderTimings: Joi.array().items(
    Joi.number().integer().min(0).max(10080),
  ).max(10).allow(null).optional(),
});

module.exports = { updateBookingPolicySchema };
