'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const taskIdAndIdParamSchema = Joi.object({
  taskId: objectId.required(),
  id: objectId.required(),
});

const patientIdParamSchema = Joi.object({
  patientId: objectId.required(),
});

const respondToReminderSchema = Joi.object({
  status: Joi.string().valid('done', 'skipped').required(),
  note: Joi.string().trim().max(500).allow('', null),
});

const listCareTasksQuerySchema = Joi.object({
  patientId: objectId,
  status: Joi.string().valid('active', 'completed', 'deactivated'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

const taskIdParamSchema = Joi.object({
  taskId: objectId.required(),
});

const dependentIdParamSchema = Joi.object({
  dependentId: objectId.required(),
});

const guardianReminderParamSchema = Joi.object({
  dependentId: objectId.required(),
  taskId: objectId.required(),
  id: objectId.required(),
});

const guardianTaskParamSchema = Joi.object({
  dependentId: objectId.required(),
  taskId: objectId.required(),
});

const notificationPreferenceSchema = Joi.object({
  preferredChannel: Joi.string().valid('push', 'sms', 'email').required(),
});

const doctorTaskParamSchema = Joi.object({
  patientId: objectId.required(),
  taskId: objectId.required(),
});

const prescriptionActionParamSchema = Joi.object({
  patientId: objectId.required(),
  prescriptionId: objectId.required(),
});

const batchRespondSchema = Joi.object({
  responses: Joi.array().items(
    Joi.object({
      reminderId: objectId.required(),
      taskId: objectId.required(),
      status: Joi.string().valid('done', 'skipped').required(),
    }),
  ).min(1).max(50).required(),
});

module.exports = {
  idParamSchema,
  taskIdAndIdParamSchema,
  taskIdParamSchema,
  patientIdParamSchema,
  dependentIdParamSchema,
  respondToReminderSchema,
  listCareTasksQuerySchema,
  guardianReminderParamSchema,
  guardianTaskParamSchema,
  notificationPreferenceSchema,
  doctorTaskParamSchema,
  prescriptionActionParamSchema,
  batchRespondSchema,
};
