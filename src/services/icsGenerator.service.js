'use strict';

/**
 * ICS Generator — produces RFC 5545 compliant iCalendar text.
 *
 * Zero npm dependencies. Generates VCALENDAR documents with VEVENT
 * entries for appointments, leaves, and schedule overrides.
 *
 * Timezone: The backend uses a "fake-UTC" convention where IST local
 * times are stored as UTC (e.g. 10:00 IST → T10:00:00.000Z). We read
 * getUTC* components and emit them as TZID=Asia/Kolkata timestamps.
 */

const { getTenantConnection } = require('../db/tenantConnectionManager');

const CRLF = '\r\n';

// ── RFC 5545 helpers ────────────────────────────────────

/** Escape special characters per RFC 5545 §3.3.11 */
function escapeText(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold content lines longer than 75 octets (RFC 5545 §3.1).
 * Continuation lines start with a single space.
 */
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let remaining = line;
  let first = true;
  while (Buffer.byteLength(remaining, 'utf8') > 75) {
    // On first chunk take 75, on continuation take 74 (space prefix counts)
    const maxBytes = first ? 75 : 74;
    let cut = maxBytes;
    // Walk back to avoid splitting a multi-byte character
    while (cut > 0 && Buffer.byteLength(remaining.slice(0, cut), 'utf8') > maxBytes) {
      cut--;
    }
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
    first = false;
  }
  if (remaining) parts.push(remaining);
  return parts.join(CRLF + ' ');
}

/**
 * Format a JS Date's UTC components as iCal datetime: YYYYMMDDTHHmmss
 * (treating UTC components as IST per the fake-UTC convention).
 */
function formatDateTime(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${M}${D}T${h}${m}${s}`;
}

/** Format a JS Date as iCal date-only: YYYYMMDD */
function formatDateOnly(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${M}${D}`;
}

/** Format current time as iCal UTC timestamp: YYYYMMDDTHHmmssZ */
function formatNowUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${M}${D}T${h}${m}${s}Z`;
}

/** Add N days to a date and return a new Date at midnight UTC */
function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Build a single line, fold it, and append CRLF */
function line(content) {
  return foldLine(content) + CRLF;
}

// ── Static VTIMEZONE for Asia/Kolkata (IST, no DST) ────

const VTIMEZONE =
  'BEGIN:VTIMEZONE' + CRLF +
  'TZID:Asia/Kolkata' + CRLF +
  'X-LIC-LOCATION:Asia/Kolkata' + CRLF +
  'BEGIN:STANDARD' + CRLF +
  'TZOFFSETFROM:+0530' + CRLF +
  'TZOFFSETTO:+0530' + CRLF +
  'TZNAME:IST' + CRLF +
  'DTSTART:19700101T000000' + CRLF +
  'END:STANDARD' + CRLF +
  'END:VTIMEZONE' + CRLF;

// ── ICS document builder ────────────────────────────────

function buildVEvent({ uid, dtstart, dtend, summary, description, location, allDay, status }) {
  let out = '';
  out += line('BEGIN:VEVENT');
  out += line(`UID:${uid}`);
  out += line(`DTSTAMP:${formatNowUTC()}`);

  if (allDay) {
    out += line(`DTSTART;VALUE=DATE:${dtstart}`);
    if (dtend) out += line(`DTEND;VALUE=DATE:${dtend}`);
  } else {
    out += line(`DTSTART;TZID=Asia/Kolkata:${dtstart}`);
    out += line(`DTEND;TZID=Asia/Kolkata:${dtend}`);
  }

  out += line(`SUMMARY:${escapeText(summary)}`);
  if (description) out += line(`DESCRIPTION:${escapeText(description)}`);
  if (location) out += line(`LOCATION:${escapeText(location)}`);
  if (status) out += line(`STATUS:${status}`);
  out += line(`TRANSP:OPAQUE`);
  out += line('END:VEVENT');
  return out;
}

function wrapCalendar(calName, events) {
  let out = '';
  out += line('BEGIN:VCALENDAR');
  out += line('VERSION:2.0');
  out += line('PRODID:-//BestoClinic//Calendar Feed//EN');
  out += line('METHOD:PUBLISH');
  out += line(`X-WR-CALNAME:${escapeText(calName)}`);
  out += line('X-WR-TIMEZONE:Asia/Kolkata');
  out += VTIMEZONE;
  out += events;
  out += line('END:VCALENDAR');
  return out;
}

// ── Public API ──────────────────────────────────────────

/**
 * Generate ICS text for a doctor's schedule feed.
 *
 * @param {string} doctorId
 * @param {string} tenantSlug
 * @param {Object} feedSettings - { showPatientNames, includeLeaves, branch }
 * @returns {Promise<string>} RFC 5545 ICS text
 */
async function generateDoctorICS(doctorId, tenantSlug, feedSettings = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const Appointment = conn.model('Appointment');
  const DoctorLeave = conn.model('DoctorLeave');
  const DoctorScheduleOverride = conn.model('DoctorScheduleOverride');
  const DoctorSchedule = conn.model('DoctorSchedule');

  // Load doctor info for calendar title
  const doctor = await User.findById(doctorId).select('name specialization').lean();
  if (!doctor) throw new Error('Doctor not found');

  // Determine date window
  let maxAdvanceDays = 60;
  const schedule = await DoctorSchedule.findOne({ doctor: doctorId, isActive: true, deletedAt: null }).lean();
  if (schedule) maxAdvanceDays = schedule.maxAdvanceDays || 60;

  const now = new Date();
  const pastDate = addDays(now, -7);
  const futureDate = addDays(now, maxAdvanceDays);

  // Branch filter
  const branchFilter = feedSettings.branch
    ? { branch: feedSettings.branch }
    : {};

  // Load appointments
  const appointments = await Appointment.find({
    doctor: doctorId,
    scheduledAt: { $gte: pastDate, $lte: futureDate },
    status: { $nin: ['cancelled', 'no_show'] },
    deletedAt: null,
    ...branchFilter,
  })
    .populate(feedSettings.showPatientNames ? { path: 'patient', select: 'name' } : '')
    .populate({ path: 'branch', select: 'name' })
    .lean();

  // Load leaves
  const leaves = feedSettings.includeLeaves !== false
    ? await DoctorLeave.find({
        doctor: doctorId,
        status: 'approved',
        startDate: { $lte: futureDate },
        endDate: { $gte: pastDate },
        deletedAt: null,
        ...(feedSettings.branch
          ? { $or: [{ branch: null }, { branch: feedSettings.branch }] }
          : {}),
      }).lean()
    : [];

  // Load day-off overrides
  const overrides = await DoctorScheduleOverride.find({
    doctor: doctorId,
    type: 'day_off',
    date: { $gte: pastDate, $lte: futureDate },
    deletedAt: null,
    ...(feedSettings.branch
      ? { $or: [{ branch: null }, { branch: feedSettings.branch }] }
      : {}),
  }).lean();

  // Build events
  let events = '';

  for (const appt of appointments) {
    const endTime = new Date(appt.scheduledAt);
    endTime.setUTCMinutes(endTime.getUTCMinutes() + (appt.duration || 30));

    let summary = 'Booked';
    if (feedSettings.showPatientNames && appt.patient?.name) {
      summary = `Appointment - ${appt.patient.name}`;
    }

    const parts = [];
    if (appt.type) parts.push(`Type: ${appt.type}`);
    if (appt.reason) parts.push(`Reason: ${appt.reason}`);

    events += buildVEvent({
      uid: `${appt._id}@${tenantSlug}.bestoclinic.com`,
      dtstart: formatDateTime(appt.scheduledAt),
      dtend: formatDateTime(endTime),
      summary,
      description: parts.length ? parts.join('. ') : undefined,
      location: appt.branch?.name || undefined,
      status: 'CONFIRMED',
    });
  }

  for (const leave of leaves) {
    // All-day event spanning the leave period.
    // ICS DATE;VALUE=DATE end is exclusive, so add 1 day.
    const endExclusive = addDays(leave.endDate, 1);
    events += buildVEvent({
      uid: `leave-${leave._id}@${tenantSlug}.bestoclinic.com`,
      dtstart: formatDateOnly(leave.startDate),
      dtend: formatDateOnly(endExclusive),
      summary: `Leave - ${leave.leaveType || 'planned'}`,
      description: leave.reason || undefined,
      allDay: true,
      status: 'CONFIRMED',
    });
  }

  for (const ov of overrides) {
    events += buildVEvent({
      uid: `override-${ov._id}@${tenantSlug}.bestoclinic.com`,
      dtstart: formatDateOnly(ov.date),
      summary: 'Day Off',
      description: ov.reason || undefined,
      allDay: true,
      status: 'CONFIRMED',
    });
  }

  const calName = `Dr. ${doctor.name}${doctor.specialization ? ` (${doctor.specialization})` : ''} — Schedule`;
  return wrapCalendar(calName, events);
}

module.exports = { generateDoctorICS };
