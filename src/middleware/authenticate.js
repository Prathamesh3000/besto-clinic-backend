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

/**
 * Standard tenant-user authentication.
 */
function authenticate() {
  return async (req, _res, next) => {
    try {
      const token = _extractToken(req);
      const decoded = verifyAccessToken(token);

      // Check token blacklist (for logout / role-change revocation)
      const redis = getRedis();
      const isBlacklisted = await redis.get(`auth:blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        throw ApiError.unauthorized('Token has been revoked');
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
