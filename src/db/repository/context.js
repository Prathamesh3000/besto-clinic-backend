'use strict';

/**
 * Request-scoped tenant identity.
 *
 * Rule 2 of SQL_MIGRATION_PLAN.md section 2.2: *tenant scoping never appears in
 * module code*. No module writes `where clinic_id = ...` or touches
 * `search_path`; modules call `repo.departments.findById(id)` and the repository
 * takes tenant identity from here.
 *
 * That is what makes the isolation model swappable. Switching from
 * schema-per-clinic to shared-tables-with-RLS becomes an edit to one file plus a
 * data migration, rather than a rewrite of ~1,200 call sites.
 *
 * AsyncLocalStorage rather than a passed argument, deliberately. The existing
 * services thread `tenantSlug` through every function signature, and the failure
 * mode is silent: forget to pass it and you get `undefined`, which historically
 * resolved to *some* tenant rather than none. Storage that follows the async
 * context cannot be forgotten at a call site, and its absence is an error rather
 * than a default.
 *
 * Note what this does NOT fix. Tracker item C-01 was an ordering bug -- six
 * routers resolved the tenant before authenticating, so the request was scoped
 * correctly to the *wrong* clinic. Whatever is put in here is what gets used; if
 * the wrong value is put in, the wrong clinic is served. The guard for that is
 * router order plus the negative isolation test, not this module.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with a tenant bound to the current async context.
 *
 * `clinicId` is optional and only used to populate `clinic_id` on writes (rule 1
 * of section 2.2). Isolation does not depend on it while the model is
 * schema-per-clinic.
 */
function runWithTenant(tenant, fn) {
  if (!tenant || !tenant.slug) {
    throw new Error('runWithTenant requires a tenant with a slug');
  }
  /**
   * Normalised to a string on the way in.
   *
   * `tenantContextMiddleware` sources this from `req.tenant._id`, which is a
   * Mongoose ObjectId. Writing that straight into the `char(24)` clinic_id
   * column fails with "value too long" — the driver binds the object's JSON
   * form, quotes and all, which is 26 characters. Coercing here rather than in
   * each repository keeps every caller honest, whatever it passes.
   */
  const clinicId = tenant.clinicId ? String(tenant.clinicId) : null;

  /**
   * The entities this clinic has been cut over to PostgreSQL.
   *
   * Carried on the context rather than read per query: routing is decided
   * synchronously on every repository call, and an async lookup there would put
   * a database round trip in front of every read. The middleware already loads
   * the clinic, so the list rides along with the tenant it belongs to.
   *
   * Absent means "not cut over", which is the safe default — a clinic whose
   * record failed to load reads from Mongo rather than from a schema that may
   * not be populated.
   */
  const sqlEntities = Array.isArray(tenant.sqlEntities) ? tenant.sqlEntities : [];
  return storage.run({ slug: tenant.slug, clinicId, sqlEntities }, fn);
}

/**
 * Bind an already-open transaction to the current async context.
 *
 * Without this, every repository call opens its own transaction: a service that
 * writes an invoice and then its payment gets two, and a failure between them
 * leaves the first committed. Half a financial record is worse than none,
 * because it looks complete.
 *
 * Nested calls reuse the outermost transaction rather than opening a savepoint.
 * A service should not be able to commit part of its own operation by accident,
 * and the cases that genuinely want partial rollback are rare enough to be
 * worth writing explicitly when they appear.
 */
function runWithTransaction(trx, fn) {
  const tenant = storage.getStore();
  if (!tenant) {
    throw new Error('runWithTransaction requires a tenant — call it inside runWithTenant()');
  }
  return storage.run({ ...tenant, trx }, fn);
}

/** The ambient transaction, or null if no service has opened one. */
const currentTransaction = () => (storage.getStore() || {}).trx || null;

/** Entities the current clinic has been cut over. Empty outside a tenant scope. */
const currentSqlEntities = () => (storage.getStore() || {}).sqlEntities || [];

/** The current tenant, or null outside a tenant-scoped request. */
const currentTenant = () => storage.getStore() || null;

/**
 * The current tenant, or throw.
 *
 * Repositories use this rather than `currentTenant()` so that a query issued
 * outside a tenant scope fails loudly at the call that made it. Returning null
 * and letting it become an unscoped query is how a background job quietly reads
 * across every clinic.
 */
function requireTenant() {
  const tenant = storage.getStore();
  if (!tenant) {
    throw new Error(
      'No tenant is bound to this request. A repository was used outside runWithTenant() — '
      + 'the query has been refused rather than run unscoped.'
    );
  }
  return tenant;
}

/**
 * Bind `slug` only if no tenant is already bound, then run `fn`.
 *
 * The bridge for callers that still pass a `tenantSlug` explicitly. Not every
 * caller is inside a tenant-scoped request — background workers and cron jobs
 * iterate clinics and have no request context at all — and the migration cannot
 * move all of them at once.
 *
 * An already-bound context always wins. If a request has a tenant and a caller
 * passes a *different* slug, honouring the argument would be a cross-tenant read
 * performed on purpose. The argument is a fallback for when there is no context,
 * never an override of one.
 */
function withTenantIfNeeded(slug, fn) {
  const current = storage.getStore();
  if (current) return fn();
  if (!slug) return fn(); // no context and no slug — requireTenant() will refuse
  return runWithTenant({ slug }, fn);
}

/**
 * Express middleware binding the tenant already resolved onto the request.
 *
 * Mounted *after* authentication and tenant resolution, never before: this only
 * publishes what earlier middleware decided, and running it earlier would bind
 * whatever the caller put in the `X-Tenant-ID` header.
 */
function tenantContextMiddleware(req, res, next) {
  const slug = req.tenantSlug || (req.tenant && req.tenant.slug);
  if (!slug) return next();

  // Kept in step with tenantResolver, which is the binding point the running
  // app actually uses. This helper exists for callers that bind a tenant
  // outside the normal request path.
  const sqlEntities = (req.clinic && req.clinic.migration && req.clinic.migration.sqlEntities)
    || (req.tenant && req.tenant.migration && req.tenant.migration.sqlEntities)
    || [];

  return runWithTenant({
    slug,
    clinicId: req.clinicId || (req.tenant && req.tenant._id),
    sqlEntities,
  }, next);
}

module.exports = {
  currentSqlEntities,
  runWithTransaction,
  currentTransaction,
  runWithTenant, currentTenant, requireTenant, withTenantIfNeeded, tenantContextMiddleware,
};
