'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('./payment.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createPaymentSchema,
  createGatewayOrderSchema,
  verifyGatewayPaymentSchema,
  refundPaymentSchema,
  paymentIdParamSchema,
  invoiceIdParamSchema,
} = require('./payment.validator');

/* ── Webhook — no auth, signature verified in handler ──────────────── */
// The raw body parser for this path is mounted in app.js, ahead of the global
// express.json(). Declaring express.raw() here as well was a no-op — body-parser
// skips once any parser has marked the request read — and having it in two
// places hid that. One place decides how this body is parsed; it is app.js.
router.post(
  '/gateway/webhook',
  asyncHandler(ctrl.webhook),
);

/* ── All other routes require tenant + auth ────────────────────────── */
// const { tenantLimiter } = require('../../middleware/rateLimiter');
router.use(authenticate(), tenantResolver());
// router.use(tenantLimiter());

router.post(
  '/',
  authorize(PERMISSIONS.PAYMENT_CREATE),
  validate(createPaymentSchema),
  asyncHandler(ctrl.create),
);

router.post(
  '/gateway/order',
  authorize(PERMISSIONS.PAYMENT_CREATE),
  validate(createGatewayOrderSchema),
  asyncHandler(ctrl.createOrder),
);

router.post(
  '/gateway/verify',
  authorize(PERMISSIONS.PAYMENT_CREATE),
  validate(verifyGatewayPaymentSchema),
  asyncHandler(ctrl.verifyPayment),
);

router.post(
  '/:id/refund',
  validate(paymentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PAYMENT_REFUND),
  validate(refundPaymentSchema),
  asyncHandler(ctrl.refund),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/invoice/:invoiceId',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.getForInvoice),
);

router.get(
  '/:id/receipt',
  validate(paymentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.downloadReceipt),
);

router.get(
  '/:id',
  validate(paymentIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.getById),
);

module.exports = router;
