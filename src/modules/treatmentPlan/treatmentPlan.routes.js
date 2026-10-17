'use strict';

/**
 * Treatment plan routes.
 *
 * Reuses the existing RECORD_* permissions rather than introducing new ones: a
 * treatment plan is a clinical record, and every role that may read or write
 * clinical records should see it. Adding a new permission would mean editing the
 * role map for twelve roles plus every tenant's own Role documents, for no gain
 * in access control.
 *
 * Patients reach their own history through RECORD_READ_OWN; the service narrows
 * the query to their linked patient record.
 */

const router = require('express').Router();
const ctrl = require('./treatmentPlan.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const v = require('./treatmentPlan.validator');

router.use(authenticate(), tenantResolver());

// ── Patient timeline ────────────────────────────────
// Declared before /:id so "patient" is never read as a plan id.
router.get(
  '/patient/:patientId',
  validate(v.patientIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.RECORD_READ, PERMISSIONS.RECORD_READ_OWN),
  asyncHandler(ctrl.patientTimeline),
);

// ── Plans ───────────────────────────────────────────
router.get(
  '/',
  authorizeAny(PERMISSIONS.RECORD_READ, PERMISSIONS.RECORD_READ_OWN),
  asyncHandler(ctrl.list),
);

router.post(
  '/',
  authorize(PERMISSIONS.RECORD_CREATE),
  validate(v.createPlanSchema),
  asyncHandler(ctrl.create),
);

router.get(
  '/:id',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.RECORD_READ, PERMISSIONS.RECORD_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.put(
  '/:id',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.updatePlanSchema),
  asyncHandler(ctrl.update),
);

router.put(
  '/:id/status',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.changeStatusSchema),
  asyncHandler(ctrl.changeStatus),
);

router.post(
  '/:id/addenda',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.addendumSchema),
  asyncHandler(ctrl.addAddendum),
);

router.delete(
  '/:id',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_UPDATE),
  asyncHandler(ctrl.remove),
);

// ── Sittings ────────────────────────────────────────
router.post(
  '/:id/sittings',
  validate(v.planIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RECORD_CREATE),
  validate(v.addSittingSchema),
  asyncHandler(ctrl.addSitting),
);

router.put(
  '/sittings/:sittingId/completion',
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.setCompletionSchema),
  asyncHandler(ctrl.setSittingCompletion),
);

router.put(
  '/sittings/:sittingId/lock',
  authorize(PERMISSIONS.RECORD_UPDATE),
  asyncHandler(ctrl.lockSitting),
);

router.post(
  '/sittings/:sittingId/addenda',
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.addendumSchema),
  asyncHandler(ctrl.addSittingAddendum),
);

router.post(
  '/sittings/:sittingId/complaints',
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.complaintSchema),
  asyncHandler(ctrl.recordComplaint),
);

router.put(
  '/sittings/:sittingId/complaints/:complaintId/resolve',
  authorize(PERMISSIONS.RECORD_UPDATE),
  validate(v.resolveComplaintSchema),
  asyncHandler(ctrl.resolveComplaint),
);

module.exports = router;
