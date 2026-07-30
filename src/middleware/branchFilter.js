'use strict';

/**
 * Branch-based filtering middleware.
 *
 * Attaches `req.branchFilter` based on the user's assigned branch.
 * Staff with a branch assignment only see data for their branch.
 * Admins and users without a branch see all data.
 *
 * Usage:
 *   router.use(branchFilter());
 *   // then in service: if (req.branchFilter) filter.branch = req.branchFilter;
 */

const { ROLES } = require('../config/constants');

const BRANCH_EXEMPT_ROLES = [
  ROLES.PRODUCT_OWNER,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

function branchFilter() {
  return (req, _res, next) => {
    req.branchFilter = null;

    if (!req.user) return next();

    // Admins and managers see all branches
    if (BRANCH_EXEMPT_ROLES.includes(req.user.role)) return next();

    // If user has a branch assignment, scope queries to it
    if (req.user.branch) {
      req.branchFilter = req.user.branch;
    }

    // Allow explicit branch query param override for exempt roles only
    // (already returned above for exempt roles)

    next();
  };
}

module.exports = branchFilter;
