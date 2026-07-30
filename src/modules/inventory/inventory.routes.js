'use strict';

const router = require('express').Router();
const ctrl = require('./inventory.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  idParamSchema,
  createItemSchema,
  updateItemSchema,
  restockSchema,
  bulkCreateItemsSchema,
  listQuerySchema,
} = require('./inventory.validator');

router.use(tenantResolver(), authenticate());

router.post('/',
  authorize(PERMISSIONS.INVENTORY_CREATE),
  validate(createItemSchema),
  asyncHandler(ctrl.create),
);

// Bulk import (must be before /:id)
router.post('/bulk',
  authorize(PERMISSIONS.INVENTORY_CREATE),
  validate(bulkCreateItemsSchema),
  asyncHandler(ctrl.bulkCreate),
);

router.get('/',
  authorize(PERMISSIONS.INVENTORY_READ),
  asyncHandler(ctrl.list),
);

// Static routes BEFORE /:id
router.get('/low-stock',
  authorize(PERMISSIONS.INVENTORY_READ),
  asyncHandler(ctrl.lowStock),
);

router.get('/expiring',
  authorize(PERMISSIONS.INVENTORY_READ),
  asyncHandler(ctrl.expiring),
);

router.get('/reports',
  authorize(PERMISSIONS.INVENTORY_REPORT),
  asyncHandler(ctrl.reports),
);

router.get('/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVENTORY_READ),
  asyncHandler(ctrl.getById),
);

router.put('/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVENTORY_UPDATE),
  validate(updateItemSchema),
  asyncHandler(ctrl.update),
);

router.delete('/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVENTORY_DELETE),
  asyncHandler(ctrl.delete),
);

router.put('/:id/restock',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVENTORY_RESTOCK),
  validate(restockSchema),
  asyncHandler(ctrl.restock),
);

module.exports = router;
