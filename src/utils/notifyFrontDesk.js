'use strict';

const { getTenantConnection } = require('../db/tenantConnectionManager');
const { notifyAndEmit } = require('./notifyAndEmit');
const { ROLE_GROUPS } = require('../config/constants');
const logger = require('./logger');

/**
 * Send a notification to all active front-desk staff (receptionists + support staff).
 * Follows the same pattern as inventoryAlertWorker's admin notification.
 *
 * @param {string} tenantSlug
 * @param {Object} data - { title, message, type, metadata }
 * @param {Object} [opts]
 * @param {string} [opts.excludeUserId] - Skip this user (e.g. the receptionist who triggered the action)
 */
async function notifyFrontDesk(tenantSlug, data, opts = {}) {
  try {
    const conn = await getTenantConnection(tenantSlug);
    const User = conn.model('User');

    const query = {
      role: { $in: ROLE_GROUPS.FRONT_DESK },
      deletedAt: null,
    };

    const staff = await User.find(query).select('_id').lean();

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
    logger.error('notifyFrontDesk failed for %s — %s', tenantSlug, err.message);
  }
}

module.exports = { notifyFrontDesk };
