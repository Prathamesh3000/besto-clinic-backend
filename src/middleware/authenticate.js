'use strict';

/**
 * JWT authentication middleware — extracts Bearer token from Authorization header,
 * verifies it, attaches decoded payload to req.user.
 *
 * Supports two modes:
 *   authenticate()         → verifies against JWT_ACCESS_SECRET (tenant users)
 *   platformAuthenticate() → verifies against JWT_PLATFORM_SECRET (product_owner)
 */

const ApiError = require('../utils/ApiError');
const { verifyAccessToken, verifyPlatformToken } = require('../utils/tokenHelper');
const { getRedis } = require('../config/redis');
const { tenantRevocationKey } = require('../utils/sessionRevocation');

/**
 * Standard tenant-user authentication.
 */
function authenticate() {
  return async (req, _res, next) => {
    try {
      const token = _extractToken(req);
      const decoded = verifyAccessToken(token);

      const redis = getRedis();

      // Two checks, one round trip:
      //   1. per-token blacklist  — logout / role-change revocation
      //   2. per-tenant cut-off   — set when a clinic is suspended
      //
      // The cut-off exists because access-token jti values are never persisted
      // (only refresh tokens are), so there is no list of live sessions to
      // revoke individually. Comparing the token's issued-at against a single
      // per-tenant timestamp invalidates every token minted before the
      // suspension, without tracking any of them.
      const [isBlacklisted, revokedAt] = await redis.mget(
        `auth:blacklist:${decoded.jti}`,
        tenantRevocationKey(decoded.tenantSlug || '__none__'),
      );

      if (isBlacklisted) {
        throw ApiError.unauthorized('Token has been revoked');
      }

      // jwt `iat` is in seconds; the stamp is stored in the same unit.
      if (revokedAt && decoded.iat && decoded.iat < Number(revokedAt)) {
        throw ApiError.unauthorized('Session ended — this clinic account was suspended');
      }

      req.user = decoded;
      next();
    } catch (err) {
      if (err instanceof ApiError) return next(err);
      next(ApiError.unauthorized('Invalid or expired token'));
    }
  };
}

/**
 * Platform-level authentication (product_owner only).
 */
function platformAuthenticate() {
  return async (req, _res, next) => {
    try {
      const token = _extractToken(req);
      const decoded = verifyPlatformToken(token);

      // Check token blacklist (for logout / revocation)
      const redis = getRedis();
      const isBlacklisted = await redis.get(`auth:blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        throw ApiError.unauthorized('Token has been revoked');
      }

      if (decoded.role !== 'product_owner') {
        throw ApiError.forbidden('Platform access requires product_owner role');
      }

      req.user = decoded;
      next();
    } catch (err) {
      if (err instanceof ApiError) return next(err);
      next(ApiError.unauthorized('Invalid or expired platform token'));
    }
  };
}

/** Extract Bearer token from Authorization header. */
function _extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }
  return authHeader.split(' ')[1];
}

module.exports = { authenticate, platformAuthenticate };
