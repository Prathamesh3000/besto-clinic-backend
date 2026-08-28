'use strict';

const router = require('express').Router();
const ctrl = require('./consent.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createConsentSchema, updateConsentSchema, consentIdParamSchema } = require('./consent.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.CONSENT_READ, PERMISSIONS.CONSENT_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(consentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.CONSENT_READ, PERMISSIONS.CONSENT_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorizeAny(PERMISSIONS.CONSENT_CREATE, PERMISSIONS.CONSENT_REVOKE),
  validate(createConsentSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(consentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CONSENT_UPDATE),
  validate(updateConsentSchema),
  asyncHandler(ctrl.update),
);

router.put(
  '/:id/revoke',
  validate(consentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.CONSENT_REVOKE),
  asyncHandler(ctrl.revoke),
);

module.exports = router;
