'use strict';

const router = require('express').Router();
const ctrl = require('./queue.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createQueueSchema, updateQueueStatusSchema, queueIdParamSchema, changePrioritySchema, swapPositionsSchema, movePositionSchema } = require('./queue.validator');
const { cacheResponse } = require('../../middleware/cacheResponse');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.QUEUE_READ),
  asyncHandler(ctrl.list),
);

router.get(
  '/current',
  authorizeAny(PERMISSIONS.QUEUE_READ),
  cacheResponse(15),
  asyncHandler(ctrl.getCurrent),
);

router.put(
  '/swap',
  authorize(PERMISSIONS.QUEUE_MANAGE),
  validate(swapPositionsSchema),
  asyncHandler(ctrl.swap),
);

router.get(
  '/:id',
  validate(queueIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.QUEUE_READ),
  asyncHandler(ctrl.getById),
);

router.post(
  '/',
  authorize(PERMISSIONS.QUEUE_MANAGE),
  validate(createQueueSchema),
  asyncHandler(ctrl.add),
);

router.put(
  '/:id/priority',
  validate(queueIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_MANAGE),
  validate(changePrioritySchema),
  asyncHandler(ctrl.changePriority),
);

router.put(
  '/:id/move',
  validate(queueIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_MANAGE),
  validate(movePositionSchema),
  asyncHandler(ctrl.move),
);

router.put(
  '/:id/call',
  validate(queueIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_MANAGE),
  asyncHandler(ctrl.call),
);

router.put(
  '/:id/complete',
  validate(queueIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_MANAGE),
  asyncHandler(ctrl.complete),
);

router.put(
  '/:id/cancel',
  validate(queueIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.QUEUE_MANAGE),
  validate(updateQueueStatusSchema),
  asyncHandler(ctrl.cancel),
);

module.exports = router;
