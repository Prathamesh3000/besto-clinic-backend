'use strict';

/**
 * Which entities a clinic reads from PostgreSQL — the per-clinic cutover state.
 *
 * Plan phase 7 is a "per-clinic cutover, rehearsed rollback". The only switch
 * before this was the global `SQL_ENTITIES` environment variable, which moves
 * every clinic at once: a big-bang cutover, and the one thing a rehearsed
 * rollback is meant to avoid.
 *
 * Read on every request, so it is cached in Redis the same way subscription
 * status is. The list changes when someone cuts a clinic over or rolls it back
 * — a handful of times across the whole programme — and paying a database round
 * trip per request for that would be a poor trade.
 *
 * `clearCutoverCache` exists because the one moment the cache must not be stale
 * is a rollback: a clinic is misbehaving on PostgreSQL and someone needs it back
 * on Mongo now, not in five minutes.
 */

const mongoose = require('mongoose');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');

const CACHE_TTL = 300; // 5 min, matching the subscription-status cache
const key = (slug) => `clinic:migration:entities:${slug}`;

/**
 * The clinic's cut-over entities, or `[]`.
 *
 * Every failure path returns `[]` rather than throwing. An empty list means
 * "read from Mongo", which is where the data certainly is — failing open onto
 * PostgreSQL would route a clinic at a schema that may never have been loaded.
 */
async function getCutoverEntities(slug) {
  if (!slug) return [];

  try {
    const redis = getRedis();
    const cached = await redis.get(key(slug));
    if (cached !== null && cached !== undefined) {
      try {
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  } catch (err) {
    // Redis down is not a reason to fail the request, nor to guess.
    logger.warn('Cutover cache read failed for %s: %s', slug, err.message);
  }

  let entities = [];
  try {
    const Clinic = mongoose.model('Clinic');
    const clinic = await Clinic.findOne({ slug, deletedAt: null })
      .select('migration.sqlEntities')
      .lean();
    entities = clinic?.migration?.sqlEntities || [];
  } catch (err) {
    logger.error('Cutover state lookup failed for %s: %s', slug, err.message);
    return [];
  }

  try {
    const redis = getRedis();
    await redis.set(key(slug), JSON.stringify(entities), 'EX', CACHE_TTL);
  } catch {
    // Caching is an optimisation; a miss next time is acceptable.
  }

  return entities;
}

/**
 * Drop the cached list so the next request re-reads it.
 *
 * Called by the cutover script on both cut over and roll back. A rollback that
 * took five minutes to take effect would be five minutes of a clinic serving
 * from a database someone has decided is wrong.
 */
async function clearCutoverCache(slug) {
  try {
    const redis = getRedis();
    await redis.del(key(slug));
    return true;
  } catch (err) {
    logger.warn('Could not clear cutover cache for %s: %s', slug, err.message);
    return false;
  }
}

module.exports = { getCutoverEntities, clearCutoverCache, CACHE_TTL };
