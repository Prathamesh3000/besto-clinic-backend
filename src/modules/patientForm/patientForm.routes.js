'use strict';

const router = require('express').Router();
const ctrl = require('./patientForm.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { updatePatientFormSchema, toggleQrSchema } = require('./patientForm.validator');

router.use(authenticate(), tenantResolver());

// Reception fills this form but holds PATIENT_CREATE, not CLINIC_READ. The service
// already withholds the QR token from anyone without CLINIC_UPDATE.
router.get(
  '/',
  authorizeAny(PERMISSIONS.CLINIC_READ, PERMISSIONS.PATIENT_CREATE),
  asyncHandler(ctrl.get),
);

router.put(
  '/',
  authorize(PERMISSIONS.CLINIC_UPDATE),
  validate(updatePatientFormSchema),
  asyncHandler(ctrl.update),
);

router.post('/qr/regenerate', authorize(PERMISSIONS.CLINIC_UPDATE), asyncHandler(ctrl.regenerateQr));

router.post(
  '/qr/toggle',
  authorize(PERMISSIONS.CLINIC_UPDATE),
  validate(toggleQrSchema),
  asyncHandler(ctrl.toggleQr),
);

module.exports = router;
