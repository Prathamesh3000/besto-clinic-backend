'use strict';

/**
 * Appointment reminder worker — processes per-timing reminder jobs.
 * Each job corresponds to one timing entry (e.g., 24h before, 30min before).
 * Loads the appointment, guards against already-sent/cancelled,
 * sends contextual notification + FCM push.
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const fcmService = require('../../services/fcm.service');
const { APPOINTMENT_STATUS } = require('../../config/constants');

/**
 * Generate a human-friendly reminder message based on timing.
 */
function _buildReminderMessage(doctorName, minutesBefore) {
  if (minutesBefore === 0) {
    return `Dr. ${doctorName} has sent you a reminder about your appointment. Please confirm your attendance.`;
  }
  if (minutesBefore < 60) {
    return `Your appointment with Dr. ${doctorName} is in ${minutesBefore} minutes. Please confirm your attendance.`;
  }
  if (minutesBefore === 60) {
    return `Your appointment with Dr. ${doctorName} is in 1 hour. Please confirm your attendance.`;
  }
  if (minutesBefore < 1440) {
    const hours = Math.round(minutesBefore / 60);
    return `Your appointment with Dr. ${doctorName} is in ${hours} hours. Please confirm your attendance.`;
  }
  if (minutesBefore === 1440) {
    return `Reminder: You have an appointment tomorrow with Dr. ${doctorName}. Please confirm your attendance.`;
  }
  const days = Math.round(minutesBefore / 1440);
  return `Reminder: You have an appointment in ${days} days with Dr. ${doctorName}. Please confirm your attendance.`;
}

function createAppointmentReminderWorker() {
  const worker = new Worker(
    'appointmentReminder',
    async (job) => {
      const { appointmentId, tenantSlug, minutesBefore } = job.data;
      logger.info(
        'Reminder worker: processing appointment %s (tenant: %s, minutesBefore: %s)',
        appointmentId, tenantSlug, minutesBefore ?? 'legacy',
      );

      const conn = await getTenantConnection(tenantSlug);
      const Appointment = conn.model('Appointment');
      const Patient = conn.model('Patient');
      const User = conn.model('User');

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        logger.warn('Reminder worker: appointment %s not found — skipping', appointmentId);
        return;
      }

      // Guard: skip if appointment is in a terminal state
      if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW].includes(appointment.status)) {
        return;
      }

      // For multi-timing: check if this specific reminder was already sent
      if (minutesBefore !== undefined && appointment.reminders && appointment.reminders.length > 0) {
        const entry = appointment.reminders.find(r => r.minutesBefore === minutesBefore);
        if (entry && entry.status === 'sent') {
          logger.info('Reminder worker: timing %dmin already sent for %s — skipping', minutesBefore, appointmentId);
          return;
        }
      } else if (appointment.reminderSent) {
        // Legacy single-reminder guard
        return;
      }

      const patient = await Patient.findById(appointment.patient);
      const doctor = await User.findById(appointment.doctor);
      if (!patient || !doctor) return;
      if (!patient.user && !patient.guardian) return; // no one to notify

      // Build contextual message
      const timingMin = minutesBefore ?? 1440; // fallback for legacy jobs
      const message = _buildReminderMessage(doctor.name, timingMin);

      // Create in-app notification (only if patient has their own user account)
      if (patient.user) {
        const { notifyAndEmit } = require('../../utils/notifyAndEmit');
        await notifyAndEmit({
          recipient: patient.user,
          title: 'Appointment Reminder',
          message,
          type: 'reminder',
          metadata: { appointmentId: appointment._id, doctorName: doctor.name, scheduledAt: appointment.scheduledAt, minutesBefore: timingMin },
        }, tenantSlug);
      }

      // Send interactive FCM push notification (Yes/No reconfirmation)
      // sendAppointmentReminder handles both patient user + guardian internally
      await fcmService.sendAppointmentReminder(patient.user || null, tenantSlug, {
        appointmentId: appointment._id,
        doctorName: doctor.name,
        scheduledAt: appointment.scheduledAt,
        patientId: patient._id,
      });

      // Mark this specific reminder entry as sent
      if (minutesBefore !== undefined && appointment.reminders && appointment.reminders.length > 0) {
        const entry = appointment.reminders.find(r => r.minutesBefore === minutesBefore);
        if (entry) {
          entry.status = 'sent';
          entry.sentAt = new Date();
        }
        // Check if ALL reminders are now sent
        const allSent = appointment.reminders.every(r => r.status === 'sent');
        if (allSent) {
          appointment.reminderSent = true;
        }
      } else {
        // Legacy single-reminder
        appointment.reminderSent = true;
      }

      appointment.reminderSentAt = new Date();
      await appointment.save();

      logger.info('Reminder worker: sent for appointment %s (timing: %dmin)', appointmentId, timingMin);
    },
    {
      connection: getRedis(),
      concurrency: 3,
      drainDelay: 30_000,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Reminder worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createAppointmentReminderWorker;
