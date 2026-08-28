'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const {
  SOCKET_EVENTS,
  NOTIFICATION_TYPE,
  VIDEO_SESSION_STATUS,
  VIDEO_SESSION_TYPE,
  EMERGENCY_SESSION_STATUS,
  EMERGENCY_SESSION_TYPE,
} = require('../../config/constants');
const roomTokenService = require('../telemedicine/roomToken.service');
const {
  emitToUser,
  emitToRole,
  emitToEmergency,
  emitToVideoRoom,
} = require('../../websocket');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const fcmService = require('../../services/fcm.service');
const logger = require('../../utils/logger');
const {
  listAccessiblePatientIds, canActForPatient, resolveActingPatientId,
} = require('../../utils/patientScope');

/* ── Helpers ──────────────────────────────────────────────────────── */

function _computePriority({ pain, symptoms = [] }) {
  const p = Number(pain);
  const text = (symptoms || []).join(' ').toLowerCase();
  const criticalTriggers = ['chest pain', 'unconscious', 'bleeding heavy', 'stroke', 'not breathing'];
  const highTriggers = ['bleeding', 'severe pain', 'broken', 'fainting'];

  if (criticalTriggers.some((t) => text.includes(t)) || p >= 9) return 'critical';
  if (highTriggers.some((t) => text.includes(t)) || p >= 7)    return 'high';
  if (p >= 4) return 'medium';
  return 'low';
}

function _getPatientWithUser(conn, patientId) {
  const Patient = conn.model('Patient');
  return Patient.findById(patientId).select('name user').lean();
}

async function _getOnDutyDoctorUserIds(conn) {
  const User = conn.model('User');
  const docs = await User.find({
    role: 'doctor',
    isActive: true,
    deletedAt: null,
  }).select('_id').lean();
  return docs.map((d) => String(d._id));
}

/* ── List Sessions ───────────────────────────────────────────────── */

async function listSessions(query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.type)   filter.type   = query.type;

  if (user.role === 'patient' || user.role === 'guardian') {
    // Guardians see their own sessions plus their dependents'.
    const accessibleIds = await listAccessiblePatientIds(user.userId, conn);
    if (accessibleIds.length) {
      filter.patient = { $in: accessibleIds };
    } else {
      return { items: [], total: 0, page: 1, limit };
    }
  } else {
    if (query.patient) filter.patient = query.patient;
    if (query.doctor)  filter.doctor  = query.doctor;
  }

  const [items, total] = await Promise.all([
    EmergencySession.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name')
      .populate('videoSession', 'roomId status'),
    EmergencySession.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ── Get Session By ID ───────────────────────────────────────────── */

async function getSessionById(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');

  const session = await EmergencySession.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name')
    .populate('videoSession', 'roomId status startedAt maxDuration');
  if (!session) throw ApiError.notFound('Emergency session not found');

  if (user.role === 'patient' || user.role === 'guardian') {
    const accessibleIds = await listAccessiblePatientIds(user.userId, conn);
    if (!canActForPatient(accessibleIds, session.patient._id || session.patient)) {
      throw ApiError.forbidden('Access denied to this emergency session');
    }
  }

  return session;
}

/* ── Create Session (patient-initiated) ──────────────────────────── */

async function createSession(data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');
  const Patient = conn.model('Patient');
  const userId = user.userId;

  // `data.patient` is client-supplied. Staff legitimately raise sessions for any
  // patient, but a patient/guardian may only do so for themselves or a dependent
  // — without this check any patient could file an emergency against someone
  // else's record.
  if (user.role === 'patient' || user.role === 'guardian') {
    await resolveActingPatientId(userId, conn, data.patient);
  }

  const patient = await Patient.findById(data.patient).select('_id name user').lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  const priority = data.priority || _computePriority({
    pain: data.pain,
    symptoms: data.symptoms,
  });

  const session = await EmergencySession.create({
    patient:  data.patient,
    branch:   data.branch,
    type:     data.type || EMERGENCY_SESSION_TYPE.CHAT,
    reason:   data.reason,
    symptoms: data.symptoms || [],
    pain:     data.pain,
    priority,
    createdBy: userId,
    status:   EMERGENCY_SESSION_STATUS.REQUESTED,
  });

  // ── Broadcast to all on-duty doctors (socket + FCM + notification bell)
  try {
    const doctorIds = await _getOnDutyDoctorUserIds(conn);
    const payload = {
      sessionId: String(session._id),
      patient: {
        _id: String(patient._id),
        name: patient.name,
      },
      type: session.type,
      reason: session.reason,
      symptoms: session.symptoms,
      pain: session.pain,
      priority: session.priority,
      createdAt: session.createdAt.toISOString(),
    };

    emitToRole(tenantSlug, 'doctor', SOCKET_EVENTS.EMERGENCY_NEW, payload);
    emitToRole(tenantSlug, 'receptionist', SOCKET_EVENTS.EMERGENCY_NEW, payload);

    fcmService.sendEmergencyAlert(doctorIds, tenantSlug, {
      sessionId: String(session._id),
      patientName: patient.name || 'Patient',
      type: session.type,
      reason: session.reason,
      symptoms: session.symptoms,
      pain: session.pain,
      priority: session.priority,
    }).catch((err) => logger.warn('emergency.create: FCM failed — %s', err.message));

    doctorIds.forEach((did) => {
      notifyAndEmit({
        recipient: did,
        title: `Emergency · ${patient.name || 'Patient'}`,
        message: session.reason || `New ${session.type} emergency request`,
        type: NOTIFICATION_TYPE.EMERGENCY,
        metadata: {
          sessionId: String(session._id),
          emergencyType: session.type,
          priority: session.priority,
        },
      }, tenantSlug).catch(() => {});
    });
  } catch (err) {
    logger.warn('emergency.create: broadcast failed — %s', err.message);
  }

  return session;
}

/* ── Accept Session — auto-create VideoSession ───────────────────── */

async function acceptSession(id, tenantSlug, doctorUserId) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');
  const VideoSession = conn.model('VideoSession');
  const User = conn.model('User');

  const session = await EmergencySession.findById(id);
  if (!session) throw ApiError.notFound('Emergency session not found');

  if (session.status !== EMERGENCY_SESSION_STATUS.REQUESTED) {
    throw ApiError.badRequest('Only sessions with status "requested" can be accepted');
  }

  // Auto-create a VideoSession (tenant-scoped, used for both video + chat emergencies)
  const roomId = roomTokenService.generateRoomId(tenantSlug);
  const videoSession = await VideoSession.create({
    type: VIDEO_SESSION_TYPE.EMERGENCY,
    status: VIDEO_SESSION_STATUS.WAITING,
    patient: session.patient,
    doctor: doctorUserId,
    branch: session.branch,
    roomId,
    reason: session.reason,
    maxDuration: 1800,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    createdBy: doctorUserId,
  });

  const now = new Date();
  session.status       = EMERGENCY_SESSION_STATUS.ACTIVE;
  session.doctor       = doctorUserId;
  session.roomId       = roomId;
  session.acceptedAt   = now;
  session.startedAt    = now;
  session.videoSession = videoSession._id;

  await session.save();

  // Look up doctor display + patient user
  const [doctor, patient] = await Promise.all([
    User.findById(doctorUserId).select('name specialization').lean(),
    _getPatientWithUser(conn, session.patient),
  ]);

  const payload = {
    sessionId: String(session._id),
    videoSessionId: String(videoSession._id),
    roomId,
    type: session.type,
    doctor: doctor ? {
      _id: String(doctor._id),
      name: doctor.name,
      specialization: doctor.specialization,
    } : null,
    acceptedAt: now.toISOString(),
  };

  // Notify patient — in-app + FCM ring (if type:'video') + persistent notification
  if (patient?.user) {
    emitToUser(String(patient.user), SOCKET_EVENTS.EMERGENCY_ACCEPTED, payload);

    if (session.type === EMERGENCY_SESSION_TYPE.VIDEO) {
      fcmService.sendIncomingCallAlert(String(patient.user), tenantSlug, {
        sessionId: String(videoSession._id),
        roomId,
        callerName: doctor?.name ? `Dr. ${doctor.name}` : 'Your doctor',
        callerRole: 'doctor',
        type: 'emergency',
        reason: session.reason || '',
      }).catch(() => {});
    }

    notifyAndEmit({
      recipient: String(patient.user),
      title: 'Doctor is ready',
      message: doctor?.name
        ? `Dr. ${doctor.name} has accepted your emergency request.`
        : 'A doctor has accepted your emergency request.',
      type: NOTIFICATION_TYPE.EMERGENCY,
      metadata: {
        sessionId: String(session._id),
        videoSessionId: String(videoSession._id),
        roomId,
        emergencyType: session.type,
      },
    }, tenantSlug).catch(() => {});
  }

  // Dismiss from the other doctors' live queues
  emitToRole(tenantSlug, 'doctor', SOCKET_EVENTS.EMERGENCY_ACCEPTED, {
    sessionId: String(session._id),
    acceptedBy: String(doctorUserId),
  });
  emitToRole(tenantSlug, 'receptionist', SOCKET_EVENTS.EMERGENCY_ACCEPTED, payload);

  return session;
}

/* ── End Session ─────────────────────────────────────────────────── */

async function endSession(id, tenantSlug, data) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');
  const VideoSession = conn.model('VideoSession');

  const session = await EmergencySession.findById(id);
  if (!session) throw ApiError.notFound('Emergency session not found');

  if (session.status !== EMERGENCY_SESSION_STATUS.ACTIVE) {
    throw ApiError.badRequest('Only active sessions can be ended');
  }

  const now = new Date();
  session.status   = EMERGENCY_SESSION_STATUS.ENDED;
  session.endedAt  = now;
  session.duration = session.startedAt
    ? Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
    : 0;
  if (data?.notes) session.notes = data.notes;

  await session.save();

  // Also close the linked VideoSession if still open
  if (session.videoSession) {
    try {
      const vs = await VideoSession.findById(session.videoSession);
      if (vs && [
        VIDEO_SESSION_STATUS.WAITING,
        VIDEO_SESSION_STATUS.ACTIVE,
        VIDEO_SESSION_STATUS.PAUSED,
      ].includes(vs.status)) {
        vs.status  = VIDEO_SESSION_STATUS.ENDED;
        vs.endedAt = now;
        vs.duration = vs.startedAt
          ? Math.round((now.getTime() - vs.startedAt.getTime()) / 1000)
          : 0;
        await vs.save();

        emitToVideoRoom(tenantSlug, vs.roomId, SOCKET_EVENTS.VIDEO_CALL_ENDED, {
          sessionId: String(vs._id),
          endedBy: 'emergency-closed',
          reason: 'emergency-ended',
          durationSec: vs.duration,
          endedAt: now.toISOString(),
        });
      }
    } catch (err) {
      logger.warn('emergency.end: linked VideoSession close failed — %s', err.message);
    }
  }

  // Broadcast the ended event
  const payload = {
    sessionId: String(session._id),
    endedAt: now.toISOString(),
    durationSec: session.duration,
  };
  emitToEmergency(String(session._id), SOCKET_EVENTS.EMERGENCY_ENDED, payload);

  try {
    const patient = await _getPatientWithUser(conn, session.patient);
    if (patient?.user) emitToUser(String(patient.user), SOCKET_EVENTS.EMERGENCY_ENDED, payload);
    if (session.doctor) emitToUser(String(session.doctor), SOCKET_EVENTS.EMERGENCY_ENDED, payload);
  } catch { /* non-fatal */ }

  emitToRole(tenantSlug, 'receptionist', SOCKET_EVENTS.EMERGENCY_ENDED, payload);

  return session;
}

/* ── Cancel Session (patient-initiated) ──────────────────────────── */

async function cancelSession(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');

  const session = await EmergencySession.findById(id);
  if (!session) throw ApiError.notFound('Emergency session not found');

  if (user.role === 'patient' || user.role === 'guardian') {
    const accessibleIds = await listAccessiblePatientIds(user.userId, conn);
    if (!canActForPatient(accessibleIds, session.patient)) {
      throw ApiError.forbidden('Access denied to this emergency session');
    }
  }

  if (session.status !== EMERGENCY_SESSION_STATUS.REQUESTED) {
    throw ApiError.badRequest('Only sessions still waiting for a doctor can be cancelled');
  }

  const now = new Date();
  session.status      = EMERGENCY_SESSION_STATUS.CANCELLED;
  session.cancelledAt = now;
  session.cancelledBy = user.userId;
  session.endedAt     = now;
  await session.save();

  // Broadcast cancellation to doctors/receptionists so their queue clears
  const payload = {
    sessionId: String(session._id),
    cancelledBy: String(user.userId),
    cancelledAt: now.toISOString(),
  };
  emitToRole(tenantSlug, 'doctor', SOCKET_EVENTS.EMERGENCY_CANCELLED, payload);
  emitToRole(tenantSlug, 'receptionist', SOCKET_EVENTS.EMERGENCY_CANCELLED, payload);

  return session;
}

/* ── Decline Session (doctor dismisses from their queue) ─────────── */

/**
 * Doctor-side "not me" action. Records an audit entry so we can measure
 * response funnel (how many doctors passed before one accepted) and
 * emits a targeted event to the declining doctor's user room so any
 * other devices they are signed in on clear the card too.
 *
 * IMPORTANT: Does NOT change the session's global status. Other doctors
 * can still accept. The card is only dismissed from the declining
 * doctor's queue client-side.
 */
async function declineSession(id, tenantSlug, user, data = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const EmergencySession = conn.model('EmergencySession');

  const session = await EmergencySession.findById(id);
  if (!session) throw ApiError.notFound('Emergency session not found');

  if (session.status !== EMERGENCY_SESSION_STATUS.REQUESTED) {
    throw ApiError.badRequest('Only pending emergencies can be declined');
  }

  // Idempotent — if this doctor has already declined, do not double-record.
  const alreadyDeclined = (session.declinedBy || []).some(
    (entry) => String(entry.doctor) === String(user.userId),
  );

  if (!alreadyDeclined) {
    session.declinedBy = session.declinedBy || [];
    session.declinedBy.push({
      doctor: user.userId,
      at: new Date(),
      reason: data?.reason || undefined,
    });
    await session.save();
  }

  // Emit ONLY to the declining user's room so their other devices also clear
  // the card. Other doctors should still see the emergency in their queue.
  emitToUser(String(user.userId), SOCKET_EVENTS.EMERGENCY_DECLINED, {
    sessionId: String(session._id),
    declinedBy: String(user.userId),
    at: new Date().toISOString(),
  });

  return session;
}

module.exports = {
  listSessions,
  getSessionById,
  createSession,
  acceptSession,
  declineSession,
  endSession,
  cancelSession,
};
