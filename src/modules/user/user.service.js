'use strict';

/**
 * Users — ported to the repository seam.
 *
 * The role-hierarchy checks are untouched and stay in this module deliberately.
 * They are authorisation rules about who may create or promote whom, not
 * persistence concerns, and pushing them behind the seam would put a security
 * decision in a layer whose job is to not know what it is storing.
 *
 * What did move: the password hash. `User` declared it in a `pre('save')` hook,
 * which `create` on the Mongo side still runs and which the SQL side reproduces
 * through `behaviours.js`. Neither this module nor its callers hash anything,
 * exactly as before.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');
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

async function listUsers(query) {
  const users = repo('User');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

  // The hand-rolled `$or` of two escaped regexes is now `search` +
  // `searchFields`. Same two fields, same case-insensitive substring match, and
  // the escaping moves to the seam — which is where it stops being something
  // each module has to remember for itself.
  const { items, total } = await users.find(filter, {
    sort,
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'email'],
  });

  return { items, total, page, limit };
}

async function getUserById(id) {
  const user = await repo('User').findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function createUser(data, _tenantSlug, requestingUser) {
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

  // Matches the previous behaviour, including the part worth noticing: the
  // repository excludes soft-deleted rows, so a deactivated user's address does
  // not block re-registration. That was true before this port too — the model's
  // `pre(/^find/)` hook filtered the same lookup.
  const existing = await repo('User').findOne({ email: data.email });
  if (existing) throw ApiError.conflict('Email already registered');

  // Password is hashed by the create behaviour, on either backend.
  return repo('User').create(data);
}

async function updateUser(id, data, _tenantSlug, requestingUser) {
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

  const user = await repo('User').updateById(id, data);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function deactivateUser(id, _tenantSlug, requestingUserId) {
  // Prevent self-deactivation
  if (requestingUserId && id === requestingUserId) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  // `updateById` rather than `softDeleteById`: this sets `isActive` as well as
  // `deletedAt`, and the soft-delete helper only writes the timestamp.
  const user = await repo('User').updateById(id, { deletedAt: new Date(), isActive: false });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

module.exports = { listUsers, getUserById, createUser, updateUser, deactivateUser };
