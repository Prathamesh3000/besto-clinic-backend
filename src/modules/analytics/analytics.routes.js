'use strict';

const router = require('express').Router();
const ctrl = require('./analytics.controller');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { PERMISSIONS } = require('../../config/permissions');
const { featureGuard } = require('../../middleware/featureGuard');
const { periodQuerySchema, doctorPerformanceSchema } = require('./analytics.validator');

router.use(authenticate(), tenantResolver());

// Summary (no query params needed)
router.get('/summary',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  asyncHandler(ctrl.getSummary),
);

// Revenue trends
router.get('/revenue',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getRevenueTrends),
);

// Appointment trends
router.get('/appointments',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getAppointmentTrends),
);

// Doctor performance
router.get('/doctors',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(doctorPerformanceSchema, 'query'),
  asyncHandler(ctrl.getDoctorPerformance),
);

// No-show analysis
router.get('/no-shows',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getNoShowAnalysis),
);

// Insurance claim trends
router.get('/insurance',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getInsuranceClaimTrends),
);

// Telemedicine usage
router.get('/telemedicine',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getTelemedicineUsage),
);

// Patient growth
router.get('/patients',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getPatientGrowth),
);

// Integration usage
router.get('/integrations',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  featureGuard('advancedReports'),
  asyncHandler(ctrl.getIntegrationUsage),
);

// Compliance overview
router.get('/compliance-overview',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  asyncHandler(ctrl.getComplianceOverview),
);

// Compliance alerts (paginated)
router.get('/compliance-alerts',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  asyncHandler(ctrl.getComplianceAlerts),
);

// Compliance trends
router.get('/compliance-trends',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  validate(periodQuerySchema, 'query'),
  asyncHandler(ctrl.getComplianceTrends),
);

// Resolve compliance alert
router.put('/compliance-alerts/:alertId/resolve',
  authorize(PERMISSIONS.CLINIC_ANALYTICS_VIEW),
  asyncHandler(ctrl.resolveComplianceAlert),
);

module.exports = router;
