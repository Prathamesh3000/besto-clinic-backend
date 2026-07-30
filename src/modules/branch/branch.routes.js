'use strict';

const router = require('express').Router();
const ctrl = require('./branch.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createBranchSchema, updateBranchSchema, branchIdParamSchema, bulkCreateBranchSchema } = require('./branch.validator');
const { cacheResponse } = require('../../middleware/cacheResponse');

router.use(authenticate(), tenantResolver());

// ── Monitor endpoints (must be before /:id to avoid route conflict) ──
router.get('/overview', authorizeAny(PERMISSIONS.BRANCH_READ), asyncHandler(ctrl.getOverview));
router.get('/monitor/presence', authorizeAny(PERMISSIONS.BRANCH_READ), cacheResponse(20), asyncHandler(ctrl.getDoctorPresence));
router.get('/monitor/waiting', authorizeAny(PERMISSIONS.BRANCH_READ), cacheResponse(15), asyncHandler(ctrl.getWaitingPatients));
router.get('/monitor/capacity', authorizeAny(PERMISSIONS.BRANCH_READ), cacheResponse(30), asyncHandler(ctrl.getBranchCapacity));
router.get('/monitor/activity', authorizeAny(PERMISSIONS.BRANCH_READ), cacheResponse(20), asyncHandler(ctrl.getActivityFeed));

// ── Room management ──
router.get('/rooms', authorizeAny(PERMISSIONS.BRANCH_READ), cacheResponse(30), asyncHandler(ctrl.listRooms));
router.post('/rooms', authorize(PERMISSIONS.BRANCH_UPDATE), asyncHandler(ctrl.createRoom));
router.put('/rooms/:id', authorize(PERMISSIONS.BRANCH_UPDATE), asyncHandler(ctrl.updateRoom));
router.put('/rooms/:id/assign', authorize(PERMISSIONS.BRANCH_UPDATE), asyncHandler(ctrl.assignRoom));
router.put('/rooms/:id/release', authorize(PERMISSIONS.BRANCH_UPDATE), asyncHandler(ctrl.releaseRoom));
router.delete('/rooms/:id', authorize(PERMISSIONS.BRANCH_DELETE), asyncHandler(ctrl.deleteRoom));

// ── Bulk import (must be before /:id) ──
router.post(
  '/bulk',
  authorize(PERMISSIONS.BRANCH_CREATE),
  validate(bulkCreateBranchSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.BRANCH_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(branchIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.BRANCH_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.BRANCH_CREATE),
  validate(createBranchSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(branchIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.BRANCH_UPDATE),
  validate(updateBranchSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(branchIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.BRANCH_DELETE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
