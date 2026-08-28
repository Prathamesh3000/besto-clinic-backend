'use strict';

const router = require('express').Router();
const ctrl = require('./insurance.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createProviderSchema,
  updateProviderSchema,
  createClaimSchema,
  updateClaimStatusSchema,
  idParamSchema,
} = require('./insurance.validator');

router.use(authenticate(), tenantResolver());

// ── Insurance Providers ──────────────────────────────────────────────

router.get(
  '/providers',
  authorizeAny(PERMISSIONS.INSURANCE_READ),
  asyncHandler(ctrl.listProviders),
);

router.get(
  '/providers/:id',
  validate(idParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.INSURANCE_READ),
  asyncHandler(ctrl.getProviderById),
);

router.post(
  '/providers',
  authorize(PERMISSIONS.INSURANCE_CREATE),
  validate(createProviderSchema),
  asyncHandler(ctrl.createProvider),
);

router.put(
  '/providers/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  validate(updateProviderSchema),
  asyncHandler(ctrl.updateProvider),
);

router.delete(
  '/providers/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  asyncHandler(ctrl.deleteProvider),
);

// ── Insurance Claims ─────────────────────────────────────────────────

router.get(
  '/claims',
  authorizeAny(PERMISSIONS.INSURANCE_READ),
  asyncHandler(ctrl.listClaims),
);

router.get(
  '/claims/:id',
  validate(idParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.INSURANCE_READ),
  asyncHandler(ctrl.getClaimById),
);

router.post(
  '/claims',
  authorize(PERMISSIONS.INSURANCE_CREATE),
  validate(createClaimSchema),
  asyncHandler(ctrl.createClaim),
);

router.put(
  '/claims/:id/status',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  validate(updateClaimStatusSchema),
  asyncHandler(ctrl.updateClaimStatus),
);

router.delete(
  '/claims/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  asyncHandler(ctrl.deleteClaim),
);

router.put(
  '/claims/:id/pre-auth',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  asyncHandler(ctrl.recordPreAuth),
);

router.get(
  '/claims/:id/co-pay',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_READ),
  asyncHandler(ctrl.calculateCoPay),
);

router.put(
  '/claims/:id/reconcile',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INSURANCE_UPDATE),
  asyncHandler(ctrl.reconcileSettlement),
);

module.exports = router;
