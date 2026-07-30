'use strict';

const router = require('express').Router();
const ctrl = require('./integrationViewer.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const v = require('./integrationViewer.validator');

// All integration viewer routes require tenant context + auth
router.use(authenticate(), tenantResolver());

// List sync logs (paginated, filterable)
router.get(
  '/sync-logs',
  authorize(PERMISSIONS.INTEGRATION_VIEW_DATA),
  validate(v.listSyncLogsQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.listSyncLogs),
);

// Get sync log details by ID
router.get(
  '/sync-logs/:id',
  authorize(PERMISSIONS.INTEGRATION_VIEW_DATA),
  validate(v.syncLogIdParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getSyncLogById),
);

// Get integration status summary
router.get(
  '/status',
  authorize(PERMISSIONS.INTEGRATION_VIEW_DATA),
  asyncHandler(ctrl.getIntegrationStatus),
);

// Get synced data for a specific patient
router.get(
  '/patient/:patientId/data',
  authorize(PERMISSIONS.INTEGRATION_VIEW_DATA),
  validate(v.patientIdParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getPatientSyncedData),
);

module.exports = router;
