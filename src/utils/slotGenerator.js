'use strict';

/**
 * Generate time slots for a given date, excluding slots that overlap with booked appointments.
 *
 * @param {string} date       - Date in YYYY-MM-DD format
 * @param {Array}  booked     - Array of { scheduledAt, duration } objects
 * @param {Object} options
 * @param {number} options.slotDuration  - Slot size in minutes (default 30)
 * @param {number} options.startHour     - First slot hour (default 9)
 * @param {number} options.endHour       - End boundary hour (default 18)
 * @param {number} options.bufferMinutes - Gap between consecutive appointments (default 0)
 * @returns {Array} Array of { startTime, endTime, display, available }
 */
function generateSlots(date, booked = [], options = {}) {
  const { slotDuration = 30, startHour = 9, endHour = 18, bufferMinutes = 0 } = options;
  const slots = [];
  const step = slotDuration + bufferMinutes;
  const startMin = startHour * 60;
  const endMin = endHour * 60;

  for (let min = startMin; min + slotDuration <= endMin; min += step) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const slotStart = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`);
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

    const isBooked = booked.some((appt) => {
      const apptStart = new Date(appt.scheduledAt);
      const apptEnd = new Date(apptStart.getTime() + ((appt.duration || 30) + bufferMinutes) * 60 * 1000);
      return apptStart < slotEnd && apptEnd > slotStart;
    });

    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      display: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      available: !isBooked,
    });
  }

  return slots;
}

/**
 * Generate schedule-aware time slots for a given date.
 * Takes doctor schedule, branch hours, and booked appointments into account.
 *
 * @param {string} date    - Date in YYYY-MM-DD format
 * @param {Array}  booked  - Array of { scheduledAt, duration } objects
 * @param {Object} options
 * @param {Object|null} options.daySchedule   - { isWorking, startTime, endTime, breakStart, breakEnd }
 * @param {Object|null} options.branchHours   - { openTime, closeTime }
 * @param {number}      options.slotDuration  - Slot size in minutes (default 30)
 * @param {number}      options.bufferMinutes - Gap between consecutive appointments (default 0)
 * @returns {Array} Array of { startTime, endTime, display, available }
 */
function generateScheduleAwareSlots(date, booked = [], options = {}) {
  const { daySchedule, branchHours, slotDuration = 30, bufferMinutes = 0 } = options;

  // Fallback: no schedule configured → use defaults (9AM-6PM)
  if (!daySchedule) {
    return generateSlots(date, booked, { slotDuration, bufferMinutes });
  }

  if (!daySchedule.isWorking) return [];

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  let startMin = toMinutes(daySchedule.startTime || '09:00');
  let endMin = toMinutes(daySchedule.endTime || '18:00');

  // Intersect with branch hours (clamp to narrower window)
  if (branchHours) {
    const branchOpen = toMinutes(branchHours.openTime);
    const branchClose = toMinutes(branchHours.closeTime);
    startMin = Math.max(startMin, branchOpen);
    endMin = Math.min(endMin, branchClose);
  }

  if (startMin >= endMin) return [];

  // Build working ranges — multi-slot or legacy break-split
  const ranges = [];
  if (daySchedule.slots && daySchedule.slots.length > 0) {
    // Multi-slot: each slot is its own working range
    for (const slot of daySchedule.slots) {
      let slotStartMin = toMinutes(slot.startTime);
      let slotEndMin = toMinutes(slot.endTime);
      // Intersect with branch hours
      if (branchHours) {
        const branchOpen = toMinutes(branchHours.openTime);
        const branchClose = toMinutes(branchHours.closeTime);
        slotStartMin = Math.max(slotStartMin, branchOpen);
        slotEndMin = Math.min(slotEndMin, branchClose);
      }
      if (slotStartMin < slotEndMin) {
        ranges.push({ start: slotStartMin, end: slotEndMin });
      }
    }
  } else if (daySchedule.breakStart && daySchedule.breakEnd) {
    // Legacy: single range split around break
    const breakStart = toMinutes(daySchedule.breakStart);
    const breakEnd = toMinutes(daySchedule.breakEnd);
    if (breakStart > startMin) ranges.push({ start: startMin, end: Math.min(breakStart, endMin) });
    if (breakEnd < endMin) ranges.push({ start: Math.max(breakEnd, startMin), end: endMin });
  } else {
    ranges.push({ start: startMin, end: endMin });
  }

  // Generate slots within each range
  const step = slotDuration + bufferMinutes;
  const slots = [];
  for (const range of ranges) {
    for (let min = range.start; min + slotDuration <= range.end; min += step) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const slotStart = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      const isBooked = booked.some((appt) => {
        const apptStart = new Date(appt.scheduledAt);
        const apptEnd = new Date(apptStart.getTime() + ((appt.duration || 30) + bufferMinutes) * 60 * 1000);
        return apptStart < slotEnd && apptEnd > slotStart;
      });

      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        display: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        available: !isBooked,
      });
    }
  }

  return slots;
}

module.exports = { generateSlots, generateScheduleAwareSlots };
