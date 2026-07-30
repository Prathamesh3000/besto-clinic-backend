'use strict';

const router = require('express').Router();
const ctrl = require('./prescription.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createPrescriptionSchema, updatePrescriptionSchema, prescriptionIdParamSchema } = require('./prescription.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRESCRIPTION_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(prescriptionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRESCRIPTION_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.PRESCRIPTION_CREATE),
  validate(createPrescriptionSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(prescriptionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PRESCRIPTION_UPDATE),
  validate(updatePrescriptionSchema),
  asyncHandler(ctrl.update),
);

router.put(
  '/:id/cancel',
  validate(prescriptionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PRESCRIPTION_UPDATE),
  asyncHandler(ctrl.cancel),
);

module.exports = router;
