'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const appointmentIdParamSchema = Joi.object({
  appointmentId: objectId.required(),
});

const createSchema = Joi.object({
  appointmentId: objectId.required(),
  procedureId: objectId.required(),
  branch: objectId.required(),
});

module.exports = {
  idParamSchema,
  appointmentIdParamSchema,
  createSchema,
};
