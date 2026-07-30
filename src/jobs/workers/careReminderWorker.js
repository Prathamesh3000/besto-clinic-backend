'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const fcmService = require('../../services/fcm.service');

function createCareReminderWorker() {
  const worker = new Worker(
    'careReminder',
    async (job) => {
      const { reminderId, tenantSlug } = job.data;

      if (job.name === 'check-missed') {
        return _handleCheckMissed(reminderId, tenantSlug);
      }
      if (job.name === 'send-eod-checklist') {
        return _handleSendEodChecklist(job.data);
      }
      if (job.name === 'check-eod-missed') {
        return _handleCheckEodMissed(job.data);
      }

      // Default: send-reminder
      return _handleSendReminder(reminderId, tenantSlug);
    },
    { connection: getRedis(), concurrency: 3, drainDelay: 30_000 },
  );

  worker.on('failed', (job, err) => {
    logger.error('CareReminder worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

async function _handleSendReminder(reminderId, tenantSlug) {
  logger.info('CareReminder worker: sending reminder %s (tenant: %s)', reminderId, tenantSlug);

  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const Patient = conn.model('Patient');

  const reminder = await CareReminder.findById(reminderId);
  if (!reminder) {
    logger.warn('CareReminder worker: reminder %s not found — skipping', reminderId);
    return;
  }
  if (reminder.status !== 'pending') return;

  const task = await PrescriptionTask.findById(reminder.task);
  if (!task || task.status !== 'active') {
    reminder.status = 'cancelled';
    await reminder.save();
    return;
  }

  const patient = await Patient.findById(reminder.patient);
  if (!patient) return;
  if (!patient.user && !patient.guardian) return; // no one to notify

  let notification;
  if (patient.user) {
    notification = await notifyAndEmit({
      recipient: patient.user,
      title: `Care Reminder: ${task.title}`,
      message: task.instructions || `Time for: ${task.title}`,
      type: 'reminder',
      metadata: {
        careReminderId: reminder._id,
        taskId: task._id,
        prescriptionId: reminder.prescription,
        taskType: task.taskType,
      },
    }, tenantSlug);
  }

  // Send interactive FCM push notification (Done/Skip)
  // sendCareReminder handles both patient user + guardian internally
  await fcmService.sendCareReminder(patient.user || null, tenantSlug, {
    reminderId: reminder._id,
    taskId: task._id,
    prescriptionId: reminder.prescription,
    patientId: patient._id,
    taskTitle: task.title,
    taskInstructions: task.instructions || `Time for: ${task.title}`,
  });

  // SMS delivery if patient prefers SMS
  let deliveryChannel = 'push';
  if (patient.preferredReminderChannel === 'sms' && patient.phone && patient.phone !== 'N/A') {
    try {
      const smsService = require('../../services/sms.service');
      await smsService.sendCareReminder({
        phone: patient.phone,
        patientName: patient.name,
        taskTitle: task.title,
        tenantSlug,
      });
      deliveryChannel = 'sms';
    } catch (smsErr) {
      logger.warn('CareReminder: SMS fallback to push for %s — %s', reminderId, smsErr.message);
    }
  }

  reminder.status = 'sent';
  reminder.sentAt = new Date();
  reminder.deliveryChannel = deliveryChannel;
  if (notification) reminder.notificationId = notification._id;
  await reminder.save();

  // Schedule missed-timeout check (4 hours)
  const { careReminderQueue } = require('../queues');
  const MISSED_TIMEOUT_MS = 4 * 60 * 60 * 1000;
  await careReminderQueue.add(
    'check-missed',
    { reminderId: reminder._id.toString(), tenantSlug },
    { delay: MISSED_TIMEOUT_MS, jobId: `missed-${reminder._id}` },
  ).catch((err) => {
    logger.warn('CareReminder: failed to schedule missed-check for %s — %s', reminderId, err.message);
  });

  logger.info('CareReminder worker: sent reminder %s (task: %s)', reminderId, task.title);
}

async function _handleCheckMissed(reminderId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');
  const PrescriptionTask = conn.model('PrescriptionTask');

  const reminder = await CareReminder.findById(reminderId);
  if (!reminder || reminder.status !== 'sent') return;

  reminder.status = 'missed';
  await reminder.save();

  await PrescriptionTask.findByIdAndUpdate(reminder.task, { $inc: { missedCount: 1 } });
  logger.info('CareReminder: marked as missed — %s', reminderId);

  // Trigger compliance checks
  try {
    const { complianceAlertQueue } = require('../queues');
    const taskId = reminder.task.toString();
    await complianceAlertQueue.add('check-task-compliance', { taskId, tenantSlug });
    await complianceAlertQueue.add('check-consecutive-misses', { taskId, tenantSlug });
  } catch (err) {
    logger.warn('CareReminder: failed to enqueue compliance check — %s', err.message);
  }
}

// ── EOD Checklist handlers ──────────────────────────────────────────

async function _handleSendEodChecklist({ patientId, tenantSlug, date }) {
  logger.info('EOD Checklist: building for patient %s on %s (tenant: %s)', patientId, date, tenantSlug);

  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');
  const Patient = conn.model('Patient');

  const startOfDay = new Date(date + 'T00:00:00.000Z');
  const endOfDay = new Date(date + 'T23:59:59.999Z');

  const reminders = await CareReminder.find({
    patient: patientId,
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
    status: 'pending',
    deletedAt: null,
  }).populate('task', 'title taskType instructions reminderMode').lean();

  // Only include reminders whose task is in eod_checklist mode
  const eodReminders = reminders.filter(r => r.task?.reminderMode === 'eod_checklist');
  if (eodReminders.length === 0) {
    logger.info('EOD Checklist: no pending EOD reminders for patient %s on %s', patientId, date);
    return;
  }

  const patient = await Patient.findById(patientId);
  if (!patient) return;
  if (!patient.user && !patient.guardian) return;

  // Deduplicate by task — build unique task list with all reminder IDs
  const taskMap = new Map();
  for (const r of eodReminders) {
    const tid = r.task._id.toString();
    if (!taskMap.has(tid)) {
      taskMap.set(tid, {
        taskId: tid,
        title: r.task.title,
        taskType: r.task.taskType,
        reminderIds: [],
      });
    }
    taskMap.get(tid).reminderIds.push(r._id.toString());
  }
  const tasks = Array.from(taskMap.values());

  // Send FCM notification
  await fcmService.sendEodChecklist(patient.user || null, tenantSlug, {
    patientId,
    date,
    tasks,
  });

  // Mark all as 'sent'
  const reminderIds = eodReminders.map(r => r._id);
  await CareReminder.updateMany(
    { _id: { $in: reminderIds } },
    { status: 'sent', sentAt: new Date() },
  );

  // Schedule missed check for next morning at 06:00
  const nextMorning = new Date(date + 'T06:00:00.000Z');
  nextMorning.setDate(nextMorning.getDate() + 1);
  const missedDelay = Math.max(0, nextMorning.getTime() - Date.now());

  const { careReminderQueue } = require('../queues');
  await careReminderQueue.add(
    'check-eod-missed',
    { patientId, tenantSlug, date },
    { delay: missedDelay, jobId: `eod-missed-${patientId}-${date}` },
  ).catch((err) => {
    logger.warn('EOD Checklist: failed to schedule missed-check — %s', err.message);
  });

  logger.info('EOD Checklist: sent %d tasks (%d reminders) to patient %s', tasks.length, eodReminders.length, patientId);
}

async function _handleCheckEodMissed({ patientId, tenantSlug, date }) {
  logger.info('EOD missed check: patient %s, date %s (tenant: %s)', patientId, date, tenantSlug);

  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');
  const PrescriptionTask = conn.model('PrescriptionTask');

  const startOfDay = new Date(date + 'T00:00:00.000Z');
  const endOfDay = new Date(date + 'T23:59:59.999Z');

  const staleReminders = await CareReminder.find({
    patient: patientId,
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
    status: 'sent',
    deletedAt: null,
  }).populate('task', 'reminderMode').lean();

  const eodStale = staleReminders.filter(r => r.task?.reminderMode === 'eod_checklist');
  if (eodStale.length === 0) return;

  const taskIncs = {};
  for (const r of eodStale) {
    await CareReminder.findByIdAndUpdate(r._id, { status: 'missed' });
    const tid = r.task._id.toString();
    taskIncs[tid] = (taskIncs[tid] || 0) + 1;
  }

  for (const [taskId, count] of Object.entries(taskIncs)) {
    await PrescriptionTask.findByIdAndUpdate(taskId, { $inc: { missedCount: count } });
  }

  logger.info('EOD missed check: marked %d reminders missed for patient %s on %s', eodStale.length, patientId, date);
}

module.exports = createCareReminderWorker;
