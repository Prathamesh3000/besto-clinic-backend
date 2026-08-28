'use strict';

/**
 * WebSocket (Socket.IO) bootstrap — attaches to the HTTP server.
 *
 * Usage from server.js:
 *   const { initWebSocket } = require('./src/websocket');
 *   initWebSocket(httpServer);
 *
 * Usage from services (emit to a user):
 *   const { emitToUser, emitToTenant, emitToRole, emitToVideoRoom } = require('./src/websocket');
 *   emitToUser(userId, 'appointment:updated', { ... });
 */

const { Server } = require('socket.io');
const wsAuthMiddleware = require('./middleware/wsAuth');
const registerNotificationHandlers = require('./handlers/notificationHandler');
const registerVideoHandlers = require('./handlers/videoHandler');
const registerPresenceHandlers = require('./handlers/presenceHandler');
const logger = require('../utils/logger');

/** @type {Server | null} */
let io = null;

/**
 * Initialize Socket.IO and attach to HTTP server.
 * @param {import('http').Server} httpServer
 */
function initWebSocket(httpServer) {
  const env = require('../config/env');
  const allowedOrigins = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : [];

  io = new Server(httpServer, {
    cors: {
      origin: env.NODE_ENV === 'development' ? '*' : allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware (auto-joins user/tenant/role rooms)
  io.use(wsAuthMiddleware);

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('WS: client connected — user %s (tenant: %s, role: %s)',
      socket.user.userId, socket.tenantSlug, socket.user.role);

    // Register event handlers
    registerNotificationHandlers(io, socket);
    registerVideoHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.debug('WS: client disconnected — user %s (reason: %s)', socket.user.userId, reason);
    });

    socket.on('error', (err) => {
      logger.error('WS: socket error — user %s — %s', socket.user.userId, err.message);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Emit an event to a specific user (across all their connected sockets).
 * @param {string} userId
 * @param {string} event
 * @param {*} data
 */
function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit an event to every user in a tenant.
 * @param {string} tenantSlug
 * @param {string} event
 * @param {*} data
 */
function emitToTenant(tenantSlug, event, data) {
  if (!io || !tenantSlug) return;
  io.to(`tenant:${tenantSlug}`).emit(event, data);
}

/**
 * Emit an event to all users of a given role inside a tenant.
 * Role is pluralized automatically (`doctor` → `doctors`).
 *
 * @param {string} tenantSlug
 * @param {'doctor'|'receptionist'|'admin'|'owner'|'patient'} role
 * @param {string} event
 * @param {*} data
 */
function emitToRole(tenantSlug, role, event, data) {
  if (!io || !tenantSlug || !role) return;
  io.to(`tenant:${tenantSlug}:${role}s`).emit(event, data);
}

/**
 * Emit an event into a video-session room.
 * @param {string} tenantSlug
 * @param {string} roomId
 * @param {string} event
 * @param {*} data
 */
function emitToVideoRoom(tenantSlug, roomId, event, data) {
  if (!io || !tenantSlug || !roomId) return;
  io.to(`video:${tenantSlug}:${roomId}`).emit(event, data);
}

/**
 * Emit an event to a specific emergency lifecycle room.
 * @param {string} sessionId
 * @param {string} event
 * @param {*} data
 */
function emitToEmergency(sessionId, event, data) {
  if (!io || !sessionId) return;
  io.to(`emergency:${sessionId}`).emit(event, data);
}

/**
 * Emit to multiple user IDs at once (bulk).
 * @param {string[]} userIds
 * @param {string} event
 * @param {*} data
 */
function emitToUsers(userIds, event, data) {
  if (!io || !Array.isArray(userIds)) return;
  userIds.forEach((uid) => {
    if (uid) io.to(`user:${uid}`).emit(event, data);
  });
}

/**
 * Get the Socket.IO server instance.
 */
function getIO() {
  return io;
}

module.exports = {
  initWebSocket,
  emitToUser,
  emitToUsers,
  emitToTenant,
  emitToRole,
  emitToVideoRoom,
  emitToEmergency,
  getIO,
};
