'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('./dentalScan.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  initiateScanSchema,
  uploadImageSchema,
  scanIdParamSchema,
  reviewScanSchema,
  recommendationQuerySchema,
  validateFrameSchema,
  detectTeethSchema,
} = require('./dentalScan.validator');

router.use(authenticate(), tenantResolver());

// POST /dental-scans — patient initiates a guided scan (consent + creates record)
router.post(
  '/',
  authorize(PERMISSIONS.DENTAL_SCAN_CREATE),
  validate(initiateScanSchema),
  asyncHandler(ctrl.initiate),
);

// PUT /dental-scans/:id/upload — upload single image for a specific angle (10MB limit)
router.put(
  '/:id/upload',
  express.json({ limit: '10mb' }),
  validate(scanIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DENTAL_SCAN_CREATE),
  validate(uploadImageSchema),
  asyncHandler(ctrl.uploadImage),
);

// POST /dental-scans/:id/analyze — trigger AI analysis (requires all 5 angles)
router.post(
  '/:id/analyze',
  validate(scanIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DENTAL_SCAN_CREATE),
  asyncHandler(ctrl.triggerAnalysis),
);

// ── NEW: Real-time validation endpoints ──

// POST /dental-scans/:id/validate-frame — validate frame during positioning (pre-capture)
router.post(
  '/:id/validate-frame',
  express.json({ limit: '10mb' }),
  validate(scanIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DENTAL_SCAN_CREATE),
  validate(validateFrameSchema),
  asyncHandler(ctrl.validateFrame),
);

// POST /dental-scans/:id/detect-teeth — detect visible teeth per angle (post-capture)
router.post(
  '/:id/detect-teeth',
  express.json({ limit: '10mb' }),
  validate(scanIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DENTAL_SCAN_CREATE),
  validate(detectTeethSchema),
  asyncHandler(ctrl.detectTeeth),
);

// GET /dental-scans/:id/result — get AI scan result
router.get(
  '/:id/result',
  validate(scanIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.DENTAL_SCAN_READ_OWN, PERMISSIONS.DENTAL_SCAN_READ),
  asyncHandler(ctrl.getResult),
);

// GET /dental-scans/:id/recommendations — get doctor recommendations
router.get(
  '/:id/recommendations',
  validate(scanIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.DENTAL_SCAN_READ_OWN, PERMISSIONS.DENTAL_SCAN_READ),
  validate(recommendationQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.getRecommendations),
);

// GET /dental-scans/history — list patient scans (MUST come before /:id)
router.get(
  '/history',
  authorizeAny(PERMISSIONS.DENTAL_SCAN_READ_OWN, PERMISSIONS.DENTAL_SCAN_READ),
  asyncHandler(ctrl.list),
);

// GET /dental-scans/:id — single scan with full details
router.get(
  '/:id',
  validate(scanIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.DENTAL_SCAN_READ_OWN, PERMISSIONS.DENTAL_SCAN_READ),
  asyncHandler(ctrl.getById),
);

// PUT /dental-scans/:id/review — doctor submits review
router.put(
  '/:id/review',
  validate(scanIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.DENTAL_SCAN_REVIEW),
  validate(reviewScanSchema),
  asyncHandler(ctrl.review),
);

module.exports = router;
