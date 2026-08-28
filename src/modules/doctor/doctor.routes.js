'use strict';

const router = require('express').Router();
const ctrl = require('./doctor.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createDoctorSchema, updateDoctorSchema, doctorIdParamSchema, bulkCreateDoctorSchema } = require('./doctor.validator');
const scheduleCtrl = require('../schedule/schedule.controller');
const { scheduleSchema, leaveSchema, leaveIdParamSchema, overrideSchema, overrideIdParamSchema } = require('../schedule/schedule.validator');
const conflictCtrl = require('../conflictResolution/conflictResolution.controller');
const { detectConflictsSchema, detectLeaveConflictsSchema } = require('../conflictResolution/conflictResolution.validator');

router.use(authenticate(), tenantResolver());

// ── Schedule aggregate (must be before /:id to avoid route conflict) ──
router.get(
  '/schedules/all',
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(scheduleCtrl.getAllSchedules),
);

// ── Cross-doctor leave listing (must be before /:id) ──
router.get(
  '/leaves/all',
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(scheduleCtrl.getAllLeaves),
);

// ── Doctor self-service availability summary (before /:id) ──
router.get(
  '/schedule/availability-summary',
  asyncHandler(scheduleCtrl.getAvailabilitySummary),
);

// ── Schedule conflict resolution (must be before /:id) ──
router.post(
  '/schedule/conflicts/detect',
  authorizeAny(PERMISSIONS.USER_UPDATE),
  validate(detectConflictsSchema),
  asyncHandler(conflictCtrl.detectConflicts),
);

router.post(
  '/schedule/conflicts/detect-leave',
  authorizeAny(PERMISSIONS.USER_UPDATE),
  validate(detectLeaveConflictsSchema),
  asyncHandler(conflictCtrl.detectLeaveConflicts),
);

router.get(
  '/schedule/conflicts/next-slots',
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(conflictCtrl.getNextAvailableSlots),
);

// ── Bulk import (must be before /:id) ──
router.post(
  '/bulk',
  authorize(PERMISSIONS.USER_CREATE),
  validate(bulkCreateDoctorSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.USER_CREATE),
  validate(createDoctorSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(updateDoctorSchema),
  asyncHandler(ctrl.update),
);

router.put(
  '/:id/feature',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  asyncHandler(ctrl.toggleFeature),
);

router.delete(
  '/:id',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_DELETE),
  asyncHandler(ctrl.remove),
);

// ── Doctor schedule sub-routes ────────────────────────────────
router.get(
  '/:id/schedule',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(scheduleCtrl.getSchedule),
);

router.put(
  '/:id/schedule',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(scheduleSchema),
  asyncHandler(scheduleCtrl.updateSchedule),
);

router.get(
  '/:id/leaves',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(scheduleCtrl.listLeaves),
);

router.post(
  '/:id/leaves',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(leaveSchema),
  asyncHandler(scheduleCtrl.createLeave),
);

router.delete(
  '/:id/leaves/:leaveId',
  validate(leaveIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  asyncHandler(scheduleCtrl.deleteLeave),
);

router.put(
  '/:id/leaves/:leaveId/approve',
  validate(leaveIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  asyncHandler(scheduleCtrl.approveLeave),
);

router.put(
  '/:id/leaves/:leaveId/reject',
  validate(leaveIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  asyncHandler(scheduleCtrl.rejectLeave),
);

// ── Schedule overrides ─────────────────────────────────────
router.get(
  '/:id/overrides',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(scheduleCtrl.listOverrides),
);

router.post(
  '/:id/overrides',
  validate(doctorIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(overrideSchema),
  asyncHandler(scheduleCtrl.createOverride),
);

router.put(
  '/:id/overrides/:overrideId',
  validate(overrideIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(overrideSchema),
  asyncHandler(scheduleCtrl.updateOverride),
);

router.delete(
  '/:id/overrides/:overrideId',
  validate(overrideIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  asyncHandler(scheduleCtrl.deleteOverride),
);

module.exports = router;
