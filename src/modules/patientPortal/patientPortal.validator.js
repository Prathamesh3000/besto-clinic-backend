'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const patientIdParamSchema = Joi.object({
  patientId: objectId.required(),
});

const idParamSchema = Joi.object({
  id: objectId.required(),
});

const bookAppointmentSchema = Joi.object({
  // patientId is required so guardian users can explicitly target a specific
  // patient. Without it `stripUnknown: true` would drop it and the service
  // would fall back to "any patient linked to this user" — wrong for guardians.
  patientId: objectId.required(),
  doctor: objectId.required(),
  scheduledAt: Joi.date().iso().greater('now').required(),
  duration: Joi.number().integer().min(10).max(240).default(30),
  type: Joi.string().valid('consultation', 'follow_up', 'procedure', 'teleconsult').required(),
  // `reason` is optional — Joi's plain string rejects '' by default so we
  // explicitly allow empty / null to avoid "not allowed to be empty" failures
  // when the patient leaves the notes field blank.
  reason: Joi.string().trim().max(500).allow('', null),
  branch: objectId,
  source: Joi.string().valid('general', 'chatbot', 'walk_in', 'portal').default('chatbot'),
  consultationFee: Joi.number().min(0).max(100000),
});

const verifyPaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  appointmentId: objectId.required(),
});

const verifyInvoicePaymentSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  invoiceId: objectId.required(),
  patientId: objectId.required(),
});

const cancelAppointmentSchema = Joi.object({
  reason: Joi.string().trim().max(500).required(),
});

const rescheduleSchema = Joi.object({
  scheduledAt: Joi.date().iso().greater('now').required(),
});

const emergencySchema = Joi.object({
  type: Joi.string().valid('chat', 'video').required(),
  reason: Joi.string().trim().max(1000).allow('', null),
  branch: objectId,
});

const shareTokenSchema = Joi.object({
  recordType: Joi.string().valid('treatment', 'prescription', 'invoice', 'all').required(),
  // recordId is required when sharing a specific record type.
  // Only 'all' can omit it.
  recordId: Joi.when('recordType', {
    is: 'all',
    then: objectId.optional(),
    otherwise: objectId.required(),
  }),
  sharedWith: Joi.string().trim().max(200),
  expiresInHours: Joi.number().integer().min(1).max(720).default(24),
  maxAccesses: Joi.number().integer().min(1).max(100).default(10),
});

const shareViewParamSchema = Joi.object({
  token: Joi.string().hex().length(64).required(),
});

const uploadInsuranceSchema = Joi.object({
  fileData: Joi.string().base64().max(14 * 1024 * 1024).required(),
  fileName: Joi.string().trim().max(255).required(),
  mimeType: Joi.string().valid('image/jpeg', 'image/png', 'application/pdf').required(),
});

const reviewSchema = Joi.object({
  appointmentId: objectId.required(),
  doctor: objectId.required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().trim().max(100),
  comment: Joi.string().trim().max(1000),
  isAnonymous: Joi.boolean().default(false),
});

const paymentParamSchema = Joi.object({
  invoiceId: objectId.required(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  status: Joi.string().trim(),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

const accessLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  resource: Joi.string().valid(
    'profile', 'appointment', 'treatment', 'prescription',
    'invoice', 'consent', 'insurance', 'review', 'share_token',
  ),
  accessType: Joi.string().valid('view', 'download', 'share', 'export', 'create', 'update', 'cancel', 'revoke'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  phone: Joi.string().trim().max(20),
  dateOfBirth: Joi.string().trim().allow(''),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').allow(''),
  bloodGroup: Joi.string().trim().max(10).allow(''),
  address: Joi.object({
    street: Joi.string().trim().max(200).allow(''),
    city: Joi.string().trim().max(100).allow(''),
    state: Joi.string().trim().max(100).allow(''),
    zipCode: Joi.string().trim().max(20).allow(''),
    country: Joi.string().trim().max(100).allow(''),
  }),
  emergencyContact: Joi.object({
    name: Joi.string().trim().max(100).allow(''),
    phone: Joi.string().trim().max(20).allow(''),
    relationship: Joi.string().trim().max(50).allow(''),
  }),
}).min(1);

const confirmAttendanceSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'declined').required(),
});

const patientIdQuerySchema = Joi.object({
  patientId: objectId.required(),
});

// ── Dependent management ──────────────────────────────────────────

// Upgrading a patient account to guardian carries the same responsibility the
// consent text describes, so it is accepted explicitly rather than implied.
const becomeGuardianSchema = Joi.object({
  consentAccepted: Joi.boolean().valid(true).required()
    .messages({ 'any.only': 'You must accept the guardian responsibility agreement' }),
});

const createDependentSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  dateOfBirth: Joi.date().max('now').required(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  phone: Joi.string().trim().max(20),
  bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  allergies: Joi.array().items(Joi.string().trim()),
  medicalHistory: Joi.object({
    conditions: Joi.array().items(Joi.string().trim()),
    medications: Joi.array().items(Joi.string().trim()),
    surgeries: Joi.array().items(Joi.string().trim()),
  }),
  consentAccepted: Joi.boolean().valid(true).required().messages({
    'any.only': 'You must accept the guardian consent agreement',
  }),
});

const updateDependentSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100),
  lastName: Joi.string().trim().min(1).max(100),
  dateOfBirth: Joi.date().max('now'),
  gender: Joi.string().valid('male', 'female', 'other'),
  phone: Joi.string().trim().max(20),
  bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  allergies: Joi.array().items(Joi.string().trim()),
  medicalHistory: Joi.object({
    conditions: Joi.array().items(Joi.string().trim()),
    medications: Joi.array().items(Joi.string().trim()),
    surgeries: Joi.array().items(Joi.string().trim()),
  }),
}).min(1);

const detachDependentSchema = Joi.object({
  email: Joi.string().email().required(),
  phone: Joi.string().trim().min(5).max(20).required(),
  password: Joi.string().min(8).max(128).required(),
});

const dependentIdParamSchema = Joi.object({
  dependentId: objectId.required(),
});

const archiveIdParamSchema = Joi.object({
  id: objectId.required(),
});

const appointmentIdParamSchema = Joi.object({
  appointmentId: objectId.required(),
});

module.exports = {
  patientIdParamSchema,
  patientIdQuerySchema,
  idParamSchema,
  appointmentIdParamSchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleSchema,
  emergencySchema,
  shareTokenSchema,
  shareViewParamSchema,
  uploadInsuranceSchema,
  reviewSchema,
  paymentParamSchema,
  listQuerySchema,
  updateProfileSchema,
  confirmAttendanceSchema,
  verifyPaymentSchema,
  verifyInvoicePaymentSchema,
  becomeGuardianSchema,
  createDependentSchema,
  updateDependentSchema,
  detachDependentSchema,
  dependentIdParamSchema,
  archiveIdParamSchema,
  accessLogQuerySchema,
};
