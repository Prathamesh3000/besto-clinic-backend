'use strict';

/**
 * Presence WebSocket handler — tracks which doctors are online / busy / DND.
 *
 * - On connect (doctor role): mark presence as "online" and broadcast to tenant.
 * - On disconnect: mark as "offline" and broadcast.
 * - Client can emit `presence:change` to toggle busy/dnd/online explicitly.
 * - In-memory presence map is kept per-process (stateless for HA — clients
 *   refetch via REST `/telemedicine/presence` on reconnect).
 */

const logger = require('../../utils/logger');
const { SOCKET_EVENTS, PRESENCE_STATUS } = require('../../config/constants');

/**
 * In-memory presence registry (per-process).
 * Shape:
 *   { [tenantSlug]: { [userId]: { status, role, name, connections, lastChangedAt } } }
 */
const presenceMap = new Map();

function _getTenantMap(tenantSlug) {
  if (!presenceMap.has(tenantSlug)) presenceMap.set(tenantSlug, new Map());
  return presenceMap.get(tenantSlug);
}

/**
 * Compute receptionist-visible snapshot of doctor presence for a tenant.
 * @param {string} tenantSlug
 * @returns {Array<{ userId, status, role, name, lastChangedAt }>}
 */
function getPresenceSnapshot(tenantSlug) {
  const tmap = presenceMap.get(tenantSlug);
  if (!tmap) return [];
  return Array.from(tmap.entries()).map(([userId, entry]) => ({
    userId,
    status: entry.status,
    role: entry.role,
    name: entry.name,
    lastChangedAt: entry.lastChangedAt,
  }));
}

/**
 * Read the current status of a single user (or 'offline' if unknown).
 */
function getUserPresence(tenantSlug, userId) {
  const entry = presenceMap.get(tenantSlug)?.get(String(userId));
  return entry ? entry.status : PRESENCE_STATUS.OFFLINE;
}

/**
 * Broadcast a presence change to the relevant tenant rooms.
 */
function _broadcastPresence(io, tenantSlug, payload) {
  io.to(`tenant:${tenantSlug}:doctors`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, payload);
  io.to(`tenant:${tenantSlug}:receptionists`).emit(SOCKET_EVENTS.PRESENCE_CHANGE, payload);
}

/**
 * Set a user's presence + broadcast (if changed).
 */
function setPresence(io, tenantSlug, userId, { status, role, name }) {
  const tmap = _getTenantMap(tenantSlug);
  const existing = tmap.get(String(userId));
  const next = {
    status,
    role: role || existing?.role,
    name: name || existing?.name,
    connections: existing?.connections || 0,
    lastChangedAt: new Date().toISOString(),
  };
  tmap.set(String(userId), next);

  _broadcastPresence(io, tenantSlug, {
    userId: String(userId),
    status,
    role: next.role,
    name: next.name,
    lastChangedAt: next.lastChangedAt,
  });
}

function registerPresenceHandlers(io, socket) {
  const { userId, role, name } = socket.user || {};
  const tenantSlug = socket.tenantSlug;

  if (!userId || !tenantSlug) return;

  // Only doctors have public presence; other roles can still read but not broadcast.
  const isDoctor = role === 'doctor';

  if (isDoctor) {
    const tmap = _getTenantMap(tenantSlug);
    const existing = tmap.get(String(userId));
    const status = existing?.status === PRESENCE_STATUS.DND
      ? PRESENCE_STATUS.DND            // preserve DND across reconnects
      : PRESENCE_STATUS.ONLINE;
    const connections = (existing?.connections || 0) + 1;

    tmap.set(String(userId), {
      status,
      role,
      name: name || existing?.name,
      connections,
      lastChangedAt: new Date().toISOString(),
    });

    _broadcastPresence(io, tenantSlug, {
      userId: String(userId),
      status,
      role,
      name: name || existing?.name,
      lastChangedAt: new Date().toISOString(),
    });
  }

  // Client-initiated status change (online / busy / dnd)
  socket.on(SOCKET_EVENTS.PRESENCE_CHANGE, ({ status }) => {
    if (!isDoctor) return;
    const valid = [
      PRESENCE_STATUS.ONLINE,
      PRESENCE_STATUS.BUSY,
      PRESENCE_STATUS.DND,
    ];
    if (!valid.includes(status)) return;

    setPresence(io, tenantSlug, userId, { status, role, name });
    logger.debug('WS presence: user %s → %s', userId, status);
  });

  // Heartbeat (client sends every ~30s to stay flagged "online")
  socket.on(SOCKET_EVENTS.PRESENCE_HEARTBEAT, () => {
    if (!isDoctor) return;
    const tmap = _getTenantMap(tenantSlug);
    const entry = tmap.get(String(userId));
    if (entry) {
      entry.lastChangedAt = new Date().toISOString();
    }
  });

  // On disconnect, decrement connection count and flip to offline if no sockets remain
  socket.on('disconnect', () => {
    if (!isDoctor) return;
    const tmap = _getTenantMap(tenantSlug);
    const entry = tmap.get(String(userId));
    if (!entry) return;

    entry.connections = Math.max(0, (entry.connections || 1) - 1);
    if (entry.connections === 0) {
      entry.status = PRESENCE_STATUS.OFFLINE;
      entry.lastChangedAt = new Date().toISOString();

      _broadcastPresence(io, tenantSlug, {
        userId: String(userId),
        status: PRESENCE_STATUS.OFFLINE,
        role,
        name: entry.name,
        lastChangedAt: entry.lastChangedAt,
      });
    }
  });
}

module.exports = registerPresenceHandlers;
module.exports.getPresenceSnapshot = getPresenceSnapshot;
module.exports.getUserPresence = getUserPresence;
module.exports.setPresence = setPresence;
