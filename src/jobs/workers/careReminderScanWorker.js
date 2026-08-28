'use strict';

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

function createCareReminderScanWorker() {
  const worker = new Worker(
    'careReminderScan',
    async (job) => {
      logger.info('CareReminder scan: starting (job %s)', job.id);

      const Clinic = mongoose.model('Clinic');
      const clinics = await Clinic.find({ status: 'active' }).select('slug').lean();

      let totalQueued = 0;
      let totalMarkedMissed = 0;
      const now = new Date();
      const missedCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      for (const clinic of clinics) {
        try {
          const conn = await getTenantConnection(clinic.slug);
          const CareReminder = conn.model('CareReminder');
          const PrescriptionTask = conn.model('PrescriptionTask');

          // 1. Re-enqueue overdue pending reminders (skip eod_checklist — managed by EOD jobs)
          const overdueReminders = await CareReminder.find({
            status: 'pending',
            scheduledAt: { $lte: now },
            deletedAt: null,
          }).populate('task', 'reminderMode').lean();

          if (overdueReminders.length > 0) {
            const { careReminderQueue } = require('../queues');
            for (const r of overdueReminders) {
              if (r.task?.reminderMode === 'eod_checklist') continue;
              const jobId = `care-${r._id}`;
              try {
                await careReminderQueue.add(
                  'send-reminder',
                  { reminderId: r._id.toString(), tenantSlug: clinic.slug },
                  { jobId },
                );
                totalQueued += 1;
              } catch (err) {
                if (!err.message.includes('Job with id')) {
                  logger.warn('CareReminder scan: failed to enqueue %s — %s', r._id, err.message);
                }
              }
            }
          }

          // 2. Mark sent reminders as missed if no response in 4 hours (skip eod_checklist)
          const missedReminders = await CareReminder.find({
            status: 'sent',
            sentAt: { $lte: missedCutoff },
            deletedAt: null,
          }).populate('task', 'reminderMode').lean();

          // Batch-enqueue compliance checks for missed tasks
          const missedTaskIds = new Set();
          for (const r of missedReminders) {
            if (r.task?.reminderMode === 'eod_checklist') continue;
            const taskRef = r.task?._id || r.task;
            await CareReminder.findByIdAndUpdate(r._id, { status: 'missed' });
            await PrescriptionTask.findByIdAndUpdate(taskRef, { $inc: { missedCount: 1 } });
            missedTaskIds.add(taskRef.toString());
            totalMarkedMissed += 1;
          }

          if (missedTaskIds.size > 0) {
            try {
              const { complianceAlertQueue } = require('../queues');
              for (const taskId of missedTaskIds) {
                await complianceAlertQueue.add('check-task-compliance', { taskId, tenantSlug: clinic.slug });
                await complianceAlertQueue.add('check-consecutive-misses', { taskId, tenantSlug: clinic.slug });
              }
            } catch (compErr) {
              logger.warn('CareReminder scan: failed to enqueue compliance checks — %s', compErr.message);
            }
          }
        } catch (err) {
          logger.error('CareReminder scan: error processing clinic %s — %s', clinic.slug, err.message);
        }
      }

      logger.info(
        'CareReminder scan: complete — %d clinics, %d queued, %d marked missed',
        clinics.length, totalQueued, totalMarkedMissed,
      );
      return { clinicsScanned: clinics.length, remindersQueued: totalQueued, markedMissed: totalMarkedMissed };
    },
    { connection: getRedis(), concurrency: 1, drainDelay: 30_000 },
  );

  worker.on('failed', (job, err) => {
    logger.error('CareReminder scan: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createCareReminderScanWorker;
