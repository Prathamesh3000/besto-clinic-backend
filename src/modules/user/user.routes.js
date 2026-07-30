'use strict';

const router = require('express').Router();
const ctrl = require('./user.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createUserSchema, updateUserSchema, userIdParamSchema } = require('./user.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorize(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(userIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.USER_CREATE),
  validate(createUserSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(userIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(updateUserSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(userIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
