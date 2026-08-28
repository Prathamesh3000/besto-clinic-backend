'use strict';

const router = require('express').Router();
const ctrl = require('./clinic.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { subscriptionActive, featureGuard } = require('../../middleware/featureGuard');
const { PERMISSIONS } = require('../../config/permissions');
const { updateClinicSchema } = require('./clinic.validator');

router.use(authenticate(), tenantResolver());

// Block requests if subscription is suspended or cancelled
router.use(subscriptionActive());

router.get(
  '/',
  authorize(PERMISSIONS.CLINIC_READ),
  asyncHandler(ctrl.get),
);

router.put(
  '/',
  authorize(PERMISSIONS.CLINIC_UPDATE),
  featureGuard('customBranding'),
  validate(updateClinicSchema),
  asyncHandler(ctrl.update),
);

router.post(
  '/logo',
  authorize(PERMISSIONS.CLINIC_UPDATE),
  featureGuard('customBranding'),
  asyncHandler(ctrl.uploadLogo),
);

// Example: stacking guards for feature + module enforcement
// router.post('/telehealth/session', featureGuard('teleHealthEnabled'), moduleGuard('telehealth'), asyncHandler(ctrl.startTelehealth));

module.exports = router;
