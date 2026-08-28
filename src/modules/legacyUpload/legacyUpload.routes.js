'use strict';

const router = require('express').Router();
const ctrl = require('./legacyUpload.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createUploadSchema, idParamSchema, listUploadsQuery } = require('./legacyUpload.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.LEGACY_READ),
  validate(listUploadsQuery, { source: 'query' }),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(idParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.LEGACY_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.LEGACY_UPLOAD),
  validate(createUploadSchema),
  asyncHandler(ctrl.create),
);

router.post(
  '/:id/process',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.LEGACY_UPLOAD),
  asyncHandler(ctrl.process),
);

router.delete(
  '/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.LEGACY_UPLOAD),
  asyncHandler(ctrl.remove),
);

module.exports = router;
