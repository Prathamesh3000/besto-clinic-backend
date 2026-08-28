'use strict';

const logger = require('./logger');

// ── Frequency → times-per-day + default schedule times ──────────────

/** Map frequency enum → { count, times } */
const FREQUENCY_CONFIG = {
  once:             { count: 1, times: ['09:00'] },
  twice_daily:      { count: 2, times: ['09:00', '21:00'] },
  thrice_daily:     { count: 3, times: ['08:00', '14:00', '20:00'] },
  four_times_daily: { count: 4, times: ['08:00', '12:00', '16:00', '20:00'] },
  after_meals:      { count: 3, times: ['09:30', '14:30', '20:30'] },
  before_meals:     { count: 3, times: ['08:30', '13:30', '19:30'] },
  bedtime:          { count: 1, times: ['21:30'] },
  custom:           { count: 1, times: ['09:00'] }, // overridden by customTimes
};

// ── Task type classification via keyword matching ───────────────────

const TASK_TYPE_KEYWORDS = {
  medication: ['tablet', 'capsule', 'syrup', 'drops', 'mg', 'ml', 'dose', 'medicine', 'drug'],
  hygiene:    ['brush', 'floss', 'rinse', 'mouthwash', 'toothpaste', 'clean'],
  post_care:  ['gargle', 'ice', 'compress', 'rest', 'salt-water', 'saltwater', 'cold pack'],
  dietary:    ['avoid', 'diet', 'eat', 'food', 'drink', 'chew', 'soft food', 'hard food'],
};

/**
 * Classify medication into a task type using keyword matching.
 * Falls back to 'medication' if no other match.
 */
function classifyTaskType(med) {
  const text = `${med.name || ''} ${med.instructions || ''}`.toLowerCase();

  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (type === 'medication') continue; // check last as default
    if (keywords.some(kw => text.includes(kw))) return type;
  }

  // Check if it looks like a medication
  if (TASK_TYPE_KEYWORDS.medication.some(kw => text.includes(kw))) return 'medication';

  return 'medication'; // default
}

// ── Frequency string mapping ────────────────────────────────────────

const FREQUENCY_MAP = {
  'once daily':    'once',
  'once a day':    'once',
  'od':            'once',
  '1x daily':      'once',
  'twice daily':   'twice_daily',
  'twice a day':   'twice_daily',
  'bid':           'twice_daily',
  '2x daily':      'twice_daily',
  'three times':   'thrice_daily',
  'thrice daily':  'thrice_daily',
  'tid':           'thrice_daily',
  '3x daily':      'thrice_daily',
  'four times':    'four_times_daily',
  'qid':           'four_times_daily',
  '4x daily':      'four_times_daily',
  'after meals':   'after_meals',
  'after food':    'after_meals',
  'before meals':  'before_meals',
  'before food':   'before_meals',
  'at bedtime':    'bedtime',
  'at night':      'bedtime',
  'bedtime':       'bedtime',
};

/**
 * Map a free-text frequency string to a frequency enum value.
 */
function mapFrequency(freqStr) {
  if (!freqStr) return 'once';
  const lower = freqStr.toLowerCase().trim();

  // Direct match
  if (FREQUENCY_MAP[lower]) return FREQUENCY_MAP[lower];

  // Partial match
  for (const [pattern, freq] of Object.entries(FREQUENCY_MAP)) {
    if (lower.includes(pattern)) return freq;
  }

  return 'once';
}

/**
 * Parse a duration string to number of days.
 */
function parseDuration(durStr) {
  if (!durStr) return 7;
  const lower = durStr.toLowerCase().trim();

  const dayMatch = lower.match(/(\d+)\s*days?/);
  if (dayMatch) return parseInt(dayMatch[1], 10);

  const weekMatch = lower.match(/(\d+)\s*weeks?/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7;

  const monthMatch = lower.match(/(\d+)\s*months?/);
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30;

  const num = parseInt(lower, 10);
  if (!isNaN(num) && num > 0) return num;
  return 7;
}

/**
 * Calculate end date from start date and duration string.
 */
function calculateEndDate(durationStr, startDate) {
  const days = parseDuration(durationStr);
  return new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Extract PrescriptionTask plain objects from a prescription.
 * Handles all task types: medication, hygiene, post_care, dietary, follow_up.
 */
function extractTasks(prescription) {
  const startDate = prescription.createdAt ? new Date(prescription.createdAt) : new Date();
  const tasks = [];
  const patientId = prescription.patient._id || prescription.patient;
  const doctorId = prescription.doctor._id || prescription.doctor;

  // Extract tasks from each medication
  for (const med of (prescription.medications || [])) {
    // Check if doctor disabled reminders for this medication
    const reminderConfig = med._reminderConfig;
    if (reminderConfig?.enabled === false) {
      continue; // Skip task creation entirely if reminders are disabled
    }

    const taskType = classifyTaskType(med);
    const frequency = mapFrequency(med.frequency);
    const config = FREQUENCY_CONFIG[frequency] || FREQUENCY_CONFIG.once;
    const endDate = calculateEndDate(med.duration, startDate);
    const durationDays = Math.max(1, Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000)));

    // Use doctor-specified times if provided, otherwise use system defaults
    const customTimes = reminderConfig?.customTimes || config.times;
    const totalReminders = customTimes.length * durationDays;

    tasks.push({
      prescription: prescription._id,
      patient: patientId,
      doctor: doctorId,
      taskType,
      title: `${med.name}${med.dosage ? ' ' + med.dosage : ''}`.trim(),
      instructions: med.instructions || `Take ${med.name} ${med.dosage || ''}, ${med.frequency || 'once daily'}`.trim(),
      frequency,
      customTimes, // Use doctor custom times or system defaults
      startDate,
      endDate,
      totalReminders,
    });
  }

  // Extract follow-up task if followUpDate exists
  if (prescription.followUpDate) {
    const followUpDate = new Date(prescription.followUpDate);
    const dayBefore = new Date(followUpDate.getTime() - 24 * 60 * 60 * 1000);

    tasks.push({
      prescription: prescription._id,
      patient: patientId,
      doctor: doctorId,
      taskType: 'follow_up',
      title: 'Follow-up visit',
      instructions: 'You have a follow-up appointment scheduled. Please attend your visit.',
      frequency: 'once',
      customTimes: ['09:00'],
      startDate: dayBefore,
      endDate: followUpDate,
      totalReminders: 1,
    });
  }

  return tasks;
}

/**
 * Parse time string "HH:MM" to { hour, minute }.
 */
function parseTimeString(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

/**
 * Generate CareReminder plain objects for a given saved task document.
 */
function generateReminders(task) {
  const reminders = [];
  const times = (task.customTimes && task.customTimes.length > 0)
    ? task.customTimes
    : (FREQUENCY_CONFIG[task.frequency] || FREQUENCY_CONFIG.once).times;

  const current = new Date(task.startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(task.endDate);
  end.setHours(23, 59, 59, 999);

  const now = new Date();

  while (current <= end) {
    for (const timeStr of times) {
      const { hour, minute } = parseTimeString(timeStr);
      const scheduledAt = new Date(current);
      scheduledAt.setHours(hour, minute, 0, 0);

      if (scheduledAt <= now) continue;
      if (scheduledAt > end) continue;

      reminders.push({
        task: task._id,
        patient: task.patient,
        prescription: task.prescription,
        scheduledAt,
        status: 'pending',
        deliveryChannel: 'push',
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return reminders;
}

/**
 * Schedule BullMQ delayed jobs for an array of saved CareReminder documents.
 */
async function scheduleBulkReminders(reminders, tenantSlug) {
  const { careReminderQueue } = require('../jobs/queues');
  let scheduled = 0;

  for (const reminder of reminders) {
    const delay = Math.max(0, new Date(reminder.scheduledAt).getTime() - Date.now());
    const jobId = `care-${reminder._id}`;
    try {
      await careReminderQueue.add(
        'send-reminder',
        { reminderId: reminder._id.toString(), tenantSlug },
        { delay, jobId },
      );
      scheduled += 1;
    } catch (err) {
      if (!err.message.includes('Job with id')) {
        logger.warn('careReminderScheduler: failed to schedule %s — %s', reminder._id, err.message);
      }
    }
  }

  logger.info('careReminderScheduler: scheduled %d/%d reminders (tenant: %s)', scheduled, reminders.length, tenantSlug);
  return scheduled;
}

/**
 * Cancel all pending BullMQ jobs for the given reminder IDs.
 */
async function cancelPrescriptionReminders(reminderIds) {
  const { careReminderQueue } = require('../jobs/queues');
  let cancelled = 0;

  for (const id of reminderIds) {
    try {
      const job = await careReminderQueue.getJob(`care-${id}`);
      if (job) { await job.remove(); cancelled += 1; }
    } catch (_) { /* ignore */ }

    try {
      const job = await careReminderQueue.getJob(`missed-${id}`);
      if (job) await job.remove();
    } catch (_) { /* ignore */ }
  }

  logger.info('careReminderScheduler: cancelled %d/%d jobs', cancelled, reminderIds.length);
}

/**
 * Schedule daily EOD checklist BullMQ jobs for a patient.
 * One job per day at `eodTime`, collecting all pending EOD reminders for that patient.
 * Job ID `eod-{patientId}-{date}` ensures idempotency across multiple prescriptions.
 */
async function scheduleEodChecklistJobs(patientId, eodTime, startDate, endDate, tenantSlug) {
  const { careReminderQueue } = require('../jobs/queues');
  const [hour, minute] = (eodTime || '20:00').split(':').map(Number);
  let scheduled = 0;

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();

  while (current <= end) {
    const fireAt = new Date(current);
    fireAt.setHours(hour, minute, 0, 0);

    if (fireAt > now) {
      const dateStr = fireAt.toISOString().slice(0, 10);
      const jobId = `eod-${patientId}-${dateStr}`;
      const delay = fireAt.getTime() - Date.now();

      try {
        await careReminderQueue.add(
          'send-eod-checklist',
          { patientId: patientId.toString(), tenantSlug, date: dateStr },
          { delay, jobId },
        );
        scheduled += 1;
      } catch (err) {
        if (!err.message.includes('Job with id')) {
          logger.warn('scheduleEodChecklist: failed %s — %s', jobId, err.message);
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  logger.info('scheduleEodChecklist: scheduled %d EOD jobs for patient %s (tenant: %s)', scheduled, patientId, tenantSlug);
  return scheduled;
}

module.exports = {
  mapFrequency,
  parseDuration,
  classifyTaskType,
  extractTasks,
  generateReminders,
  scheduleBulkReminders,
  scheduleEodChecklistJobs,
  cancelPrescriptionReminders,
  FREQUENCY_CONFIG,
};
