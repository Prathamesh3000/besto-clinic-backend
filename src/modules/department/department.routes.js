'use strict';

const router = require('express').Router();
const ctrl = require('./department.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createDepartmentSchema, updateDepartmentSchema, departmentIdParamSchema, bulkCreateDepartmentSchema } = require('./department.validator');

router.use(authenticate(), tenantResolver());

// ── Bulk import (must be before /:id) ──
router.post(
  '/bulk',
  authorize(PERMISSIONS.DEPARTMENT_CREATE),
  validate(bulkCreateDepartmentSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.DEPARTMENT_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(departmentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.DEPARTMENT_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.DEPARTMENT_CREATE),
  validate(createDepartmentSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(departmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPARTMENT_UPDATE),
  validate(updateDepartmentSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(departmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DEPARTMENT_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
