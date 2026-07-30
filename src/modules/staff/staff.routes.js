'use strict';

const router = require('express').Router();
const ctrl = require('./staff.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createStaffSchema, updateStaffSchema, staffIdParamSchema, bulkCreateStaffSchema, changeRoleSchema } = require('./staff.validator');

router.use(authenticate(), tenantResolver());

// ── Bulk import (must be before /:id) ──
router.post(
  '/bulk',
  authorize(PERMISSIONS.USER_CREATE),
  validate(bulkCreateStaffSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(staffIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.USER_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.USER_CREATE),
  validate(createStaffSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(staffIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(updateStaffSchema),
  asyncHandler(ctrl.update),
);

router.put(
  '/:id/role',
  validate(staffIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_UPDATE),
  validate(changeRoleSchema),
  asyncHandler(ctrl.changeRole),
);

router.delete(
  '/:id',
  validate(staffIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.USER_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
