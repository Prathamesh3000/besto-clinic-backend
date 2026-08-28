'use strict';

const router = require('express').Router();
const ctrl = require('./bookingPolicy.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { updateBookingPolicySchema } = require('./bookingPolicy.validator');

router.use(authenticate(), tenantResolver());

// Any authenticated user with CLINIC_READ can view the policy
router.get(
  '/',
  authorize(PERMISSIONS.CLINIC_READ),
  asyncHandler(ctrl.getResolved),
);

// Raw view for settings form (shows nulls + system defaults)
router.get(
  '/raw',
  authorize(PERMISSIONS.CLINIC_READ),
  asyncHandler(ctrl.getRaw),
);

// Only CLINIC_UPDATE can modify the policy
router.put(
  '/',
  authorize(PERMISSIONS.CLINIC_UPDATE),
  validate(updateBookingPolicySchema),
  asyncHandler(ctrl.update),
);

module.exports = router;
