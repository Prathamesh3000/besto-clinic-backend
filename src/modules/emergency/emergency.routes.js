'use strict';

const router = require('express').Router();
const ctrl = require('./emergency.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createSessionSchema, endSessionSchema, declineSessionSchema, sessionIdParamSchema } = require('./emergency.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.EMERGENCY_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.EMERGENCY_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorizeAny(PERMISSIONS.EMERGENCY_CREATE),
  validate(createSessionSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id/accept',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.EMERGENCY_UPDATE),
  asyncHandler(ctrl.accept),
);

// Doctor dismisses the emergency from their queue without accepting.
// Does not change session status — other doctors can still pick it up.
router.put(
  '/:id/decline',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.EMERGENCY_UPDATE),
  validate(declineSessionSchema),
  asyncHandler(ctrl.decline),
);

router.put(
  '/:id/end',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.EMERGENCY_UPDATE),
  validate(endSessionSchema),
  asyncHandler(ctrl.end),
);

// Patients cancel their own still-pending request; staff with EMERGENCY_UPDATE may also cancel.
router.put(
  '/:id/cancel',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.EMERGENCY_CREATE, PERMISSIONS.EMERGENCY_UPDATE),
  asyncHandler(ctrl.cancel),
);

module.exports = router;
