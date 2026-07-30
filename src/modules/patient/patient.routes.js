'use strict';

const router = require('express').Router();
const ctrl = require('./patient.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createPatientSchema, updatePatientSchema, patientIdParamSchema, bulkCreatePatientSchema } = require('./patient.validator');

router.use(authenticate(), tenantResolver());

// ── Bulk import (must be before /:id) ──
router.post(
  '/bulk',
  authorize(PERMISSIONS.PATIENT_CREATE),
  validate(bulkCreatePatientSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.PATIENT_READ, PERMISSIONS.PATIENT_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(patientIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PATIENT_READ, PERMISSIONS.PATIENT_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.PATIENT_CREATE),
  validate(createPatientSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(patientIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PATIENT_UPDATE, PERMISSIONS.PATIENT_UPDATE_OWN),
  validate(updatePatientSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(patientIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PATIENT_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
