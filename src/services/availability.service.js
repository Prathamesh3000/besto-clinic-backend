'use strict';

const ApiError = require('../utils/ApiError');
const { getTenantConnection } = require('../db/tenantConnectionManager');
const { generateScheduleAwareSlots } = require('../utils/slotGenerator');
const { resolveBookingPolicy } = require('../utils/resolveBookingPolicy');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Clinic timezone offset from UTC in milliseconds (IST = UTC+5:30)
const CLINIC_TZ_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Convert current time to IST in the "fake UTC" convention matching the slot
 * generator, regardless of what timezone the server OS is set to.
 *
 * Slots store local HH:mm values as UTC (e.g. 10:00 IST → T10:00:00.000Z).
 * A raw `new Date().getTime()` is real UTC, so comparing it against slot
 * timestamps produces wrong results. This helper always uses IST.
 */
function _localNow() {
  const now = new Date();
  // Shift real UTC → IST, then read components via getUTC* (avoids OS locale)
  const ist = new Date(now.getTime() + CLINIC_TZ_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const M = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const dateStr = `${y}-${M}-${d}`;
  return {
    dateStr,
    ms: new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`).getTime(),
    hours,
    minutes,
    real: now,
  };
}

/**
 * Get doctor availability for a specific date.
 * Single source of truth used by all booking surfaces.
 */
async function getDoctorAvailability(doctorId, date, tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const { ObjectId } = require('mongoose').Types;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('date query parameter is required (YYYY-MM-DD)');
  }
  if (!ObjectId.isValid(doctorId)) {
    throw ApiError.badRequest('Invalid doctor ID');
  }

  // Early exit for past dates — no slots are bookable
  const local = _localNow();
  if (date < local.dateStr) {
    return { date, doctorId, slots: [], isPastDate: true };
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const dayOfWeek = DAYS[dayStart.getUTCDay()];

  // 1. Check leaves
  const DoctorLeave = conn.model('DoctorLeave');
  const leaveFilter = {
    doctor: new ObjectId(doctorId),
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
    status: 'approved',
  };
  if (branchId) {
    leaveFilter.$or = [{ branch: null }, { branch: new ObjectId(branchId) }];
  }
  const leave = await DoctorLeave.findOne(leaveFilter).lean();
  if (leave) {
    return {
      date,
      doctorId,
      slots: [],
      isOnLeave: true,
      leaveReason: leave.reason || null,
      leaveType: leave.leaveType,
    };
  }

  // 1.5. Check clinic holidays
  const ClinicHoliday = conn.model('ClinicHoliday');
  const holidayFilter = {
    isActive: true,
    deletedAt: null,
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  };
  if (branchId) {
    holidayFilter.$or = [{ branches: { $size: 0 } }, { branches: { $exists: false } }, { branches: new ObjectId(branchId) }];
  }
  const holiday = await ClinicHoliday.findOne(holidayFilter).lean();
  if (holiday) {
    return {
      date,
      doctorId,
      slots: [],
      isHoliday: true,
      holidayName: holiday.name,
    };
  }

  // 2. Fetch doctor schedule
  const DoctorSchedule = conn.model('DoctorSchedule');
  const scheduleFilter = {
    doctor: new ObjectId(doctorId),
    isActive: true,
  };
  if (branchId) scheduleFilter.branch = new ObjectId(branchId);

  const schedule = await DoctorSchedule.findOne(scheduleFilter).lean();

  // 2.5. Check schedule overrides for this specific date
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const overrideFilter = {
    doctor: new ObjectId(doctorId),
    date: dayStart,
  };
  if (branchId) overrideFilter.branch = new ObjectId(branchId);

  const override = await DoctorScheduleOverride.findOne(overrideFilter).lean();

  // Policy fields — resolved via DoctorSchedule → ClinicBookingPolicy → system defaults
  const policy = await resolveBookingPolicy(tenantSlug, schedule);
  const { slotDuration, bufferMinutes, minNoticeMinutes, maxAdvanceDays } = policy;

  // 3. Determine day schedule (override takes priority)
  let daySchedule = null;

  if (override) {
    if (override.type === 'day_off') {
      return {
        date,
        doctorId,
        slots: [],
        isOverrideDayOff: true,
        reason: override.reason || null,
      };
    }
    // custom_hours or extra_day: use override times
    daySchedule = {
      isWorking: true,
      slots: override.slots?.length
        ? override.slots
        : (override.startTime && override.endTime ? [{ startTime: override.startTime, endTime: override.endTime }] : []),
      startTime: override.startTime,
      endTime: override.endTime,
      breakStart: override.breakStart || null,
      breakEnd: override.breakEnd || null,
    };
  } else if (schedule) {
    daySchedule = schedule.weeklySchedule.find((d) => d.day === dayOfWeek);
  }

  // If schedule exists but doctor is not working this day
  if (daySchedule && !daySchedule.isWorking) {
    return { date, doctorId, slots: [], isOffDay: true };
  }

  // 4. Fetch branch operating hours (optional intersection)
  let branchHours = null;
  if (branchId) {
    const Branch = conn.model('Branch');
    const branch = await Branch.findById(branchId).select('operatingHours').lean();
    if (branch && branch.operatingHours) {
      const branchDay = branch.operatingHours.find((h) => h.day === dayOfWeek);
      if (branchDay && branchDay.isClosed) {
        return { date, doctorId, slots: [], isBranchClosed: true };
      }
      if (branchDay) {
        branchHours = { openTime: branchDay.openTime, closeTime: branchDay.closeTime };
      }
    }
  }

  // 5. Fetch booked appointments
  const Appointment = conn.model('Appointment');
  const booked = await Appointment.find({
    doctor: new ObjectId(doctorId),
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
    status: { $nin: ['cancelled', 'no_show'] },
    deletedAt: null,
  })
    .select('scheduledAt duration')
    .lean();

  // 6. Generate slots
  let slots = generateScheduleAwareSlots(date, booked, {
    daySchedule,
    branchHours,
    slotDuration,
    bufferMinutes,
  });

  // 7. Filter past slots + enforce minNotice for today
  if (date === local.dateStr) {
    const cutoffMs = local.ms + minNoticeMinutes * 60 * 1000;
    slots = slots.map((s) => {
      if (new Date(s.startTime).getTime() < cutoffMs) {
        return { ...s, available: false, isPast: true };
      }
      return s;
    });
  }

  // 8. Enforce maxAdvanceDays (use fake-UTC ms to match dayStart convention)
  const maxDate = new Date(local.ms + maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (dayStart > maxDate) {
    return {
      date,
      doctorId,
      slots: [],
      isBeyondMaxAdvance: true,
      maxAdvanceDays,
    };
  }

  return {
    date,
    doctorId,
    slots,
    bufferMinutes,
    minNoticeMinutes,
    maxAdvanceDays,
  };
}

/**
 * Validate that a booking time falls within doctor working hours.
 * Called before every booking/reschedule across all surfaces.
 */
async function validateBookingTime(doctorId, scheduledAt, duration, tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const { ObjectId } = require('mongoose').Types;

  const bookingStart = new Date(scheduledAt);
  const bookingEnd = new Date(bookingStart.getTime() + (duration || 30) * 60000);
  const dateStr = bookingStart.toISOString().slice(0, 10);
  const dayOfWeek = DAYS[bookingStart.getUTCDay()];
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);

  // 1. Check leaves
  const DoctorLeave = conn.model('DoctorLeave');
  const leaveFilter = {
    doctor: new ObjectId(doctorId),
    startDate: { $lte: bookingEnd },
    endDate: { $gte: bookingStart },
    status: 'approved',
  };
  if (branchId) {
    leaveFilter.$or = [{ branch: null }, { branch: new ObjectId(branchId) }];
  }
  const leave = await DoctorLeave.findOne(leaveFilter).lean();
  if (leave) {
    throw ApiError.badRequest('Doctor is on leave on the selected date');
  }

  // 1.5. Check clinic holidays
  const ClinicHoliday = conn.model('ClinicHoliday');
  const holidayFilter = {
    isActive: true,
    deletedAt: null,
    startDate: { $lte: bookingEnd },
    endDate: { $gte: bookingStart },
  };
  if (branchId) {
    holidayFilter.$or = [{ branches: { $size: 0 } }, { branches: { $exists: false } }, { branches: new ObjectId(branchId) }];
  }
  const holiday = await ClinicHoliday.findOne(holidayFilter).lean();
  if (holiday) {
    throw ApiError.badRequest(`Clinic is closed for holiday: ${holiday.name}`);
  }

  // 2. Check schedule + overrides
  const DoctorSchedule = conn.model('DoctorSchedule');
  const scheduleFilter = {
    doctor: new ObjectId(doctorId),
    isActive: true,
  };
  if (branchId) scheduleFilter.branch = new ObjectId(branchId);

  const schedule = await DoctorSchedule.findOne(scheduleFilter).lean();

  // Check for override
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const overrideFilter = { doctor: new ObjectId(doctorId), date: dayStart };
  if (branchId) overrideFilter.branch = new ObjectId(branchId);
  const override = await DoctorScheduleOverride.findOne(overrideFilter).lean();

  // Determine effective day schedule
  let daySchedule = null;

  if (override) {
    if (override.type === 'day_off') {
      throw ApiError.badRequest('Doctor is not available on this date');
    }
    daySchedule = {
      isWorking: true,
      slots: override.slots?.length
        ? override.slots
        : (override.startTime && override.endTime ? [{ startTime: override.startTime, endTime: override.endTime }] : []),
      startTime: override.startTime,
      endTime: override.endTime,
      breakStart: override.breakStart || null,
      breakEnd: override.breakEnd || null,
    };
  } else if (schedule) {
    daySchedule = schedule.weeklySchedule.find((d) => d.day === dayOfWeek);
  }

  // No schedule → allow (backward-compatible fallback to 9-18)
  if (!schedule && !override) return;

  if (!daySchedule || !daySchedule.isWorking) {
    throw ApiError.badRequest('Doctor does not work on this day');
  }

  // Policy enforcement — resolved via DoctorSchedule → ClinicBookingPolicy → system defaults
  const policy = await resolveBookingPolicy(tenantSlug, schedule);
  const { minNoticeMinutes, maxAdvanceDays } = policy;

  const local = _localNow();
  if (bookingStart.getTime() < local.ms + minNoticeMinutes * 60 * 1000) {
    const display = minNoticeMinutes >= 60
      ? `${Math.round(minNoticeMinutes / 60)} hour(s)`
      : `${minNoticeMinutes} minutes`;
    throw ApiError.badRequest(`Please book at least ${display} in advance`);
  }

  // Use fake-UTC ms to match bookingStart convention
  const maxDate = new Date(local.ms + maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (bookingStart > maxDate) {
    throw ApiError.badRequest(`Cannot book more than ${maxAdvanceDays} days in advance`);
  }

  // Parse times (HH:mm → minutes from midnight)
  const bookingStartMin = bookingStart.getUTCHours() * 60 + bookingStart.getUTCMinutes();
  const bookingEndMin = bookingEnd.getUTCHours() * 60 + bookingEnd.getUTCMinutes();

  // Validate booking falls within working hours (multi-slot or legacy)
  if (daySchedule.slots && daySchedule.slots.length > 0) {
    const inSlot = daySchedule.slots.some((slot) => {
      const slotStartMin = toMinutes(slot.startTime);
      const slotEndMin = toMinutes(slot.endTime);
      return bookingStartMin >= slotStartMin && bookingEndMin <= slotEndMin;
    });
    if (!inSlot) {
      const slotRanges = daySchedule.slots.map((s) => `${s.startTime}-${s.endTime}`).join(', ');
      throw ApiError.badRequest(`Appointment must be within doctor working hours (${slotRanges})`);
    }
  } else {
    // Legacy: single range + break check
    const schedStart = toMinutes(daySchedule.startTime);
    const schedEnd = toMinutes(daySchedule.endTime);

    if (bookingStartMin < schedStart || bookingEndMin > schedEnd) {
      throw ApiError.badRequest(
        `Appointment must be within doctor working hours (${daySchedule.startTime} - ${daySchedule.endTime})`,
      );
    }

    // Check break overlap
    if (daySchedule.breakStart && daySchedule.breakEnd) {
      const breakStart = toMinutes(daySchedule.breakStart);
      const breakEnd = toMinutes(daySchedule.breakEnd);
      if (bookingStartMin < breakEnd && bookingEndMin > breakStart) {
        throw ApiError.badRequest(
          `Appointment overlaps with doctor's break time (${daySchedule.breakStart} - ${daySchedule.breakEnd})`,
        );
      }
    }
  }

  // 3. Check branch hours
  if (branchId) {
    const Branch = conn.model('Branch');
    const branch = await Branch.findById(branchId).select('operatingHours').lean();
    if (branch && branch.operatingHours) {
      const branchDay = branch.operatingHours.find((h) => h.day === dayOfWeek);
      if (branchDay && branchDay.isClosed) {
        throw ApiError.badRequest('Branch is closed on this day');
      }
      if (branchDay) {
        const branchOpen = toMinutes(branchDay.openTime);
        const branchClose = toMinutes(branchDay.closeTime);
        if (bookingStartMin < branchOpen || bookingEndMin > branchClose) {
          throw ApiError.badRequest(
            `Appointment must be within branch operating hours (${branchDay.openTime} - ${branchDay.closeTime})`,
          );
        }
      }
    }
  }
}

/**
 * Get monthly availability summary for calendar heat map.
 * Returns per-day status without generating individual slots.
 */
async function getMonthlyAvailabilitySummary(doctorId, month, year, tenantSlug, branchId) {
  const conn = await getTenantConnection(tenantSlug);
  const { ObjectId } = require('mongoose').Types;

  if (!ObjectId.isValid(doctorId)) {
    throw ApiError.badRequest('Invalid doctor ID');
  }

  // Month range (1-indexed month)
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const local = _localNow();
  const now = local.real;
  const todayStr = local.dateStr;

  // 1. Get schedule
  const DoctorSchedule = conn.model('DoctorSchedule');
  const scheduleFilter = { doctor: new ObjectId(doctorId), isActive: true };
  if (branchId) scheduleFilter.branch = new ObjectId(branchId);
  const schedule = await DoctorSchedule.findOne(scheduleFilter).lean();

  // Policy fields — resolved via DoctorSchedule → ClinicBookingPolicy → system defaults
  const monthlyPolicy = await resolveBookingPolicy(tenantSlug, schedule);
  const slotDuration = monthlyPolicy.slotDuration;
  const bufferMinutes = monthlyPolicy.bufferMinutes;
  const minNoticeMinutes = monthlyPolicy.minNoticeMinutes;
  const maxAdvanceDays = monthlyPolicy.maxAdvanceDays;
  // Use fake-UTC ms (local.ms) to match dateObj convention (Date.UTC)
  const maxDate = new Date(local.ms + maxAdvanceDays * 24 * 60 * 60 * 1000);

  // 2. Get approved leaves in range
  const DoctorLeave = conn.model('DoctorLeave');
  const leaveFilter = {
    doctor: new ObjectId(doctorId),
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
    status: 'approved',
  };
  if (branchId) {
    leaveFilter.$or = [{ branch: null }, { branch: new ObjectId(branchId) }];
  }
  const leaves = await DoctorLeave.find(leaveFilter).lean();

  // 3. Get overrides in range
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const overrideFilter = {
    doctor: new ObjectId(doctorId),
    date: { $gte: monthStart, $lte: monthEnd },
  };
  if (branchId) overrideFilter.branch = new ObjectId(branchId);
  const overrides = await DoctorScheduleOverride.find(overrideFilter).lean();
  const overrideMap = {};
  for (const o of overrides) {
    overrideMap[o.date.toISOString().slice(0, 10)] = o;
  }

  // 4. Get booked appointment counts per day
  const Appointment = conn.model('Appointment');
  const bookingCounts = await Appointment.aggregate([
    {
      $match: {
        doctor: new ObjectId(doctorId),
        scheduledAt: { $gte: monthStart, $lte: monthEnd },
        status: { $nin: ['cancelled', 'no_show'] },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const bookedByDate = {};
  for (const b of bookingCounts) {
    bookedByDate[b._id] = b.count;
  }

  // 5. Get branch hours (if applicable)
  let branchHoursMap = null;
  if (branchId) {
    const Branch = conn.model('Branch');
    const branch = await Branch.findById(branchId).select('operatingHours').lean();
    if (branch && branch.operatingHours) {
      branchHoursMap = {};
      for (const h of branch.operatingHours) {
        branchHoursMap[h.day] = h;
      }
    }
  }

  // 5.5. Get clinic holidays in range
  const ClinicHoliday = conn.model('ClinicHoliday');
  const holidayFilter = {
    isActive: true,
    deletedAt: null,
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  };
  if (branchId) {
    holidayFilter.$or = [{ branches: { $size: 0 } }, { branches: { $exists: false } }, { branches: new ObjectId(branchId) }];
  }
  const holidays = await ClinicHoliday.find(holidayFilter).lean();

  // 6. Build date-by-date summary
  const dates = {};
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(Date.UTC(year, month - 1, d));
    const dateStr = dateObj.toISOString().slice(0, 10);
    const dayOfWeek = DAYS[dateObj.getUTCDay()];

    // Past dates
    if (dateStr < todayStr) {
      dates[dateStr] = 'past';
      continue;
    }

    // Check clinic holidays
    const isHoliday = holidays.some((h) => {
      const hStart = new Date(h.startDate).toISOString().slice(0, 10);
      const hEnd = new Date(h.endDate).toISOString().slice(0, 10);
      return dateStr >= hStart && dateStr <= hEnd;
    });
    if (isHoliday) {
      dates[dateStr] = 'holiday';
      continue;
    }

    // Today: account for elapsed time + minNotice
    if (dateStr === todayStr) {
      const onLeaveToday = leaves.some((l) => {
        const leaveStart = new Date(l.startDate).toISOString().slice(0, 10);
        const leaveEnd = new Date(l.endDate).toISOString().slice(0, 10);
        return dateStr >= leaveStart && dateStr <= leaveEnd;
      });
      if (onLeaveToday) { dates[dateStr] = 'leave'; continue; }
      const ov = overrideMap[dateStr];
      if (ov && ov.type === 'day_off') { dates[dateStr] = 'off'; continue; }
      const todaySched = ov
        ? { isWorking: true, slots: ov.slots || [], startTime: ov.startTime, endTime: ov.endTime, breakStart: ov.breakStart, breakEnd: ov.breakEnd }
        : schedule?.weeklySchedule?.find((ds) => ds.day === dayOfWeek) || null;
      if (!todaySched || !todaySched.isWorking) { dates[dateStr] = 'off'; continue; }
      if (branchHoursMap && branchHoursMap[dayOfWeek]?.isClosed) { dates[dateStr] = 'off'; continue; }
      // Count only remaining future slots (past now + minNotice cutoff)
      const cutoffMin = local.hours * 60 + local.minutes + minNoticeMinutes;
      const todaySlots = todaySched.slots?.length ? todaySched.slots : null;
      const remainingTotal = _countSlots(
        todaySched.startTime, todaySched.endTime, todaySched.breakStart, todaySched.breakEnd,
        slotDuration, bufferMinutes, branchHoursMap?.[dayOfWeek], cutoffMin, todaySlots,
      );
      if (remainingTotal === 0) { dates[dateStr] = 'fully_booked'; continue; }
      // Count only future booked appointments (fake-UTC convention)
      const cutoffDate = new Date(local.ms + minNoticeMinutes * 60 * 1000);
      const futureBooked = await Appointment.countDocuments({
        doctor: new ObjectId(doctorId),
        scheduledAt: { $gte: cutoffDate, $lte: new Date(`${dateStr}T23:59:59.999Z`) },
        status: { $nin: ['cancelled', 'no_show'] },
        deletedAt: null,
      });
      dates[dateStr] = _statusFromCounts(remainingTotal, futureBooked);
      continue;
    }

    // Beyond max advance
    if (dateObj > maxDate) {
      dates[dateStr] = 'unavailable';
      continue;
    }

    // Check leaves (normalize to date strings for reliable comparison)
    const onLeave = leaves.some((l) => {
      const leaveStart = new Date(l.startDate).toISOString().slice(0, 10);
      const leaveEnd = new Date(l.endDate).toISOString().slice(0, 10);
      return dateStr >= leaveStart && dateStr <= leaveEnd;
    });
    if (onLeave) {
      dates[dateStr] = 'leave';
      continue;
    }

    // Check override
    const override = overrideMap[dateStr];
    if (override) {
      if (override.type === 'day_off') {
        dates[dateStr] = 'off';
        continue;
      }
      // custom_hours or extra_day: calculate total slot count
      const overrideSlots = override.slots?.length ? override.slots : null;
      const totalSlots = _countSlots(
        override.startTime,
        override.endTime,
        override.breakStart,
        override.breakEnd,
        slotDuration,
        bufferMinutes,
        branchHoursMap?.[dayOfWeek],
        0,
        overrideSlots,
      );
      const booked = bookedByDate[dateStr] || 0;
      dates[dateStr] = _statusFromCounts(totalSlots, booked);
      continue;
    }

    // Weekly schedule
    let daySchedule = null;
    if (schedule) {
      daySchedule = schedule.weeklySchedule.find((ds) => ds.day === dayOfWeek);
    }

    if (!daySchedule || !daySchedule.isWorking) {
      dates[dateStr] = 'off';
      continue;
    }

    // Branch closed?
    if (branchHoursMap && branchHoursMap[dayOfWeek]?.isClosed) {
      dates[dateStr] = 'off';
      continue;
    }

    // Calculate total slot count for this day
    const daySlots = daySchedule.slots?.length ? daySchedule.slots : null;
    const totalSlots = _countSlots(
      daySchedule.startTime,
      daySchedule.endTime,
      daySchedule.breakStart,
      daySchedule.breakEnd,
      slotDuration,
      bufferMinutes,
      branchHoursMap?.[dayOfWeek],
      0,
      daySlots,
    );

    const booked = bookedByDate[dateStr] || 0;
    dates[dateStr] = _statusFromCounts(totalSlots, booked);
  }

  return {
    doctorId,
    month,
    year,
    dates,
    maxAdvanceDays,
    minNoticeMinutes,
    slotDuration,
    bufferMinutes,
  };
}

/**
 * Count total possible slots in a time window (without fetching appointments).
 * Supports multi-slot format via optional `slots` parameter.
 */
function _countSlots(startTime, endTime, breakStart, breakEnd, slotDuration, bufferMinutes, branchDay, minCutoff = 0, slots = null) {
  const step = slotDuration + bufferMinutes;
  let count = 0;

  // Build ranges — multi-slot or legacy
  const ranges = [];

  if (slots && slots.length > 0) {
    // Multi-slot: each slot is its own range
    for (const slot of slots) {
      let slotStart = toMinutes(slot.startTime);
      let slotEnd = toMinutes(slot.endTime);
      // Intersect with branch hours
      if (branchDay && !branchDay.isClosed && branchDay.openTime && branchDay.closeTime) {
        slotStart = Math.max(slotStart, toMinutes(branchDay.openTime));
        slotEnd = Math.min(slotEnd, toMinutes(branchDay.closeTime));
      }
      if (slotStart < slotEnd) ranges.push({ start: slotStart, end: slotEnd });
    }
  } else {
    // Legacy: single range with optional break split
    let startMin = toMinutes(startTime || '09:00');
    let endMin = toMinutes(endTime || '18:00');

    if (branchDay && !branchDay.isClosed && branchDay.openTime && branchDay.closeTime) {
      startMin = Math.max(startMin, toMinutes(branchDay.openTime));
      endMin = Math.min(endMin, toMinutes(branchDay.closeTime));
    }

    if (startMin >= endMin) return 0;

    if (breakStart && breakEnd) {
      const bStart = toMinutes(breakStart);
      const bEnd = toMinutes(breakEnd);
      if (bStart > startMin) ranges.push({ start: startMin, end: Math.min(bStart, endMin) });
      if (bEnd < endMin) ranges.push({ start: Math.max(bEnd, startMin), end: endMin });
    } else {
      ranges.push({ start: startMin, end: endMin });
    }
  }

  for (const range of ranges) {
    for (let min = range.start; min + slotDuration <= range.end; min += step) {
      if (min >= minCutoff) count++;
    }
  }

  return count;
}

/**
 * Derive availability status from total vs booked slot counts.
 */
function _statusFromCounts(totalSlots, bookedCount) {
  if (totalSlots === 0) return 'off';
  if (bookedCount >= totalSlots) return 'fully_booked';
  if (bookedCount / totalSlots >= 0.7) return 'few_left';
  return 'available';
}

module.exports = { getDoctorAvailability, validateBookingTime, getMonthlyAvailabilitySummary };
