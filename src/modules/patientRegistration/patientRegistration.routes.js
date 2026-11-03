'use strict';

const router = require('express').Router();
const ctrl = require('./patientRegistration.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { submitRegistrationSchema, registrationIdParamSchema } = require('./patientRegistration.validator');

router.use(authenticate(), tenantResolver());

router.post(
  '/',
  authorize(PERMISSIONS.PATIENT_CREATE),
  validate(submitRegistrationSchema),
  asyncHandler(ctrl.create),
);

router.get('/', authorize(PERMISSIONS.PATIENT_READ), asyncHandler(ctrl.list));

// Must be before /:id
router.get('/stats', authorize(PERMISSIONS.DASHBOARD_VIEW), asyncHandler(ctrl.stats));

router.get(
  '/:id',
  validate(registrationIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PATIENT_READ),
  asyncHandler(ctrl.getById),
);

module.exports = router;
