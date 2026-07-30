/**
 * Unified Socket.IO client for the BestoClinic website.
 *
 * Mirrors the backend `SOCKET_EVENTS` contract defined in
 * `src/config/constants.js`. Auto-joined rooms (handled server-side):
 *   - user:{userId}
 *   - tenant:{slug}
 *   - tenant:{slug}:{role}s   (+ receptionists room for admin/owner)
 *
 * Event registries are Set-based so a component may subscribe / unsubscribe
 * without tearing down the singleton socket.
 *
 * Contract categories:
 *   1. Video lifecycle + WebRTC signaling relay
 *   2. Unified chat (video-session-scoped)
 *   3. Emergency queue + session lifecycle
 *   4. Doctor presence
 *   5. Notification bus
 */
import { io } from 'socket.io-client';

// ── Singleton ──
let socket = null;

// Track the active video room so we can auto-rejoin on reconnect.
let _activeVideoRoom = null; // { roomId, token, iv }

// ── Subscriber registries ──────────────────────────
const videoEventListeners    = new Set(); // (event, payload) — WebRTC relay
const incomingCallListeners  = new Set(); // (payload)
const callLifecycleListeners = new Set(); // (event, payload) — peer-joined/left/ended/media-state/reconnecting
const chatListeners          = new Set(); // (event, payload)
const emergencyListeners     = new Set(); // (event, payload)
const presenceListeners      = new Set(); // (payload)
const notificationListeners  = new Set();
const unreadCountListeners   = new Set();

// ── Event name groups (mirrors backend SOCKET_EVENTS) ──
// Legacy WebRTC relay events (kept for compat with existing VideoCall screen)
const WEBRTC_RELAY_EVENTS = [
  'video:offer',
  'video:answer',
  'video:ice-candidate',
  'video:user-joined',  // legacy peer-joined
  'video:user-left',    // legacy peer-left
  'video:toggle-media', // legacy media-toggle
  'video:error',
];

// Video call lifecycle (new contract)
const CALL_LIFECYCLE_EVENTS = [
  'video:peer-joined',
  'video:peer-left',
  'video:call-ended',
  'video:media-state',
  'video:reconnecting',
  'video:consent-updated',
  'video:session-extended',
];

// Unified chat events (scoped to video room)
const CHAT_EVENTS = [
  'chat:message',
  'chat:delivered',
  'chat:read',
  'chat:typing',
];

// Emergency queue events
const EMERGENCY_EVENTS = [
  'emergency:new',
  'emergency:accepted',
  'emergency:declined',
  'emergency:cancelled',
  'emergency:ended',
];

// ── Lifecycle ──────────────────────────────────────

export function initSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('tenant_token');
  const tenantSlug = localStorage.getItem('tenant_slug');

  if (!token) {
    console.warn('[Socket] Cannot connect: no access token');
    return null;
  }

  const serverUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1')
    .replace('/api/v1', '');

  socket = io(serverUrl, {
    transports: ['websocket'],
    auth: { token, tenantSlug: tenantSlug || undefined },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    // Auto-rejoin the video room after a reconnect so signaling keeps working.
    if (_activeVideoRoom) {
      const { roomId, token, iv } = _activeVideoRoom;
      socket.emit('video:join-room', { roomId, token, iv });
      console.log('[Socket] Auto-rejoined video room after reconnect:', roomId);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  // ── WebRTC relay (legacy) ──
  WEBRTC_RELAY_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => {
      _broadcast(videoEventListeners, eventName, payload);
    });
  });

  // ── Call lifecycle (new) ──
  CALL_LIFECYCLE_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => {
      _broadcast(callLifecycleListeners, eventName, payload);
      // Also funnel call-ended / peer-* into legacy videoEventListeners
      // so the old VideoCall screen keeps working during the transition.
      _broadcast(videoEventListeners, eventName, payload);
    });
  });

  // ── Incoming call (user-private) ──
  socket.on('video:incoming-call', (payload) => {
    incomingCallListeners.forEach((cb) => {
      try { cb(payload); } catch (err) { console.error('[Socket] incoming-call handler error:', err); }
    });
  });

  // ── Chat events ──
  CHAT_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => {
      _broadcast(chatListeners, eventName, payload);
    });
  });

  // ── Emergency events ──
  EMERGENCY_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => {
      _broadcast(emergencyListeners, eventName, payload);
    });
  });

  // ── Presence ──
  socket.on('presence:change', (payload) => {
    presenceListeners.forEach((cb) => {
      try { cb(payload); } catch (err) { console.error('[Socket] presence handler error:', err); }
    });
  });

  // ── Notification bus ──
  socket.on('notification:new', (payload) => {
    notificationListeners.forEach((cb) => {
      try { cb(payload); } catch (err) { console.error('[Socket] notification handler error:', err); }
    });
  });

  socket.on('notification:unreadCount', (payload) => {
    unreadCountListeners.forEach((cb) => {
      try { cb(payload.count); } catch (err) { console.error('[Socket] unread handler error:', err); }
    });
  });

  return socket;
}

function _broadcast(registry, eventName, payload) {
  registry.forEach((cb) => {
    try { cb(eventName, payload); } catch (err) {
      console.error('[Socket] listener error for', eventName, err);
    }
  });
}

export function getSocket() {
  return socket;
}

export function isSocketConnected() {
  return Boolean(socket?.connected);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── Video Signaling Helpers (WebRTC relay) ────────

export function joinVideoRoom(roomId, token, iv) {
  if (!socket) return;
  _activeVideoRoom = { roomId, token, iv };
  const emit = () => socket.emit('video:join-room', { roomId, token, iv });
  if (socket.connected) {
    emit();
  } else {
    socket.once('connect', emit);
  }
}

export function leaveVideoRoom(roomId, reason = 'user-left') {
  _activeVideoRoom = null;
  if (!socket?.connected) return;
  socket.emit('video:leave-room', { roomId, reason });
}

export function sendVideoOffer(roomId, sdp) {
  if (!socket?.connected) return;
  socket.emit('video:offer', { roomId, sdp });
}

export function sendVideoAnswer(roomId, sdp) {
  if (!socket?.connected) return;
  socket.emit('video:answer', { roomId, sdp });
}

export function sendIceCandidate(roomId, candidate) {
  if (!socket?.connected) return;
  socket.emit('video:ice-candidate', { roomId, candidate });
}

/**
 * sendMediaToggle supports two call shapes:
 *   (roomId, 'audio' | 'video', enabled)                ← legacy 3-arg
 *   (roomId, { audio, video, mediaType, enabled })      ← new normalized
 * The backend currently accepts `{ mediaType, enabled }` so both funnel into that.
 */
export function sendMediaToggle(roomId, mediaTypeOrOpts, enabledArg) {
  if (!socket?.connected) return;
  let payload;
  if (typeof mediaTypeOrOpts === 'string') {
    payload = { roomId, mediaType: mediaTypeOrOpts, enabled: !!enabledArg };
  } else {
    payload = { roomId, ...(mediaTypeOrOpts || {}) };
  }
  socket.emit('video:toggle-media', payload);
}

export function sendReconnecting(roomId) {
  if (!socket?.connected) return;
  socket.emit('video:reconnecting', { roomId });
}

// ── Chat Signaling Helpers (scoped to video room) ──

export function sendTyping(roomId, isTyping = true) {
  if (!socket?.connected) return;
  socket.emit('chat:typing', { roomId, isTyping });
}

export function sendChatReadReceipt(roomId, messageId) {
  if (!socket?.connected) return;
  socket.emit('chat:read', { roomId, messageId });
}

// ── Presence ──────────────────────────────────────

export function emitPresenceHeartbeat() {
  if (!socket?.connected) return;
  socket.emit('presence:heartbeat');
}

export function emitPresenceChange(status) {
  if (!socket?.connected) return;
  socket.emit('presence:change', { status });
}

// ── Subscriber API ────────────────────────────────

function _makeSub(registry) {
  return {
    on(cb) { registry.add(cb); return () => registry.delete(cb); },
    off(cb) { registry.delete(cb); },
  };
}

export const videoRelay  = _makeSub(videoEventListeners);
export const callLife    = _makeSub(callLifecycleListeners);
export const chatBus     = _makeSub(chatListeners);
export const emergencyBus = _makeSub(emergencyListeners);

// Convenience subscriptions (single-event)
export function onIncomingCall(cb) {
  incomingCallListeners.add(cb);
  return () => incomingCallListeners.delete(cb);
}
export function offIncomingCall(cb)  { incomingCallListeners.delete(cb); }

export function onPresenceChange(cb) {
  presenceListeners.add(cb);
  return () => presenceListeners.delete(cb);
}
export function offPresenceChange(cb) { presenceListeners.delete(cb); }

// Legacy-compatible wrappers (already used by PatientVideoCall + NotificationBell)
export function onVideoEvent(callback)  { videoEventListeners.add(callback); return callback; }
export function offVideoEvent(callback) { videoEventListeners.delete(callback); }

export function onNotification(callback)  { notificationListeners.add(callback); return callback; }
export function offNotification(callback) { notificationListeners.delete(callback); }

export function onUnreadCount(callback)  { unreadCountListeners.add(callback); return callback; }
export function offUnreadCount(callback) { unreadCountListeners.delete(callback); }

export function emitNotificationAck(notificationId) {
  if (!socket?.connected) return;
  socket.emit('notification:ack', { notificationId });
}

export function requestUnreadCount() {
  if (!socket?.connected) return;
  socket.emit('notification:getUnreadCount');
}
