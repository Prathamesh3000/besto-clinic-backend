'use strict';

const router = require('express').Router();
const ctrl = require('./notification.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { notificationIdParamSchema, listNotificationsQuery } = require('./notification.validator');
const { cacheResponse } = require('../../middleware/cacheResponse');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.NOTIFICATION_READ),
  validate(listNotificationsQuery, { source: 'query' }),
  asyncHandler(ctrl.list),
);

// Static routes BEFORE parameterized routes to avoid /:id capture
router.get(
  '/unread-count',
  authorizeAny(PERMISSIONS.NOTIFICATION_READ),
  cacheResponse(30, { perUser: true }),
  asyncHandler(ctrl.unreadCount),
);

router.put(
  '/read-all',
  authorizeAny(PERMISSIONS.NOTIFICATION_READ),
  asyncHandler(ctrl.markAllRead),
);

router.put(
  '/:id/read',
  validate(notificationIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.NOTIFICATION_READ),
  asyncHandler(ctrl.markAsRead),
);

router.delete(
  '/:id',
  validate(notificationIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.NOTIFICATION_READ),
  asyncHandler(ctrl.remove),
);

module.exports = router;
