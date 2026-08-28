'use strict';

/**
 * WebSocket authentication middleware — verifies JWT from handshake query.
 * Client connects as: io({ query: { token: 'xxx', tenantSlug: 'yyy' } })
 */

const { verifyAccessToken } = require('../../utils/tokenHelper');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');

async function wsAuthMiddleware(socket, next) {
  try {
    // Support both `auth` (Socket.IO v4 recommended) and `query` (legacy)
    const { token, tenantSlug } = {
      ...socket.handshake.query,
      ...socket.handshake.auth,
    };

    if (!token) {
      return next(new Error('Authentication required — provide token in handshake query'));
    }

    if (!tenantSlug) {
      return next(new Error('Tenant slug required in handshake query'));
    }

    const decoded = verifyAccessToken(token);

    // Honour the revocation blacklist, exactly as the HTTP authenticate()
    // middleware does. Without this a user who logged out — or whose token was
    // revoked on a role change — kept a live authenticated socket receiving
    // clinic events until the token expired on its own.
    // Fails closed on a Redis error, matching authenticate()'s behaviour.
    const redis = getRedis();
    if (await redis.get(`auth:blacklist:${decoded.jti}`)) {
      return next(new Error('Token has been revoked'));
    }

    // CRITICAL: Verify the JWT tenantSlug matches the requested tenant.
    // Without this check, a user from tenant-A could join tenant-B's rooms.
    if (decoded.tenantSlug && decoded.tenantSlug !== tenantSlug) {
      if (decoded.role !== 'product_owner') {
        return next(new Error('Tenant mismatch — token belongs to a different tenant'));
      }
    }

    socket.user = decoded;
    socket.tenantSlug = tenantSlug;

    // Join user-specific and tenant-specific rooms
    socket.join(`user:${decoded.userId}`);
    socket.join(`tenant:${tenantSlug}`);

    // Auto-join role-scoped rooms for broadcast events
    // Contract:
    //   tenant:{slug}:doctors        — all doctors (emergency + presence + queue)
    //   tenant:{slug}:receptionists  — receptionists + admins + owners (queue monitoring)
    //   tenant:{slug}:admins         — admins only
    //   tenant:{slug}:owners         — owners only
    //   tenant:{slug}:patients       — patients only
    const role = decoded.role;
    if (role) {
      socket.join(`tenant:${tenantSlug}:${role}s`);
      // Admins and owners also see the receptionist queue
      if (role === 'admin' || role === 'owner') {
        socket.join(`tenant:${tenantSlug}:receptionists`);
      }
    }

    logger.debug('WS: user %s connected (tenant: %s, role: %s)', decoded.userId, tenantSlug, role);
    next();
  } catch (err) {
    logger.warn('WS: auth failed — %s', err.message);
    next(new Error('Invalid or expired token'));
  }
}

module.exports = wsAuthMiddleware;
