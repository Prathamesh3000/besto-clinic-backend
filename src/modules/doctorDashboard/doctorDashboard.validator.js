'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const startConsultationSchema = Joi.object({
  appointmentId: objectId.required(),
  roomId: objectId.optional(),
  diagnosis: Joi.string().trim().max(2000).allow(''),
  treatment: Joi.string().trim().max(2000).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
});

const updateConsultationSchema = Joi.object({
  diagnosis: Joi.string().trim().max(2000).allow(''),
  treatment: Joi.string().trim().max(2000).allow(''),
  chiefComplaint: Joi.string().trim().max(2000).allow(''),
  medicalHistory: Joi.string().trim().max(2000).allow(''),
  allergies: Joi.string().trim().max(2000).allow(''),
  vitals: Joi.object({
    bloodPressure: Joi.string().trim().max(50).allow(''),
    heartRate: Joi.string().trim().max(50).allow(''),
    temperature: Joi.string().trim().max(50).allow(''),
    spo2: Joi.string().trim().max(50).allow(''),
    weight: Joi.string().trim().max(50).allow(''),
    height: Joi.string().trim().max(50).allow(''),
    respiratoryRate: Joi.string().trim().max(50).allow(''),
  }).unknown(true).allow(null),
  examination: Joi.string().trim().max(2000).allow(''),
  oralFindings: Joi.string().trim().max(2000).allow(''),
  severity: Joi.string().valid('mild', 'moderate', 'severe').allow(null, ''),
  assessmentNotes: Joi.string().trim().max(2000).allow(''),
  treatmentPlan: Joi.string().trim().max(4000).allow(''),
  followUpInstructions: Joi.string().trim().max(2000).allow(''),
  procedure: Joi.string().trim().max(200).allow(''),
  priority: Joi.string().valid('immediate', 'urgent', 'routine').allow(null, ''),
  estimatedCost: Joi.number().min(0).max(10000000).allow(null, ''),
  visitType: Joi.string().trim().max(100).allow(''),
  patientConsent: Joi.string().trim().max(200).allow(''),
  teeth: Joi.array().items(
    Joi.object({
      tooth: Joi.number().integer().min(11).max(48).required(),
      conditions: Joi.array().items(Joi.string().trim().max(50)).max(10),
    }),
  ).max(32),
  prescription: Joi.array().items(
    Joi.object({
      medication: Joi.string().trim().max(200).required(),
      dosage: Joi.string().trim().max(100).allow(''),
      frequency: Joi.string().trim().max(100).allow(''),
      duration: Joi.string().trim().max(100).allow(''),
      notes: Joi.string().trim().max(500).allow(''),
    }),
  ).max(20),
  careTasks: Joi.array().items(
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
      customTimes: Joi.array().items(Joi.string().trim().max(20)).max(10),
      enabled: Joi.boolean().default(true),
      reminderEnabled: Joi.boolean().default(true),
    }),
  ).max(30),
  materialsUsed: Joi.array().items(
    Joi.object({
      item: Joi.string().hex().length(24).required(),
      itemName: Joi.string().trim().max(200).required(),
      quantity: Joi.number().integer().min(1).max(9999).required(),
      costPerUnit: Joi.number().min(0).max(10000000).default(0),
    }),
  ).max(50),
  doctorSignature: Joi.string().max(500000).allow('', null),
  reminderConfig: Joi.object().unknown(true),
  notes: Joi.string().trim().max(2000).allow(''),
  followUpDate: Joi.date().iso().greater('now').allow(null),
}).min(1);

const completeConsultationSchema = Joi.object({
  doctorSignature: Joi.object({
    dataUrl: Joi.string().max(500000).required(),
    ipAddress: Joi.string().max(45).allow(''),
  }).required(),
  reminderConfig: Joi.object().unknown(true),
});

const uploadAttachmentSchema = Joi.object({
  treatmentId: objectId.required(),
  fileData: Joi.string().base64().max(14 * 1024 * 1024).required(), // ~10MB binary
  fileName: Joi.string().trim().max(255).required(),
  mimeType: Joi.string().valid(
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'application/dicom',
  ).required(),
});

const createFollowUpSchema = Joi.object({
  treatmentId: objectId.required(),
  followUpDate: Joi.date().iso().greater('now').required(),
  message: Joi.string().trim().max(500).allow(''),
});

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const treatmentIdParamSchema = Joi.object({
  treatmentId: objectId.required(),
});

const appointmentIdParamSchema = Joi.object({
  appointmentId: objectId.required(),
});

const updateDoctorProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  phone: Joi.string().trim().max(20),
  specialization: Joi.string().trim().max(100).allow(''),
  consultationFee: Joi.number().min(0).max(100000),
}).min(1);

module.exports = {
  startConsultationSchema,
  updateConsultationSchema,
  completeConsultationSchema,
  uploadAttachmentSchema,
  createFollowUpSchema,
  idParamSchema,
  treatmentIdParamSchema,
  appointmentIdParamSchema,
  updateDoctorProfileSchema,
};
