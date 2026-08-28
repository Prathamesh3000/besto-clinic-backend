'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function listNotifications(userId, query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { recipient: userId, deletedAt: null };
  if (query.type) {
    // The validator allows a comma-separated set for multi-type filter chips.
    const types = String(query.type).split(',').map((t) => t.trim()).filter(Boolean);
    filter.type = types.length > 1 ? { $in: types } : types[0];
  }
  if (query.isRead !== undefined) {
    filter.isRead = query.isRead === 'true' || query.isRead === true;
  }

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getUnreadCount(userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');
  return Notification.countDocuments({ recipient: userId, isRead: false, deletedAt: null });
}

async function markAsRead(id, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');

  const notification = await Notification.findOne({ _id: id, recipient: userId });
  if (!notification) throw ApiError.notFound('Notification not found');

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  return notification;
}

async function markAllRead(userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');

  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return { modifiedCount: result.modifiedCount };
}

async function deleteNotification(id, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: userId },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!notification) throw ApiError.notFound('Notification not found');

  return notification;
}

async function createNotification(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Notification = conn.model('Notification');
  return Notification.create(data);
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  deleteNotification,
  createNotification,
};
