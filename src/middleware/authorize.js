'use strict';

/**
 * Role-based + permission-based authorization middleware.
 *
 * Two flavours:
 *   authorize('patient:read')              → user must have this permission (AND logic)
 *   authorizeAny('patient:read', 'patient:readOwn') → user must have at least one (OR logic)
 *
 * Permission keys are validated at route-definition time (on require), not at
 * request time — so typos crash on startup rather than causing silent 500s in prod.
 *
 * Permissions are resolved from the tenant's Role collection (cached with 5-min TTL),
 * falling back to the static ROLE_PERMISSIONS map for non-tenant routes or when the
 * Role collection hasn't been seeded yet.
 */

const ApiError = require('../utils/ApiError');
const { ROLE_PERMISSIONS, ALL_PERMISSION_KEYS } = require('../config/permissions');

// Lazy-loaded to avoid circular dependency at startup
let _getRolePermissions;
function _resolvePerms(role, tenantSlug) {
  if (!_getRolePermissions) {
    _getRolePermissions = require('../modules/role/role.service').getRolePermissions;
  }
  return _getRolePermissions(role, tenantSlug);
}

/**
 * Require ALL listed permissions (AND logic).
 * @param {...string} requiredPermissions
 */
function authorize(...requiredPermissions) {
  // Startup validation — fail fast on unknown permission keys
  for (const perm of requiredPermissions) {
    if (!ALL_PERMISSION_KEYS.has(perm)) {
      throw new Error(
        `authorize(): unknown permission key "${perm}". ` +
        `Check src/config/permissions.js PERMISSIONS object.`,
      );
    }
  }

  return async (req, _res, next) => {
    if (!req.user || !req.user.role) {
      return next(ApiError.unauthorized());
    }

    const userPerms = await _resolvePerms(req.user.role, req.tenantSlug);
    const hasAll = requiredPermissions.every((p) => userPerms.includes(p));

    if (!hasAll) {
      return next(
        ApiError.forbidden(
          `Missing required permission(s): ${requiredPermissions.join(', ')}`,
        ),
      );
    }

    next();
  };
}

/**
 * Require AT LEAST ONE of the listed permissions (OR logic).
 * @param {...string} permissions
 */
function authorizeAny(...permissions) {
  // Startup validation
  for (const perm of permissions) {
    if (!ALL_PERMISSION_KEYS.has(perm)) {
      throw new Error(
        `authorizeAny(): unknown permission key "${perm}". ` +
        `Check src/config/permissions.js PERMISSIONS object.`,
      );
    }
  }

  return async (req, _res, next) => {
    if (!req.user || !req.user.role) {
      return next(ApiError.unauthorized());
    }

    const userPerms = await _resolvePerms(req.user.role, req.tenantSlug);
    const hasAny = permissions.some((p) => userPerms.includes(p));

    if (!hasAny) {
      return next(
        ApiError.forbidden(
          `Requires at least one of: ${permissions.join(', ')}`,
        ),
      );
    }

    next();
  };
}

/**
 * Simple role-check middleware (no permission keys, just role names).
 * @param {...string} roles - e.g. 'doctor', 'super_admin'
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

module.exports = { authorize, authorizeAny, requireRole };
