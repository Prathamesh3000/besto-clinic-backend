'use strict';

/**
 * JWT helpers — sign and verify access/refresh/platform tokens.
 * Uses separate secrets + audiences for each token type.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_AUDIENCE } = require('../config/constants');

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
  signAccessToken,
  signRefreshToken,
  signPlatformToken,
  signCandidateToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyPlatformToken,
  verifyCandidateToken,
};
