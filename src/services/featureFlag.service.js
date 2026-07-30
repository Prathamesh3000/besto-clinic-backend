'use strict';

/**
 * Feature Flag Service — resolves dynamic feature flags with
 * a 3-tier hierarchy: tenant override > plan default > global default.
 *
 * Uses Redis caching (5-min TTL) for performance. Cache is invalidated
 * when subscriptions change, plans change, or tenant overrides are modified.
 */

const mongoose = require('mongoose');
const { getRedis } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const CACHE_TTL = 300; // 5 minutes

// ─── Single Flag Resolution ────────────────────────────

/**
 * Resolve a single feature flag for a clinic.
 *
 * @param {string} flagKey — FeatureFlag.key (e.g. 'teleHealthEnabled')
 * @param {string} clinicSlug — tenant identifier
 * @returns {*} resolved value (boolean, number, or string)
 */
async function resolveFlag(flagKey, clinicSlug) {
  const redis = getRedis();
  const cacheKey = `ff:${clinicSlug}:${flagKey}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const { planSlug } = await _getClinicPlanContext(clinicSlug);

  const FeatureFlag = mongoose.model('FeatureFlag');
  const flag = await FeatureFlag.findOne({ key: flagKey, isActive: true });

  if (!flag) {
    // Flag not defined — fail closed (deny by default)
    return false;
  }

  const resolved = flag.resolve(clinicSlug, planSlug);

  await redis.set(cacheKey, JSON.stringify(resolved), 'EX', CACHE_TTL);
  return resolved;
}

// ─── All Flags Resolution ──────────────────────────────

/**
 * Resolve all active feature flags for a clinic.
 *
 * @param {string} clinicSlug
 * @returns {{ flags: Object, plan: string, clinicSlug: string }}
 */
async function resolveAllFlags(clinicSlug) {
  const redis = getRedis();
  const cacheKey = `ff:all:${clinicSlug}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const { planSlug } = await _getClinicPlanContext(clinicSlug);

  const FeatureFlag = mongoose.model('FeatureFlag');
  const flags = await FeatureFlag.find({ isActive: true }).lean();

  const resolved = {};
  for (const flag of flags) {
    // Manually resolve since lean() strips methods
    let value;
    if (clinicSlug && flag.tenantOverrides && flag.tenantOverrides[clinicSlug] !== undefined) {
      value = flag.tenantOverrides[clinicSlug];
    } else if (planSlug && flag.planDefaults && flag.planDefaults[planSlug] !== undefined) {
      value = flag.planDefaults[planSlug];
    } else {
      value = flag.defaultValue;
    }
    resolved[flag.key] = value;
  }

  const result = { flags: resolved, plan: planSlug, clinicSlug };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
  return result;
}

// ─── Module Access Check ───────────────────────────────

/**
 * Check if a module is enabled for a clinic's current plan.
 *
 * Resolution order:
 *  1. FeatureFlag tenant override for moduleKey
 *  2. Plan's moduleConfig (includedInPlan + isActive)
 *  3. FeatureFlag plan default
 *  4. FeatureFlag global default
 *  5. false (not enabled)
 *
 * @param {string} clinicSlug
 * @param {string} moduleKey
 * @returns {boolean}
 */
async function isModuleEnabled(clinicSlug, moduleKey) {
  const redis = getRedis();
  const cacheKey = `ff:mod:${clinicSlug}:${moduleKey}`;

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: clinicSlug, isActive: true })
    .select('subscription.planRef')
    .lean();

  if (!clinic) {
    return false;
  }

  // 1. Check FeatureFlag tenant override first
  const FeatureFlag = mongoose.model('FeatureFlag');
  const flag = await FeatureFlag.findOne({ key: moduleKey, isActive: true });

  if (flag) {
    const overrideMap = flag.tenantOverrides instanceof Map
      ? flag.tenantOverrides
      : new Map(Object.entries(flag.tenantOverrides || {}));

    if (overrideMap.has(clinicSlug)) {
      const val = overrideMap.get(clinicSlug);
      await redis.set(cacheKey, JSON.stringify(!!val), 'EX', CACHE_TTL);
      return !!val;
    }
  }

  // 2. Check Plan's moduleConfig
  if (clinic.subscription?.planRef) {
    const Plan = mongoose.model('Plan');
    const plan = await Plan.findById(clinic.subscription.planRef).select('moduleConfig slug').lean();

    if (plan) {
      const mod = (plan.moduleConfig || []).find(
        (m) => m.moduleKey === moduleKey && m.isActive,
      );

      if (mod) {
        const enabled = mod.includedInPlan === true;
        await redis.set(cacheKey, JSON.stringify(enabled), 'EX', CACHE_TTL);
        return enabled;
      }

      // 3. Check FeatureFlag plan default
      if (flag) {
        const planMap = flag.planDefaults instanceof Map
          ? flag.planDefaults
          : new Map(Object.entries(flag.planDefaults || {}));

        if (planMap.has(plan.slug)) {
          const val = planMap.get(plan.slug);
          await redis.set(cacheKey, JSON.stringify(!!val), 'EX', CACHE_TTL);
          return !!val;
        }
      }
    }
  }

  // 4. FeatureFlag global default
  if (flag) {
    const val = !!flag.defaultValue;
    await redis.set(cacheKey, JSON.stringify(val), 'EX', CACHE_TTL);
    return val;
  }

  // 5. Not found anywhere — disabled
  await redis.set(cacheKey, 'false', 'EX', CACHE_TTL);
  return false;
}

// ─── Cache Invalidation ────────────────────────────────

/**
 * Invalidate all cached feature flag resolutions for a clinic.
 * Call when subscription changes, plan changes, or overrides are modified.
 *
 * @param {string} clinicSlug
 */
async function invalidateCache(clinicSlug) {
  try {
    const redis = getRedis();
    const patterns = [`ff:${clinicSlug}:*`, `ff:all:${clinicSlug}`, `ff:mod:${clinicSlug}:*`];

    // Collect all keys first, then delete in a single pipeline
    const allKeys = [];
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      allKeys.push(...keys);
    }

    if (allKeys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of allKeys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }

    logger.debug('Feature flag cache invalidated for clinic: %s (%d keys)', clinicSlug, allKeys.length);
  } catch (err) {
    // Cache invalidation failure is non-fatal — flags will expire via TTL
    logger.warn('Failed to invalidate feature flag cache for %s: %s', clinicSlug, err.message);
  }
}

// ─── Internals ─────────────────────────────────────────

/**
 * Get clinic's current plan slug for flag resolution.
 */
async function _getClinicPlanContext(clinicSlug) {
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: clinicSlug, isActive: true })
    .select('subscription.plan')
    .lean();

  if (!clinic) {
    throw ApiError.notFound('Clinic not found');
  }

  return { planSlug: clinic.subscription?.plan || 'free' };
}

module.exports = {
  resolveFlag,
  resolveAllFlags,
  isModuleEnabled,
  invalidateCache,
};
