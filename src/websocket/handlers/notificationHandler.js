'use strict';

/**
 * Notification WebSocket handler — delivers real-time notifications to clients.
 */

const logger = require('../../utils/logger');
const { markAsRead, getUnreadCount } = require('../../modules/notification/notification.service');

function registerNotificationHandlers(_io, socket) {
  // Client acknowledges a notification — mark it as read in DB
  socket.on('notification:ack', async ({ notificationId }) => {
    try {
      await markAsRead(notificationId, socket.user.userId, socket.tenantSlug);
      logger.debug('WS notification: user %s marked %s as read', socket.user.userId, notificationId);
    } catch (err) {
      logger.error('WS notification:ack failed — %s', err.message);
    }
  });

  // Client requests unread count — query DB and emit back
  socket.on('notification:getUnreadCount', async () => {
    try {
      const count = await getUnreadCount(socket.user.userId, socket.tenantSlug);
      socket.emit('notification:unreadCount', { count });
    } catch (err) {
      logger.error('WS notification:getUnreadCount failed — %s', err.message);
      socket.emit('notification:unreadCount', { count: 0 });
    }
  });
}

module.exports = registerNotificationHandlers;
