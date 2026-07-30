'use strict';

const router = require('express').Router();
const ctrl = require('./dashboard.controller');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorize(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(ctrl.getStats),
);

module.exports = router;
