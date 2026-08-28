'use strict';

/**
 * Department-based filtering middleware.
 *
 * Attaches `req.departmentFilter` based on the user's assigned department.
 * Department managers and staff with a department see only their department's data.
 * Admins see all departments.
 *
 * Usage:
 *   router.use(departmentFilter());
 *   // then in service: if (req.departmentFilter) filter.department = req.departmentFilter;
 */

const { ROLES } = require('../config/constants');

const DEPARTMENT_EXEMPT_ROLES = [
  ROLES.PRODUCT_OWNER,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.MANAGER,
];

function departmentFilter() {
  return (req, _res, next) => {
    req.departmentFilter = null;

    if (!req.user) return next();

    // Admins and managers see all departments
    if (DEPARTMENT_EXEMPT_ROLES.includes(req.user.role)) return next();

    // If user has a department assignment, scope queries to it
    if (req.user.department) {
      req.departmentFilter = req.user.department;
    }

    next();
  };
}

module.exports = departmentFilter;
