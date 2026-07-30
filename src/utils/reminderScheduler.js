'use strict';

/**
 * Appointment reminder scheduling utility — multi-timing support.
 * Encapsulates BullMQ delayed-job scheduling for appointment reminders.
 *
 * Each appointment can have multiple reminders (e.g., 24h + 30min before).
 * Each timing gets its own BullMQ job with a unique jobId.
 */

const logger = require('./logger');

/** Default fallback: 24h + 1h + 15min before appointment */
const DEFAULT_TIMINGS = [1440, 60, 15];

/** Max lead time in minutes (1 week) */
const MAX_LEAD_MINUTES = 10080;

/** Backward compat — used by scan worker */
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule multiple reminder jobs for an appointment.
 *
 * @param {string} appointmentId
 * @param {string} tenantSlug
 * @param {string|Date} scheduledAt - appointment date/time
 * @param {number[]} timings - array of minutes-before values (e.g., [1440, 30, 0])
 * @returns {Promise<Array<{minutesBefore: number, jobId: string, status: string}>>} reminder entries
 */
async function scheduleReminders(appointmentId, tenantSlug, scheduledAt, timings) {
  const validTimings = (timings && timings.length > 0) ? timings : DEFAULT_TIMINGS;
  const scheduledTime = new Date(scheduledAt).getTime();
  const reminders = [];

  try {
    const { appointmentReminderQueue } = require('../jobs/queues');

    for (const minutesBefore of validTimings) {
      const clamped = Math.max(0, Math.min(minutesBefore, MAX_LEAD_MINUTES));
      const fireAt = scheduledTime - (clamped * 60 * 1000);
      const delay = fireAt - Date.now();

      // Skip reminders whose fire time is already in the past
      if (delay < -60000) {
        continue;
      }

      const jobId = `reminder-${appointmentId}-${clamped}`;

      await appointmentReminderQueue.add(
        'send-reminder',
        { appointmentId, tenantSlug, minutesBefore: clamped },
        { delay: Math.max(0, delay), jobId },
      );

      reminders.push({ minutesBefore: clamped, jobId, status: 'scheduled' });
    }

    logger.info(
      'Reminders scheduled: appointment %s (tenant: %s, timings: %s)',
      appointmentId, tenantSlug, validTimings.join(','),
    );
  } catch (err) {
    logger.error('Failed to schedule reminders for appointment %s: %s', appointmentId, err.message);
  }

  return reminders;
}

/**
 * Cancel all reminder jobs for an appointment.
 *
 * @param {Array<{jobId: string}>} reminders - reminder entries with jobId
 */
async function cancelReminders(reminders) {
  if (!reminders || reminders.length === 0) return;

  try {
    const { appointmentReminderQueue } = require('../jobs/queues');

    for (const reminder of reminders) {
      if (!reminder.jobId) continue;
      try {
        const job = await appointmentReminderQueue.getJob(reminder.jobId);
        if (job) {
          await job.remove();
          logger.info('Reminder cancelled: %s', reminder.jobId);
        }
      } catch (err) {
        logger.warn('Failed to cancel reminder %s (may not exist): %s', reminder.jobId, err.message);
      }
    }
  } catch (err) {
    logger.warn('Failed to cancel reminders: %s', err.message);
  }
}

/**
 * Cancel a single reminder job by ID.
 * @param {string} jobId
 */
async function cancelSingleReminder(jobId) {
  if (!jobId) return;
  try {
    const { appointmentReminderQueue } = require('../jobs/queues');
    const job = await appointmentReminderQueue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info('Reminder cancelled: %s', jobId);
    }
  } catch (err) {
    logger.warn('Failed to cancel reminder %s (may not exist): %s', jobId, err.message);
  }
}

// ── Backward compat aliases ──────────────────────────────
/** @deprecated Use scheduleReminders() instead */
async function scheduleReminder(appointmentId, tenantSlug, scheduledAt) {
  const entries = await scheduleReminders(appointmentId, tenantSlug, scheduledAt, DEFAULT_TIMINGS);
  return entries.length > 0 ? entries[0].jobId : null;
}

/** @deprecated Use cancelReminders() instead */
async function cancelReminder(jobId) {
  await cancelSingleReminder(jobId);
}

module.exports = {
  scheduleReminders,
  cancelReminders,
  cancelSingleReminder,
  // Backward compat
  scheduleReminder,
  cancelReminder,
  REMINDER_LEAD_MS,
  DEFAULT_TIMINGS,
  MAX_LEAD_MINUTES,
};
