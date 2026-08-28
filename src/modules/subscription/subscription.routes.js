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
  selfServeQuoteSchema,
  selfServeVerifySchema,
} = require('./subscription.validator');

// ── Tenant-authenticated routes (view own subscription) ──
router.get(
  '/',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_READ),
  asyncHandler(ctrl.getCurrent),
);

// ── Clinic self-service: plan, usage, upgrade, renewal, add-ons ──
// Declared before '/:id'-style routes; SUBSCRIPTION_PURCHASE is granted to the
// clinic's own admins, unlike SUBSCRIPTION_MANAGE which stays platform-only.
router.get(
  '/overview',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_READ),
  asyncHandler(ctrl.getOverview),
);

router.post(
  '/quote',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_READ),
  validate(selfServeQuoteSchema),
  asyncHandler(ctrl.quote),
);

router.post(
  '/upgrade/order',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_PURCHASE),
  validate(selfServeQuoteSchema),
  asyncHandler(ctrl.createUpgradeOrder),
);

router.post(
  '/upgrade/verify',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_PURCHASE),
  validate(selfServeVerifySchema),
  asyncHandler(ctrl.verifyUpgrade),
);

router.post(
  '/downgrade/schedule',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_PURCHASE),
  validate(selfServeQuoteSchema),
  asyncHandler(ctrl.scheduleDowngrade),
);

router.delete(
  '/downgrade/schedule',
  tenantResolver(),
  authenticate(),
  authorize(PERMISSIONS.SUBSCRIPTION_PURCHASE),
  asyncHandler(ctrl.cancelScheduledDowngrade),
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
