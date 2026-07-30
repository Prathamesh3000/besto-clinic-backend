'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { getActiveRoleSlugs, getActiveRolesMap } = require('../role/role.service');
const { syncUserDirectory } = require('../auth/auth.service');

/** Fallback staff roles if Role collection hasn't been seeded yet. */
const STAFF_ROLES_FALLBACK = [
  'admin', 'receptionist', 'support_staff', 'billing_officer',
];

/** Groups excluded from staff management (doctors, patients handled by dedicated modules). */
const STAFF_EXCLUDED_GROUPS = ['clinical'];

/** Escape special regex characters to prevent ReDoS / regex injection. */
function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get valid staff role slugs from the Role collection, excluding clinical roles
 * (doctors are managed via the Doctor module, patients via the Patient portal).
 */
async function _getStaffRoles(tenantSlug) {
  try {
    const slugs = await getActiveRoleSlugs(tenantSlug, { excludeGroups: STAFF_EXCLUDED_GROUPS });
    return slugs.length > 0 ? slugs : STAFF_ROLES_FALLBACK;
  } catch {
    return STAFF_ROLES_FALLBACK;
  }
}

/**
 * Resolve raw role text to a valid Role Master slug via 3-tier matching:
 *   1. Exact slug match
 *   2. Case-insensitive slug match
 *   3. Case-insensitive name match
 * Returns the resolved slug or null if no match.
 */
async function _resolveRole(rawRole, tenantSlug) {
  const roles = await getActiveRolesMap(tenantSlug, { excludeGroups: STAFF_EXCLUDED_GROUPS });
  const input = rawRole.trim();
  const inputLower = input.toLowerCase();

  const exactSlug = roles.find((r) => r.slug === input);
  if (exactSlug) return exactSlug.slug;

  const ciSlug = roles.find((r) => r.slug.toLowerCase() === inputLower);
  if (ciSlug) return ciSlug.slug;

  const ciName = roles.find((r) => r.name.toLowerCase() === inputLower);
  if (ciName) return ciName.slug;

  return null;
}

async function listStaff(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const { skip, limit, page, sort } = parsePagination(query);

  const staffRoles = await _getStaffRoles(tenantSlug);
  const filter = { role: { $in: staffRoles }, deletedAt: null };

  if (query.role) {
    if (!staffRoles.includes(query.role)) {
      throw ApiError.badRequest(`Invalid staff role filter: ${query.role}`);
    }
    filter.role = query.role;
  }

  if (query.branch) filter.branch = query.branch;
  if (query.department) filter.department = query.department;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;

  if (query.search) {
    const escaped = _escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('branch', 'name')
      .populate('department', 'name'),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getStaffById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const staffRoles = await _getStaffRoles(tenantSlug);
  const staff = await User.findOne({ _id: id, role: { $in: staffRoles } })
    .populate('branch', 'name')
    .populate('department', 'name');
  if (!staff) throw ApiError.notFound('Staff member not found');
  return staff;
}

async function createStaff(data, tenantSlug) {
  // Resolve role to a valid slug (supports name and case-insensitive matching)
  const resolved = await _resolveRole(data.role, tenantSlug);
  if (!resolved) {
    const staffRoles = await _getStaffRoles(tenantSlug);
    throw ApiError.badRequest(`Invalid staff role: "${data.role}". Valid roles: ${staffRoles.join(', ')}`);
  }
  data.role = resolved;

  const Clinic = mongoose.model('Clinic');
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  // Check for duplicate email
  const existing = await User.findOne({ email: data.email });
  if (existing) throw ApiError.conflict('Email already registered');

  // Atomic limit enforcement: increment first, then check
  const clinic = await Clinic.findOneAndUpdate(
    { slug: tenantSlug },
    { $inc: { 'usage.staffCount': 1 } },
    { new: true },
  );
  if (!clinic) throw ApiError.internal('Clinic configuration not found');

  try {
    if (clinic.features?.maxStaff && clinic.usage.staffCount > clinic.features.maxStaff) {
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.staffCount': -1 } },
      );
      throw ApiError.forbidden('Staff limit reached. Upgrade your plan.');
    }

    const staff = await User.create(data);

    // Sync to UserDirectory so email-first login flow can find this user
    syncUserDirectory(data.email, tenantSlug, staff._id.toString(), data.role).catch(() => {});

    return staff;
  } catch (err) {
    if (!(err instanceof ApiError && err.statusCode === 403)) {
      await Clinic.findOneAndUpdate(
        { slug: tenantSlug },
        { $inc: { 'usage.staffCount': -1 } },
      );
    }
    throw err;
  }
}

async function updateStaff(id, data, tenantSlug) {
  // Prevent role and password changes through staff update
  delete data.role;
  delete data.password;

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const staffRoles = await _getStaffRoles(tenantSlug);
  const staff = await User.findOneAndUpdate(
    { _id: id, role: { $in: staffRoles } },
    data,
    { new: true, runValidators: true },
  );
  if (!staff) throw ApiError.notFound('Staff member not found');
  return staff;
}

async function deactivateStaff(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const staffRoles = await _getStaffRoles(tenantSlug);

  // Only deactivate if not already deleted — prevents double-decrement
  const staff = await User.findOneAndUpdate(
    { _id: id, role: { $in: staffRoles }, deletedAt: null },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!staff) throw ApiError.notFound('Staff member not found or already deactivated');

  const Clinic = mongoose.model('Clinic');
  await Clinic.findOneAndUpdate(
    { slug: tenantSlug, 'usage.staffCount': { $gt: 0 } },
    { $inc: { 'usage.staffCount': -1 } },
  );

  return staff;
}

async function bulkCreateStaff(rows, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const results = { totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [] };

  // Pre-resolve branchCodes to ObjectIDs
  const branchCodes = [...new Set(rows.map((r) => r.branchCode).filter(Boolean))];
  const branchMap = {};
  if (branchCodes.length > 0) {
    const branches = await Branch.find({ code: { $in: branchCodes }, deletedAt: null });
    for (const b of branches) branchMap[b.code] = b._id.toString();
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = { ...rows[i] };
      if (row.branchCode && !row.branch) {
        const resolved = branchMap[row.branchCode.toUpperCase()] || branchMap[row.branchCode];
        if (!resolved) throw new Error(`Branch code "${row.branchCode}" not found`);
        row.branch = resolved;
      }
      delete row.branchCode;
      // Pre-resolve role before createStaff for clearer bulk error messages
      if (row.role) {
        const resolvedRole = await _resolveRole(row.role, tenantSlug);
        if (!resolvedRole) {
          const staffRoles = await _getStaffRoles(tenantSlug);
          throw new Error(`Invalid role "${row.role}". Valid roles: ${staffRoles.join(', ')}`);
        }
        row.role = resolvedRole;
      }
      const staff = await createStaff(row, tenantSlug);
      results.successCount++;
      results.created.push(staff);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

/**
 * Change a staff member's role. Revokes all refresh tokens to force re-login.
 */
async function changeStaffRole(id, newRole, requestingUserId, tenantSlug) {
  const staffRoles = await _getStaffRoles(tenantSlug);
  if (!staffRoles.includes(newRole)) {
    throw ApiError.badRequest(`Invalid staff role: ${newRole}`);
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const staff = await User.findOne({ _id: id, role: { $in: staffRoles }, deletedAt: null });
  if (!staff) throw ApiError.notFound('Staff member not found');

  // Prevent self-role-change
  if (staff._id.toString() === requestingUserId) {
    throw ApiError.forbidden('You cannot change your own role');
  }

  // Prevent changing to/from protected roles
  const PROTECTED_ROLES = ['super_admin', 'product_owner'];
  if (PROTECTED_ROLES.includes(staff.role) || PROTECTED_ROLES.includes(newRole)) {
    throw ApiError.forbidden('Cannot assign or remove protected roles');
  }

  if (staff.role === newRole) {
    return staff; // No change needed
  }

  staff.role = newRole;
  await staff.save({ validateModifiedOnly: true });

  // Revoke all refresh tokens — forces re-login with new permissions
  const { getRedis } = require('../../config/redis');
  const redis = getRedis();
  await redis.del(`auth:refresh:devices:${staff._id}`);

  return staff;
}

module.exports = { listStaff, getStaffById, createStaff, updateStaff, deactivateStaff, bulkCreateStaff, changeStaffRole };
