'use strict';

/**
 * Appointment reminder scanner — safety-net repeatable job.
 * Runs every 15 minutes to catch any reminders that were missed
 * (e.g., server restart during scheduling, Redis flush, etc.).
 *
 * Supports both:
 * - New multi-timing appointments (scans reminders[] array for 'scheduled' entries)
 * - Legacy single-timing appointments (uses reminderSent boolean)
 *
 * BullMQ deduplicates by jobId, so double-enqueue is safe.
 */

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { APPOINTMENT_STATUS } = require('../../config/constants');
const { MAX_LEAD_MINUTES } = require('../../utils/reminderScheduler');

/** Max look-ahead window (1 week in ms) */
const MAX_LEAD_MS = MAX_LEAD_MINUTES * 60 * 1000;

function createAppointmentReminderScanWorker() {
  const worker = new Worker(
    'appointmentReminderScan',
    async (job) => {
      logger.info('Reminder scan: starting (job %s)', job.id);

      const Clinic = mongoose.model('Clinic');
      const clinics = await Clinic.find({ status: 'active' }).select('slug').lean();

      let totalQueued = 0;

      for (const clinic of clinics) {
        try {
          const conn = await getTenantConnection(clinic.slug);
          const Appointment = conn.model('Appointment');

          const now = new Date();
          const maxCutoff = new Date(now.getTime() + MAX_LEAD_MS);

          // Find upcoming appointments that are not fully reminded yet
          const appointments = await Appointment.find({
            scheduledAt: { $gt: now, $lte: maxCutoff },
            reminderSent: false,
            status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW] },
            deletedAt: null,
          }).select('_id reminders reminderTimings reminderJobId').lean();

          if (appointments.length === 0) continue;

          const { appointmentReminderQueue } = require('../queues');

          for (const appt of appointments) {
            // Multi-timing path
            if (appt.reminders && appt.reminders.length > 0) {
              for (const reminder of appt.reminders) {
                if (reminder.status !== 'scheduled') continue;
                // Check if this reminder's fire time has passed or is imminent
                const fireAt = new Date(appt.scheduledAt).getTime() - (reminder.minutesBefore * 60 * 1000);
                if (fireAt > now.getTime()) continue; // not due yet

                const jobId = reminder.jobId || `reminder-${appt._id}-${reminder.minutesBefore}`;
                try {
                  await appointmentReminderQueue.add(
                    'send-reminder',
                    { appointmentId: appt._id.toString(), tenantSlug: clinic.slug, minutesBefore: reminder.minutesBefore },
                    { jobId },
                  );
                  totalQueued += 1;
                } catch (err) {
                  if (!err.message.includes('Job with id')) {
                    logger.warn('Reminder scan: failed to enqueue %s/%d — %s', appt._id, reminder.minutesBefore, err.message);
                  }
                }
              }
            } else {
              // Legacy single-timing fallback
              const jobId = appt.reminderJobId || `reminder-${appt._id}`;
              try {
                await appointmentReminderQueue.add(
                  'send-reminder',
                  { appointmentId: appt._id.toString(), tenantSlug: clinic.slug },
                  { jobId },
                );
                totalQueued += 1;
              } catch (err) {
                if (!err.message.includes('Job with id')) {
                  logger.warn('Reminder scan: failed to enqueue %s — %s', appt._id, err.message);
                }
              }
            }
          }
        } catch (err) {
          logger.error('Reminder scan: error processing clinic %s — %s', clinic.slug, err.message);
        }
      }

      logger.info('Reminder scan: complete — scanned %d clinics, queued %d reminders', clinics.length, totalQueued);
      return { clinicsScanned: clinics.length, remindersQueued: totalQueued };
    },
    {
      connection: getRedis(),
      concurrency: 1,
      drainDelay: 30_000,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Reminder scan: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createAppointmentReminderScanWorker;
