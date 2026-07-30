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
