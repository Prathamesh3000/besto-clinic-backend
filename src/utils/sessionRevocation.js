'use strict';

/**
 * Tenant-wide session revocation.
 *
 * Why a timestamp rather than a blacklist: access-token `jti` values are never
 * persisted — only refresh tokens are stored, under
 * `auth:refresh:devices:<userId>`. There is therefore no list of live access
 * tokens to revoke one by one. Recording a single per-tenant cut-off and
 * comparing it against each token's `iat` invalidates every session issued
 * before that moment while tracking none of them.
 *
 * Read by authenticate() on every request, folded into the MGET it already makes
 * for the blacklist, so this costs no extra round trip.
 */

const { getRedis } = require('../config/redis');
const logger = require('./logger');

// Matches the refresh-token lifetime used in auth.service._storeRefreshToken.
// Once no token issued before the cut-off can still verify, the key is dead
// weight, so it expires itself rather than accumulating one entry per tenant.
const REVOCATION_TTL_SECONDS = 7 * 24 * 3600;

/** Redis key holding the cut-off for a tenant. */
function tenantRevocationKey(slug) {
  return `auth:tenant:revokedAt:${slug}`;
}

/**
 * End every active session for a tenant, immediately.
 *
 * Deliberately NOT cleared on reactivation: tokens minted before the suspension
 * must stay dead, and tokens minted after it carry a later `iat` and pass
 * anyway, so the stamp can simply age out.
 *
 * @param {string} slug — tenant slug
 * @returns {Promise<number|null>} the cut-off written, or null if Redis is down
 */
async function revokeTenantSessions(slug) {
  try {
    const redis = getRedis();
    const cutoff = Math.floor(Date.now() / 1000);
    await redis.set(tenantRevocationKey(slug), String(cutoff), 'EX', REVOCATION_TTL_SECONDS);
    logger.warn('Sessions revoked for tenant %s (cut-off %d)', slug, cutoff);
    return cutoff;
  } catch (err) {
    // Suspension itself has already been persisted; losing the stamp only means
    // existing sessions survive until their token expires. Surface it loudly
    // rather than failing the suspend.
    logger.error('Could not revoke sessions for %s: %s', slug, err.message);
    return null;
  }
}

module.exports = { revokeTenantSessions, tenantRevocationKey, REVOCATION_TTL_SECONDS };
