'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');

function createComplianceAlertWorker() {
  const worker = new Worker(
    'complianceAlert',
    async (job) => {
      const { taskId, tenantSlug } = job.data;

      switch (job.name) {
        case 'check-task-compliance':
          return _handleCheckTaskCompliance(taskId, tenantSlug);
        case 'check-consecutive-misses':
          return _handleCheckConsecutiveMisses(taskId, tenantSlug);
        case 'resolve-stale-alerts':
          return _handleResolveStaleAlerts(tenantSlug);
        default:
          logger.warn('ComplianceAlert worker: unknown job name %s', job.name);
      }
    },
    { connection: getRedis(), concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    logger.error('ComplianceAlert worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

async function _handleCheckTaskCompliance(taskId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const ComplianceAlert = conn.model('ComplianceAlert');

  const task = await PrescriptionTask.findById(taskId)
    .populate('patient', 'name')
    .populate('doctor', 'name')
    .lean({ virtuals: true });

  if (!task || !task.isActive) return;
  if (task.totalReminders < 3) return; // too few reminders to judge

  const completionRate = task.completionRate ?? 0;
  if (completionRate >= 50) return; // compliance is acceptable

  // Dedup: check for existing active alert for this task
  const existing = await ComplianceAlert.findOne({
    task: task._id,
    alertType: 'low_compliance',
    status: 'active',
  }).lean();
  if (existing) return;

  const severity = completionRate < 25 ? 'high' : 'medium';
  const patientName = task.patient?.name || 'Patient';

  await ComplianceAlert.create({
    patient: task.patient._id,
    doctor: task.doctor?._id || task.doctor,
    task: task._id,
    prescription: task.prescription,
    alertType: 'low_compliance',
    severity,
    complianceRate: completionRate,
    message: `${patientName}'s compliance for "${task.title}" is ${completionRate}%`,
  });

  // Notify prescribing doctor
  const doctorId = task.doctor?._id || task.doctor;
  if (doctorId) {
    await notifyAndEmit({
      recipient: doctorId,
      title: 'Low Compliance Alert',
      message: `Patient ${patientName}'s compliance for "${task.title}" has dropped to ${completionRate}%. Please review.`,
      type: 'alert',
      metadata: { alertType: 'low_compliance', patientId: task.patient._id, taskId: task._id, completionRate },
    }, tenantSlug);
  }

  logger.info('ComplianceAlert: created low_compliance alert for task %s (rate: %d%%)', taskId, completionRate);
}

async function _handleCheckConsecutiveMisses(taskId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');
  const ComplianceAlert = conn.model('ComplianceAlert');
  const PrescriptionTask = conn.model('PrescriptionTask');

  // Get last 5 reminders sorted most recent first
  const recentReminders = await CareReminder.find({
    task: taskId,
    status: { $in: ['done', 'skipped', 'missed'] },
  })
    .sort({ scheduledAt: -1 })
    .limit(5)
    .lean();

  // Count consecutive misses from most recent
  let consecutiveMisses = 0;
  for (const r of recentReminders) {
    if (r.status === 'missed') consecutiveMisses++;
    else break;
  }

  if (consecutiveMisses < 3) return;

  // Dedup
  const existing = await ComplianceAlert.findOne({
    task: taskId,
    alertType: 'consecutive_misses',
    status: 'active',
  }).lean();
  if (existing) return;

  const task = await PrescriptionTask.findById(taskId)
    .populate('patient', 'name')
    .populate('doctor', 'name')
    .lean();
  if (!task) return;

  const patientName = task.patient?.name || 'Patient';

  await ComplianceAlert.create({
    patient: task.patient._id,
    doctor: task.doctor?._id || task.doctor,
    task: task._id,
    prescription: task.prescription,
    alertType: 'consecutive_misses',
    severity: 'high',
    consecutiveMisses,
    message: `${patientName} has missed ${consecutiveMisses} consecutive reminders for "${task.title}"`,
  });

  const doctorId = task.doctor?._id || task.doctor;
  if (doctorId) {
    await notifyAndEmit({
      recipient: doctorId,
      title: 'Patient Missed Multiple Reminders',
      message: `${patientName} has missed ${consecutiveMisses} consecutive reminders for "${task.title}". Immediate attention needed.`,
      type: 'alert',
      metadata: { alertType: 'consecutive_misses', patientId: task.patient._id, taskId, consecutiveMisses },
    }, tenantSlug);
  }

  logger.info('ComplianceAlert: created consecutive_misses alert for task %s (%d misses)', taskId, consecutiveMisses);
}

async function _handleResolveStaleAlerts(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ComplianceAlert = conn.model('ComplianceAlert');
  const PrescriptionTask = conn.model('PrescriptionTask');

  // Find all active alerts and check if their tasks are still active
  const activeAlerts = await ComplianceAlert.find({ status: 'active' }).lean();
  let resolved = 0;

  for (const alert of activeAlerts) {
    const task = await PrescriptionTask.findById(alert.task).lean();
    if (!task || !task.isActive) {
      await ComplianceAlert.findByIdAndUpdate(alert._id, {
        status: 'expired',
        resolvedAt: new Date(),
        resolveNote: 'Auto-resolved: task no longer active',
      });
      resolved++;
    }
  }

  logger.info('ComplianceAlert: resolved %d stale alerts', resolved);
  return { resolved };
}

module.exports = createComplianceAlertWorker;
