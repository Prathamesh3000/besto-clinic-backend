'use strict';

/**
 * Subscription plan enforcement middleware.
 *
 * Checks whether the current tenant's subscription plan includes
 * the requested feature. Returns 403 if the feature is gated.
 *
 * Usage:
 *   router.post('/telehealth', subscriptionGuard('teleHealthEnabled'), ctrl.start);
 *   router.post('/branch',     subscriptionGuard('maxBranches', 3),    ctrl.create);
 */

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_TTL = 300; // 5 min

/**
 * @param {string} featureKey — matches a key in Clinic.features (e.g. 'teleHealthEnabled', 'smsEnabled')
 * @param {number} [minValue] — for numeric features (e.g. maxDoctors), the minimum value required
 */
function subscriptionGuard(featureKey, minValue) {
  return async (req, _res, next) => {
    try {
      const slug = req.tenantSlug;
      if (!slug) return next(); // no tenant context — skip (platform routes)

      const features = await _getClinicFeatures(slug);
      if (!features) {
        return next(ApiError.notFound('Clinic not found'));
      }

      const value = features[featureKey];

      // Boolean feature flag
      if (typeof value === 'boolean' && !value) {
        return next(
          ApiError.forbidden(
            `Feature "${featureKey}" is not available on your current plan. Please upgrade.`,
          ),
        );
      }

      // Numeric limit (e.g. maxDoctors)
      if (typeof value === 'number' && minValue !== undefined && value < minValue) {
        return next(
          ApiError.forbidden(
            `Your plan allows up to ${value} for "${featureKey}". Please upgrade for more.`,
          ),
        );
      }

      next();
    } catch (err) {
      logger.error('subscriptionGuard error: %s', err.message);
      next(err);
    }
  };
}

/**
 * Fetch clinic features with Redis caching.
 */
async function _getClinicFeatures(slug) {
  const redis = getRedis();
  const cacheKey = `clinic:features:${slug}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug, isActive: true }).select('features').lean();
  if (!clinic) return null;

  await redis.set(cacheKey, JSON.stringify(clinic.features), 'EX', CACHE_TTL);
  return clinic.features;
}

module.exports = subscriptionGuard;
