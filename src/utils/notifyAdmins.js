'use strict';

const { getTenantConnection } = require('../db/tenantConnectionManager');
const { notifyAndEmit } = require('./notifyAndEmit');
const { ROLE_GROUPS } = require('../config/constants');
const logger = require('./logger');

/**
 * Send a notification to all active admin/owner roles (super_admin, admin, manager, department_manager).
 *
 * @param {string} tenantSlug
 * @param {Object} data - { title, message, type, metadata }
 * @param {Object} [opts]
 * @param {string} [opts.excludeUserId] - Skip this user (e.g. the admin who triggered the action)
 */
async function notifyAdmins(tenantSlug, data, opts = {}) {
  try {
    const conn = await getTenantConnection(tenantSlug);
    const User = conn.model('User');

    const staff = await User.find({
      role: { $in: ROLE_GROUPS.ADMIN },
      deletedAt: null,
    }).select('_id').lean();

    for (const user of staff) {
      if (opts.excludeUserId && String(user._id) === String(opts.excludeUserId)) continue;
      await notifyAndEmit({
        recipient: user._id,
        title: data.title,
        message: data.message,
        type: data.type || 'appointment',
        metadata: data.metadata || {},
      }, tenantSlug);
    }
  } catch (err) {
    logger.error('notifyAdmins failed for %s — %s', tenantSlug, err.message);
  }
}

module.exports = { notifyAdmins };
