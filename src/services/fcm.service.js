'use strict';

/**
 * FCM push notification service — sends push notifications via Firebase Cloud Messaging.
 *
 * Gracefully degrades to no-op if Firebase is not configured.
 */

const logger = require('../utils/logger');
const { getMessaging, isFirebaseAvailable } = require('../config/firebase');
const { getTenantConnection } = require('../db/tenantConnectionManager');

/**
 * Send a push notification to all devices of a given user.
 * Auto-cleans invalid/expired tokens.
 *
 * @param {string} userId - Tenant User _id
 * @param {string} tenantSlug
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
async function sendToUser(userId, tenantSlug, { title, body, data = {} }) {
  if (!isFirebaseAvailable()) return;

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const user = await User.findById(userId).select('fcmTokens').lean();

  if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
    logger.debug('FCM: no tokens for user %s — skipping', userId);
    return;
  }

  const tokens = user.fcmTokens.map((t) => t.token);
  const messaging = getMessaging();

  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { ...data, title, body },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', 'content-available': 1 } } },
    });

    // Clean up invalid tokens
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { token: { $in: invalidTokens } } } },
      );
      logger.info('FCM: cleaned %d invalid tokens for user %s', invalidTokens.length, userId);
    }

    logger.debug('FCM: sent to user %s — %d/%d succeeded', userId, response.successCount, tokens.length);
  } catch (err) {
    logger.error('FCM: sendToUser failed for %s — %s', userId, err.message);
  }
}

/**
 * Send an interactive appointment reminder push notification.
 * Client displays Yes/No buttons for reconfirmation.
 */
async function sendAppointmentReminder(userId, tenantSlug, { appointmentId, doctorName, scheduledAt, patientId }) {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-IN', { dateStyle: 'long' });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-IN', { timeStyle: 'short' });

  const payload = {
    title: 'Appointment Reminder',
    body: `You have an appointment with Dr. ${doctorName} on ${dateStr} at ${timeStr}. Will you attend?`,
    data: {
      type: 'appointment_reminder',
      appointmentId: appointmentId.toString(),
      patientId: patientId ? patientId.toString() : '',
      doctorName,
      scheduledAt: new Date(scheduledAt).toISOString(),
      actions: JSON.stringify(['confirm', 'decline']),
    },
  };

  if (userId) {
    await sendToUser(userId, tenantSlug, payload);
  }

  // Also notify guardian if configured
  if (patientId) {
    await _sendToGuardianIfEnabled(patientId, tenantSlug, payload);
  }
}

/**
 * Send an interactive care task reminder push notification.
 * Client displays Done/Skip buttons for checklist-style interaction.
 */
async function sendCareReminder(userId, tenantSlug, { reminderId, taskId, prescriptionId, patientId, taskTitle, taskInstructions }) {
  const payload = {
    title: `Care Reminder: ${taskTitle}`,
    body: taskInstructions || `Time for: ${taskTitle}`,
    data: {
      type: 'care_reminder',
      reminderId: reminderId.toString(),
      taskId: taskId.toString(),
      prescriptionId: prescriptionId ? prescriptionId.toString() : '',
      patientId: patientId ? patientId.toString() : '',
      taskTitle,
      actions: JSON.stringify(['done', 'skip']),
    },
  };

  if (userId) {
    await sendToUser(userId, tenantSlug, payload);
  }

  // Also notify guardian if configured
  if (patientId) {
    await _sendToGuardianIfEnabled(patientId, tenantSlug, payload);
  }
}

/**
 * Bulk-send a push notification to multiple users in the same tenant.
 * Useful for broadcasts (e.g. emergency alert to all on-duty doctors).
 * Each user receives the same payload; tokens are collated and invalid tokens cleaned per-user.
 *
 * @param {string[]} userIds
 * @param {string}   tenantSlug
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
async function sendToUsers(userIds, tenantSlug, payload) {
  if (!isFirebaseAvailable() || !userIds?.length) return;
  await Promise.all(
    userIds.map((uid) => sendToUser(uid, tenantSlug, payload).catch((err) => {
      logger.warn('FCM: sendToUsers — failed for %s: %s', uid, err.message);
    })),
  );
}

/**
 * Send a high-priority full-screen incoming-call alert.
 * Mobile clients should render a CallKit/WhatsApp-style takeover UI with ringtone.
 * Web clients render a fixed-position overlay + browser Notification when tab is hidden.
 *
 * @param {string} userId                  — target user (callee)
 * @param {string} tenantSlug
 * @param {{
 *   sessionId:   string,
 *   roomId:      string,
 *   callerName:  string,
 *   callerRole:  string,
 *   callerAvatar?: string,
 *   type:        'scheduled'|'emergency'|'follow_up'|string,
 *   reason?:     string,
 * }} payload
 */
async function sendIncomingCallAlert(userId, tenantSlug, {
  sessionId, roomId, callerName, callerRole, callerAvatar, type, reason,
}) {
  await sendToUser(userId, tenantSlug, {
    title: `Incoming ${type === 'emergency' ? 'emergency ' : ''}call`,
    body:  `${callerName} is calling you${reason ? ` — ${reason}` : ''}`,
    data: {
      type:         'incoming_call',
      sessionId:    sessionId.toString(),
      roomId:       roomId ? roomId.toString() : '',
      callerName:   callerName || '',
      callerRole:   callerRole || '',
      callerAvatar: callerAvatar || '',
      callType:     type || 'scheduled',
      reason:       reason || '',
      priority:     'high',
      // Mobile: trigger full-screen intent channel with ringtone
      channelId:    'incoming_calls',
      sound:        'ringtone',
      actions:      JSON.stringify(['accept', 'decline']),
    },
  });
}

/**
 * Broadcast a high-priority emergency alert to on-duty doctors.
 * Mobile clients render a doctor-channel notification with triage context.
 *
 * @param {string[]} doctorUserIds
 * @param {string}   tenantSlug
 * @param {{
 *   sessionId:   string,
 *   patientName: string,
 *   type:        'video'|'chat'|string,
 *   reason?:     string,
 *   symptoms?:   string[],
 *   pain?:       number,
 *   priority?:   'low'|'medium'|'high'|'critical',
 * }} payload
 */
async function sendEmergencyAlert(doctorUserIds, tenantSlug, {
  sessionId, patientName, type, reason, symptoms = [], pain, priority = 'high',
}) {
  const painStr = typeof pain === 'number' ? ` · Pain ${pain}/10` : '';
  const bodyReason = reason ? ` — ${reason}` : '';
  await sendToUsers(doctorUserIds, tenantSlug, {
    title: `Emergency: ${patientName}`,
    body:  `New ${type} emergency${bodyReason}${painStr}`,
    data: {
      type:        'emergency_alert',
      sessionId:   sessionId.toString(),
      patientName: patientName || '',
      emergencyType: type || 'chat',
      reason:      reason || '',
      symptoms:    JSON.stringify(symptoms || []),
      pain:        pain !== null && pain !== undefined ? String(pain) : '',
      priority,
      channelId:   'emergency_alerts',
      sound:       'emergency',
      actions:     JSON.stringify(['accept', 'view']),
    },
  });
}

/**
 * Send a chat-message push notification to an offline recipient.
 * Mobile clients should render under a "chat" channel with quick-reply action.
 *
 * @param {string} userId
 * @param {string} tenantSlug
 * @param {{
 *   sessionId:   string,
 *   messageId:   string,
 *   senderName:  string,
 *   senderRole:  string,
 *   preview:     string,
 *   hasAttachment?: boolean,
 * }} payload
 */
async function sendChatMessageAlert(userId, tenantSlug, {
  sessionId, messageId, senderName, senderRole, preview, hasAttachment = false,
}) {
  await sendToUser(userId, tenantSlug, {
    title: senderName || 'New message',
    body:  preview || (hasAttachment ? 'Attachment' : 'New message'),
    data: {
      type:        'chat_message',
      sessionId:   sessionId.toString(),
      messageId:   messageId.toString(),
      senderName:  senderName || '',
      senderRole:  senderRole || '',
      preview:     preview || '',
      hasAttachment: hasAttachment ? '1' : '0',
      channelId:   'chat_messages',
      actions:     JSON.stringify(['reply', 'open']),
    },
  });
}

/**
 * Send a duplicate push notification to the patient's guardian (parent),
 * if the patient has a guardian and guardianNotifications is enabled.
 * Used by sendAppointmentReminder / sendCareReminder to notify parents
 * of their dependent's reminders.
 *
 * @param {string} patientId  — Patient document _id
 * @param {string} tenantSlug
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
async function _sendToGuardianIfEnabled(patientId, tenantSlug, payload) {
  if (!isFirebaseAvailable()) return;
  try {
    const conn = await getTenantConnection(tenantSlug);
    const Patient = conn.model('Patient');
    const patient = await Patient.findById(patientId).select('guardian guardianNotifications').lean();
    if (!patient?.guardian) return;
    if (patient.guardianNotifications?.enabled === false) return;
    await sendToUser(patient.guardian, tenantSlug, payload);
  } catch (err) {
    logger.warn('FCM: _sendToGuardianIfEnabled failed for patient %s — %s', patientId, err.message);
  }
}

/**
 * Send an immediate care-plan summary push notification after consultation completion.
 * Lists all prescribed care tasks in a single notification. Informational — no action buttons.
 *
 * @param {string}   patientId  — Patient document _id
 * @param {string}   patientUserId — Patient's User _id (may be null for dependents)
 * @param {string}   doctorName
 * @param {string}   tenantSlug
 * @param {Array<{ title: string, frequency: string, taskType: string }>} tasks
 */
async function sendCareSummary(patientId, patientUserId, doctorName, tenantSlug, tasks) {
  if (!tasks || tasks.length === 0) return;

  const TASK_ICONS = { medication: '\uD83D\uDC8A', post_care: '\uD83E\uDE7A', custom: '\uD83D\uDCCB' };
  const lines = tasks.map((t) => {
    const icon = TASK_ICONS[t.taskType] || TASK_ICONS.custom;
    return `${icon} ${t.title} — ${t.frequency || 'as needed'}`;
  });
  const body = `Your care plan from Dr. ${doctorName}:\n${lines.join('\n')}`;

  const payload = {
    title: 'Your Care Plan',
    body,
    data: {
      type: 'care_summary',
      patientId: patientId ? patientId.toString() : '',
      taskCount: String(tasks.length),
      doctorName: doctorName || '',
    },
  };

  // Send to patient's own user if they have one
  if (patientUserId) {
    await sendToUser(patientUserId, tenantSlug, payload);
  }

  // Also notify guardian if configured
  if (patientId) {
    await _sendToGuardianIfEnabled(patientId, tenantSlug, payload);
  }
}

/**
 * Send an End-of-Day checklist push notification. Patient taps to open in-app checklist screen.
 *
 * @param {string}   userId     — Patient's User _id (may be null)
 * @param {string}   tenantSlug
 * @param {Object}   opts
 * @param {string}   opts.patientId
 * @param {string}   opts.date  — YYYY-MM-DD
 * @param {Array}    opts.tasks — [{ taskId, title, taskType, reminderIds }]
 */
async function sendEodChecklist(userId, tenantSlug, { patientId, date, tasks }) {
  if (!tasks || tasks.length === 0) return;

  const ICONS = { medication: '\uD83D\uDC8A', hygiene: '\uD83E\uDEB4', post_care: '\uD83E\uDE7A', dietary: '\uD83C\uDF4E', custom: '\uD83D\uDCCB' };
  const lines = tasks.map(t => `${ICONS[t.taskType] || ICONS.custom} ${t.title}`);
  const body = `You have ${tasks.length} care task${tasks.length > 1 ? 's' : ''} to review:\n${lines.join('\n')}`;

  const payload = {
    title: 'End-of-Day Care Checklist',
    body,
    data: {
      type: 'eod_checklist',
      patientId: patientId ? patientId.toString() : '',
      date: date || '',
      taskCount: String(tasks.length),
      tasks: JSON.stringify(tasks),
    },
  };

  if (userId) {
    await sendToUser(userId, tenantSlug, payload);
  }
  if (patientId) {
    await _sendToGuardianIfEnabled(patientId, tenantSlug, payload);
  }
}

/**
 * Send a push notification to the patient when their consultation has started.
 *
 * @param {string} userId       — Patient's User _id
 * @param {string} tenantSlug
 * @param {{ doctorName: string, appointmentId: string, treatmentId: string }} opts
 */
async function sendConsultationStarted(userId, tenantSlug, { doctorName, appointmentId, treatmentId }) {
  await sendToUser(userId, tenantSlug, {
    title: 'Consultation Started',
    body: `Dr. ${doctorName || 'Your doctor'} has started your consultation.`,
    data: {
      type: 'consultation_started',
      appointmentId: appointmentId ? appointmentId.toString() : '',
      treatmentId: treatmentId ? treatmentId.toString() : '',
      doctorName: doctorName || '',
    },
  });
}

module.exports = {
  sendToUser,
  sendToUsers,
  sendAppointmentReminder,
  sendCareReminder,
  sendIncomingCallAlert,
  sendEmergencyAlert,
  sendChatMessageAlert,
  sendCareSummary,
  sendEodChecklist,
  sendConsultationStarted,
  _sendToGuardianIfEnabled,
};
