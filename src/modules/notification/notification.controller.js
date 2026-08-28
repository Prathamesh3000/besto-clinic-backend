'use strict';

const notificationService = require('./notification.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await notificationService.listNotifications(
    req.user.userId,
    req.query,
    req.tenantSlug,
  );
  res.json(ApiResponse.paginated('Notifications retrieved', items, { page, limit, total }));
};

exports.unreadCount = async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Unread count retrieved', { count }));
};

exports.markAsRead = async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user.userId,
    req.tenantSlug,
  );
  res.json(ApiResponse.success('Notification marked as read', notification));
};

exports.markAllRead = async (req, res) => {
  const result = await notificationService.markAllRead(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('All notifications marked as read', result));
};

exports.remove = async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.deleted('Notification deleted'));
};
