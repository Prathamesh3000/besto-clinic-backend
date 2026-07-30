'use strict';

const router = require('express').Router();
const ctrl = require('./procedure.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  idParamSchema,
  createSchema,
  updateSchema,
  availabilityQuerySchema,
} = require('./procedure.validator');

router.use(tenantResolver(), authenticate());

router.post('/',
  authorize(PERMISSIONS.PROCEDURE_CREATE),
  validate(createSchema),
  asyncHandler(ctrl.create),
);

router.get('/',
  authorize(PERMISSIONS.PROCEDURE_READ),
  asyncHandler(ctrl.list),
);

router.put('/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PROCEDURE_UPDATE),
  validate(updateSchema),
  asyncHandler(ctrl.update),
);

router.get('/:id/check-availability',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PROCEDURE_READ),
  validate(availabilityQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.checkAvailability),
);

module.exports = router;
