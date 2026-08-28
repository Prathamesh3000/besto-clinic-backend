'use strict';

const router = require('express').Router();
const ctrl = require('./integration.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { moduleGuard, featureGuard } = require('../../middleware/featureGuard');
const v = require('./integration.validator');

// All integration routes require tenant context + auth + module enabled
router.use(authenticate(), tenantResolver());
router.use(moduleGuard('externalIntegrations'));
router.use(featureGuard('apiAccess'));

// Sync logs (must be before /:type to avoid route collision)
router.get(
  '/logs',
  validate(v.syncLogQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.getSyncLogs),
);

// List all integrations for this tenant
router.get('/', asyncHandler(ctrl.listIntegrations));

// Get specific integration
router.get(
  '/:type',
  validate(v.integrationTypeParamSchema, { source: 'params' }),
  asyncHandler(ctrl.getIntegration),
);

// Create/update integration config
router.put(
  '/',
  authorize('integration:manage'),
  validate(v.upsertIntegrationSchema),
  asyncHandler(ctrl.upsertIntegration),
);

// Store credentials
router.post(
  '/:type/credentials',
  validate(v.integrationTypeParamSchema, { source: 'params' }),
  authorize('integration:manage'),
  validate(v.storeCredentialsSchema),
  asyncHandler(ctrl.storeCredentials),
);

// Test connection
router.post(
  '/:type/test',
  validate(v.integrationTypeParamSchema, { source: 'params' }),
  authorize('integration:manage'),
  asyncHandler(ctrl.testConnection),
);

// Trigger manual sync
router.post(
  '/:type/sync',
  validate(v.integrationTypeParamSchema, { source: 'params' }),
  authorize('integration:manage'),
  validate(v.triggerSyncSchema),
  asyncHandler(ctrl.triggerSync),
);

// Disable integration
router.delete(
  '/:type',
  validate(v.integrationTypeParamSchema, { source: 'params' }),
  authorize('integration:manage'),
  asyncHandler(ctrl.disableIntegration),
);

module.exports = router;
