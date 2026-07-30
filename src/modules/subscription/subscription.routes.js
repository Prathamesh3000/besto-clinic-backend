'use strict';

const router = require('express').Router();
const ctrl = require('./subscription.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate, platformAuthenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  webhookPayloadSchema,
} = require('./subscription.validator');

// ── Tenant-authenticated routes (view own subscription) ──
router.get(
  '/',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_READ),
  asyncHandler(ctrl.getCurrent),
);

// ── Platform-authenticated routes (manage subscriptions) ──
router.post(
  '/',
  tenantResolver(),
  platformAuthenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_MANAGE),
  validate(createSubscriptionSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/change-plan',
  tenantResolver(),
  platformAuthenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_MANAGE),
  validate(updateSubscriptionSchema),
  asyncHandler(ctrl.changePlan),
);

router.post(
  '/cancel',
  tenantResolver(),
  platformAuthenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_MANAGE),
  asyncHandler(ctrl.cancel),
);

// ── Webhook (no JWT auth — verified by Razorpay HMAC signature) ──
// Note: express.json() must have already parsed the body.
// The controller calls verifyWebhookSignature(req.body, req.headers['x-razorpay-signature'])
// In production, the signature header is REQUIRED (enforced below).
router.post(
  '/webhook',
  (req, _res, next) => {
    if (process.env.NODE_ENV === 'production' && !req.headers['x-razorpay-signature']) {
      return next(require('../../utils/ApiError').unauthorized('Missing x-razorpay-signature header'));
    }
    next();
  },
  validate(webhookPayloadSchema),
  asyncHandler(ctrl.webhook),
);

module.exports = router;
