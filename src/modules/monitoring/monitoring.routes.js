'use strict';

const router = require('express').Router();
const ctrl = require('./monitoring.controller');
const { platformAuthenticate } = require('../../middleware/authenticate');
const asyncHandler = require('../../utils/asyncHandler');

// ── Public probes (no auth required) ─────────────
// These are designed for load balancers, Kubernetes, and Prometheus
router.get('/health',  asyncHandler(ctrl.healthCheck));
router.get('/ready',   asyncHandler(ctrl.readinessProbe));
router.get('/live',    ctrl.livenessProbe);
router.get('/prometheus', ctrl.prometheusMetrics);

// ── Admin-only monitoring (platform auth) ────────
router.use(platformAuthenticate());

router.get('/metrics',       asyncHandler(ctrl.getApiMetrics));
router.get('/system',        asyncHandler(ctrl.getSystemReport));
router.get('/memory',        asyncHandler(ctrl.getMemory));
router.get('/slow-queries',  asyncHandler(ctrl.getSlowQueries));
router.get('/errors',        asyncHandler(ctrl.getRecentErrors));
router.post('/reset',        asyncHandler(ctrl.resetApiMetrics));

module.exports = router;
