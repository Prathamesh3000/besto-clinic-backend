'use strict';

/**
 * Job Portal Routes — clinic-facing job management.
 *
 * Mounted at: /api/v1/jobs
 * All routes require tenant authentication + job portal feature.
 */

const express = require('express');
const router = express.Router();
const controller = require('./jobPortal.controller');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { clinicFeatureGuard } = require('../../middleware/featureGuard');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createJobSchema,
  updateJobSchema,
  jobIdParamSchema,
  closeJobSchema,
  listJobsQuerySchema,
  listApplicationsQuerySchema,
  applicationIdParamSchema,
} = require('./jobPortal.validator');

// All routes require auth + tenant resolution + job portal feature
router.use(authenticate(), tenantResolver(), clinicFeatureGuard('jobPortalEnabled'));

// ─── Dashboard ──────────────────────────────────────────

router.get(
  '/dashboard',
  authorize(PERMISSIONS.JOB_READ),
  asyncHandler(controller.getDashboard),
);

// ─── Departments (suggestions for combobox) ─────────────

router.get(
  '/departments',
  authorize(PERMISSIONS.JOB_READ),
  asyncHandler(controller.getDistinctDepartments),
);

// ─── Job CRUD ───────────────────────────────────────────

router.get(
  '/',
  authorize(PERMISSIONS.JOB_READ),
  validate(listJobsQuerySchema, { source: 'query' }),
  asyncHandler(controller.listJobs),
);

router.post(
  '/',
  authorize(PERMISSIONS.JOB_CREATE),
  validate(createJobSchema),
  asyncHandler(controller.createJob),
);

router.get(
  '/:id',
  authorize(PERMISSIONS.JOB_READ),
  validate(jobIdParamSchema, { source: 'params' }),
  asyncHandler(controller.getJob),
);

router.put(
  '/:id',
  authorize(PERMISSIONS.JOB_UPDATE),
  validate(jobIdParamSchema, { source: 'params' }),
  validate(updateJobSchema),
  asyncHandler(controller.updateJob),
);

router.post(
  '/:id/publish',
  authorize(PERMISSIONS.JOB_CREATE),
  validate(jobIdParamSchema, { source: 'params' }),
  asyncHandler(controller.publishJob),
);

// Clones a closed/filled posting into a new draft — creation, not mutation.
router.post(
  '/:id/repost',
  authorize(PERMISSIONS.JOB_CREATE),
  validate(jobIdParamSchema, { source: 'params' }),
  asyncHandler(controller.repostJob),
);

router.post(
  '/:id/close',
  authorize(PERMISSIONS.JOB_UPDATE),
  validate(jobIdParamSchema, { source: 'params' }),
  validate(closeJobSchema),
  asyncHandler(controller.closeJob),
);

router.delete(
  '/:id',
  authorize(PERMISSIONS.JOB_DELETE),
  validate(jobIdParamSchema, { source: 'params' }),
  asyncHandler(controller.deleteJob),
);

// ─── Applications for a specific job ────────────────────

router.get(
  '/:id/applications',
  authorize(PERMISSIONS.APPLICATION_READ),
  validate(jobIdParamSchema, { source: 'params' }),
  validate(listApplicationsQuerySchema, { source: 'query' }),
  asyncHandler(controller.listApplicationsForJob),
);

// Resume download. Declared before nothing else matches /applications/... so it
// does not collide with '/:id'. Resumes are PII and live outside the public
// static dirs, so they are streamed through this authenticated route rather than
// linked to directly — an <a href> cannot send the Bearer token.
router.get(
  '/applications/:applicationId/resume',
  authorize(PERMISSIONS.APPLICATION_READ),
  validate(applicationIdParamSchema, { source: 'params' }),
  asyncHandler(controller.downloadApplicationResume),
);

module.exports = router;
