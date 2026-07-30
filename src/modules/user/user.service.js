'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLES } = require('../../config/constants');

/**
 * Role hierarchy — a role can only create roles below itself.
 * Higher index = higher authority.
 */
const ROLE_HIERARCHY = [
  ROLES.PATIENT,
  ROLES.GUARDIAN,
  ROLES.SUPPORT_STAFF,
  ROLES.RECEPTIONIST,
  ROLES.ACCOUNTANT,
  ROLES.BILLING_OFFICER,
  ROLES.HR_PAYROLL_MANAGER,
  ROLES.IT_SUPPORT,
  ROLES.DOCTOR,
  ROLES.DEPARTMENT_MANAGER,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.PRODUCT_OWNER,
];

function _getRoleLevel(role) {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? -1 : idx;
}

/** Escape special regex characters to prevent ReDoS / regex injection. */
function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listUsers(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const escaped = _escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getUserById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function createUser(data, tenantSlug, requestingUser) {
  // Enforce role hierarchy: cannot create a user with equal or higher role
  if (requestingUser) {
    const creatorLevel = _getRoleLevel(requestingUser.role);
    const targetLevel = _getRoleLevel(data.role);
    if (targetLevel >= creatorLevel) {
      throw ApiError.forbidden(
        `Role "${requestingUser.role}" cannot create users with role "${data.role}"`,
      );
    }
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const existing = await User.findOne({ email: data.email });
  if (existing) throw ApiError.conflict('Email already registered');

  // Password is hashed by the User schema pre-save hook
  const user = await User.create(data);
  return user;
}

async function updateUser(id, data, tenantSlug, requestingUser) {
  // Prevent role escalation: if changing role, enforce hierarchy
  if (data.role && requestingUser) {
    const callerLevel = _getRoleLevel(requestingUser.role);
    const newRoleLevel = _getRoleLevel(data.role);
    if (newRoleLevel >= callerLevel) {
      throw ApiError.forbidden(
        `Cannot assign role "${data.role}" — it is equal to or above your own role`,
      );
    }
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const user = await User.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function deactivateUser(id, tenantSlug, requestingUserId) {
  // Prevent self-deactivation
  if (requestingUserId && id === requestingUserId) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const user = await User.findByIdAndUpdate(
    id,
    { deletedAt: new Date(), isActive: false },
    { new: true },
  );
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

module.exports = { listUsers, getUserById, createUser, updateUser, deactivateUser };
