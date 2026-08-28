'use strict';

const router = require('express').Router();
const ctrl = require('./calendarFeed.controller');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');

router.use(authenticate(), tenantResolver());

// ── Doctor self-service ─────────────────────────────
router.post('/my-feed',            asyncHandler(ctrl.generateMyFeed));
router.get('/my-feeds',            asyncHandler(ctrl.listMyFeeds));

// ── Feed management (shared) ────────────────────────
router.put('/:feedId',             asyncHandler(ctrl.updateFeed));
router.delete('/:feedId',          asyncHandler(ctrl.revokeFeed));
router.post('/:feedId/regenerate', asyncHandler(ctrl.regenerateFeed));

// ── Admin: manage a specific doctor's feeds ─────────
router.post('/doctor/:doctorId',   authorize(PERMISSIONS.USER_UPDATE), asyncHandler(ctrl.generateDoctorFeed));
router.get('/doctor/:doctorId',    authorize(PERMISSIONS.USER_READ),   asyncHandler(ctrl.listDoctorFeeds));

module.exports = router;
