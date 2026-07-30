'use strict';

const Joi = require('joi');

const createDoctorSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
  specialization: Joi.string().trim().max(100),
  licenseNumber: Joi.string().trim().max(50),
  consultationFee: Joi.number().min(0),
  branch: Joi.string().hex().length(24),
  department: Joi.string().hex().length(24).allow('', null).optional(),
  employeeId: Joi.string().trim(),
});

const doctorProfileSchema = Joi.object({
  bio: Joi.string().trim().max(1000).allow(''),
  education: Joi.array().items(Joi.object({
    degree: Joi.string().trim().max(100).required(),
    institution: Joi.string().trim().max(200).required(),
    year: Joi.number().integer().min(1950).max(2040).required(),
  })).max(10),
  experienceYears: Joi.number().integer().min(0).max(60),
  languages: Joi.array().items(Joi.string().trim()).max(10),
  qualifications: Joi.array().items(Joi.string().trim()).max(10),
  achievements: Joi.array().items(Joi.string().trim().max(200)).max(10),
  acceptingNewPatients: Joi.boolean(),
});

const updateDoctorSchema = createDoctorSchema
  .fork(
    ['name', 'email', 'password'],
    (field) => field.optional(),
  )
  .keys({
    doctorProfile: doctorProfileSchema,
    isFeaturedOnPlatform: Joi.boolean(),
  })
  .min(1);

const doctorIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid doctor ID format',
    'string.length': 'Invalid doctor ID format',
  }),
});

const bulkDoctorRowSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().trim().min(10).max(15),
  password: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
  specialization: Joi.string().trim().max(100),
  licenseNumber: Joi.string().trim().max(50),
  consultationFee: Joi.number().min(0),
  branch: Joi.string().hex().length(24),
  branchCode: Joi.string().trim(),
  department: Joi.string().hex().length(24).allow('', null).optional(),
  employeeId: Joi.string().trim(),
});

const bulkCreateDoctorSchema = Joi.object({
  rows: Joi.array().items(bulkDoctorRowSchema).min(1).max(500).required(),
});

module.exports = { createDoctorSchema, updateDoctorSchema, doctorIdParamSchema, bulkCreateDoctorSchema };
