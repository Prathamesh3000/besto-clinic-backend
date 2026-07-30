'use strict';

const router = require('express').Router();
const ctrl = require('./billing.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const {
  createEnhancedInvoiceSchema,
  recordPaymentSchema,
  serviceItemSchema,
  updateServiceItemSchema,
  advancePaymentSchema,
  ledgerAdjustmentSchema,
  invoiceIdParamSchema,
  serviceItemIdParamSchema,
  patientIdParamSchema,
  writeOffSchema,
} = require('./billing.validator');

router.use(authenticate(), tenantResolver());
// router.use(tenantLimiter());

// ── Invoice ────────────────────────────────────────────────────────
router.post(
  '/invoice',
  authorize(PERMISSIONS.INVOICE_CREATE),
  validate(createEnhancedInvoiceSchema),
  asyncHandler(ctrl.createInvoice),
);

router.post(
  '/invoice/:id/payment',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PAYMENT_CREATE),
  validate(recordPaymentSchema),
  asyncHandler(ctrl.recordPayment),
);

// ── Service Items ──────────────────────────────────────────────────
router.get(
  '/service-items',
  authorize(PERMISSIONS.SERVICE_ITEM_READ),
  asyncHandler(ctrl.listServiceItems),
);

router.post(
  '/service-items',
  authorize(PERMISSIONS.SERVICE_ITEM_CREATE),
  validate(serviceItemSchema),
  asyncHandler(ctrl.createServiceItem),
);

router.put(
  '/service-items/:id',
  validate(serviceItemIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.SERVICE_ITEM_UPDATE),
  validate(updateServiceItemSchema),
  asyncHandler(ctrl.updateServiceItem),
);

// ── Analytics ──────────────────────────────────────────────────────
router.get(
  '/analytics/revenue',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.revenueAnalytics),
);

router.get(
  '/analytics/outstanding',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.outstandingReport),
);

router.get(
  '/analytics/doctor-revenue',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.doctorRevenue),
);

// ── Reports ───────────────────────────────────────────────────────
router.get(
  '/reports/day-end',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.dayEndReport),
);

router.get(
  '/reports/gst-summary',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.gstSummary),
);

router.get(
  '/reports/collection-metrics',
  authorize(PERMISSIONS.REVENUE_REPORT_VIEW),
  asyncHandler(ctrl.collectionMetrics),
);

// ── Audit Trail ───────────────────────────────────────────────────
router.get(
  '/audit-trail',
  authorize(PERMISSIONS.FINANCIAL_AUDIT_READ),
  asyncHandler(ctrl.financialAuditTrail),
);

// ── Write-Off ─────────────────────────────────────────────────────
router.post(
  '/write-off',
  authorize(PERMISSIONS.INVOICE_WRITE_OFF),
  validate(writeOffSchema),
  asyncHandler(ctrl.writeOff),
);

// ── Ledger ─────────────────────────────────────────────────────────
router.get(
  '/ledger/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.LEDGER_READ, PERMISSIONS.LEDGER_READ_OWN),
  asyncHandler(ctrl.patientLedger),
);

router.post(
  '/ledger/advance',
  authorize(PERMISSIONS.PAYMENT_CREATE),
  validate(advancePaymentSchema),
  asyncHandler(ctrl.recordAdvance),
);

router.post(
  '/ledger/adjustment',
  authorize(PERMISSIONS.LEDGER_ADJUST),
  validate(ledgerAdjustmentSchema),
  asyncHandler(ctrl.adjustLedger),
);

module.exports = router;
