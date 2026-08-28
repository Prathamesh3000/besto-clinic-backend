'use strict';

const Joi = require('joi');
const { QUEUE_PRIORITY } = require('../../config/constants');

const createQueueSchema = Joi.object({
  patient: Joi.string().hex().length(24).required(),
  doctor: Joi.string().hex().length(24).required(),
  branch: Joi.string().hex().length(24).required(),
  department: Joi.string().hex().length(24),
  appointment: Joi.string().hex().length(24),
  priority: Joi.string().valid(...Object.values(QUEUE_PRIORITY)),
  notes: Joi.string().trim().max(500),
});

const updateQueueStatusSchema = Joi.object({
  reason: Joi.string().trim().max(500),
});

const queueIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const changePrioritySchema = Joi.object({
  priority: Joi.string().valid(...Object.values(QUEUE_PRIORITY)).required(),
});

const swapPositionsSchema = Joi.object({
  entryA: Joi.string().hex().length(24).required(),
  entryB: Joi.string().hex().length(24).required(),
});

const movePositionSchema = Joi.object({
  direction: Joi.string().valid('up', 'down').required(),
});

module.exports = {
  createQueueSchema,
  updateQueueStatusSchema,
  queueIdParamSchema,
  changePrioritySchema,
  swapPositionsSchema,
  movePositionSchema,
};
