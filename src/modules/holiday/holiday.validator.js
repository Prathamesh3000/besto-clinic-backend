const Joi = require('joi');

const createHolidaySchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  branches: Joi.array().items(Joi.string().hex().length(24)).default([]),
  isRecurring: Joi.boolean().default(false),
  notes: Joi.string().trim().max(500).allow('', null),
});

const updateHolidaySchema = createHolidaySchema.fork(
  ['name', 'startDate', 'endDate'],
  (field) => field.optional()
);

const holidayIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const listHolidaysQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  year: Joi.number().integer().min(2000).max(2100),
  month: Joi.number().integer().min(1).max(12),
  branchId: Joi.string().hex().length(24),
  isActive: Joi.boolean(),
});

module.exports = {
  createHolidaySchema,
  updateHolidaySchema,
  holidayIdParamSchema,
  listHolidaysQuerySchema,
};
