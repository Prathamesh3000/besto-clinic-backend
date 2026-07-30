'use strict';

/**
 * Tenant resolution middleware — reads X-Tenant-ID header and attaches
 * the clinic slug to req.tenantSlug.
 *
 * Must run AFTER authenticate and BEFORE any controller that calls
 * dbManager.getTenantModel().
 *
 * Security:
 *   - Validates slug format (alphanumeric + hyphens only)
 *   - Cross-checks JWT tenantSlug against header to prevent cross-tenant access
 *   - Fail-closed: missing or invalid tenant header → 400
 */

const ApiError = require('../utils/ApiError');
const { TENANT_HEADER } = require('../config/constants');

function tenantResolver() {
  return (req, _res, next) => {
    const slug = req.headers[TENANT_HEADER];

    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      return next(
        ApiError.badRequest(
          `Missing or empty ${TENANT_HEADER} header — cannot resolve tenant`,
        ),
      );
    }

    // Sanitize: lowercase, strip whitespace, reject obviously invalid slugs
    const sanitized = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(sanitized)) {
      return next(
        ApiError.badRequest(
          `Invalid tenant slug format: "${slug}". Use lowercase alphanumeric with hyphens (3-64 chars).`,
        ),
      );
    }

    // CRITICAL: If user is authenticated, verify JWT tenantSlug matches header.
    // Prevents cross-tenant data access by header manipulation.
    if (req.user && req.user.tenantSlug && req.user.tenantSlug !== sanitized) {
      // Allow product_owner to access any tenant (platform-level admin)
      if (req.user.role !== 'product_owner') {
        return next(
          ApiError.forbidden(
            'Tenant mismatch — your token belongs to a different tenant',
          ),
        );
      }
    }

    req.tenantSlug = sanitized;
    next();
  };
}

module.exports = { tenantResolver };
