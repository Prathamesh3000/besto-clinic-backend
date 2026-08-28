'use strict';

const router = require('express').Router();
const { authenticate, platformAuthenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { requireRole } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const ctrl = require('./globalSearch.controller');
const { globalSearchQuerySchema } = require('./globalSearch.validator');

// Tenant global search
router.get(
  '/tenant',
  authenticate(),
  tenantResolver(),
  validate(globalSearchQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.tenantSearch),
);

// Patient portal global search
router.get(
  '/patient',
  authenticate(),
  tenantResolver(),
  requireRole('patient', 'guardian'),
  validate(globalSearchQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.patientSearch),
);

// Platform global search
router.get(
  '/platform',
  platformAuthenticate(),
  validate(globalSearchQuerySchema, { source: 'query' }),
  asyncHandler(ctrl.platformSearch),
);

module.exports = router;
