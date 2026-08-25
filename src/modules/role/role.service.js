'use strict';

/**
 * Roles — ported to the repository seam (Phase 0, deliverable 8).
 *
 * The second pilot, chosen to be different from `department` rather than more of
 * the same: no `populate()`, no joins, but four callers outside the module and a
 * cross-entity check (`deleteRole` counts users). That combination is what most
 * of the remaining ~30 CRUD modules actually look like.
 *
 * On the retained `tenantSlug` arguments
 * --------------------------------------
 * Rule 2 of plan section 2.2 says tenant identity comes from request-scoped
 * context, and inside this module it does. The exported signatures still *accept*
 * a `tenantSlug` because four callers pass one — auth.controller, auth.service,
 * globalSearch.service and staff.service — and some of them run outside a
 * request, where there is no context to read.
 *
 * `withTenantIfNeeded` resolves that honestly: an already-bound context always
 * wins, and the argument is used only when there is none. Honouring the argument
 * over a bound context would be a deliberate cross-tenant read.
 *
 * These arguments should disappear as their callers are ported. Removing them now
 * would mean porting five modules to land two, which is exactly the big-bang the
 * plan's incremental cutover exists to avoid.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { ROLE_PERMISSIONS } = require('../../config/permissions');
const { repo, withTenantIfNeeded, currentTenant } = require('../../db/repository');

// ── In-memory permission cache (per tenant) ──────────────
const _permCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** The cache is keyed by tenant, so it needs the slug whichever way it arrived. */
const slugOf = (tenantSlug) => tenantSlug || (currentTenant() && currentTenant().slug) || null;

/**
 * Resolve permissions for a role from the DB cache, falling back to static map.
 */
async function getRolePermissions(role, tenantSlug) {
  const slug = slugOf(tenantSlug);
  if (!slug) return ROLE_PERMISSIONS[role] || [];

  const now = Date.now();
  let entry = _permCache.get(slug);

  if (!entry || (now - entry.updatedAt) > CACHE_TTL) {
    try {
      const { items } = await withTenantIfNeeded(slug, () => repo('Role').find(
        { isActive: true },
        { limit: 1000, sort: { displayOrder: 1 } },
      ));
      entry = { updatedAt: now, roles: {} };
      for (const r of items) entry.roles[r.slug] = r.permissions;
      _permCache.set(slug, entry);
    } catch {
      // Permissions must resolve even when the database does not answer, or an
      // outage becomes a lockout. The static map is the same fallback as before.
      return ROLE_PERMISSIONS[role] || [];
    }
  }

  return entry.roles[role] || ROLE_PERMISSIONS[role] || [];
}

/**
 * Clear the permission cache for a tenant (call after role updates).
 */
function clearPermissionCache(tenantSlug) {
  const slug = slugOf(tenantSlug);
  if (slug) _permCache.delete(slug);
}

// ── CRUD ─────────────────────────────────────────────────

async function listRoles(query, tenantSlug) {
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.group) filter.group = query.group;
  if (query.excludeGroup) {
    const groups = Array.isArray(query.excludeGroup) ? query.excludeGroup : [query.excludeGroup];
    filter.group = { $nin: groups };
  }
  if (query.isActive === 'true' || query.isActive === true) {
    filter.isActive = true;
  } else if (query.isActive === 'false' || query.isActive === false) {
    filter.isActive = false;
  }

  const { items, total } = await withTenantIfNeeded(tenantSlug, () => repo('Role').find(filter, {
    sort: sort || { displayOrder: 1 },
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'slug'],
  }));

  return { items, total, page, limit };
}

async function getRoleBySlug(slug, tenantSlug) {
  const role = await withTenantIfNeeded(tenantSlug, () => repo('Role').findOne({ slug }));
  if (!role) throw ApiError.notFound(`Role '${slug}' not found`);
  return role;
}

async function createRole(data, tenantSlug) {
  return withTenantIfNeeded(tenantSlug, async () => {
    const roles = repo('Role');

    const existing = await roles.findOne({ slug: data.slug });
    if (existing) throw ApiError.conflict(`Role with slug '${data.slug}' already exists`);

    const role = await roles.create({ ...data, isSystem: false });
    clearPermissionCache(tenantSlug);
    return role;
  });
}

async function updateRole(slug, data, tenantSlug) {
  return withTenantIfNeeded(tenantSlug, async () => {
    const roles = repo('Role');

    // Neither is patchable: the slug is the identity other records reference, and
    // isSystem is what protects built-in roles from deletion below.
    const patch = { ...data };
    delete patch.slug;
    delete patch.isSystem;

    const existing = await roles.findOne({ slug });
    if (!existing) throw ApiError.notFound(`Role '${slug}' not found`);

    const role = await roles.updateById(existing._id, patch);
    clearPermissionCache(tenantSlug);
    return role;
  });
}

async function deleteRole(slug, tenantSlug) {
  return withTenantIfNeeded(tenantSlug, async () => {
    const role = await repo('Role').findOne({ slug });
    if (!role) throw ApiError.notFound(`Role '${slug}' not found`);
    if (role.isSystem) throw ApiError.forbidden('Cannot delete a system role');

    const usersWithRole = await repo('User').count({ role: slug });
    if (usersWithRole > 0) {
      throw ApiError.conflict(`Cannot delete role '${slug}' — ${usersWithRole} user(s) are assigned to it`);
    }

    const deleted = await repo('Role').softDeleteById(role._id);
    clearPermissionCache(tenantSlug);
    return deleted;
  });
}

/**
 * Get all active role slugs for this tenant (used by staff module for validation).
 * @param {string} tenantSlug
 * @param {object} [opts]
 * @param {string[]} [opts.excludeGroups] - Groups to exclude (e.g. ['clinical'])
 * @param {string[]} [opts.excludeSlugs]  - Specific slugs to exclude
 */
async function getActiveRoleSlugs(tenantSlug, opts = {}) {
  const roles = await getActiveRolesMap(tenantSlug, opts);
  const excluded = new Set(opts.excludeSlugs || []);
  return roles.map((r) => r.slug).filter((s) => !excluded.has(s));
}

/**
 * Get active roles with both slug and name (used for fuzzy role resolution in bulk imports).
 * @param {string} tenantSlug
 * @param {object} [opts]
 * @param {string[]} [opts.excludeGroups] - Groups to exclude (e.g. ['clinical'])
 */
async function getActiveRolesMap(tenantSlug, opts = {}) {
  const filter = { isActive: true };
  if (opts.excludeGroups && opts.excludeGroups.length) filter.group = { $nin: opts.excludeGroups };

  // A high limit rather than no limit: the repository paginates by design, and a
  // clinic has tens of roles. If one ever had more than this, truncating silently
  // would drop valid roles from staff validation — so the bound is explicit.
  const { items } = await withTenantIfNeeded(tenantSlug, () => repo('Role').find(filter, {
    limit: 1000,
    sort: { displayOrder: 1 },
  }));
  return items;
}

module.exports = {
  listRoles,
  getRoleBySlug,
  createRole,
  updateRole,
  deleteRole,
  getActiveRoleSlugs,
  getActiveRolesMap,
  getRolePermissions,
  clearPermissionCache,
};
