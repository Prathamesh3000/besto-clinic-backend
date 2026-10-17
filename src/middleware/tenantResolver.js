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
const { runWithTenant } = require('../db/repository/context');

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

    /**
     * Bind the tenant for the rest of the request.
     *
     * Done here rather than as a separate middleware because this is the single
     * place `req.tenantSlug` is assigned, so the two cannot disagree and no route
     * can forget to mount it. Modules ported to the repository seam read tenant
     * identity from this context instead of taking a `tenantSlug` argument —
     * rule 2 of SQL_MIGRATION_PLAN.md section 2.2.
     *
     * It runs *after* the checks above, not before. The order is the whole point:
     * tracker item C-01 was six routers resolving the tenant before
     * authenticating, so `req.tenantSlug` became whatever the caller put in the
     * header and the request was scoped correctly to the wrong clinic. Binding
     * only once the JWT has been matched against the header means the context can
     * never hold a tenant the caller was not entitled to.
     *
     * `next` is called *inside* the context so everything downstream — including
     * the async continuation of every handler — sees it. Calling it outside would
     * bind the context to this function and nothing else.
     */
    /**
     * The clinic's cutover list rides along with its identity.
     *
     * Routing between Mongo and PostgreSQL is decided synchronously on every
     * repository call, so it cannot await a lookup. Resolving the list once
     * here — cached in Redis, like subscription status — keeps that decision
     * free for every query the request goes on to make.
     *
     * Missing means "not cut over", which is the safe default: a clinic whose
     * record did not load reads from Mongo rather than from a PostgreSQL schema
     * that may never have been populated.
     */
    const { getCutoverEntities } = require('../db/repository/cutover');

    return getCutoverEntities(sanitized)
      .then((sqlEntities) => runWithTenant(
        { slug: sanitized, clinicId: req.clinicId || null, sqlEntities },
        () => next(),
      ))
      .catch((err) => next(err));
  };
}

module.exports = { tenantResolver };
