'use strict';

const router = require('express').Router();
const ctrl = require('./doctorDashboard.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { requireRole, authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { ROLE_GROUPS } = require('../../config/constants');
const {
  startConsultationSchema,
  updateConsultationSchema,
  completeConsultationSchema,
  uploadAttachmentSchema,
  createFollowUpSchema,
  idParamSchema,
  treatmentIdParamSchema,
  appointmentIdParamSchema,
  updateDoctorProfileSchema,
} = require('./doctorDashboard.validator');

// All routes require auth + doctor or admin-tier role
router.use(tenantResolver(), authenticate(), requireRole('doctor', ...ROLE_GROUPS.ADMIN));

// Dashboard stats
router.get('/stats',
  authorize(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(ctrl.getStats),
);

// Current room assignment
router.get('/current-room',
  authorize(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(ctrl.getCurrentRoom),
);

// List doctor's consultations (treatment records)
router.get('/consultations',
  authorize(PERMISSIONS.RECORD_READ),
  asyncHandler(ctrl.listConsultations),
);

// Get single consultation by appointment ID (read-only)
router.get('/consultations/by-appointment/:appointmentId',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_READ),
  asyncHandler(ctrl.getConsultationByAppointment),
);

// Consultation lifecycle
router.post('/consultations',
  authorize(PERMISSIONS.RECORD_CREATE),
  validate(startConsultationSchema),
  asyncHandler(ctrl.startConsultation),
);

router.put('/consultations/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(updateConsultationSchema),
  asyncHandler(ctrl.updateConsultation),
);

router.put('/consultations/:id/complete',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(completeConsultationSchema),
  asyncHandler(ctrl.completeConsultation),
);

// Attachments
router.post('/attachments',
  authorize(PERMISSIONS.RECORD_CREATE),
  validate(uploadAttachmentSchema),
  asyncHandler(ctrl.uploadAttachment),
);

router.get('/attachments/:treatmentId',
  validate(treatmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_READ),
  asyncHandler(ctrl.listAttachments),
);

// Follow-ups
router.post('/follow-ups',
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(createFollowUpSchema),
  asyncHandler(ctrl.createFollowUp),
);

// Care Compliance
const careCtrl = require('../careReminder/careReminder.controller');
const { patientIdParamSchema: carePatientIdSchema, doctorTaskParamSchema, prescriptionActionParamSchema } = require('../careReminder/careReminder.validator');

router.get('/patients/:patientId/compliance',
  validate(carePatientIdSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_COMPLIANCE_READ),
  asyncHandler(careCtrl.getPatientCompliance),
);

router.put('/patients/:patientId/care-tasks/:taskId/toggle',
  validate(doctorTaskParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.toggleTaskReminderAsDoctor),
);

router.post('/patients/:patientId/prescriptions/:prescriptionId/enable-reminders',
  validate(prescriptionActionParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.enableRemindersAsStaff),
);

router.delete('/patients/:patientId/prescriptions/:prescriptionId/disable-reminders',
  validate(prescriptionActionParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CARE_REMINDER_MANAGE),
  asyncHandler(careCtrl.disableRemindersAsStaff),
);

// Doctor compliance summary
router.get('/compliance-summary',
  authorize(PERMISSIONS.CARE_COMPLIANCE_READ),
  asyncHandler(ctrl.getComplianceSummary),
);

// Doctor care task list (all patients)
router.get('/care-tasks',
  asyncHandler(ctrl.listCareTasks),
);

// Doctor-triggered care summary push notification
router.post('/patients/:patientId/care-summary',
  validate(carePatientIdSchema, { source: 'params' }),
  asyncHandler(ctrl.sendCareSummary),
);

// Doctor's patient list
router.get('/patients',
  authorize(PERMISSIONS.PATIENT_READ_OWN),
  asyncHandler(ctrl.listMyPatients),
);

// Doctor schedule (self-service)
const scheduleCtrl = require('../schedule/schedule.controller');
const { leaveSchema, overrideSchema, selfOverrideIdParamSchema, selfLeaveIdParamSchema } = require('../schedule/schedule.validator');

router.get('/schedule',
  asyncHandler(scheduleCtrl.getOwnSchedule),
);

router.get('/leaves',
  asyncHandler(scheduleCtrl.getOwnLeaves),
);

router.post('/leaves',
  validate(leaveSchema),
  asyncHandler(scheduleCtrl.requestLeave),
);

router.delete('/leaves/:leaveId',
  validate(selfLeaveIdParamSchema, { source: 'params' }),
  asyncHandler(scheduleCtrl.deleteOwnLeave),
);

// Doctor self-service overrides
router.get('/overrides',
  asyncHandler(scheduleCtrl.getOwnOverrides),
);

router.post('/overrides',
  validate(overrideSchema),
  asyncHandler(scheduleCtrl.createOwnOverride),
);

router.delete('/overrides/:overrideId',
  validate(selfOverrideIdParamSchema, { source: 'params' }),
  asyncHandler(scheduleCtrl.deleteOwnOverride),
);

// Doctor holiday visibility (read-only)
const holidayCtrl = require('../holiday/holiday.controller');
router.get('/holidays',
  authorize(PERMISSIONS.HOLIDAY_READ),
  asyncHandler(holidayCtrl.list),
);

// Doctor self-profile (with populated department)
router.get('/profile',
  asyncHandler(ctrl.getProfile),
);

// Doctor self-profile update
router.put('/profile',
  validate(updateDoctorProfileSchema),
  asyncHandler(ctrl.updateProfile),
);

// ── Consultation Templates ────────────────────────────
const templateCtrl = require('../consultationTemplate/consultationTemplate.controller');
const {
  templateBodySchema,
  updateTemplateSchema,
  idParamSchema: templateIdParam,
} = require('../consultationTemplate/consultationTemplate.validator');

router.get('/templates',
  authorize(PERMISSIONS.RECORD_READ),
  asyncHandler(templateCtrl.listTemplates),
);

router.get('/templates/:id',
  validate(templateIdParam, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_READ),
  asyncHandler(templateCtrl.getTemplate),
);

router.post('/templates',
  authorize(PERMISSIONS.RECORD_CREATE),
  validate(templateBodySchema),
  asyncHandler(templateCtrl.createTemplate),
);

router.put('/templates/:id',
  validate(templateIdParam, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(updateTemplateSchema),
  asyncHandler(templateCtrl.updateTemplate),
);

router.delete('/templates/:id',
  validate(templateIdParam, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  asyncHandler(templateCtrl.removeTemplate),
);

module.exports = router;
