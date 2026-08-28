'use strict';

const Joi = require('joi');

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const slotSchema = Joi.object({
  startTime: Joi.string().pattern(timePattern).required(),
  endTime: Joi.string().pattern(timePattern).required(),
  label: Joi.string().max(50).allow('', null).default(null),
}).custom((value, helpers) => {
  if (toMinutes(value.endTime) <= toMinutes(value.startTime)) {
    return helpers.error('any.custom', { message: 'endTime must be after startTime' });
  }
  return value;
});

const dayScheduleSchema = Joi.object({
  day: Joi.string().valid(...days).required(),
  isWorking: Joi.boolean().required(),
  slots: Joi.array().items(slotSchema).max(5).default([]),
  // Legacy fields — accepted for backward compat
  startTime: Joi.string().pattern(timePattern).allow(null).default(null),
  endTime: Joi.string().pattern(timePattern).allow(null).default(null),
  breakStart: Joi.string().pattern(timePattern).allow(null).default(null),
  breakEnd: Joi.string().pattern(timePattern).allow(null).default(null),
}).custom((value, helpers) => {
  // Validate no overlapping slots
  if (value.slots && value.slots.length > 1) {
    const sorted = [...value.slots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) {
        return helpers.error('any.custom', { message: `Slots overlap: ${sorted[i - 1].endTime} and ${sorted[i].startTime}` });
      }
    }
  }
  return value;
});

const scheduleSchema = Joi.object({
  branch: Joi.string().hex().length(24).required(),
  slotDuration: Joi.number().integer().min(10).max(120).default(30),
  bufferMinutes: Joi.number().integer().min(0).max(60).default(0),
  minNoticeMinutes: Joi.number().integer().min(0).max(10080).default(60),
  maxAdvanceDays: Joi.number().integer().min(1).max(365).default(60),
  weeklySchedule: Joi.array().items(dayScheduleSchema).min(1).max(7).required(),
}).custom((value, helpers) => {
  // Reject duplicate days in weeklySchedule
  const seen = new Set();
  for (const entry of value.weeklySchedule) {
    if (seen.has(entry.day)) {
      return helpers.error('any.custom', { message: `Duplicate day in weeklySchedule: ${entry.day}` });
    }
    seen.add(entry.day);
  }
  return value;
});

const leaveSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  reason: Joi.string().max(500).allow('', null),
  leaveType: Joi.string().valid('planned', 'sick', 'personal', 'conference', 'other').default('planned'),
  branch: Joi.string().hex().length(24).allow(null).default(null),
});

const doctorIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const leaveIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  leaveId: Joi.string().hex().length(24).required(),
});

const overrideSchema = Joi.object({
  branch: Joi.string().hex().length(24).required(),
  date: Joi.date().iso().required(),
  type: Joi.string().valid('custom_hours', 'day_off', 'extra_day').required(),
  slots: Joi.array().items(slotSchema).max(5).default([]),
  // Legacy fields — accepted for backward compat
  startTime: Joi.string().pattern(timePattern).allow(null).default(null),
  endTime: Joi.string().pattern(timePattern).allow(null).default(null),
  breakStart: Joi.string().pattern(timePattern).allow(null).default(null),
  breakEnd: Joi.string().pattern(timePattern).allow(null).default(null),
  reason: Joi.string().max(200).allow('', null),
}).custom((value, helpers) => {
  if (value.type === 'custom_hours' || value.type === 'extra_day') {
    const hasSlots = value.slots && value.slots.length > 0;
    const hasLegacy = value.startTime && value.endTime;
    if (!hasSlots && !hasLegacy) {
      return helpers.error('any.custom', { message: 'Either slots[] or startTime+endTime required for custom_hours and extra_day' });
    }
  }
  return value;
});

const overrideIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  overrideId: Joi.string().hex().length(24).required(),
});

const selfOverrideIdParamSchema = Joi.object({
  overrideId: Joi.string().hex().length(24).required(),
});

const selfLeaveIdParamSchema = Joi.object({
  leaveId: Joi.string().hex().length(24).required(),
});

module.exports = {
  scheduleSchema,
  slotSchema,
  leaveSchema,
  doctorIdParamSchema,
  leaveIdParamSchema,
  overrideSchema,
  overrideIdParamSchema,
  selfOverrideIdParamSchema,
  selfLeaveIdParamSchema,
};
