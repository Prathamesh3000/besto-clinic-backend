'use strict';

const router = require('express').Router();
const ctrl = require('./appointment.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createAppointmentSchema, updateAppointmentSchema, appointmentIdParamSchema } = require('./appointment.validator');
const conflictCtrl = require('../conflictResolution/conflictResolution.controller');
const {
  appointmentIdParamSchema: conflictApptIdSchema,
  rescheduleSchema,
  cancelReasonSchema,
  markContactedSchema,
  bulkCancelSchema,
} = require('../conflictResolution/conflictResolution.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.APPOINTMENT_READ, PERMISSIONS.APPOINTMENT_READ_OWN),
  asyncHandler(ctrl.list),
);

// ── Conflict resolution bulk action (must be before /:id) ──
router.post(
  '/bulk-cancel-refund',
  authorizeAny(PERMISSIONS.APPOINTMENT_CANCEL),
  validate(bulkCancelSchema),
  asyncHandler(conflictCtrl.bulkCancelRefund),
);

// ── Availability routes (must be before /:id to avoid capture) ──
router.get(
  '/availability-overview',
  authorizeAny(PERMISSIONS.APPOINTMENT_READ),
  asyncHandler(ctrl.getDoctorsAvailabilityOverview),
);

router.get(
  '/availability/:doctorId/summary',
  authorizeAny(PERMISSIONS.APPOINTMENT_READ),
  asyncHandler(ctrl.getAvailabilitySummary),
);

router.get(
  '/:id',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_READ, PERMISSIONS.APPOINTMENT_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorizeAny(PERMISSIONS.APPOINTMENT_CREATE),
  validate(createAppointmentSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_UPDATE),
  validate(updateAppointmentSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_CANCEL, PERMISSIONS.APPOINTMENT_CANCEL_OWN),
  asyncHandler(ctrl.remove),
);

// ── Conflict resolution per-appointment actions ──────────────
router.post(
  '/:id/admin-reschedule',
  validate(conflictApptIdSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_UPDATE),
  validate(rescheduleSchema),
  asyncHandler(conflictCtrl.rescheduleAppointment),
);

router.post(
  '/:id/cancel-refund',
  validate(conflictApptIdSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_CANCEL),
  validate(cancelReasonSchema),
  asyncHandler(conflictCtrl.cancelWithRefund),
);

router.post(
  '/:id/cancel-credit',
  validate(conflictApptIdSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_CANCEL),
  validate(cancelReasonSchema),
  asyncHandler(conflictCtrl.cancelWithCredit),
);

router.post(
  '/:id/cancel-unpaid',
  validate(conflictApptIdSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_CANCEL),
  validate(cancelReasonSchema),
  asyncHandler(conflictCtrl.cancelUnpaid),
);

router.post(
  '/:id/mark-contacted',
  validate(conflictApptIdSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.APPOINTMENT_UPDATE),
  validate(markContactedSchema),
  asyncHandler(conflictCtrl.markContacted),
);

// GET /appointments/availability/:doctorId?date=YYYY-MM-DD
router.get(
  '/availability/:doctorId',
  authorizeAny(PERMISSIONS.APPOINTMENT_READ),
  asyncHandler(ctrl.getAvailability),
);

module.exports = router;
