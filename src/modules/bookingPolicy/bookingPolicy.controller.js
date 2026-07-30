'use strict';

const service = require('./bookingPolicy.service');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /booking-policy
 * Returns the fully resolved policy (all defaults filled in).
 */
exports.getResolved = async (req, res) => {
  const policy = await service.getResolvedPolicy(req.tenantSlug);
  res.json(ApiResponse.success('Booking policy resolved', policy));
};

/**
 * GET /booking-policy/raw
 * Returns the raw document (nulls visible) + system defaults.
 * Used by the settings UI to show what's configured vs inherited.
 */
exports.getRaw = async (req, res) => {
  const result = await service.getRawPolicy(req.tenantSlug);
  res.json(ApiResponse.success('Raw booking policy', result));
};

/**
 * PUT /booking-policy
 * Upsert the clinic booking policy.
 */
exports.update = async (req, res) => {
  const policy = await service.updatePolicy(req.body, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Booking policy updated', policy));
};
