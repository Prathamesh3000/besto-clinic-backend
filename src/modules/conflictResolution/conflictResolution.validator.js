'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const detectConflictsSchema = Joi.object({
  doctorId: objectId.required(),
  date: Joi.date().iso().required(),
  overrideType: Joi.string().valid('day_off', 'custom_hours', 'extra_day').required(),
  overrideSlots: Joi.array().items(Joi.object({
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  })).default([]),
  overrideId: objectId.allow(null).default(null),
});

const detectLeaveConflictsSchema = Joi.object({
  doctorId: objectId.required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  leaveId: objectId.allow(null).default(null),
});

const nextSlotsQuerySchema = Joi.object({
  doctorId: objectId.required(),
  branchId: objectId.required(),
  afterDate: Joi.date().iso().required(),
  limit: Joi.number().integer().min(1).max(20).default(5),
});

const appointmentIdParamSchema = Joi.object({
  id: objectId.required(),
});

const rescheduleSchema = Joi.object({
  newScheduledAt: Joi.date().iso().required(),
  reason: Joi.string().max(500).required(),
});

const cancelReasonSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

const markContactedSchema = Joi.object({
  notes: Joi.string().max(500).allow('', null).default('Patient contacted by staff'),
});

const bulkCancelSchema = Joi.object({
  appointmentIds: Joi.array().items(objectId.required()).min(1).max(50).required(),
  reason: Joi.string().max(500).required(),
});

module.exports = {
  detectConflictsSchema,
  detectLeaveConflictsSchema,
  nextSlotsQuerySchema,
  appointmentIdParamSchema,
  rescheduleSchema,
  cancelReasonSchema,
  markContactedSchema,
  bulkCancelSchema,
};
