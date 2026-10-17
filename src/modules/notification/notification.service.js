'use strict';

/**
 * Notifications — ported to the repository seam.
 *
 * Same shape as the department port: no `getTenantConnection`, no model lookup,
 * no query syntax belonging to either engine. Tenant identity comes from
 * request-scoped context, so the trailing `tenantSlug` argument is gone from
 * every signature.
 *
 * Two things this module does that the earlier ports did not, and both are the
 * reason `updateOne` and `updateMany` were added to the seam rather than worked
 * around here:
 *
 * - **Every single-row write is scoped by recipient as well as id.** That is an
 *   authorisation boundary: without it, any authenticated user could mark read
 *   or delete a notification belonging to someone else by passing its id. Doing
 *   it as a read followed by `updateById` would drop the ownership clause from
 *   the statement that actually writes, and open a window between the two.
 * - **`markAllRead` updates a set in one statement.** Reading the ids first and
 *   updating them one by one would turn a single write into N+1, and a user with
 *   a long backlog is exactly who calls it.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');

async function listNotifications(userId, query) {
  const notifications = repo('Notification');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { recipient: userId };
  if (query.type) {
    // The validator allows a comma-separated set for multi-type filter chips.
    const types = String(query.type).split(',').map((t) => t.trim()).filter(Boolean);
    filter.type = types.length > 1 ? { $in: types } : types[0];
  }
  if (query.isRead !== undefined) {
    filter.isRead = query.isRead === 'true' || query.isRead === true;
  }

  // `deletedAt: null` is no longer written here. The repository applies it to
  // every read, which is the point of moving it there: the next module to be
  // ported cannot forget it.
  const { items, total } = await notifications.find(filter, { sort, skip, limit });
  return { items, total, page, limit };
}

async function getUnreadCount(userId) {
  return repo('Notification').count({ recipient: userId, isRead: false });
}

async function markAsRead(id, userId) {
  const notification = await repo('Notification').updateOne(
    { _id: id, recipient: userId },
    { isRead: true, readAt: new Date() },
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
}

async function markAllRead(userId) {
  return repo('Notification').updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
}

async function deleteNotification(id, userId) {
  const notification = await repo('Notification').updateOne(
    { _id: id, recipient: userId },
    { deletedAt: new Date() },
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
}

async function createNotification(data) {
  return repo('Notification').create(data);
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  deleteNotification,
  createNotification,
};
