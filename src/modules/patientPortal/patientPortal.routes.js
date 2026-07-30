'use strict';

const router = require('express').Router();
const ctrl = require('./patientPortal.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { requireRole, authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  patientIdParamSchema,
  idParamSchema,
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
  createDependentSchema,
  updateDependentSchema,
  detachDependentSchema,
  dependentIdParamSchema,
  archiveIdParamSchema,
  appointmentIdParamSchema,
  accessLogQuerySchema,
  patientIdQuerySchema,
} = require('./patientPortal.validator');

// Public share view — no auth required, tenant from query param
router.get('/share/view/:token',
  validate(shareViewParamSchema, { source: 'params' }),
  asyncHandler(ctrl.viewSharedRecord),
);

// All remaining routes require auth + patient/guardian role
router.use(tenantResolver(), authenticate(), requireRole('patient', 'guardian'));

// Patient profiles
router.get('/profiles',
  asyncHandler(ctrl.getProfiles),
);

router.get('/profiles/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getProfile),
);

router.put('/profiles/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  validate(updateProfileSchema),
  asyncHandler(ctrl.updateProfile),
);

// Dashboard
router.get('/dashboard/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getDashboard),
);

// Clinic browsing (for appointment booking — no extra permissions needed)
router.get('/departments',
  asyncHandler(ctrl.listDepartments),
);

router.get('/doctors',
  asyncHandler(ctrl.listDoctors),
);

router.get('/doctors/:id',
  validate(idParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getDoctor),
);

router.get('/doctors/:id/availability-summary',
  validate(idParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getDoctorAvailabilitySummary),
);

// Appointments
router.get('/appointments',
  authorize(PERMISSIONS.APPOINTMENT_READ_OWN),
  asyncHandler(ctrl.listAppointments),
);

router.get('/appointments/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.APPOINTMENT_READ_OWN),
  asyncHandler(ctrl.getAppointment),
);

router.post('/appointments',
  authorize(PERMISSIONS.APPOINTMENT_CREATE),
  validate(bookAppointmentSchema),
  asyncHandler(ctrl.bookAppointment),
);

router.post('/appointments/verify-payment',
  authorize(PERMISSIONS.APPOINTMENT_CREATE),
  validate(verifyPaymentSchema),
  asyncHandler(ctrl.verifyAppointmentPayment),
);

router.put('/appointments/:id/cancel',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.APPOINTMENT_CANCEL_OWN),
  validate(cancelAppointmentSchema),
  asyncHandler(ctrl.cancelAppointment),
);

router.put('/appointments/:id/reschedule',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.APPOINTMENT_CANCEL_OWN),
  validate(rescheduleSchema),
  asyncHandler(ctrl.rescheduleAppointment),
);

router.put('/appointments/:id/confirm-attendance',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.APPOINTMENT_READ_OWN),
  validate(patientIdQuerySchema, { source: 'query' }),
  validate(confirmAttendanceSchema),
  asyncHandler(ctrl.confirmAttendance),
);

// Check-in & Queue
router.put('/appointments/:id/check-in',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.APPOINTMENT_READ_OWN),
  asyncHandler(ctrl.checkIn),
);

router.get('/queue-position/:appointmentId',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_READ),
  asyncHandler(ctrl.getQueuePosition),
);

// Emergency
router.post('/emergency',
  authorize(PERMISSIONS.EMERGENCY_CREATE),
  validate(emergencySchema),
  asyncHandler(ctrl.createEmergency),
);

// Prescriptions
router.get('/prescriptions',
  authorize(PERMISSIONS.PRESCRIPTION_READ_OWN),
  asyncHandler(ctrl.listPrescriptions),
);

// Care Reminders
const careCtrl = require('../careReminder/careReminder.controller');
const {
  respondToReminderSchema,
  listCareTasksQuerySchema,
  taskIdParamSchema: careTaskIdParamSchema,
  dependentIdParamSchema: careDependentIdParamSchema,
  guardianReminderParamSchema,
  guardianTaskParamSchema,
  notificationPreferenceSchema,
  batchRespondSchema,
} = require('../careReminder/careReminder.validator');

router.post('/prescriptions/:id/enable-reminders',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.enableReminders),
);

router.delete('/prescriptions/:id/disable-reminders',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.disableReminders),
);

router.get('/care-tasks',
  authorize(PERMISSIONS.CARE_REMINDER_READ_OWN),
  asyncHandler(careCtrl.listCareTasks),
);

// Batch respond (EOD checklist) — MUST come before parameterized /:taskId routes
router.put('/care-tasks/batch-respond',
  validate(batchRespondSchema),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.batchRespondToReminders),
);

router.get('/care-tasks/:taskId/reminders',
  authorize(PERMISSIONS.CARE_REMINDER_READ_OWN),
  asyncHandler(careCtrl.listTaskReminders),
);

router.put('/care-tasks/:taskId/reminders/:id',
  validate(respondToReminderSchema),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.respondToReminder),
);

router.put('/care-tasks/:taskId/toggle',
  validate(careTaskIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.toggleTaskReminder),
);

router.get('/care/today',
  authorize(PERMISSIONS.CARE_REMINDER_READ_OWN),
  asyncHandler(careCtrl.getDailyCareSchedule),
);

// Notification Preference
router.put('/notification-preferences',
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  validate(notificationPreferenceSchema),
  asyncHandler(careCtrl.updateNotificationPreference),
);

// Medical history
router.get('/medical-history',
  authorize(PERMISSIONS.RECORD_READ_OWN),
  asyncHandler(ctrl.getMedicalHistory),
);

// Consultation detail (by appointment)
router.get('/consultations/:appointmentId',
  authorize(PERMISSIONS.RECORD_READ_OWN),
  asyncHandler(ctrl.getConsultationDetail),
);

// Payments
router.get('/payments',
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.listPayments),
);

router.post('/payments/verify',
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  validate(verifyInvoicePaymentSchema),
  asyncHandler(ctrl.verifyInvoicePayment),
);

router.post('/payments/:invoiceId/pay',
  validate(paymentParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.initiatePayment),
);

// Share tokens
router.post('/share',
  authorize(PERMISSIONS.SHARE_CREATE),
  validate(shareTokenSchema),
  asyncHandler(ctrl.createShareToken),
);

router.get('/share',
  authorize(PERMISSIONS.SHARE_READ),
  asyncHandler(ctrl.listShareTokens),
);

router.delete('/share/:tokenId',
  authorize(PERMISSIONS.SHARE_CREATE),
  asyncHandler(ctrl.revokeShareToken),
);

// Consents
router.get('/consents',
  authorize(PERMISSIONS.CONSENT_READ_OWN),
  asyncHandler(ctrl.listConsents),
);

router.put('/consents/:id/approve',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CONSENT_REVOKE),
  asyncHandler(ctrl.approveConsent),
);

router.put('/consents/:id/revoke',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CONSENT_REVOKE),
  asyncHandler(ctrl.revokeConsent),
);

// Insurance
router.post('/insurance/upload',
  authorize(PERMISSIONS.PATIENT_UPDATE_OWN),
  validate(uploadInsuranceSchema),
  asyncHandler(ctrl.uploadInsurance),
);

// Reviews
router.post('/reviews',
  authorize(PERMISSIONS.REVIEW_CREATE),
  validate(reviewSchema),
  asyncHandler(ctrl.submitReview),
);

router.get('/reviews',
  authorize(PERMISSIONS.REVIEW_READ_OWN),
  asyncHandler(ctrl.listReviews),
);

// Access log
router.get('/access-log',
  authorize(PERMISSIONS.ACCESS_LOG_READ),
  validate(accessLogQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.getAccessLog),
);

// Financial & Billing
router.get('/financial-summary/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.financialSummary),
);

router.get('/ledger',
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.ledger),
);

router.get('/credit-notes',
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.creditNotes),
);

router.get('/invoices/:invoiceId/pdf',
  authorize(PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.invoicePdf),
);

// ── Dependent Management (Guardian only) ──────────────────────────
router.get('/dependents',
  requireRole('guardian'),
  authorize(PERMISSIONS.DEPENDENT_READ),
  asyncHandler(ctrl.listDependents),
);

router.post('/dependents',
  requireRole('guardian'),
  authorize(PERMISSIONS.DEPENDENT_CREATE),
  validate(createDependentSchema),
  asyncHandler(ctrl.createDependent),
);

// Archives must come BEFORE /:dependentId routes
router.get('/dependents/archives',
  requireRole('guardian'),
  authorize(PERMISSIONS.DEPENDENT_ARCHIVE_READ),
  asyncHandler(ctrl.listDependentArchives),
);

router.get('/dependents/archives/:id',
  requireRole('guardian'),
  validate(archiveIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPENDENT_ARCHIVE_READ),
  asyncHandler(ctrl.getDependentArchive),
);

router.get('/dependents/:dependentId/consent',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPENDENT_READ),
  asyncHandler(ctrl.getDependentConsent),
);

router.put('/dependents/:dependentId',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPENDENT_UPDATE),
  validate(updateDependentSchema),
  asyncHandler(ctrl.updateDependent),
);

router.post('/dependents/:dependentId/detach',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPENDENT_DETACH),
  validate(detachDependentSchema),
  asyncHandler(ctrl.detachDependent),
);

router.get('/dependents/:dependentId/compliance',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_COMPLIANCE_READ_DEPENDENT),
  asyncHandler(careCtrl.getGuardianDependentCompliance),
);

router.get('/dependents/:dependentId/care-today',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_COMPLIANCE_READ_DEPENDENT),
  asyncHandler(careCtrl.getGuardianDependentDailySchedule),
);

// Guardian batch respond (EOD checklist)
router.put('/dependents/:dependentId/care-tasks/batch-respond',
  requireRole('guardian'),
  validate(careDependentIdParamSchema, { source: 'params' }),
  validate(batchRespondSchema),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.batchRespondToRemindersAsGuardian),
);

router.put('/dependents/:dependentId/care-tasks/:taskId/reminders/:id',
  requireRole('guardian'),
  validate(guardianReminderParamSchema, { source: 'params' }),
  validate(respondToReminderSchema),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.respondToReminderAsGuardian),
);

router.put('/dependents/:dependentId/care-tasks/:taskId/toggle',
  requireRole('guardian'),
  validate(guardianTaskParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.toggleTaskReminderAsGuardian),
);

router.patch('/dependents/:dependentId/notifications',
  requireRole('guardian'),
  validate(dependentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPENDENT_UPDATE),
  asyncHandler(ctrl.updateDependentNotifications),
);

module.exports = router;
