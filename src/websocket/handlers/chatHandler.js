'use strict';

/**
 * @deprecated — RETIRED.
 *
 * The old ephemeral appointment-based chat (`chat:join` / `chat:leave` / `chat:message`
 * scoped to `chat:{slug}:{appointmentId}`) has been replaced by the unified
 * video-session-scoped chat in `videoHandler.js`.
 *
 * All real-time chat now flows through:
 *   - Rooms: `video:{slug}:{roomId}` (where roomId comes from a VideoSession, including
 *     auto-created VideoSessions for emergency `type:'chat'` sessions).
 *   - Events: `chat:message`, `chat:delivered`, `chat:read`, `chat:typing`.
 *   - Persistence: `ChatMessage` model (AES-256-GCM encrypted at rest).
 *
 * This file is kept as a placeholder so any stale import surfaces a no-op
 * rather than a crash during the transition. Safe to delete after Wave 4.
 */

const logger = require('../../utils/logger');

function registerChatHandlers(/* io, socket */) {
  logger.warn('chatHandler is deprecated — use the unified videoHandler chat events.');
}

module.exports = registerChatHandlers;
