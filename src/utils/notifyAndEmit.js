'use strict';

const { createNotification } = require('../modules/notification/notification.service');
const { emitToUser } = require('../websocket');
const logger = require('./logger');

/**
 * Persist a notification and push it in real-time via WebSocket.
 * Wrapped in try/catch so failures never break the primary business operation.
 *
 * @param {Object}  data        - { recipient, title, message, type, metadata }
 * @param {string}  tenantSlug
 * @returns {Promise<Object|null>}
 */
async function notifyAndEmit(data, tenantSlug) {
  // A missing recipient means the caller had nobody to address — e.g. a
  // dependent with neither a login nor a guardian. Say so once rather than
  // failing schema validation on every such call.
  if (!data?.recipient) {
    logger.warn('notifyAndEmit skipped — no recipient for "%s"', data?.title || 'notification');
    return null;
  }

  try {
    const notification = await createNotification(data, tenantSlug);
    emitToUser(String(data.recipient), 'notification:new', notification);
    return notification;
  } catch (err) {
    logger.error('notifyAndEmit failed — recipient %s — %s', data.recipient, err.message);
    return null;
  }
}

module.exports = { notifyAndEmit };
