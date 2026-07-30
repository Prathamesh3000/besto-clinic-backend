'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS } = require('../../config/permissions');

// ── In-memory permission cache (per tenant) ──────────────
const _permCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve permissions for a role from the DB cache, falling back to static map.
 */
async function getRolePermissions(role, tenantSlug) {
  if (!tenantSlug) return ROLE_PERMISSIONS[role] || [];

  const now = Date.now();
  let entry = _permCache.get(tenantSlug);

  if (!entry || (now - entry.updatedAt) > CACHE_TTL) {
    try {
      const conn = await getTenantConnection(tenantSlug);
      const Role = conn.model('Role');
      const roles = await Role.find({ isActive: true, deletedAt: null }).lean();
      entry = { updatedAt: now, roles: {} };
      for (const r of roles) entry.roles[r.slug] = r.permissions;
      _permCache.set(tenantSlug, entry);
    } catch {
      return ROLE_PERMISSIONS[role] || [];
    }
  }

  return entry.roles[role] || ROLE_PERMISSIONS[role] || [];
}

/**
 * Clear the permission cache for a tenant (call after role updates).
 */
function clearPermissionCache(tenantSlug) {
  if (tenantSlug) _permCache.delete(tenantSlug);
}

// ── CRUD ─────────────────────────────────────────────────

async function listRoles(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };

  if (query.group) filter.group = query.group;
  if (query.excludeGroup) {
    const groups = Array.isArray(query.excludeGroup) ? query.excludeGroup : [query.excludeGroup];
    filter.group = { ...(filter.group || {}), $nin: groups };
  }
  if (query.isActive === 'true' || query.isActive === true) {
    filter.isActive = true;
  } else if (query.isActive === 'false' || query.isActive === false) {
    filter.isActive = false;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Role.find(filter).sort(sort || { displayOrder: 1 }).skip(skip).limit(limit),
    Role.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getRoleBySlug(slug, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');
  const role = await Role.findOne({ slug });
  if (!role) throw ApiError.notFound(`Role '${slug}' not found`);
  return role;
}

async function createRole(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');

  const existing = await Role.findOne({ slug: data.slug, deletedAt: null });
  if (existing) throw ApiError.conflict(`Role with slug '${data.slug}' already exists`);

  const role = await Role.create({ ...data, isSystem: false });
  clearPermissionCache(tenantSlug);
  return role;
}

async function updateRole(slug, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');

  // Prevent slug changes
  delete data.slug;
  delete data.isSystem;

  const role = await Role.findOneAndUpdate(
    { slug, deletedAt: null },
    data,
    { new: true, runValidators: true },
  );
  if (!role) throw ApiError.notFound(`Role '${slug}' not found`);

  clearPermissionCache(tenantSlug);
  return role;
}

async function deleteRole(slug, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');

  const role = await Role.findOne({ slug, deletedAt: null });
  if (!role) throw ApiError.notFound(`Role '${slug}' not found`);
  if (role.isSystem) throw ApiError.forbidden('Cannot delete a system role');

  // Check if any users are assigned this role
  const User = conn.model('User');
  const usersWithRole = await User.countDocuments({ role: slug, deletedAt: null });
  if (usersWithRole > 0) {
    throw ApiError.conflict(`Cannot delete role '${slug}' — ${usersWithRole} user(s) are assigned to it`);
  }

  role.deletedAt = new Date();
  await role.save();

  clearPermissionCache(tenantSlug);
  return role;
}

/**
 * Get all active role slugs for this tenant (used by staff module for validation).
 * @param {string} tenantSlug
 * @param {object} [opts]
 * @param {string[]} [opts.excludeGroups] - Groups to exclude (e.g. ['clinical'])
 * @param {string[]} [opts.excludeSlugs]  - Specific slugs to exclude
 */
async function getActiveRoleSlugs(tenantSlug, opts = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');
  const filter = { isActive: true, deletedAt: null };

  if (opts.excludeGroups?.length) {
    filter.group = { $nin: opts.excludeGroups };
  }
  if (opts.excludeSlugs?.length) {
    filter.slug = { $nin: opts.excludeSlugs };
  }

  const roles = await Role.find(filter).lean().select('slug');
  return roles.map((r) => r.slug);
}

/**
 * Get active roles with both slug and name (used for fuzzy role resolution in bulk imports).
 * @param {string} tenantSlug
 * @param {object} [opts]
 * @param {string[]} [opts.excludeGroups] - Groups to exclude (e.g. ['clinical'])
 */
async function getActiveRolesMap(tenantSlug, opts = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const Role = conn.model('Role');
  const filter = { isActive: true, deletedAt: null };
  if (opts.excludeGroups?.length) filter.group = { $nin: opts.excludeGroups };
  const roles = await Role.find(filter).lean().select('slug name');
  return roles;
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
