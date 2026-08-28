'use strict';

/**
 * Feature flag enforcement middleware — dynamic feature gating
 * using the FeatureFlag model's 3-tier resolution hierarchy:
 *   tenant override > plan default > global default
 *
 * Middleware factories + cache helper:
 *
 *   featureGuard(flagKey)
 *     — Resolve a dynamic FeatureFlag and block if disabled.
 *
 *   moduleGuard(moduleKey)
 *     — Check if a module is enabled on the clinic's plan.
 *
 *   subscriptionActive()
 *     — Ensure the tenant's subscription is active (not suspended/cancelled).
 *       Reads tenant slug from req.tenantSlug or x-tenant-id header directly,
 *       so it can be applied globally before tenantResolver() runs.
 *
 *   invalidateSubscriptionCache(slug)
 *     — Clear Redis-cached subscription status for immediate enforcement.
 *
 * Usage:
 *   router.use(subscriptionActive());
 *   router.post('/telehealth', featureGuard('teleHealthEnabled'), ctrl.start);
 *   router.get('/inventory', moduleGuard('inventory'), ctrl.list);
 */

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const featureFlagService = require('../services/featureFlag.service');
const { getRedis } = require('../config/redis');
const { TENANT_HEADER, TENANT_STATUS, SUBSCRIPTION_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

const SUBSCRIPTION_CACHE_TTL = 300; // 5 min

// ─── Feature Guard ─────────────────────────────────────

/**
 * Middleware that resolves a FeatureFlag and blocks if the feature is disabled.
 *
 * @param {string} flagKey — FeatureFlag.key (e.g. 'teleHealthEnabled')
 * @param {object} [options]
 * @param {number} [options.minValue] — for numeric flags, the minimum value required
 */
function featureGuard(flagKey, options = {}) {
  return async (req, _res, next) => {
    try {
      const slug = req.tenantSlug;
      if (!slug) return next(); // no tenant context — skip (platform routes)

      const resolved = await featureFlagService.resolveFlag(flagKey, slug);

      // Flag not defined or boolean false — fail closed (deny by default)
      if (resolved === undefined || resolved === false) {
        return next(
          ApiError.forbidden(
            `Feature "${flagKey}" is not available on your current plan. Please upgrade.`,
          ),
        );
      }

      // Numeric check
      if (typeof resolved === 'number' && options.minValue !== undefined && resolved < options.minValue) {
        return next(
          ApiError.forbidden(
            `Your plan allows up to ${resolved} for "${flagKey}". Please upgrade for more.`,
          ),
        );
      }

      // String check — empty string or falsy means disabled
      if (typeof resolved === 'string' && !resolved) {
        return next(
          ApiError.forbidden(
            `Feature "${flagKey}" is not available on your current plan. Please upgrade.`,
          ),
        );
      }

      next();
    } catch (err) {
      logger.error('featureGuard(%s) error — failing closed: %s', flagKey, err.message);
      next(ApiError.serviceUnavailable('Feature check failed. Please try again later.'));
    }
  };
}

// ─── Module Guard ──────────────────────────────────────

/**
 * Middleware that checks if a module is enabled on the clinic's plan.
 *
 * @param {string} moduleKey — matches Plan.moduleConfig[].moduleKey
 */
function moduleGuard(moduleKey) {
  return async (req, _res, next) => {
    try {
      const slug = req.tenantSlug;
      if (!slug) return next();

      const enabled = await featureFlagService.isModuleEnabled(slug, moduleKey);

      if (!enabled) {
        return next(
          ApiError.forbidden(
            `Module "${moduleKey}" is not enabled on your current plan.`,
          ),
        );
      }

      next();
    } catch (err) {
      logger.error('moduleGuard(%s) error: %s', moduleKey, err.message);
      next(err);
    }
  };
}

// ─── Subscription Active Guard ─────────────────────────

/**
 * Router-level middleware that ensures the tenant's subscription
 * is in an active state (trial, active, or grace_period).
 * Blocks requests if subscription is suspended or cancelled.
 *
 * Reads tenant slug from req.tenantSlug (set by tenantResolver)
 * or falls back to the x-tenant-id header directly — allowing
 * this middleware to be applied globally before tenantResolver runs.
 */
function subscriptionActive() {
  return async (req, _res, next) => {
    try {
      // Read from tenantSlug (if tenantResolver already ran) or from header directly
      const slug = req.tenantSlug || (req.headers[TENANT_HEADER] || '').trim().toLowerCase();
      if (!slug) return next(); // No tenant context — skip

      const result = await _getSubscriptionStatus(slug);

      if (!result) {
        return next(ApiError.notFound('Clinic not found'));
      }

      const blocked = ['suspended', 'cancelled'];
      if (blocked.includes(result.status)) {
        return next(
          ApiError.forbidden(
            `Your clinic subscription is ${result.status}. Please contact support or reactivate your subscription.`,
            { code: 'SUBSCRIPTION_BLOCKED', subscriptionStatus: result.status, reason: result.reason || null },
          ),
        );
      }

      next();
    } catch (err) {
      logger.error('subscriptionActive() error: %s', err.message);
      next(err);
    }
  };
}

// ─── Cache Invalidation ───────────────────────────────

/**
 * Immediately clear the Redis-cached subscription status for a tenant.
 * Call after any status change (suspend, activate, cancel, subscription transition)
 * to ensure the next request sees the updated state without waiting for TTL expiry.
 */
async function invalidateSubscriptionCache(slug) {
  try {
    const redis = getRedis();
    await redis.del(`clinic:sub:status:${slug}`);
  } catch (err) {
    logger.error('Failed to invalidate subscription cache for %s: %s', slug, err.message);
  }
}

// ─── Internals ─────────────────────────────────────────

/**
 * Get subscription status for a clinic, using Redis cache.
 * Returns { status, reason } or null if clinic not found.
 *
 * Queries without `isActive: true` so suspended/cancelled clinics
 * are found and return proper 403 (not 404).
 */
async function _getSubscriptionStatus(slug) {
  const redis = getRedis();
  const cacheKey = `clinic:sub:status:${slug}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Legacy string cache — treat as status-only
      return { status: cached, reason: null };
    }
  }

  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug, deletedAt: null })
    .select('status isActive subscription.status suspensionReason')
    .lean();

  if (!clinic) return null;

  // Tenant lifecycle and subscription state are two independent fields (see the
  // Clinic schema). This previously read subscription.status alone, so a tenant
  // suspended by the product owner — which sets clinic.status and isActive but
  // deliberately leaves the subscription untouched — was never blocked at all, and
  // kept full access to every route. Check the lifecycle first; it outranks the
  // subscription, since suspending a clinic must lock it out regardless of billing.
  const tenantBlocked = clinic.isActive === false
    || clinic.status === TENANT_STATUS.SUSPENDED
    || clinic.status === TENANT_STATUS.CANCELLED;

  // An absent subscription.status means the field was never written, not that the
  // clinic was cancelled — Clinic.subscription.status defaults to 'trial', and
  // both getCurrentSubscription() and selfServe.getOverview() already read an
  // absent status as a live legacy subscription. Defaulting to 'cancelled' here
  // contradicted them and locked those clinics out of every tenant route.
  let subStatus = clinic.subscription?.status;
  if (!subStatus) {
    logger.warn(
      'Clinic %s has no subscription.status — treating as %s',
      slug, SUBSCRIPTION_STATUS.TRIAL,
    );
    subStatus = SUBSCRIPTION_STATUS.TRIAL;
  }

  const result = {
    status: tenantBlocked
      ? (clinic.status === TENANT_STATUS.CANCELLED ? 'cancelled' : 'suspended')
      : subStatus,
    reason: clinic.suspensionReason || null,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', SUBSCRIPTION_CACHE_TTL);
  return result;
}

// ─── Clinic Feature Guard ─────────────────────────────

/**
 * Middleware that checks a feature directly on the Clinic.features document.
 *
 * Use this for **platform-managed** features (e.g. jobPortalEnabled) that the
 * product owner toggles per-clinic via the admin panel, as opposed to dynamic
 * FeatureFlag entries resolved through the 3-tier hierarchy.
 *
 * Includes Redis caching (2-min TTL) so the Clinic collection isn't hit on
 * every single request.
 *
 * @param {string} featureKey — clinic.features[featureKey]
 */
const CLINIC_FEATURE_CACHE_TTL = 120; // 2 min

function clinicFeatureGuard(featureKey) {
  return async (req, _res, next) => {
    try {
      const slug = req.tenantSlug;
      if (!slug) return next(); // no tenant context — skip (platform routes)

      const redis = getRedis();
      const cacheKey = `clinic:feat:${slug}:${featureKey}`;

      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        if (cached === 'true') return next();
        return next(
          ApiError.forbidden(
            `The "${featureKey}" feature is not enabled for your clinic. Contact your platform administrator.`,
          ),
        );
      }

      const Clinic = mongoose.model('Clinic');
      const clinic = await Clinic.findOne({ slug, isActive: true, deletedAt: null })
        .select(`features.${featureKey}`)
        .lean();

      if (!clinic) {
        return next(ApiError.notFound('Clinic not found'));
      }

      const enabled = !!(clinic.features && clinic.features[featureKey]);
      await redis.set(cacheKey, String(enabled), 'EX', CLINIC_FEATURE_CACHE_TTL);

      if (!enabled) {
        return next(
          ApiError.forbidden(
            `The "${featureKey}" feature is not enabled for your clinic. Contact your platform administrator.`,
          ),
        );
      }

      next();
    } catch (err) {
      logger.error('clinicFeatureGuard(%s) error — failing closed: %s', featureKey, err.message);
      next(ApiError.serviceUnavailable('Feature check failed. Please try again later.'));
    }
  };
}

/**
 * Invalidate the clinicFeatureGuard cache for a given clinic + feature.
 * Call from the platform admin controller when toggling features.
 */
async function invalidateClinicFeatureCache(slug, featureKey) {
  try {
    const redis = getRedis();
    if (featureKey) {
      await redis.del(`clinic:feat:${slug}:${featureKey}`);
    } else {
      // Invalidate all features for this clinic
      const keys = await redis.keys(`clinic:feat:${slug}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (err) {
    logger.warn('Failed to invalidate clinic feature cache for %s: %s', slug, err.message);
  }
}

module.exports = { featureGuard, moduleGuard, subscriptionActive, invalidateSubscriptionCache, clinicFeatureGuard, invalidateClinicFeatureCache };
