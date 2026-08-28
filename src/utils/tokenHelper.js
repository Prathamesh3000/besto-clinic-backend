'use strict';

/**
 * JWT helpers — sign and verify access/refresh/platform tokens.
 * Uses separate secrets + audiences for each token type.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_AUDIENCE } = require('../config/constants');

/**
 * Access-token lifetime in seconds, parsed from JWT_ACCESS_EXPIRES_IN.
 *
 * The logout blacklist TTL must match the token's own lifetime. It used to be
 * hardcoded to 900s, which silently un-revoked logged-out tokens the moment
 * anyone raised JWT_ACCESS_EXPIRES_IN above 15m. Parsed locally rather than via
 * `ms`, which is only a transitive dependency of jsonwebtoken.
 *
 * Accepts a bare number of seconds or a `<number><unit>` string (s/m/h/d).
 */
function accessTokenTtlSeconds() {
  const env = require('../config/env');
  const raw = String(env.JWT_ACCESS_EXPIRES_IN || '15m').trim();

  if (/^\d+$/.test(raw)) return Number(raw);

  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i.exec(raw);
  if (!match) {
    // Unparseable — fall back to the documented default rather than guessing low,
    // so a revoked token is never trusted for longer than the fallback.
    require('./logger').warn(
      'JWT_ACCESS_EXPIRES_IN="%s" is not parseable — using 900s for the revocation TTL', raw,
    );
    return 900;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return Math.ceil(value * multiplier);
}

/**
 * Sign an access token (short-lived, audience: bestoclinic-client).
 */
function signAccessToken(payload) {
  const env = require('../config/env');
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    audience: JWT_AUDIENCE.CLIENT,
    issuer: 'bestoclinic',
    jwtid: uuidv4(),
  });
}

/**
 * Sign a refresh token (long-lived, audience: bestoclinic-client).
 */
function signRefreshToken(payload) {
  const env = require('../config/env');
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    audience: JWT_AUDIENCE.CLIENT,
    issuer: 'bestoclinic',
    jwtid: uuidv4(),
  });
}

/**
 * Sign a platform token (product_owner only, audience: bestoclinic-platform).
 */
function signPlatformToken(payload) {
  const env = require('../config/env');
  return jwt.sign(payload, env.JWT_PLATFORM_SECRET, {
    expiresIn: '1h',
    audience: JWT_AUDIENCE.PLATFORM,
    issuer: 'bestoclinic',
    jwtid: uuidv4(),
  });
}

/**
 * Verify an access token.
 * @returns {object} decoded payload
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
function verifyAccessToken(token) {
  const env = require('../config/env');
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: JWT_AUDIENCE.CLIENT,
    issuer: 'bestoclinic',
    algorithms: ['HS256'],
  });
}

/**
 * Verify a refresh token.
 */
function verifyRefreshToken(token) {
  const env = require('../config/env');
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    audience: JWT_AUDIENCE.CLIENT,
    issuer: 'bestoclinic',
    algorithms: ['HS256'],
  });
}

/**
 * Verify a platform token.
 */
function verifyPlatformToken(token) {
  const env = require('../config/env');
  return jwt.verify(token, env.JWT_PLATFORM_SECRET, {
    audience: JWT_AUDIENCE.PLATFORM,
    issuer: 'bestoclinic',
    algorithms: ['HS256'],
  });
}

/**
 * Sign a candidate token (job seekers, audience: bestoclinic-candidate).
 */
function signCandidateToken(payload) {
  const env = require('../config/env');
  const secret = env.JWT_CANDIDATE_SECRET || env.JWT_ACCESS_SECRET;
  return jwt.sign(payload, secret, {
    expiresIn: '7d',
    audience: JWT_AUDIENCE.CANDIDATE,
    issuer: 'bestoclinic',
    jwtid: uuidv4(),
  });
}

/**
 * Verify a candidate token.
 */
function verifyCandidateToken(token) {
  const env = require('../config/env');
  const secret = env.JWT_CANDIDATE_SECRET || env.JWT_ACCESS_SECRET;
  return jwt.verify(token, secret, {
    audience: JWT_AUDIENCE.CANDIDATE,
    issuer: 'bestoclinic',
    algorithms: ['HS256'],
  });
}

module.exports = {
  accessTokenTtlSeconds,
  signAccessToken,
  signRefreshToken,
  signPlatformToken,
  signCandidateToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyPlatformToken,
  verifyCandidateToken,
};
