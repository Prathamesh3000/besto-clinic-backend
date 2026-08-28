'use strict';

const mongoose = require('mongoose');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

// ── Helpers ───────────────────────────────────────
function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dayName() {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

// ═══════════════════════════════════════════════════
// 1. DOCTOR PRESENCE BOARD
// ═══════════════════════════════════════════════════
async function getDoctorPresence(tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const QueueEntry = conn.model('QueueEntry');
  const Appointment = conn.model('Appointment');
  const DoctorSchedule = conn.model('DoctorSchedule');
  const DoctorLeave = conn.model('DoctorLeave');
  const ConsultationRoom = conn.model('ConsultationRoom');

  const { start, end } = todayRange();
  const today = dayName();
  const now = new Date();

  // Get all active doctors
  const doctorFilter = { role: 'doctor', isActive: true, deletedAt: null };
  if (branchId) doctorFilter.branch = new mongoose.Types.ObjectId(branchId);
  const doctors = await User.find(doctorFilter)
    .select('name specialization branch avatar')
    .populate('branch', 'name code')
    .lean();

  const doctorIds = doctors.map((d) => d._id);

  // Parallel fetch all data needed
  const [queueEntries, todayAppointments, schedules, leaves, rooms] = await Promise.all([
    // Current queue entries (waiting + in_consultation)
    QueueEntry.find({
      doctor: { $in: doctorIds },
      createdAt: { $gte: start },
      status: { $in: ['waiting', 'in_consultation'] },
    })
      .populate('patient', 'name patientId')
      .populate('branch', 'name')
      .lean(),

    // Today's appointments
    Appointment.find({
      doctor: { $in: doctorIds },
      scheduledAt: { $gte: start, $lte: end },
      deletedAt: null,
    })
      .select('doctor status scheduledAt patient duration startedAt')
      .populate('patient', 'name patientId')
      .lean(),

    // Schedules for today
    DoctorSchedule.find({
      doctor: { $in: doctorIds },
      isActive: true,
    }).lean(),

    // Active leaves covering today
    DoctorLeave.find({
      doctor: { $in: doctorIds },
      startDate: { $lte: end },
      endDate: { $gte: start },
      status: { $in: ['approved', 'pending'] },
    }).lean(),

    // Room assignments
    ConsultationRoom.find({
      currentDoctor: { $in: doctorIds },
      status: 'occupied',
    })
      .select('name code branch currentPatient occupiedSince')
      .populate('currentPatient', 'name patientId')
      .populate('branch', 'name')
      .lean(),
  ]);

  // Build lookup maps
  const queueByDoctor = {};
  for (const q of queueEntries) {
    const did = q.doctor.toString();
    if (!queueByDoctor[did]) queueByDoctor[did] = [];
    queueByDoctor[did].push(q);
  }

  const apptByDoctor = {};
  for (const a of todayAppointments) {
    const did = a.doctor.toString();
    if (!apptByDoctor[did]) apptByDoctor[did] = [];
    apptByDoctor[did].push(a);
  }

  const scheduleByDoctor = {};
  for (const s of schedules) {
    const did = s.doctor.toString();
    if (!scheduleByDoctor[did]) scheduleByDoctor[did] = [];
    scheduleByDoctor[did].push(s);
  }

  const leaveByDoctor = {};
  for (const l of leaves) {
    leaveByDoctor[l.doctor.toString()] = l;
  }

  const roomByDoctor = {};
  for (const r of rooms) {
    if (r.currentDoctor) roomByDoctor[r.currentDoctor.toString()] = r;
  }

  // Build presence for each doctor
  return doctors.map((doc) => {
    const did = doc._id.toString();
    const docQueue = queueByDoctor[did] || [];
    const docAppts = apptByDoctor[did] || [];
    const docSchedules = scheduleByDoctor[did] || [];
    const leave = leaveByDoctor[did];
    const room = roomByDoctor[did];

    // Determine current status
    const activeConsultation = docQueue.find((q) => q.status === 'in_consultation');
    const waitingPatients = docQueue.filter((q) => q.status === 'waiting');
    const inProgressAppt = docAppts.find((a) => a.status === 'in_progress');

    // Today's schedule
    let todaySchedule = null;
    for (const sched of docSchedules) {
      const dayEntry = (sched.weeklySchedule || []).find((d) => d.day === today);
      if (dayEntry && dayEntry.isWorking) {
        todaySchedule = {
          startTime: dayEntry.startTime,
          endTime: dayEntry.endTime,
          branch: sched.branch,
          slotDuration: sched.slotDuration,
        };
        break;
      }
    }

    // Determine presence status
    let status = 'offline'; // not scheduled today
    let statusDetail = 'Not scheduled today';
    let currentPatient = null;
    let consultingSince = null;

    if (leave) {
      status = 'on_leave';
      statusDetail = `On ${leave.leaveType} leave`;
    } else if (activeConsultation) {
      status = 'in_consultation';
      statusDetail = 'In consultation';
      currentPatient = activeConsultation.patient;
      consultingSince = activeConsultation.calledAt || activeConsultation.updatedAt;
    } else if (inProgressAppt) {
      status = 'in_consultation';
      statusDetail = 'In consultation';
      currentPatient = inProgressAppt.patient;
      consultingSince = inProgressAppt.startedAt;
    } else if (todaySchedule) {
      // Scheduled today but not consulting
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = todaySchedule.startTime.split(':').map(Number);
      const [eh, em] = todaySchedule.endTime.split(':').map(Number);
      const schedStart = sh * 60 + sm;
      const schedEnd = eh * 60 + em;

      if (nowMinutes < schedStart) {
        status = 'upcoming';
        statusDetail = `Starts at ${todaySchedule.startTime}`;
      } else if (nowMinutes > schedEnd) {
        status = 'shift_ended';
        statusDetail = `Shift ended at ${todaySchedule.endTime}`;
      } else if (waitingPatients.length > 0) {
        status = 'available';
        statusDetail = `${waitingPatients.length} patient${waitingPatients.length > 1 ? 's' : ''} waiting`;
      } else {
        status = 'available';
        statusDetail = 'Available — no patients waiting';
      }
    }

    // Appointment stats for today
    const apptStats = {
      total: docAppts.length,
      completed: docAppts.filter((a) => a.status === 'completed').length,
      remaining: docAppts.filter((a) =>
        ['requested', 'confirmed', 'checked_in'].includes(a.status),
      ).length,
      inProgress: docAppts.filter((a) => a.status === 'in_progress').length,
    };

    return {
      _id: doc._id,
      name: doc.name,
      specialization: doc.specialization,
      branch: doc.branch,
      avatar: doc.avatar,
      status,
      statusDetail,
      currentPatient,
      consultingSince,
      room: room
        ? { name: room.name, code: room.code, occupiedSince: room.occupiedSince }
        : null,
      waitingCount: waitingPatients.length,
      todaySchedule,
      appointments: apptStats,
      nextAppointment: docAppts
        .filter((a) => ['confirmed', 'checked_in'].includes(a.status) && new Date(a.scheduledAt) > now)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null,
    };
  });
}

// ═══════════════════════════════════════════════════
// 2. WAITING PATIENTS (who's been waiting too long?)
// ═══════════════════════════════════════════════════
async function getWaitingPatients(tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const Appointment = conn.model('Appointment');

  const { start } = todayRange();
  const now = new Date();

  // Queue entries that are waiting
  const queueFilter = {
    status: 'waiting',
    createdAt: { $gte: start },
  };
  if (branchId) queueFilter.branch = new mongoose.Types.ObjectId(branchId);

  const waitingQueue = await QueueEntry.find(queueFilter)
    .populate('patient', 'name patientId phone')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name code')
    .sort({ priority: 1, checkedInAt: 1 })
    .lean();

  // Also get checked_in appointments (waiting for consultation to start)
  const apptFilter = {
    status: 'checked_in',
    scheduledAt: { $gte: start },
    deletedAt: null,
  };
  if (branchId) apptFilter.branch = new mongoose.Types.ObjectId(branchId);

  const checkedInAppts = await Appointment.find(apptFilter)
    .populate('patient', 'name patientId phone')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name code')
    .sort({ checkedInAt: 1 })
    .lean();

  // Combine and compute wait times
  const patients = [];

  for (const q of waitingQueue) {
    const waitingSince = q.checkedInAt || q.createdAt;
    const waitMinutes = Math.round((now - new Date(waitingSince)) / 60000);
    patients.push({
      _id: q._id,
      source: 'queue',
      patient: q.patient,
      doctor: q.doctor,
      branch: q.branch,
      priority: q.priority,
      tokenNumber: q.tokenNumber,
      waitingSince,
      waitMinutes,
      severity: waitMinutes > 45 ? 'critical' : waitMinutes > 25 ? 'warning' : 'normal',
    });
  }

  for (const a of checkedInAppts) {
    // Skip if already in queue list (linked via appointment)
    const alreadyInQueue = waitingQueue.some(
      (q) => q.appointment && q.appointment.toString() === a._id.toString(),
    );
    if (alreadyInQueue) continue;

    const waitingSince = a.checkedInAt || a.scheduledAt;
    const waitMinutes = Math.round((now - new Date(waitingSince)) / 60000);
    patients.push({
      _id: a._id,
      source: 'appointment',
      patient: a.patient,
      doctor: a.doctor,
      branch: a.branch,
      priority: a.type === 'emergency' ? 'emergency' : 'normal',
      tokenNumber: null,
      waitingSince,
      waitMinutes,
      severity: waitMinutes > 45 ? 'critical' : waitMinutes > 25 ? 'warning' : 'normal',
    });
  }

  // Sort: critical first, then by wait time descending
  patients.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, normal: 2 };
    const diff = (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
    if (diff !== 0) return diff;
    return b.waitMinutes - a.waitMinutes;
  });

  return patients;
}

// ═══════════════════════════════════════════════════
// 3. BRANCH CAPACITY VIEW
// ═══════════════════════════════════════════════════
async function getBranchCapacity(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const User = conn.model('User');
  const QueueEntry = conn.model('QueueEntry');
  const Appointment = conn.model('Appointment');
  const DoctorSchedule = conn.model('DoctorSchedule');
  const DoctorLeave = conn.model('DoctorLeave');
  const ConsultationRoom = conn.model('ConsultationRoom');

  const { start, end } = todayRange();
  const today = dayName();

  const branches = await Branch.find({ isActive: true, deletedAt: null })
    .select('name code address phone')
    .lean();

  const results = await Promise.all(
    branches.map(async (branch) => {
      const bid = branch._id;

      const [doctors, queueEntries, appointments, schedules, leaves, rooms] = await Promise.all([
        User.countDocuments({ branch: bid, role: 'doctor', isActive: true, deletedAt: null }),
        QueueEntry.find({
          branch: bid,
          createdAt: { $gte: start },
          status: { $in: ['waiting', 'in_consultation'] },
        }).lean(),
        Appointment.find({
          branch: bid,
          scheduledAt: { $gte: start, $lte: end },
          deletedAt: null,
        })
          .select('status doctor')
          .lean(),
        DoctorSchedule.find({
          branch: bid,
          isActive: true,
        }).lean(),
        DoctorLeave.find({
          startDate: { $lte: end },
          endDate: { $gte: start },
          status: { $in: ['approved', 'pending'] },
          $or: [{ branch: null }, { branch: bid }],
        }).lean(),
        ConsultationRoom.find({
          branch: bid,
          isActive: true,
        })
          .select('name code status type')
          .lean(),
      ]);

      // Count doctors on leave today
      const leaveDocIds = new Set(leaves.map((l) => l.doctor.toString()));

      // Count doctors currently busy (in_consultation queue entry)
      const busyDocIds = new Set(
        queueEntries.filter((q) => q.status === 'in_consultation').map((q) => q.doctor.toString()),
      );

      // Count doctors scheduled today
      let scheduledToday = 0;
      const scheduledDocIds = new Set();
      for (const s of schedules) {
        const dayEntry = (s.weeklySchedule || []).find((d) => d.day === today);
        if (dayEntry && dayEntry.isWorking && !leaveDocIds.has(s.doctor.toString())) {
          scheduledToday++;
          scheduledDocIds.add(s.doctor.toString());
        }
      }

      const waitingCount = queueEntries.filter((q) => q.status === 'waiting').length;
      const consultingCount = queueEntries.filter((q) => q.status === 'in_consultation').length;

      // Appointment breakdown
      const apptByStatus = {};
      for (const a of appointments) {
        apptByStatus[a.status] = (apptByStatus[a.status] || 0) + 1;
      }

      // Room breakdown
      const roomStats = {
        total: rooms.length,
        available: rooms.filter((r) => r.status === 'available').length,
        occupied: rooms.filter((r) => r.status === 'occupied').length,
        maintenance: rooms.filter((r) => r.status === 'maintenance' || r.status === 'cleaning').length,
      };

      // Utilization = busy doctors / scheduled doctors
      const utilization = scheduledToday > 0
        ? Math.round((busyDocIds.size / scheduledToday) * 100)
        : 0;

      return {
        ...branch,
        doctors: {
          total: doctors,
          scheduled: scheduledToday,
          busy: busyDocIds.size,
          onLeave: leaveDocIds.size,
          available: Math.max(0, scheduledToday - busyDocIds.size),
        },
        queue: {
          waiting: waitingCount,
          inConsultation: consultingCount,
        },
        appointments: {
          total: appointments.length,
          completed: apptByStatus.completed || 0,
          inProgress: apptByStatus.in_progress || 0,
          upcoming: (apptByStatus.confirmed || 0) + (apptByStatus.checked_in || 0) + (apptByStatus.requested || 0),
          cancelled: apptByStatus.cancelled || 0,
        },
        rooms: roomStats,
        utilization,
      };
    }),
  );

  return results;
}

// ═══════════════════════════════════════════════════
// 4. ACTIVITY FEED
// ═══════════════════════════════════════════════════
async function getActivityFeed(tenantSlug, branchId, limit = 50) {
  const conn = await getTenantConnection(tenantSlug);
  const QueueEntry = conn.model('QueueEntry');
  const Appointment = conn.model('Appointment');

  const { start } = todayRange();

  // Get recent queue transitions (today)
  const queueFilter = { createdAt: { $gte: start } };
  if (branchId) queueFilter.branch = new mongoose.Types.ObjectId(branchId);

  const queueEntries = await QueueEntry.find(queueFilter)
    .populate('patient', 'name patientId')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name code')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  // Get recent appointment transitions (today)
  const apptFilter = {
    scheduledAt: { $gte: start },
    deletedAt: null,
  };
  if (branchId) apptFilter.branch = new mongoose.Types.ObjectId(branchId);

  const appointments = await Appointment.find(apptFilter)
    .populate('patient', 'name patientId')
    .populate('doctor', 'name specialization')
    .populate('branch', 'name code')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  // Build activity events from data
  const events = [];

  for (const q of queueEntries) {
    const base = {
      branch: q.branch,
      patient: q.patient,
      doctor: q.doctor,
      priority: q.priority,
    };

    // Add entry based on status — each status IS the latest event
    if (q.status === 'waiting') {
      events.push({
        ...base,
        type: 'queue_add',
        message: `${q.patient?.name || 'Patient'} added to queue (Token #${q.tokenNumber})`,
        timestamp: q.checkedInAt || q.createdAt,
        icon: 'user_plus',
      });
    } else if (q.status === 'in_consultation') {
      events.push({
        ...base,
        type: 'consultation_start',
        message: `Dr. ${q.doctor?.name || '—'} started consultation with ${q.patient?.name || 'Patient'}`,
        timestamp: q.calledAt || q.updatedAt,
        icon: 'stethoscope',
      });
    } else if (q.status === 'completed') {
      events.push({
        ...base,
        type: 'consultation_end',
        message: `Dr. ${q.doctor?.name || '—'} completed consultation with ${q.patient?.name || 'Patient'}`,
        timestamp: q.completedAt || q.updatedAt,
        icon: 'check',
      });
    } else if (q.status === 'cancelled' || q.status === 'no_show') {
      events.push({
        ...base,
        type: q.status === 'no_show' ? 'no_show' : 'queue_cancel',
        message: q.status === 'no_show'
          ? `${q.patient?.name || 'Patient'} marked as no-show`
          : `${q.patient?.name || 'Patient'} removed from queue`,
        timestamp: q.updatedAt,
        icon: q.status === 'no_show' ? 'alert' : 'x',
      });
    }
  }

  for (const a of appointments) {
    const base = {
      branch: a.branch,
      patient: a.patient,
      doctor: a.doctor,
    };

    if (a.status === 'checked_in' && a.checkedInAt) {
      events.push({
        ...base,
        type: 'patient_checkin',
        message: `${a.patient?.name || 'Patient'} checked in for appointment with Dr. ${a.doctor?.name || '—'}`,
        timestamp: a.checkedInAt,
        icon: 'clipboard_check',
      });
    } else if (a.status === 'confirmed' && a.updatedAt) {
      events.push({
        ...base,
        type: 'appointment_confirmed',
        message: `Appointment confirmed: ${a.patient?.name || 'Patient'} with Dr. ${a.doctor?.name || '—'}`,
        timestamp: a.updatedAt,
        icon: 'calendar_check',
      });
    } else if (a.status === 'cancelled' && a.cancelledAt) {
      events.push({
        ...base,
        type: 'appointment_cancelled',
        message: `Appointment cancelled: ${a.patient?.name || 'Patient'} with Dr. ${a.doctor?.name || '—'}`,
        timestamp: a.cancelledAt,
        icon: 'calendar_x',
      });
    }
  }

  // Sort by timestamp descending and limit
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, limit);
}

// ═══════════════════════════════════════════════════
// 5. ROOM MANAGEMENT
// ═══════════════════════════════════════════════════
async function listRooms(tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');

  const filter = { isActive: true };
  if (branchId) filter.branch = new mongoose.Types.ObjectId(branchId);

  return ConsultationRoom.find(filter)
    .populate('currentDoctor', 'name specialization')
    .populate('currentPatient', 'name patientId')
    .populate('branch', 'name code')
    .sort({ branch: 1, code: 1 })
    .lean();
}

async function createRoom(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');
  return ConsultationRoom.create(data);
}

async function updateRoom(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');
  const ApiError = require('../../utils/ApiError');

  const room = await ConsultationRoom.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

async function assignRoom(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');
  const ApiError = require('../../utils/ApiError');

  const room = await ConsultationRoom.findByIdAndUpdate(
    id,
    {
      currentDoctor: data.doctorId || null,
      currentPatient: data.patientId || null,
      currentAppointment: data.appointmentId || null,
      status: data.doctorId ? 'occupied' : 'available',
      occupiedSince: data.doctorId ? new Date() : null,
    },
    { new: true },
  )
    .populate('currentDoctor', 'name specialization')
    .populate('currentPatient', 'name patientId')
    .populate('branch', 'name code');

  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

async function releaseRoom(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');
  const ApiError = require('../../utils/ApiError');

  const room = await ConsultationRoom.findByIdAndUpdate(
    id,
    {
      currentDoctor: null,
      currentPatient: null,
      currentAppointment: null,
      status: 'available',
      occupiedSince: null,
    },
    { new: true },
  );
  if (!room) throw ApiError.notFound('Room not found');
  return room;
}

async function deleteRoom(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');
  const ApiError = require('../../utils/ApiError');

  const room = await ConsultationRoom.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!room) throw ApiError.notFound('Room not found or already deleted');
  return room;
}

module.exports = {
  getDoctorPresence,
  getWaitingPatients,
  getBranchCapacity,
  getActivityFeed,
  listRooms,
  createRoom,
  updateRoom,
  assignRoom,
  releaseRoom,
  deleteRoom,
};
