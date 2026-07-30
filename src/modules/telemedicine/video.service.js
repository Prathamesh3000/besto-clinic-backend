'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const {
  VIDEO_SESSION_STATUS,
  VIDEO_SESSION_TYPE,
  VIDEO_SESSION_TRANSITIONS,
  NOTIFICATION_TYPE,
  SOCKET_EVENTS,
} = require('../../config/constants');
const roomTokenService = require('./roomToken.service');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const {
  emitToUser,
  emitToVideoRoom,
} = require('../../websocket');
const fcmService = require('../../services/fcm.service');
const logger = require('../../utils/logger');

/* ── Helpers ──────────────────────────────────────────────────────── */

function _hasFullAccess(user, permission) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

async function _getLinkedPatientId(userId, conn) {
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

function _validateTransition(currentStatus, newStatus) {
  const allowed = VIDEO_SESSION_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(
      `Cannot transition from "${currentStatus}" to "${newStatus}"`,
    );
  }
}

/**
 * Announce that a call is over, to the video room and to each participant
 * directly (the latter covers peers who have not joined the room socket yet,
 * e.g. an incoming-call overlay that was never answered).
 */
function _broadcastCallEnded(conn, session, user, tenantSlug, { reason, durationSec, endedAt }) {
  const payload = {
    sessionId: String(session._id),
    endedBy: String(user.userId),
    reason,
    durationSec,
    endedAt,
  };

  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_CALL_ENDED, payload);

  _resolvePeerUserIds(conn, session, user.userId)
    .then((peerUserIds) => peerUserIds.forEach((pid) => {
      emitToUser(pid, SOCKET_EVENTS.VIDEO_CALL_ENDED, payload);
    }))
    .catch(() => { /* non-fatal — the room broadcast above is the primary path */ });
}

/**
 * Collect the two "other party" user IDs for a session so we can push
 * notifications/events targeted at them.
 */
async function _resolvePeerUserIds(conn, session, excludeUserId) {
  const Patient = conn.model('Patient');
  const userIds = new Set();

  // Doctor side
  if (session.doctor) {
    const doctorId = session.doctor._id || session.doctor;
    if (String(doctorId) !== String(excludeUserId)) {
      userIds.add(String(doctorId));
    }
  }

  // Patient side — map Patient._id → User._id
  if (session.patient) {
    const patientId = session.patient._id || session.patient;
    const pdoc = await Patient.findById(patientId).select('user').lean();
    if (pdoc?.user && String(pdoc.user) !== String(excludeUserId)) {
      userIds.add(String(pdoc.user));
    }
  }

  return Array.from(userIds);
}

/* ── Create Session ──────────────────────────────────────────────── */

async function createSession(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');
  const Patient = conn.model('Patient');

  // Accept either Patient._id or User._id — resolve to Patient._id
  let patient = await Patient.findById(data.patient).lean();
  if (!patient) {
    // Fallback: caller may have sent their User._id — look up Patient by user field
    patient = await Patient.findOne({ user: data.patient }).lean();
    if (patient) {
      data.patient = patient._id;
    }
  }
  if (!patient) throw ApiError.notFound('Patient not found');

  if (data.type === VIDEO_SESSION_TYPE.EMERGENCY) {
    const existing = await VideoSession.findOne({
      patient: data.patient,
      status: { $in: [VIDEO_SESSION_STATUS.REQUESTED, VIDEO_SESSION_STATUS.WAITING, VIDEO_SESSION_STATUS.ACTIVE] },
    }).lean();
    if (existing) {
      throw ApiError.badRequest('Patient already has an active telemedicine session');
    }
  }

  const roomId = roomTokenService.generateRoomId(tenantSlug);
  const maxDuration = data.maxDuration || 1800;
  let expiresAt;
  if (data.scheduledAt) {
    expiresAt = new Date(new Date(data.scheduledAt).getTime() + 2 * 60 * 60 * 1000);
  } else {
    expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  }

  const session = await VideoSession.create({
    type: data.type || VIDEO_SESSION_TYPE.SCHEDULED,
    status: data.scheduledAt ? VIDEO_SESSION_STATUS.SCHEDULED : VIDEO_SESSION_STATUS.REQUESTED,
    patient: data.patient,
    doctor: data.doctor,
    branch: data.branch,
    appointment: data.appointment,
    roomId,
    scheduledAt: data.scheduledAt,
    maxDuration,
    expiresAt,
    reason: data.reason,
    createdBy: user.userId,
  });

  // Notify the assigned doctor about the new teleconsult session
  if (data.doctor) {
    try {
      notifyAndEmit({
        recipient: data.doctor,
        title: 'New teleconsult session',
        message: `A ${data.type || 'scheduled'} teleconsult has been created${patient.name ? ` with ${patient.name}` : ''}`,
        type: NOTIFICATION_TYPE.VIDEO_CALL,
        metadata: {
          sessionId: String(session._id),
          roomId,
          type: data.type,
          appointmentId: data.appointment ? String(data.appointment) : null,
        },
      }, tenantSlug).catch(() => {});

      // FCM push for offline doctor
      fcmService.sendIncomingCallAlert(data.doctor, tenantSlug, {
        sessionId: String(session._id),
        roomId,
        callerName: patient.name || 'Patient',
        callerRole: 'patient',
        type: data.type || 'scheduled',
        reason: data.reason || '',
      }).catch((err) => logger.warn('createSession: FCM notify-doctor failed — %s', err.message));
    } catch (err) {
      logger.warn('createSession: doctor notification failed — %s', err.message);
    }
  }

  return session;
}

/* ── Get Session By ID ───────────────────────────────────────────── */

async function getSessionById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const populateOpts = [
    { path: 'patient', select: 'name patientId phone email' },
    { path: 'doctor', select: 'name specialization' },
    { path: 'branch', select: 'name' },
    { path: 'appointment', select: 'scheduledAt status' },
  ];

  // Try direct _id lookup, then fallback to appointment field
  let session = await VideoSession.findById(id).populate(populateOpts);
  if (!session) {
    session = await VideoSession.findOne({ appointment: id }).populate(populateOpts);
  }
  if (!session) throw ApiError.notFound('Video session not found');

  if (!_hasFullAccess(user, PERMISSIONS.TELEMEDICINE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(session.patient._id || session.patient) !== String(patientId)) {
      throw ApiError.forbidden('Access denied to this video session');
    }
  }

  return session;
}

/* ── List Sessions ───────────────────────────────────────────────── */

async function listSessions(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.doctor) filter.doctor = query.doctor;
  if (query.branch) filter.branch = query.branch;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  if (!_hasFullAccess(user, PERMISSIONS.TELEMEDICINE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      return { items: [], total: 0, page: 1, limit };
    }
  } else if (query.patient) {
    filter.patient = query.patient;
  }

  const [items, total] = await Promise.all([
    VideoSession.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name'),
    VideoSession.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ── Accept / Assign Doctor ──────────────────────────────────────── */

async function acceptSession(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id);
  if (!session) throw ApiError.notFound('Video session not found');

  _validateTransition(session.status, VIDEO_SESSION_STATUS.WAITING);

  // Only the assigned doctor or an admin can accept a session
  if (session.doctor && String(session.doctor) !== String(user.userId) && user.role !== 'admin') {
    throw ApiError.forbidden('Only the assigned doctor can accept this session');
  }

  session.status = VIDEO_SESSION_STATUS.WAITING;
  if (!session.doctor) {
    // Unassigned session: only allow assignment if user is a doctor or admin
    if (user.role !== 'doctor' && user.role !== 'admin') {
      throw ApiError.forbidden('Only doctors can be assigned to sessions');
    }
    session.doctor = user.userId;
  }
  await session.save();

  return session;
}

/* ── Join Session (generate tokens) ──────────────────────────────── */

async function joinSession(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  // Try direct _id lookup, then fallback to appointment field
  let session = await VideoSession.findById(id)
    .populate('patient', 'name user')
    .populate('doctor', 'name');
  if (!session) {
    session = await VideoSession.findOne({ appointment: id })
      .populate('patient', 'name user')
      .populate('doctor', 'name');
  }
  if (!session) throw ApiError.notFound('Video session not found');

  // Remember the original DB status before any in-memory mutations.
  const originalDbStatus = session.status;

  // Auto-promote scheduled teleconsults to waiting when participant joins
  // (will transition waiting → active below, saved at end of function)
  if (session.status === VIDEO_SESSION_STATUS.SCHEDULED) {
    session.status = VIDEO_SESSION_STATUS.WAITING;
  }

  if (![VIDEO_SESSION_STATUS.WAITING, VIDEO_SESSION_STATUS.ACTIVE, VIDEO_SESSION_STATUS.REQUESTED].includes(session.status)) {
    throw ApiError.badRequest(`Cannot join session with status "${session.status}"`);
  }

  if (session.expiresAt && session.expiresAt < new Date()) {
    session.status = VIDEO_SESSION_STATUS.EXPIRED;
    await session.save();
    throw ApiError.badRequest('This video session has expired');
  }

  // Determine participant role
  let participantRole;
  const patientId = await _getLinkedPatientId(user.userId, conn);

  if (patientId && String(session.patient._id || session.patient) === String(patientId)) {
    participantRole = 'patient';
  } else if (session.doctor && String(session.doctor._id || session.doctor) === String(user.userId)) {
    participantRole = 'doctor';
  } else if (!session.doctor && _hasFullAccess(user, PERMISSIONS.TELEMEDICINE_UPDATE) && user.role === 'admin') {
    // Only admins can join unassigned sessions as doctor — staff with
    // TELEMEDICINE_UPDATE alone should not get doctor-level access.
    participantRole = 'doctor';
  } else {
    throw ApiError.forbidden('You are not a participant in this session');
  }

  const { token, iv, expiresAt } = roomTokenService.generateRoomToken({
    roomId: session.roomId,
    participantId: user.userId,
    role: participantRole,
    maxDurationSec: session.maxDuration || 1800,
  });

  const isRequested = session.status === VIDEO_SESSION_STATUS.REQUESTED;
  const isWaiting = session.status === VIDEO_SESSION_STATUS.WAITING;

  // Determine if someone else has already joined (check connectionLog for a prior 'joined' event)
  const priorJoins = (session.connectionLog || []).filter(
    (log) => log.event === 'joined' && String(log.metadata?.userId) !== String(user.userId),
  );
  const isSecondParticipant = priorJoins.length > 0;

  // Atomic status promotion:
  // - First join: requested → waiting (doctor is ready, patient not yet, or vice versa)
  // - Second join: waiting → active (both parties present, call starts now)
  const updateOps = {
    $push: {
      connectionLog: {
        participant: participantRole,
        event: 'joined',
        timestamp: new Date(),
        metadata: { userId: user.userId },
      },
    },
    // Clear stored tokens after generating fresh ones (don't persist secrets)
    $unset: { roomToken: 1, patientToken: 1 },
  };

  if (isSecondParticipant && (isWaiting || isRequested)) {
    // Second participant → go ACTIVE and start the clock
    updateOps.$set = {
      status: VIDEO_SESSION_STATUS.ACTIVE,
      ...(!session.startedAt ? { startedAt: new Date() } : {}),
    };
  } else if (isRequested || originalDbStatus === VIDEO_SESSION_STATUS.SCHEDULED) {
    // First participant joining a requested/scheduled session → promote to waiting
    updateOps.$set = { status: VIDEO_SESSION_STATUS.WAITING };
  }

  // Use the original DB status in the filter so the atomic compare-and-swap works
  // even when the in-memory status was auto-promoted (e.g. scheduled → waiting).
  const statusFilter = (isRequested || isWaiting)
    ? { _id: session._id, status: originalDbStatus }
    : { _id: session._id };

  const updated = await VideoSession.findOneAndUpdate(statusFilter, updateOps, { new: true });
  if (!updated) {
    // Another participant already transitioned the status — re-fetch and continue
    await VideoSession.findByIdAndUpdate(session._id, {
      $push: updateOps.$push,
      $unset: updateOps.$unset,
    });
  }

  // ── Real-time: tell everyone in the room someone joined
  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_PEER_JOINED, {
    sessionId: String(session._id),
    userId: String(user.userId),
    role: participantRole,
    joinedAt: new Date().toISOString(),
  });

  // ── Ring the peer (incoming-call overlay on the other side)
  try {
    const peerUserIds = await _resolvePeerUserIds(conn, session, user.userId);
    const callerName = participantRole === 'doctor'
      ? `Dr. ${session.doctor?.name || user.name || 'Your doctor'}`
      : (session.patient?.name || user.name || 'Patient');

    for (const peerId of peerUserIds) {
      // In-app socket overlay
      emitToUser(peerId, SOCKET_EVENTS.VIDEO_INCOMING_CALL, {
        sessionId: String(session._id),
        roomId: session.roomId,
        callerName,
        callerRole: participantRole,
        type: session.type,
        reason: session.reason || '',
      });

      // Cross-device FCM for offline / background mobile
      fcmService.sendIncomingCallAlert(peerId, tenantSlug, {
        sessionId: String(session._id),
        roomId: session.roomId,
        callerName,
        callerRole: participantRole,
        type: session.type,
        reason: session.reason || '',
      }).catch((err) => logger.warn('video.join: FCM ring failed — %s', err.message));
    }
  } catch (err) {
    logger.warn('video.join: ring-peer failed — %s', err.message);
  }

  // In-app notification bell entry
  if (participantRole === 'doctor' && session.patient) {
    const Patient = conn.model('Patient');
    const patientDoc = await Patient.findById(session.patient._id || session.patient)
      .select('user name').lean();
    if (patientDoc?.user) {
      notifyAndEmit({
        recipient: patientDoc.user,
        title: 'Your teleconsult is starting',
        message: `Dr. ${session.doctor?.name || user.name || 'Your doctor'} is ready for your video consultation`,
        type: NOTIFICATION_TYPE.VIDEO_CALL,
        metadata: {
          teleconsultReady: true,
          sessionId: String(session._id),
          roomId: session.roomId,
          appointmentId: session.appointment ? String(session.appointment) : null,
        },
      }, tenantSlug).catch(() => {});
    }
  }

  // Build ICE server list: public STUN + optional TURN(s) for NAT traversal.
  // TURN env vars:
  //   TURN_SERVER_URL       — single TURN URL (back-compat)
  //   TURN_SERVER_URLS      — comma-separated TURN URLs (preferred, supports multiple hosts)
  //   TURN_USERNAME / TURN_CREDENTIAL — creds shared across all configured TURN URLs
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ];

  const turnUrls = [
    ...(process.env.TURN_SERVER_URLS || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean),
    process.env.TURN_SERVER_URL,
  ].filter(Boolean);

  if (turnUrls.length && (process.env.TURN_USERNAME || process.env.TURN_CREDENTIAL)) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }

  // Resolve the actual post-update status to return to the client.
  const finalStatus = updateOps.$set?.status || session.status;
  const finalStartedAt = updateOps.$set?.startedAt || session.startedAt;

  return {
    roomId: session.roomId,
    token,
    iv,
    expiresAt,
    participantRole,
    iceServers,
    session: {
      _id: session._id,
      type: session.type,
      status: finalStatus,
      patient: session.patient,
      doctor: session.doctor,
      startedAt: finalStartedAt,
      maxDuration: session.maxDuration,
    },
  };
}

/* ── Decline Incoming Call ───────────────────────────────────────── */

async function declineSession(id, user, tenantSlug, { reason } = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id)
    .populate('patient', 'name user')
    .populate('doctor', 'name');
  if (!session) throw ApiError.notFound('Video session not found');

  // Verify the user is actually a participant (patient or assigned doctor)
  const declinerId = String(user.userId);
  const linkedPatientId = await _getLinkedPatientId(user.userId, conn);
  const isPatient = linkedPatientId && String(session.patient?._id || session.patient) === String(linkedPatientId);
  const isDoctor = session.doctor && String(session.doctor._id || session.doctor) === declinerId;
  if (!isPatient && !isDoctor && user.role !== 'admin') {
    throw ApiError.forbidden('Only a participant can decline this call');
  }

  // Persist the decline — transition to cancelled so the session doesn't stay dangling
  const cancelAllowed = VIDEO_SESSION_TRANSITIONS[session.status];
  if (cancelAllowed && cancelAllowed.includes(VIDEO_SESSION_STATUS.CANCELLED)) {
    session.status = VIDEO_SESSION_STATUS.CANCELLED;
    session.notes = reason || 'Declined by participant';
    session.roomToken = undefined;
    session.patientToken = undefined;
    await session.save();
  }

  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_CALL_ENDED, {
    sessionId: String(session._id),
    endedBy: String(user.userId),
    reason: reason || 'declined',
    durationSec: 0,
    endedAt: new Date().toISOString(),
  });

  // Ping the caller directly too, in case they aren't joined to the room yet.
  try {
    const peerUserIds = await _resolvePeerUserIds(conn, session, user.userId);
    peerUserIds.forEach((pid) => {
      emitToUser(pid, SOCKET_EVENTS.VIDEO_CALL_ENDED, {
        sessionId: String(session._id),
        endedBy: String(user.userId),
        reason: reason || 'declined',
        endedAt: new Date().toISOString(),
      });
    });
  } catch { /* non-fatal */ }

  return { declined: true };
}

/* ── End Session ─────────────────────────────────────────────────── */

async function endSession(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id);
  if (!session) throw ApiError.notFound('Video session not found');

  // Ending is idempotent. Both participants race to end the same call (and a
  // client may retry), but VIDEO_SESSION_TRANSITIONS has no entry for terminal
  // states — so a second end used to throw "Cannot transition from ended to
  // ended". The caller saw that as "End Call is not working" and the UI never
  // tore down. Re-broadcast instead so the late caller still gets its teardown.
  const TERMINAL = [
    VIDEO_SESSION_STATUS.ENDED,
    VIDEO_SESSION_STATUS.CANCELLED,
    VIDEO_SESSION_STATUS.EXPIRED,
    VIDEO_SESSION_STATUS.NO_SHOW,
  ];
  if (TERMINAL.includes(session.status)) {
    _broadcastCallEnded(conn, session, user, tenantSlug, {
      reason: data.reason || session.status,
      durationSec: session.duration || 0,
      endedAt: (session.endedAt || new Date()).toISOString(),
    });
    return session;
  }

  _validateTransition(session.status, VIDEO_SESSION_STATUS.ENDED);

  const now = new Date();
  session.status = VIDEO_SESSION_STATUS.ENDED;
  session.endedAt = now;
  session.duration = session.startedAt
    ? Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
    : 0;

  if (data.notes) session.notes = data.notes;
  if (data.diagnosis) session.diagnosis = data.diagnosis;

  session.connectionLog.push({
    participant: user.role === 'patient' || user.role === 'guardian' ? 'patient' : 'doctor',
    event: 'left',
    timestamp: now,
    metadata: { userId: user.userId, reason: 'session_ended' },
  });

  session.roomToken = undefined;
  session.patientToken = undefined;

  await session.save();

  // ── Real-time broadcast
  _broadcastCallEnded(conn, session, user, tenantSlug, {
    reason: data.reason || 'ended',
    durationSec: session.duration,
    endedAt: now.toISOString(),
  });

  return session;
}

/* ── Cancel Session ──────────────────────────────────────────────── */

async function cancelSession(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id);
  if (!session) throw ApiError.notFound('Video session not found');

  _validateTransition(session.status, VIDEO_SESSION_STATUS.CANCELLED);

  session.status = VIDEO_SESSION_STATUS.CANCELLED;
  session.notes = data.reason || session.notes;
  session.roomToken = undefined;
  session.patientToken = undefined;

  await session.save();

  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_CALL_ENDED, {
    sessionId: String(session._id),
    endedBy: String(user.userId),
    reason: data.reason || 'cancelled',
    durationSec: 0,
    endedAt: new Date().toISOString(),
  });

  try {
    const peerUserIds = await _resolvePeerUserIds(conn, session, user.userId);
    peerUserIds.forEach((pid) => {
      emitToUser(pid, SOCKET_EVENTS.VIDEO_CALL_ENDED, {
        sessionId: String(session._id),
        endedBy: String(user.userId),
        reason: data.reason || 'cancelled',
        endedAt: new Date().toISOString(),
      });
    });
  } catch { /* non-fatal */ }

  return session;
}

/* ── Update Recording Consent ────────────────────────────────────── */

async function updateConsent(id, consentData, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id);
  if (!session) throw ApiError.notFound('Video session not found');

  const patientId = await _getLinkedPatientId(user.userId, conn);
  if (patientId && String(session.patient) === String(patientId)) {
    session.recordingConsent.patient = !!consentData.consent;
  } else if (String(session.doctor) === String(user.userId)) {
    session.recordingConsent.doctor = !!consentData.consent;
  } else {
    throw ApiError.forbidden('You are not a participant in this session');
  }

  // Update recording flag — both parties must consent for recording to be active
  session.isRecorded = !!(session.recordingConsent.patient && session.recordingConsent.doctor);

  await session.save();

  // Broadcast consent state change so peer UI updates the recording chip live.
  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_CONSENT_UPDATED, {
    sessionId: String(session._id),
    patient: session.recordingConsent.patient,
    doctor: session.recordingConsent.doctor,
    isRecorded: !!session.isRecorded,
  });

  return session;
}

/* ── Send Chat Message ───────────────────────────────────────────── */

async function sendMessage(sessionId, messageData, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');
  const ChatMessage = conn.model('ChatMessage');
  const User = conn.model('User');

  const session = await VideoSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Video session not found');

  // Chat allowed during active/paused/waiting (emergency chat sessions stay in WAITING)
  const chatAllowed = [
    VIDEO_SESSION_STATUS.ACTIVE,
    VIDEO_SESSION_STATUS.PAUSED,
    VIDEO_SESSION_STATUS.WAITING,
  ].includes(session.status);
  if (!chatAllowed) {
    throw ApiError.badRequest(`Chat is only available during an active session (current status: ${session.status})`);
  }

  // Determine sender role (patient vs staff)
  const patientId = await _getLinkedPatientId(user.userId, conn);
  const isPatient = patientId && String(session.patient) === String(patientId);
  const senderRole = isPatient ? 'patient' : (user.role || 'doctor');

  // Resolve display name (best-effort)
  let senderName = user.name;
  if (!senderName) {
    const u = await User.findById(user.userId).select('name').lean();
    senderName = u?.name || '';
  }

  // Encrypt at rest
  const { ciphertext, iv } = roomTokenService.encryptMessage(messageData.content || '');

  const message = await ChatMessage.create({
    session: sessionId,
    sender: user.userId,
    senderRole,
    senderName,
    type: messageData.type || 'text',
    content: ciphertext,
    iv,
    encrypted: true,
    attachment: messageData.attachment,
  });

  // Return decrypted payload so callers don't have to round-trip.
  // `messageId`/`sessionId` are the names the web clients filter and de-duplicate
  // on; `_id`/`session` are kept for older clients. `clientId` is echoed back so
  // the sender can reconcile its optimistic bubble instead of leaving it pending.
  const payload = {
    _id: String(message._id),
    messageId: String(message._id),
    session: String(sessionId),
    sessionId: String(sessionId),
    clientId: messageData.clientId || null,
    sender: String(user.userId),
    senderRole,
    senderName,
    type: message.type,
    content: messageData.content || '',
    attachment: message.attachment || null,
    createdAt: message.createdAt.toISOString(),
  };

  // ── Broadcast to the video room
  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.CHAT_MESSAGE, payload);

  // ── Confirm delivery to the sender
  emitToUser(String(user.userId), SOCKET_EVENTS.CHAT_DELIVERED, {
    messageId: payload._id,
    deliveredAt: new Date().toISOString(),
  });

  // ── FCM push for offline peers
  try {
    const peerUserIds = await _resolvePeerUserIds(conn, session, user.userId);
    for (const pid of peerUserIds) {
      fcmService.sendChatMessageAlert(pid, tenantSlug, {
        sessionId: String(sessionId),
        messageId: payload._id,
        senderName: senderName || 'New message',
        senderRole,
        preview: (messageData.content || '').slice(0, 120),
        hasAttachment: !!messageData.attachment,
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return payload;
}

/* ── Mark Message Read ───────────────────────────────────────────── */

async function markMessageRead(sessionId, messageId, user, tenantSlug, { upTo } = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');
  const ChatMessage = conn.model('ChatMessage');

  const session = await VideoSession.findById(sessionId).lean();
  if (!session) throw ApiError.notFound('Video session not found');

  const anchorMsg = await ChatMessage.findById(messageId).lean();
  if (!anchorMsg) throw ApiError.notFound('Message not found');
  if (String(anchorMsg.session) !== String(sessionId)) {
    throw ApiError.badRequest('Message does not belong to this session');
  }

  const now = new Date();

  if (upTo) {
    // Bulk mark: all messages in this session up to (and including) the anchor message
    const result = await ChatMessage.updateMany(
      {
        session: sessionId,
        createdAt: { $lte: anchorMsg.createdAt },
        'readBy.user': { $ne: user.userId },
      },
      {
        $push: { readBy: { user: user.userId, at: now } },
        $set: { readAt: now },
      },
    );

    emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.CHAT_READ, {
      messageId: String(messageId),
      readBy:    String(user.userId),
      readAt:    now.toISOString(),
      bulk:      true,
      count:     result.modifiedCount || 0,
    });

    return { read: true, count: result.modifiedCount || 0 };
  }

  // Single message read
  const msg = await ChatMessage.findById(messageId);
  if (!msg) throw ApiError.notFound('Message not found');

  const already = (msg.readBy || []).some((r) => String(r.user) === String(user.userId));
  if (!already) {
    msg.readBy.push({ user: user.userId, at: now });
    if (!msg.readAt) msg.readAt = now;
    await msg.save();
  }

  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.CHAT_READ, {
    messageId: String(messageId),
    readBy:    String(user.userId),
    readAt:    now.toISOString(),
  });

  return { read: true };
}

/* ── Get Chat Messages ───────────────────────────────────────────── */

async function getMessages(sessionId, query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');
  const ChatMessage = conn.model('ChatMessage');

  const session = await VideoSession.findById(sessionId).lean();
  if (!session) throw ApiError.notFound('Video session not found');

  if (!_hasFullAccess(user, PERMISSIONS.TELEMEDICINE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(session.patient) !== String(patientId)) {
      throw ApiError.forbidden('Access denied');
    }
  }

  const { skip, limit, page, sort } = parsePagination(query);
  const filter = { session: sessionId };

  const [items, total] = await Promise.all([
    ChatMessage.find(filter)
      .sort(sort.createdAt ? sort : { createdAt: 1 })
      .skip(skip).limit(limit)
      .populate('sender', 'name'),
    ChatMessage.countDocuments({ ...filter, deletedAt: null }),
  ]);

  const decryptedItems = items.map((msg) => {
    const obj = msg.toObject();
    if (obj.encrypted && obj.iv) {
      try {
        obj.content = roomTokenService.decryptMessage(obj.content, obj.iv);
      } catch {
        obj.content = '[Message could not be decrypted]';
      }
    }
    return obj;
  });

  return { items: decryptedItems, total, page, limit };
}

/* ── Share File ──────────────────────────────────────────────────── */

async function shareFile(sessionId, fileData, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Video session not found');
  if (session.status !== VIDEO_SESSION_STATUS.ACTIVE &&
      session.status !== VIDEO_SESSION_STATUS.WAITING) {
    throw ApiError.badRequest('Files can only be shared during active sessions');
  }

  session.sharedFiles.push({
    name: fileData.name,
    url: fileData.url,
    mimeType: fileData.mimeType,
    size: fileData.size,
    uploadedBy: user.userId,
    uploadedAt: new Date(),
  });

  await session.save();

  // Create a chat message with the file attachment and broadcast it.
  const messagePayload = await sendMessage(sessionId, {
    type: (fileData.mimeType || '').startsWith('image/') ? 'image' : 'file',
    content: `Shared: ${fileData.name}`,
    attachment: {
      name: fileData.name,
      url: fileData.url,
      mimeType: fileData.mimeType,
      size: fileData.size,
    },
  }, user, tenantSlug);

  return { session, message: messagePayload };
}

/* ── Log Connection Event ────────────────────────────────────────── */

async function logConnectionEvent(sessionId, eventData, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Video session not found');

  const patientId = await _getLinkedPatientId(user.userId, conn);
  const participant = patientId && String(session.patient) === String(patientId)
    ? 'patient'
    : 'doctor';

  session.connectionLog.push({
    participant,
    event: eventData.event,
    timestamp: new Date(),
    metadata: { userId: user.userId, ...eventData.metadata },
  });

  await session.save();
  return { logged: true };
}

/* ── Presence (doctor self-service) ──────────────────────────────── */

async function setPresence(status, user, tenantSlug) {
  const valid = ['online', 'busy', 'dnd', 'offline'];
  if (!valid.includes(status)) {
    throw ApiError.badRequest(`Invalid presence status: ${status}`);
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const updated = await User.findByIdAndUpdate(
    user.userId,
    { $set: { 'presence.status': status, 'presence.lastSeenAt': new Date() } },
    { new: true },
  ).select('presence role name').lean();

  if (!updated) throw ApiError.notFound('User not found');

  // Broadcast via the in-memory presence registry too
  try {
    const { setPresence: setMemoryPresence } = require('../../websocket/handlers/presenceHandler');
    const { getIO } = require('../../websocket');
    const io = getIO();
    if (io) {
      setMemoryPresence(io, tenantSlug, user.userId, {
        status,
        role: updated.role,
        name: updated.name,
      });
    }
  } catch (err) {
    logger.warn('setPresence: socket broadcast failed — %s', err.message);
  }

  return updated.presence;
}

async function getPresenceSnapshot(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const { getPresenceSnapshot: getMemorySnapshot } =
    require('../../websocket/handlers/presenceHandler');
  const memory = getMemorySnapshot(tenantSlug);

  // Merge memory (live) with persisted last-seen (for doctors currently offline)
  const doctors = await User.find({
    role: 'doctor',
    deletedAt: null,
  }).select('_id name presence role').lean();

  const merged = doctors.map((d) => {
    const mem = memory.find((m) => String(m.userId) === String(d._id));
    if (mem) return mem;
    return {
      userId: String(d._id),
      status: d.presence?.status || 'offline',
      role: d.role,
      name: d.name,
      lastChangedAt: d.presence?.lastSeenAt || null,
    };
  });

  memory.forEach((m) => {
    if (!merged.some((x) => String(x.userId) === String(m.userId))) {
      merged.push(m);
    }
  });

  return merged;
}

/* ── Extend Session ───────────────────────────────────────────── */

const MAX_EXTENSIONS = 2;
const EXTENSION_DURATION_SEC = 900; // 15 minutes per extension

async function extendSession(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const session = await VideoSession.findById(id);
  if (!session) throw ApiError.notFound('Video session not found');

  if (session.status !== VIDEO_SESSION_STATUS.ACTIVE && session.status !== VIDEO_SESSION_STATUS.WAITING) {
    throw ApiError.badRequest('Can only extend active or waiting sessions');
  }

  const extensions = session.extensions || 0;
  if (extensions >= MAX_EXTENSIONS) {
    throw ApiError.badRequest(`Maximum ${MAX_EXTENSIONS} extensions allowed per session`);
  }

  const newMaxDuration = (session.maxDuration || 1800) + EXTENSION_DURATION_SEC;
  const newExpiresAt = session.expiresAt
    ? new Date(session.expiresAt.getTime() + EXTENSION_DURATION_SEC * 1000)
    : new Date(Date.now() + EXTENSION_DURATION_SEC * 1000);

  session.maxDuration = newMaxDuration;
  session.expiresAt = newExpiresAt;
  session.extensions = extensions + 1;
  await session.save();

  // Notify both participants that session was extended
  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_SESSION_EXTENDED, {
    sessionId: String(session._id),
    roomId: session.roomId,
    newExpiresAt: newExpiresAt.toISOString(),
    maxDuration: newMaxDuration,
    extensionsUsed: session.extensions,
    maxExtensions: MAX_EXTENSIONS,
    extendedBy: String(user.userId),
  });

  logger.info('Video session %s extended by user %s (%d/%d)', id, user.userId, session.extensions, MAX_EXTENSIONS);

  return {
    expiresAt: newExpiresAt,
    maxDuration: newMaxDuration,
    extensionsUsed: session.extensions,
    maxExtensions: MAX_EXTENSIONS,
  };
}

module.exports = {
  createSession,
  getSessionById,
  listSessions,
  acceptSession,
  joinSession,
  declineSession,
  endSession,
  cancelSession,
  updateConsent,
  sendMessage,
  markMessageRead,
  getMessages,
  shareFile,
  logConnectionEvent,
  setPresence,
  getPresenceSnapshot,
  extendSession,
};
