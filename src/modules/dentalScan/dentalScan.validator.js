'use strict';

const Joi = require('joi');

const initiateScanSchema = Joi.object({
  consentGiven: Joi.boolean().valid(true).required().messages({
    'any.only': 'Consent must be given to proceed with dental scan',
    'any.required': 'Consent is required to proceed with dental scan',
  }),
  scanType: Joi.string()
    .valid('intraoral', 'xray', 'general')
    .default('general'),
  scanMode: Joi.string()
    .valid('guided_3pos', 'classic_5angle')
    .default('guided_3pos'),
});

const uploadImageSchema = Joi.object({
  imageData: Joi.string().required().messages({
    'any.required': 'Image data (base64) is required',
  }),
  mimeType: Joi.string()
    .valid('image/jpeg', 'image/png', 'image/webp')
    .default('image/jpeg'),
  angle: Joi.string()
    .valid('front', 'left', 'right', 'upper', 'lower', 'tongue')
    .required()
    .messages({
      'any.required': 'Capture angle is required',
      'any.only': 'Angle must be one of: front, left, right, upper, lower, tongue',
    }),
});

const scanIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid scan ID format',
    'string.length': 'Invalid scan ID format',
  }),
});

const reviewScanSchema = Joi.object({
  verdict: Joi.string()
    .valid('confirmed', 'modified', 'rejected')
    .required(),
  clinicalNotes: Joi.string().trim().max(5000),
  modifiedFindings: Joi.array().items(Joi.object({
    condition:   Joi.string().trim().required(),
    confidence:  Joi.number().min(0).max(1),
    severity:    Joi.string().valid('low', 'moderate', 'high', 'critical'),
    location:    Joi.string().trim(),
    description: Joi.string().trim(),
  })).when('verdict', { is: 'modified', then: Joi.required() }),
  recommendations: Joi.string().trim().max(3000),
  urgency: Joi.string()
    .valid('none', 'routine', 'soon', 'urgent')
    .default('routine'),
});

const recommendationQuerySchema = Joi.object({
  branch: Joi.string().hex().length(24).messages({
    'string.hex': 'Invalid branch ID format',
    'string.length': 'Invalid branch ID format',
  }),
});

// ── NEW: Real-time validation schemas ──

const validateFrameSchema = Joi.object({
  imageData: Joi.string().required().messages({
    'any.required': 'Image data (base64) is required for validation',
  }),
  expectedAngle: Joi.string()
    .valid('front', 'left', 'right', 'tongue')
    .required()
    .messages({
      'any.required': 'Expected angle is required',
      'any.only': 'Expected angle must be: front, left, right, or tongue',
    }),
  mimeType: Joi.string()
    .valid('image/jpeg', 'image/png', 'image/webp')
    .default('image/jpeg'),
});

const detectTeethSchema = Joi.object({
  imageData: Joi.string().required().messages({
    'any.required': 'Image data (base64) is required for tooth detection',
  }),
  angle: Joi.string()
    .valid('front', 'left', 'right', 'tongue')
    .required()
    .messages({
      'any.required': 'Angle is required',
      'any.only': 'Angle must be: front, left, right, or tongue',
    }),
  mimeType: Joi.string()
    .valid('image/jpeg', 'image/png', 'image/webp')
    .default('image/jpeg'),
});

module.exports = {
  initiateScanSchema,
  uploadImageSchema,
  scanIdParamSchema,
  reviewScanSchema,
  recommendationQuerySchema,
  validateFrameSchema,
  detectTeethSchema,
};
