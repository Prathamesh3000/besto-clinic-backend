'use strict';

const Joi = require('joi');
const { TREATMENT_PLAN_STATUS, COMPLAINT_ACTION } = require('../../config/constants');

const objectId = Joi.string().hex().length(24);

const plannedStepSchema = Joi.object({
  sittingNumber: Joi.number().integer().min(1).required(),
  description: Joi.string().trim().max(500).required(),
  estimatedCost: Joi.number().min(0),
});

const createPlanSchema = Joi.object({
  patient: objectId.required(),
  doctor: objectId.required(),
  title: Joi.string().trim().min(3).max(200).required(),
  diagnosis: Joi.string().trim().max(2000).allow('', null),
  teeth: Joi.array().items(Joi.number().integer().min(11).max(85)).max(32),
  totalSittings: Joi.number().integer().min(1).max(100).required(),
  plannedSteps: Joi.array().items(plannedStepSchema).max(100),
  estimatedCost: Joi.number().min(0),
  startDate: Joi.date(),
  expectedEndDate: Joi.date().min(Joi.ref('startDate')),
  consent: Joi.object({
    given: Joi.boolean().required(),
    date: Joi.date(),
    notes: Joi.string().trim().max(1000).allow('', null),
  }),
});

/**
 * Every field optional, but at least one required — the service decides which
 * are still editable based on whether the course has started.
 */
const updatePlanSchema = Joi.object({
  patient: objectId,
  doctor: objectId,
  title: Joi.string().trim().min(3).max(200),
  diagnosis: Joi.string().trim().max(2000).allow('', null),
  teeth: Joi.array().items(Joi.number().integer().min(11).max(85)).max(32),
  totalSittings: Joi.number().integer().min(1).max(100),
  plannedSteps: Joi.array().items(plannedStepSchema).max(100),
  estimatedCost: Joi.number().min(0),
  expectedEndDate: Joi.date(),
  consent: Joi.object({
    given: Joi.boolean().required(),
    date: Joi.date(),
    notes: Joi.string().trim().max(1000).allow('', null),
  }),
}).min(1);

const changeStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(TREATMENT_PLAN_STATUS)).required(),
  // Required for abandonment specifically; enforced in the service so the
  // message can explain why.
  reason: Joi.string().trim().max(500).allow('', null),
});

const addendumSchema = Joi.object({
  note: Joi.string().trim().min(3).max(2000).required(),
  reason: Joi.string().trim().max(500).allow('', null),
});

/** `sittingNumber` is absent on purpose — the service derives it. */
const addSittingSchema = Joi.object({
  doctor: objectId,
  appointment: objectId,
  date: Joi.date(),
  procedure: Joi.string().trim().max(500).when('patientAttended', {
    is: false,
    then: Joi.optional().allow('', null),
    otherwise: Joi.required(),
  }),
  diagnosis: Joi.string().trim().max(2000).allow('', null),
  notes: Joi.string().trim().max(4000).allow('', null),
  nextStep: Joi.string().trim().max(2000).allow('', null),
  teeth: Joi.array().items(
    Joi.object({
      tooth: Joi.number().integer().min(11).max(85).required(),
      conditions: Joi.array().items(Joi.string().trim().max(100)),
    }),
  ).max(32),
  patientAttended: Joi.boolean().default(true),
  painLevel: Joi.number().integer().min(0).max(10).allow(null),
  // Defaults false: a sitting is finished only when the doctor says so.
  completed: Joi.boolean().default(false),
});

const setCompletionSchema = Joi.object({
  completed: Joi.boolean().required(),
  date: Joi.date(),
});

const complaintSchema = Joi.object({
  painLevel: Joi.number().integer().min(0).max(10).required(),
  symptoms: Joi.string().trim().max(1000).required(),
  followUpAction: Joi.string().valid(...Object.values(COMPLAINT_ACTION)),
  actionNotes: Joi.string().trim().max(1000).allow('', null),
  reportedAt: Joi.date(),
});

const resolveComplaintSchema = Joi.object({
  note: Joi.string().trim().max(1000).allow('', null),
});

const planIdParamSchema = Joi.object({
  id: objectId.required().messages({
    'string.hex': 'Invalid treatment plan ID format',
    'string.length': 'Invalid treatment plan ID format',
  }),
});

const sittingIdParamSchema = Joi.object({
  id: objectId.required(),
  sittingId: objectId.required(),
});

const complaintIdParamSchema = Joi.object({
  sittingId: objectId.required(),
  complaintId: objectId.required(),
});

const patientIdParamSchema = Joi.object({
  patientId: objectId.required().messages({
    'string.hex': 'Invalid patient ID format',
    'string.length': 'Invalid patient ID format',
  }),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  changeStatusSchema,
  addendumSchema,
  addSittingSchema,
  setCompletionSchema,
  complaintSchema,
  resolveComplaintSchema,
  planIdParamSchema,
  sittingIdParamSchema,
  complaintIdParamSchema,
  patientIdParamSchema,
};
