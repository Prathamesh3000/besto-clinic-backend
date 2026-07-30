'use strict';

const router = require('express').Router();
const ctrl = require('./cashRegister.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  openRegisterSchema,
  closeRegisterSchema,
  reconcileRegisterSchema,
  registerIdParamSchema,
  getCurrentQuerySchema,
  listRegistersQuerySchema,
} = require('./cashRegister.validator');

router.use(authenticate(), tenantResolver());

router.post(
  '/open',
  authorize(PERMISSIONS.CASH_REGISTER_OPEN),
  validate(openRegisterSchema),
  asyncHandler(ctrl.open),
);

router.put(
  '/:id/close',
  validate(registerIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CASH_REGISTER_CLOSE),
  validate(closeRegisterSchema),
  asyncHandler(ctrl.close),
);

router.put(
  '/:id/reconcile',
  validate(registerIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CASH_REGISTER_RECONCILE),
  validate(reconcileRegisterSchema),
  asyncHandler(ctrl.reconcile),
);

router.get(
  '/current',
  authorize(PERMISSIONS.CASH_REGISTER_READ),
  validate(getCurrentQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.getCurrent),
);

router.get(
  '/',
  authorize(PERMISSIONS.CASH_REGISTER_READ),
  validate(listRegistersQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(registerIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CASH_REGISTER_READ),
  asyncHandler(ctrl.getById),
);

router.get(
  '/:id/transactions',
  validate(registerIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CASH_REGISTER_READ),
  asyncHandler(ctrl.getTransactions),
);

module.exports = router;
