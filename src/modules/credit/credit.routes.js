'use strict';

/**
 * Credit Routes — credit balance, transactions, and purchases.
 *
 * Mounted at: /api/v1/credits
 * Requires tenant authentication + job portal feature.
 */

const express = require('express');
const router = express.Router();
const controller = require('./credit.controller');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { clinicFeatureGuard } = require('../../middleware/featureGuard');
const { validate } = require('../../middleware/validate');
const { PERMISSIONS } = require('../../config/permissions');
const { creditPurchaseSchema, creditVerifySchema } = require('../jobPortal/jobPortal.validator');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate(), tenantResolver(), clinicFeatureGuard('jobPortalEnabled'));

router.get(
  '/balance',
  authorize(PERMISSIONS.CREDIT_READ),
  asyncHandler(controller.getBalance),
);

router.get(
  '/transactions',
  authorize(PERMISSIONS.CREDIT_READ),
  asyncHandler(controller.getTransactions),
);

router.get(
  '/packs',
  authorize(PERMISSIONS.CREDIT_READ),
  asyncHandler(controller.getPacks),
);

router.post(
  '/purchase',
  authorize(PERMISSIONS.CREDIT_MANAGE),
  validate(creditPurchaseSchema),
  asyncHandler(controller.purchaseCredits),
);

router.post(
  '/purchase/verify',
  authorize(PERMISSIONS.CREDIT_MANAGE),
  validate(creditVerifySchema),
  asyncHandler(controller.verifyPurchase),
);

module.exports = router;
