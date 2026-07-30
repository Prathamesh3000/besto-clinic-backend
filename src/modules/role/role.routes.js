'use strict';

const router = require('express').Router();
const ctrl = require('./role.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createRoleSchema, updateRoleSchema, roleSlugParamSchema } = require('./role.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorize(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:slug',
  validate(roleSlugParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.getBySlug),
);

router.post(
  '/',
  authorize(PERMISSIONS.USER_CREATE),
  validate(createRoleSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:slug',
  validate(roleSlugParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(updateRoleSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:slug',
  validate(roleSlugParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
