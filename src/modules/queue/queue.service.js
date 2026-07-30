'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { QUEUE_STATUS, QUEUE_PRIORITY, APPOINTMENT_STATUS } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

/**
 * Priority sort weight — lower number = higher in queue.
 */
const PRIORITY_WEIGHT = Object.freeze({
  [QUEUE_PRIORITY.EMERGENCY]: 0,
  [QUEUE_PRIORITY.HIGH]:      1,
  [QUEUE_PRIORITY.NORMAL]:    2,
});

// ── List (paginated, filterable) ─────────────────────────────

async function listQueueEntries(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.branch)  filter.branch  = query.branch;
  if (query.doctor)  filter.doctor  = query.doctor;
  if (query.status)  filter.status  = query.status;

  if (query.date) {
    const dayStart = new Date(query.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(query.date);
    dayEnd.setHours(23, 59, 59, 999);
    filter.createdAt = { $gte: dayStart, $lte: dayEnd };
  }

  const [items, total] = await Promise.all([
    QueueEntry.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name specialization'),
    QueueEntry.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

// ── Current queue (today, branch-specific) ───────────────────

async function getCurrentQueue(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  if (!query.branch) {
    throw ApiError.badRequest('Branch is required to fetch the current queue');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filter = {
    branch: query.branch,
    status: { $in: [QUEUE_STATUS.WAITING, QUEUE_STATUS.IN_CONSULTATION] },
    createdAt: { $gte: today },
  };

  const items = await QueueEntry.find(filter)
    .sort({ priority: 1, tokenNumber: 1 })
    .populate('patient', 'name patientId')
    .populate('doctor', 'name specialization')
    .populate('room', 'name code type status')
    .lean();

  // Re-sort by priority weight, then sortOrder (fallback to tokenNumber for legacy entries)
  items.sort((a, b) => {
    const wA = PRIORITY_WEIGHT[a.priority] ?? 2;
    const wB = PRIORITY_WEIGHT[b.priority] ?? 2;
    if (wA !== wB) return wA - wB;
    return (a.sortOrder ?? a.tokenNumber) - (b.sortOrder ?? b.tokenNumber);
  });

  return items;
}

// ── Get by ID ────────────────────────────────────────────────

async function getQueueEntryById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  const entry = await QueueEntry.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name');
  if (!entry) throw ApiError.notFound('Queue entry not found');

  return entry;
}

// ── Add to queue ─────────────────────────────────────────────

async function addToQueue(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const Patient = conn.model('Patient');
  const User = conn.model('User');

  // Validate patient exists
  const patient = await Patient.findById(data.patient).select('_id').lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  // Validate doctor exists
  const doctor = await User.findById(data.doctor).select('_id').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');

  // Auto-generate token number (max for today's branch + 1)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use retry loop to handle duplicate token race condition
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const lastEntry = await QueueEntry.findOne({
        branch: data.branch,
        createdAt: { $gte: today },
      })
        .sort({ tokenNumber: -1 })
        .select('tokenNumber')
        .lean();

      const tokenNumber = (lastEntry?.tokenNumber || 0) + 1;

      return await QueueEntry.create({
        ...data,
        tokenNumber,
        sortOrder: tokenNumber,
        createdBy: userId,
      });
    } catch (err) {
      // If duplicate key error on tokenNumber, retry
      if (err.code === 11000 && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
}

// ── Call patient ─────────────────────────────────────────────

async function callPatient(id, tenantSlug, roomId) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const ConsultationRoom = conn.model('ConsultationRoom');

  const entry = await QueueEntry.findById(id);
  if (!entry) throw ApiError.notFound('Queue entry not found');

  if (entry.status !== QUEUE_STATUS.WAITING) {
    throw ApiError.badRequest('Only entries with status "waiting" can be called');
  }

  // Assign room: explicit selection or auto-assign first available
  const roomUpdate = {
    status: 'occupied',
    currentDoctor: entry.doctor,
    currentPatient: entry.patient,
    currentAppointment: entry.appointment || null,
    occupiedSince: new Date(),
  };

  const room = roomId
    ? await ConsultationRoom.findOneAndUpdate(
        { _id: roomId, isActive: true, deletedAt: null },
        roomUpdate,
        { new: true },
      )
    : await ConsultationRoom.findOneAndUpdate(
        { branch: entry.branch, status: 'available', isActive: true, deletedAt: null },
        roomUpdate,
        { new: true, sort: { type: 1, code: 1 } },
      );

  entry.status = QUEUE_STATUS.IN_CONSULTATION;
  entry.calledAt = new Date();
  if (room) entry.room = room._id;
  await entry.save();

  // Sync: advance linked appointment to in_progress
  if (entry.appointment) {
    try {
      const Appointment = conn.model('Appointment');
      await Appointment.findOneAndUpdate(
        { _id: entry.appointment, status: APPOINTMENT_STATUS.CHECKED_IN },
        { status: APPOINTMENT_STATUS.IN_PROGRESS, startedAt: new Date() },
      );
    } catch { /* best-effort — queue action already succeeded */ }
  }

  // Notify patient via SMS and in-app notification (best-effort)
  try {
    const Patient = conn.model('Patient');
    const patient = await Patient.findById(entry.patient).select('name phone user').lean();
    if (patient) {
      const roomCode = room?.code || room?.name || null;
      const { notifyAndEmit } = require('../../utils/notifyAndEmit');
      const smsService = require('../../services/sms.service');
      const { emitToUser, emitToTenant } = require('../../websocket');

      // In-app notification
      if (patient.user) {
        await notifyAndEmit({
          recipient: patient.user,
          title: "You're Up!",
          message: `Please proceed to ${roomCode ? `Room ${roomCode}` : 'the reception'}. Token #${entry.tokenNumber}.`,
          type: 'appointment',
          metadata: { queueEntryId: entry._id, tokenNumber: entry.tokenNumber, room: roomCode },
        }, tenantSlug);

        // Targeted socket event for patient's appointment screen
        emitToUser(String(patient.user), 'queue:called', {
          entryId: entry._id,
          tokenNumber: entry.tokenNumber,
          room: roomCode,
        });
      }

      // SMS
      if (patient.phone && patient.phone !== 'N/A') {
        await smsService.sendPatientCalled({
          phone: patient.phone,
          patientName: patient.name,
          tokenNumber: entry.tokenNumber,
          roomCode,
          tenantSlug,
        });
      }

      // Broadcast to queue management screens
      emitToTenant(tenantSlug, 'queue:update', {
        action: 'patient_called',
        entryId: entry._id,
        branch: String(entry.branch),
      });
    }
  } catch (err) {
    // Notification failures should not break the call operation
    const logger = require('../../utils/logger');
    logger.error('callPatient notification failed: %s', err.message);
  }

  return entry;
}

// ── Complete consultation ────────────────────────────────────

async function completeConsultation(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const ConsultationRoom = conn.model('ConsultationRoom');

  const entry = await QueueEntry.findById(id);
  if (!entry) throw ApiError.notFound('Queue entry not found');

  if (entry.status !== QUEUE_STATUS.IN_CONSULTATION) {
    throw ApiError.badRequest('Only entries with status "in_consultation" can be completed');
  }

  // Auto-release assigned room
  if (entry.room) {
    await ConsultationRoom.findByIdAndUpdate(entry.room, {
      status: 'available',
      currentDoctor: null,
      currentPatient: null,
      currentAppointment: null,
      occupiedSince: null,
    });
  }

  entry.status = QUEUE_STATUS.COMPLETED;
  entry.completedAt = new Date();
  await entry.save();

  // Sync: advance linked appointment to completed
  if (entry.appointment) {
    try {
      const Appointment = conn.model('Appointment');
      await Appointment.findOneAndUpdate(
        { _id: entry.appointment, status: APPOINTMENT_STATUS.IN_PROGRESS },
        { status: APPOINTMENT_STATUS.COMPLETED, completedAt: new Date() },
      );
    } catch { /* best-effort */ }
  }

  return entry;
}

// ── Cancel / No-show ─────────────────────────────────────────

async function cancelEntry(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  const entry = await QueueEntry.findById(id);
  if (!entry) throw ApiError.notFound('Queue entry not found');

  if (entry.status === QUEUE_STATUS.COMPLETED) {
    throw ApiError.badRequest('Cannot cancel a completed queue entry');
  }

  entry.status = data.reason === 'no_show' ? QUEUE_STATUS.NO_SHOW : QUEUE_STATUS.CANCELLED;
  if (data.reason) entry.notes = data.reason;
  await entry.save();

  // Sync: update linked appointment status
  if (entry.appointment) {
    try {
      const Appointment = conn.model('Appointment');
      if (data.reason === 'no_show') {
        await Appointment.findOneAndUpdate(
          { _id: entry.appointment, status: { $in: [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.CONFIRMED] } },
          { status: APPOINTMENT_STATUS.NO_SHOW },
        );
      } else {
        await Appointment.findOneAndUpdate(
          { _id: entry.appointment, status: APPOINTMENT_STATUS.CHECKED_IN },
          { status: APPOINTMENT_STATUS.CANCELLED, cancelledAt: new Date() },
        );
      }
    } catch { /* best-effort */ }
  }

  return entry;
}

// ── Change priority ──────────────────────────────────────────

async function changePriority(id, newPriority, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  const entry = await QueueEntry.findById(id);
  if (!entry) throw ApiError.notFound('Queue entry not found');

  if (entry.status !== QUEUE_STATUS.WAITING) {
    throw ApiError.badRequest('Can only change priority of waiting entries');
  }

  if (entry.priority === newPriority) return entry;

  entry.priority = newPriority;
  await entry.save({ validateModifiedOnly: true });

  // Broadcast update
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'queue:update', {
      action: 'priority_changed',
      entryId: entry._id,
      branch: String(entry.branch),
    });
  } catch { /* best-effort */ }

  return entry;
}

// ── Swap positions ───────────────────────────────────────────

async function swapPositions(idA, idB, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  const [entryA, entryB] = await Promise.all([
    QueueEntry.findById(idA),
    QueueEntry.findById(idB),
  ]);

  if (!entryA || !entryB) throw ApiError.notFound('One or both queue entries not found');

  if (entryA.status !== QUEUE_STATUS.WAITING || entryB.status !== QUEUE_STATUS.WAITING) {
    throw ApiError.badRequest('Can only swap positions of waiting entries');
  }

  if (String(entryA.branch) !== String(entryB.branch)) {
    throw ApiError.badRequest('Cannot swap entries from different branches');
  }

  // Swap sortOrder values
  const sortA = entryA.sortOrder ?? entryA.tokenNumber;
  const sortB = entryB.sortOrder ?? entryB.tokenNumber;

  entryA.sortOrder = sortB;
  entryB.sortOrder = sortA;

  await Promise.all([
    entryA.save({ validateModifiedOnly: true }),
    entryB.save({ validateModifiedOnly: true }),
  ]);

  // Broadcast update
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'queue:update', {
      action: 'positions_swapped',
      branch: String(entryA.branch),
    });
  } catch { /* best-effort */ }

  return { entryA, entryB };
}

// ── Move position (up/down) ──────────────────────────────────

async function movePosition(id, direction, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');

  const entry = await QueueEntry.findById(id);
  if (!entry) throw ApiError.notFound('Queue entry not found');

  if (entry.status !== QUEUE_STATUS.WAITING) {
    throw ApiError.badRequest('Can only move waiting entries');
  }

  // Get all waiting entries for this branch today, sorted the same way as getCurrentQueue
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const waitingEntries = await QueueEntry.find({
    branch: entry.branch,
    status: QUEUE_STATUS.WAITING,
    createdAt: { $gte: today },
  }).lean();

  // Sort by priority weight then sortOrder
  waitingEntries.sort((a, b) => {
    const wA = PRIORITY_WEIGHT[a.priority] ?? 2;
    const wB = PRIORITY_WEIGHT[b.priority] ?? 2;
    if (wA !== wB) return wA - wB;
    return (a.sortOrder ?? a.tokenNumber) - (b.sortOrder ?? b.tokenNumber);
  });

  const currentIdx = waitingEntries.findIndex((e) => String(e._id) === String(id));
  if (currentIdx === -1) throw ApiError.notFound('Entry not found in current queue');

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
  if (targetIdx < 0 || targetIdx >= waitingEntries.length) {
    throw ApiError.badRequest(`Entry is already at the ${direction === 'up' ? 'top' : 'bottom'} of the queue`);
  }

  const neighbour = waitingEntries[targetIdx];

  // Swap sortOrder values
  const entrySortOrder = entry.sortOrder ?? entry.tokenNumber;
  const neighbourSortOrder = neighbour.sortOrder ?? neighbour.tokenNumber;

  await Promise.all([
    QueueEntry.updateOne({ _id: entry._id }, { sortOrder: neighbourSortOrder }),
    QueueEntry.updateOne({ _id: neighbour._id }, { sortOrder: entrySortOrder }),
  ]);

  // Broadcast update
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'queue:update', {
      action: 'position_moved',
      entryId: entry._id,
      branch: String(entry.branch),
    });
  } catch { /* best-effort */ }

  return { moved: true, direction };
}

module.exports = {
  listQueueEntries,
  getCurrentQueue,
  getQueueEntryById,
  addToQueue,
  callPatient,
  completeConsultation,
  cancelEntry,
  changePriority,
  swapPositions,
  movePosition,
};
