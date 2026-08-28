'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { resolveBookingPolicy } = require('../../utils/resolveBookingPolicy');
const conflictService = require('../conflictResolution/conflictResolution.service');
const logger = require('../../utils/logger');

async function getSchedules(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorSchedule = conn.model('DoctorSchedule');
  const schedules = await DoctorSchedule.find({ doctor: doctorId, isActive: true })
    .populate('branch', 'name code')
    .lean();
  return schedules;
}

async function upsertSchedule(doctorId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorSchedule = conn.model('DoctorSchedule');

  // Auto-populate legacy fields from slots for backward compat
  const weeklySchedule = (data.weeklySchedule || []).map((day) => {
    if (day.slots && day.slots.length > 0) {
      const sorted = [...day.slots].sort((a, b) => {
        const [ah, am] = a.startTime.split(':').map(Number);
        const [bh, bm] = b.startTime.split(':').map(Number);
        return (ah * 60 + am) - (bh * 60 + bm);
      });
      // Infer break from the gap between first two slots (common 2-slot pattern)
      let breakStart = null;
      let breakEnd = null;
      if (sorted.length === 2 && sorted[0].endTime !== sorted[1].startTime) {
        breakStart = sorted[0].endTime;
        breakEnd = sorted[1].startTime;
      }
      return {
        ...day,
        slots: sorted,
        startTime: sorted[0].startTime,
        endTime: sorted[sorted.length - 1].endTime,
        breakStart,
        breakEnd,
      };
    }
    // Legacy format: if no slots but has startTime/endTime, auto-create slots
    if (!day.slots?.length && day.startTime && day.endTime && day.isWorking) {
      const slots = [];
      if (day.breakStart && day.breakEnd) {
        slots.push({ startTime: day.startTime, endTime: day.breakStart, label: null });
        slots.push({ startTime: day.breakEnd, endTime: day.endTime, label: null });
      } else {
        slots.push({ startTime: day.startTime, endTime: day.endTime, label: null });
      }
      return { ...day, slots };
    }
    return day;
  });

  // Use clinic-level policy as fallback instead of hardcoded magic numbers
  const clinicDefaults = await resolveBookingPolicy(tenantSlug);

  const schedule = await DoctorSchedule.findOneAndUpdate(
    { doctor: doctorId, branch: data.branch, deletedAt: null },
    {
      doctor: doctorId,
      branch: data.branch,
      slotDuration: data.slotDuration ?? clinicDefaults.slotDuration,
      bufferMinutes: data.bufferMinutes ?? clinicDefaults.bufferMinutes,
      minNoticeMinutes: data.minNoticeMinutes ?? clinicDefaults.minNoticeMinutes,
      maxAdvanceDays: data.maxAdvanceDays ?? clinicDefaults.maxAdvanceDays,
      weeklySchedule,
      isActive: true,
    },
    { new: true, upsert: true, runValidators: true },
  );

  return schedule;
}

async function getAllSchedules(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorSchedule = conn.model('DoctorSchedule');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { isActive: true, deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.doctor) filter.doctor = query.doctor;

  const [items, total] = await Promise.all([
    DoctorSchedule.find(filter)
      .sort(sort)
      .skip(skip).limit(limit)
      .populate('doctor', 'name specialization avatar')
      .populate('branch', 'name code')
      .lean(),
    DoctorSchedule.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function listLeaves(doctorId, tenantSlug, query = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { doctor: doctorId, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.upcoming === 'true') {
    filter.endDate = { $gte: new Date() };
  }

  const [items, total] = await Promise.all([
    DoctorLeave.find(filter)
      .sort(sort || { startDate: -1 })
      .skip(skip).limit(limit)
      .populate('branch', 'name code')
      .lean(),
    DoctorLeave.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function createLeave(doctorId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');

  // Check for overlapping leaves
  const overlap = await DoctorLeave.findOne({
    doctor: doctorId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: new Date(data.endDate) },
    endDate: { $gte: new Date(data.startDate) },
    ...(data.branch ? { $or: [{ branch: null }, { branch: data.branch }] } : {}),
  });

  if (overlap) {
    throw ApiError.conflict('Doctor already has a leave entry overlapping with this date range');
  }

  return DoctorLeave.create({
    doctor: doctorId,
    ...data,
  });
}

async function deleteLeave(doctorId, leaveId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');

  const leave = await DoctorLeave.findOne({ _id: leaveId, doctor: doctorId });
  if (!leave) throw ApiError.notFound('Leave entry not found');

  leave.deletedAt = new Date();
  await leave.save();
  return leave;
}

// ── Leave approval ──────────────────────────────────────────

async function approveLeave(doctorId, leaveId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');

  const leave = await DoctorLeave.findOne({ _id: leaveId, doctor: doctorId });
  if (!leave) throw ApiError.notFound('Leave entry not found');
  if (leave.status !== 'pending') {
    throw ApiError.badRequest(`Cannot approve leave with status "${leave.status}"`);
  }

  leave.status = 'approved';
  await leave.save();

  // Detect conflicting appointments during leave period
  let conflicts = [];
  try {
    conflicts = await conflictService.detectLeaveConflicts(
      tenantSlug, doctorId, leave.startDate, leave.endDate, leave._id,
    );
  } catch (err) {
    logger.warn('approveLeave: conflict detection failed — %s', err.message);
  }

  return { leave, conflicts };
}

async function rejectLeave(doctorId, leaveId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');

  const leave = await DoctorLeave.findOne({ _id: leaveId, doctor: doctorId });
  if (!leave) throw ApiError.notFound('Leave entry not found');
  if (leave.status !== 'pending') {
    throw ApiError.badRequest(`Cannot reject leave with status "${leave.status}"`);
  }

  leave.status = 'rejected';
  await leave.save();
  return leave;
}

// ── Schedule Override CRUD ──────────────────────────────────

async function listOverrides(doctorId, tenantSlug, query = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { doctor: doctorId, deletedAt: null };
  if (query.branch) filter.branch = query.branch;

  // Filter by month/year for calendar views
  if (query.month && query.year) {
    const m = parseInt(query.month, 10);
    const y = parseInt(query.year, 10);
    filter.date = {
      $gte: new Date(Date.UTC(y, m - 1, 1)),
      $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
    };
  }

  const [items, total] = await Promise.all([
    DoctorScheduleOverride.find(filter)
      .sort(query.sort ? sort : { date: 1 })
      .skip(skip).limit(limit)
      .populate('branch', 'name code')
      .lean(),
    DoctorScheduleOverride.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function createOverride(doctorId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');

  // Normalize date to midnight UTC
  const dateObj = new Date(data.date);
  const dateNorm = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));

  // Check for existing override on same date-branch
  const existing = await DoctorScheduleOverride.findOne({
    doctor: doctorId,
    branch: data.branch,
    date: dateNorm,
    deletedAt: null,
  });
  if (existing) {
    throw ApiError.conflict('An override already exists for this date and branch');
  }

  // Auto-populate legacy fields from slots for backward compat
  let { slots, startTime, endTime, breakStart, breakEnd } = data;
  if (slots && slots.length > 0) {
    const sorted = [...slots].sort((a, b) => {
      const [ah, am] = a.startTime.split(':').map(Number);
      const [bh, bm] = b.startTime.split(':').map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });
    slots = sorted;
    startTime = sorted[0].startTime;
    endTime = sorted[sorted.length - 1].endTime;
    breakStart = null;
    breakEnd = null;
  } else if (startTime && endTime && !slots?.length) {
    // Legacy format: create slots from flat fields
    slots = [];
    if (breakStart && breakEnd) {
      slots.push({ startTime, endTime: breakStart, label: null });
      slots.push({ startTime: breakEnd, endTime, label: null });
    } else {
      slots.push({ startTime, endTime, label: null });
    }
  }

  const override = await DoctorScheduleOverride.create({
    doctor: doctorId,
    branch: data.branch,
    date: dateNorm,
    type: data.type,
    slots: slots || [],
    startTime: startTime || null,
    endTime: endTime || null,
    breakStart: breakStart || null,
    breakEnd: breakEnd || null,
    reason: data.reason || null,
  });

  // Detect conflicting appointments
  let conflicts = [];
  try {
    conflicts = await conflictService.detectConflicts(
      tenantSlug, doctorId, dateNorm, data.type, slots || [], override._id,
    );
  } catch (err) {
    logger.warn('createOverride: conflict detection failed — %s', err.message);
  }

  return { override, conflicts };
}

async function updateOverride(doctorId, overrideId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');

  const override = await DoctorScheduleOverride.findOne({ _id: overrideId, doctor: doctorId });
  if (!override) throw ApiError.notFound('Override not found');

  if (data.type !== undefined) override.type = data.type;
  if (data.reason !== undefined) override.reason = data.reason;

  // Update slots + auto-populate legacy fields (mirrors createOverride logic)
  if (data.slots !== undefined) {
    const { slots, startTime, endTime, breakStart, breakEnd } = data;
    if (slots && slots.length > 0) {
      const sorted = [...slots].sort((a, b) => {
        const [ah, am] = a.startTime.split(':').map(Number);
        const [bh, bm] = b.startTime.split(':').map(Number);
        return (ah * 60 + am) - (bh * 60 + bm);
      });
      override.slots = sorted;
      override.startTime = sorted[0].startTime;
      override.endTime = sorted[sorted.length - 1].endTime;
      override.breakStart = null;
      override.breakEnd = null;
    } else if (startTime && endTime) {
      const legacySlots = [];
      if (breakStart && breakEnd) {
        legacySlots.push({ startTime, endTime: breakStart, label: null });
        legacySlots.push({ startTime: breakEnd, endTime, label: null });
      } else {
        legacySlots.push({ startTime, endTime, label: null });
      }
      override.slots = legacySlots;
      override.startTime = startTime;
      override.endTime = endTime;
      override.breakStart = breakStart || null;
      override.breakEnd = breakEnd || null;
    } else {
      override.slots = [];
    }
  } else {
    // Legacy field-level updates (no slots provided)
    if (data.startTime !== undefined) override.startTime = data.startTime;
    if (data.endTime !== undefined) override.endTime = data.endTime;
    if (data.breakStart !== undefined) override.breakStart = data.breakStart;
    if (data.breakEnd !== undefined) override.breakEnd = data.breakEnd;
  }

  await override.save();
  return override;
}

async function deleteOverride(doctorId, overrideId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');

  const override = await DoctorScheduleOverride.findOne({ _id: overrideId, doctor: doctorId });
  if (!override) throw ApiError.notFound('Override not found');

  override.deletedAt = new Date();
  await override.save();
  return override;
}

async function getAllLeaves(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const DoctorLeave = conn.model('DoctorLeave');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.doctor) filter.doctor = query.doctor;
  if (query.branch) filter.branch = query.branch;
  if (query.leaveType) filter.leaveType = query.leaveType;
  if (query.from || query.to) {
    filter.startDate = {};
    if (query.to) filter.startDate.$lte = new Date(query.to);
    if (query.from) {
      filter.endDate = { $gte: new Date(query.from) };
    }
  }

  const [items, total] = await Promise.all([
    DoctorLeave.find(filter)
      .sort(sort || { createdAt: -1 })
      .skip(skip).limit(limit)
      .populate('doctor', 'name specialization avatar')
      .populate('branch', 'name code')
      .lean(),
    DoctorLeave.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

module.exports = {
  getSchedules,
  upsertSchedule,
  getAllSchedules,
  listLeaves,
  createLeave,
  deleteLeave,
  approveLeave,
  rejectLeave,
  getAllLeaves,
  listOverrides,
  createOverride,
  updateOverride,
  deleteOverride,
};
