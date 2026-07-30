'use strict';

const Joi = require('joi');

const TEMPLATE_CATEGORY = [
  'general', 'diagnostic', 'preventive', 'restorative',
  'endodontic', 'periodontic', 'orthodontic', 'prosthodontic',
  'surgical', 'cosmetic',
];

const objectId = Joi.string().hex().length(24);

const templateBodySchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  code: Joi.string().trim().uppercase().max(30).required(),
  category: Joi.string().valid(...TEMPLATE_CATEGORY).required(),
  description: Joi.string().trim().max(1000).allow(''),
  chiefComplaint: Joi.string().trim().allow(''),
  diagnosis: Joi.string().trim().allow(''),
  treatment: Joi.string().trim().allow(''),
  treatmentPlan: Joi.string().trim().allow(''),
  notes: Joi.string().trim().allow(''),
  followUpInstructions: Joi.string().trim().allow(''),
  defaultPrescriptions: Joi.array().items(
    Joi.object({
      medication: Joi.string().trim().max(200).required(),
      dosage: Joi.string().trim().max(100).allow(''),
      frequency: Joi.string().trim().max(100).allow(''),
      duration: Joi.string().trim().max(100).allow(''),
      notes: Joi.string().trim().max(500).allow(''),
    }),
  ).max(20),
  defaultCareTasks: Joi.array().items(
    Joi.object({
      title: Joi.string().trim().max(200).required(),
      taskType: Joi.string().valid(
        'medication', 'hygiene', 'post_care', 'follow_up', 'dietary', 'custom',
      ).default('custom'),
      instructions: Joi.string().trim().max(500).allow(''),
      frequency: Joi.string().valid(
        'once', 'twice_daily', 'thrice_daily', 'four_times_daily',
        'after_meals', 'before_meals', 'bedtime', 'custom',
      ).default('once'),
    }),
  ).max(20),
  defaultMaterials: Joi.array().items(
    Joi.object({
      item: Joi.string().hex().length(24).required(),
      itemName: Joi.string().trim().max(200).required(),
      quantity: Joi.number().integer().min(1).max(9999).default(1),
      costPerUnit: Joi.number().min(0).max(10000000).default(0),
    }),
  ).max(50),
  defaultProcedure: Joi.string().trim().max(200).allow(''),
  defaultPriority: Joi.string().valid('immediate', 'urgent', 'routine', null).allow(null),
});

const updateTemplateSchema = templateBodySchema.fork(
  ['name', 'code', 'category'],
  (schema) => schema.optional(),
).min(1);

const idParamSchema = Joi.object({
  id: objectId.required(),
});

module.exports = {
  templateBodySchema,
  updateTemplateSchema,
  idParamSchema,
};
