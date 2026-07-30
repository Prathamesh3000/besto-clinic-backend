'use strict';

/**
 * Unified video + chat signaling WebSocket handler.
 *
 * This handler covers:
 *   1. WebRTC SDP offer/answer/ICE relay (between the two participants of a call).
 *   2. Video lifecycle events (peer-joined, peer-left, media-state, reconnecting,
 *      call-ended) broadcast to the entire video room.
 *   3. Unified real-time chat events (chat:message, chat:delivered, chat:read,
 *      chat:typing) scoped to the same video room. Persistence + FCM fallback are
 *      handled by the `video.service.js` (REST-invoked) side of the stack.
 *
 * Room pattern: `video:{tenantSlug}:{roomId}`
 * Token verification uses roomTokenService (AES-256-GCM, no DB queries on the hot path).
 */

const roomTokenService = require('../../modules/telemedicine/roomToken.service');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const logger = require('../../utils/logger');
const { SOCKET_EVENTS } = require('../../config/constants');

function registerVideoHandlers(io, socket) {
  const uid = () => String(socket.user.userId);
  const roomNameFor = (roomId) => `video:${socket.tenantSlug}:${roomId}`;

  /**
   * Join a video signaling room.
   * Verifies the encrypted room token before allowing entry.
   */
  socket.on(SOCKET_EVENTS.VIDEO_JOIN_ROOM, ({ roomId, token, iv }) => {
    try {
      if (!roomId || !token || !iv) {
        socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Missing roomId, token, or iv' });
        return;
      }

      // Verify encrypted token (pure crypto, no DB hit)
      const decoded = roomTokenService.verifyRoomToken(token, iv);

      // Ensure token belongs to this socket user
      if (String(decoded.participantId) !== uid()) {
        socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Token does not belong to this user' });
        return;
      }

      // Ensure token matches the requested room
      if (decoded.roomId !== roomId) {
        socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Token room mismatch' });
        return;
      }

      const room = roomNameFor(roomId);
      socket.join(room);
      socket.videoRoomId = roomId;
      socket.videoRole = decoded.role;

      const joinedAt = new Date().toISOString();

      // Legacy event (kept for existing clients): tell the other side "a user joined"
      socket.to(room).emit(SOCKET_EVENTS.VIDEO_USER_JOINED, {
        userId: uid(),
        role: decoded.role,
      });

      // New contract event — delivered to everyone in the room (including sender for confirmation)
      io.to(room).emit(SOCKET_EVENTS.VIDEO_PEER_JOINED, {
        userId:   uid(),
        role:     decoded.role,
        joinedAt,
      });

      logger.info(
        'WS video: user %s joined room %s as %s',
        uid(), room, decoded.role,
      );
    } catch (err) {
      logger.warn('WS video: join-room failed for user %s — %s', uid(), err.message);
      socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Failed to join room: ' + err.message });
    }
  });

  const MAX_SDP_SIZE = 65536;   // 64 KB — generous upper bound for SDP
  const MAX_ICE_SIZE = 2048;    // ICE candidates are small

  /**
   * Relay SDP offer to the other participant.
   */
  socket.on(SOCKET_EVENTS.VIDEO_OFFER, ({ roomId, sdp }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    if (!sdp || JSON.stringify(sdp).length > MAX_SDP_SIZE) {
      socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Invalid or oversized SDP offer' });
      return;
    }
    socket.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.VIDEO_OFFER, { sdp, from: uid() });
  });

  /**
   * Relay SDP answer to the other participant.
   */
  socket.on(SOCKET_EVENTS.VIDEO_ANSWER, ({ roomId, sdp }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    if (!sdp || JSON.stringify(sdp).length > MAX_SDP_SIZE) {
      socket.emit(SOCKET_EVENTS.VIDEO_ERROR, { message: 'Invalid or oversized SDP answer' });
      return;
    }
    socket.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.VIDEO_ANSWER, { sdp, from: uid() });
  });

  /**
   * Relay ICE candidate to the other participant.
   */
  socket.on(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, ({ roomId, candidate }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    if (candidate && JSON.stringify(candidate).length > MAX_ICE_SIZE) return;
    socket.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, {
      candidate, from: uid(),
    });
  });

  /**
   * Relay media toggle (mute/camera) + broadcast normalized media-state to everyone.
   */
  socket.on(SOCKET_EVENTS.VIDEO_TOGGLE_MEDIA, ({ roomId, mediaType, enabled, audio, video }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    const room = roomNameFor(roomId);

    // Legacy relay
    socket.to(room).emit(SOCKET_EVENTS.VIDEO_TOGGLE_MEDIA, {
      userId: uid(),
      mediaType,
      enabled,
    });

    // New normalized event — track audio+video together so UI can render a full state chip
    io.to(room).emit(SOCKET_EVENTS.VIDEO_MEDIA_STATE, {
      userId: uid(),
      audio:  typeof audio  === 'boolean' ? audio  : (mediaType === 'audio' ? enabled : undefined),
      video:  typeof video  === 'boolean' ? video  : (mediaType === 'video' ? enabled : undefined),
      at:     new Date().toISOString(),
    });
  });

  /**
   * Reconnecting indicator — client signals "I'm struggling, peer please hold".
   */
  socket.on(SOCKET_EVENTS.VIDEO_RECONNECTING, ({ roomId }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    socket.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.VIDEO_RECONNECTING, {
      userId: uid(),
      role:   socket.videoRole,
    });
  });

  /**
   * Leave the video signaling room.
   */
  socket.on(SOCKET_EVENTS.VIDEO_LEAVE_ROOM, ({ roomId, reason }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    _leaveVideoRoom(io, socket, roomId, reason || 'user-left');
  });

  // ── Chat (scoped to the same video room) ─────────────────────────

  /**
   * Typing indicator — emits to the other peer in the room.
   */
  socket.on(SOCKET_EVENTS.CHAT_TYPING, ({ roomId, isTyping = true }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    socket.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.CHAT_TYPING, {
      userId:   uid(),
      role:     socket.videoRole || socket.user.role,
      isTyping,
    });
  });

  /**
   * Read receipt — client acknowledges it has seen a message.
   * The REST endpoint `POST /telemedicine/:id/messages/:msgId/read` is the
   * authoritative persistence path; this event is for live UI updates.
   */
  socket.on(SOCKET_EVENTS.CHAT_READ, ({ roomId, messageId }) => {
    if (!socket.videoRoomId || socket.videoRoomId !== roomId) return;
    io.to(roomNameFor(roomId)).emit(SOCKET_EVENTS.CHAT_READ, {
      messageId,
      readBy: uid(),
      readAt: new Date().toISOString(),
    });
  });

  /**
   * Clean up on disconnect — notify the other participant.
   */
  socket.on('disconnect', () => {
    if (socket.videoRoomId) {
      _leaveVideoRoom(io, socket, socket.videoRoomId, 'disconnect');
    }
  });
}

/**
 * Helper — leave video room and notify the other participant.
 */
function _leaveVideoRoom(io, socket, roomId, reason) {
  const room = `video:${socket.tenantSlug}:${roomId}`;
  const userId = String(socket.user.userId);
  const leftAt = new Date().toISOString();

  // Legacy event — include reason so clients can distinguish transient disconnects
  socket.to(room).emit(SOCKET_EVENTS.VIDEO_USER_LEFT, { userId, reason: reason || 'user-left' });

  // New contract event — everyone in the room sees it
  io.to(room).emit(SOCKET_EVENTS.VIDEO_PEER_LEFT, {
    userId,
    role:   socket.videoRole,
    leftAt,
    reason: reason || 'user-left',
  });

  socket.leave(room);
  logger.debug('WS video: user %s left room %s (%s)', userId, room, reason);

  // Persist leave event in DB connectionLog (fire-and-forget)
  const tenantSlug = socket.tenantSlug;
  if (tenantSlug && roomId) {
    getTenantConnection(tenantSlug)
      .then((conn) => {
        const VideoSession = conn.model('VideoSession');
        return VideoSession.findOneAndUpdate(
          { roomId, deletedAt: null },
          {
            $push: {
              connectionLog: {
                participant: socket.videoRole || 'unknown',
                event: reason === 'disconnect' ? 'disconnected' : 'left',
                timestamp: new Date(),
                metadata: { userId, reason },
              },
            },
          },
        );
      })
      .catch((err) => logger.warn('WS video: DB leave-log failed — %s', err.message));
  }

  socket.videoRoomId = null;
  socket.videoRole = null;
}

module.exports = registerVideoHandlers;
