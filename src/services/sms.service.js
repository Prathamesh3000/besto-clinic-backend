'use strict';

/**
 * SMS service — stub for Phase 2 integration (Twilio, MSG91, etc.)
 *
 * Enforces smsEnabled and maxSmsPerMonth plan limits before sending.
 * In Phase 1, the actual send is a stub that logs and resolves.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Check SMS plan limits for a tenant before sending.
 * @param {string} tenantSlug
 * @returns {{ allowed: boolean, reason?: string }}
 */
async function _checkSmsQuota(tenantSlug) {
  if (!tenantSlug) return { allowed: true }; // no tenant context — allow (e.g. system-level OTP)

  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: tenantSlug })
    .select('features.smsEnabled features.maxSmsPerMonth usage.smsUsedThisMonth')
    .lean();

  if (!clinic) return { allowed: false, reason: 'Clinic not found' };

  if (!clinic.features?.smsEnabled) {
    return { allowed: false, reason: 'SMS is not enabled on your plan' };
  }

  const quota = clinic.features.maxSmsPerMonth || 0;
  const used = clinic.usage?.smsUsedThisMonth || 0;

  if (quota > 0 && used >= quota) {
    return { allowed: false, reason: 'Monthly SMS quota exceeded' };
  }

  return { allowed: true };
}

/**
 * Increment the SMS usage counter for a tenant.
 */
async function _incrementSmsUsage(tenantSlug) {
  if (!tenantSlug) return;
  const Clinic = mongoose.model('Clinic');
  await Clinic.findOneAndUpdate(
    { slug: tenantSlug },
    { $inc: { 'usage.smsUsedThisMonth': 1 } },
  );
}

async function sendSMS({ phone, message, tenantSlug }) {
  // Enforce plan limits
  const check = await _checkSmsQuota(tenantSlug);
  if (!check.allowed) {
    logger.warn('SMS blocked for %s: %s', tenantSlug, check.reason);
    return { success: false, reason: check.reason };
  }

  // TODO: integrate Twilio / MSG91 / AWS SNS
  logger.info('SMS [stub] → %s: %s', phone, message);

  // Track usage
  await _incrementSmsUsage(tenantSlug);

  return { success: true, provider: 'stub' };
}

async function sendAppointmentReminder({ phone, patientName, doctorName, scheduledAt, tenantSlug }) {
  const date = new Date(scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return sendSMS({
    phone,
    message: `Hi ${patientName}, reminder: your appointment with Dr. ${doctorName} is on ${date}. — BestoClinic`,
    tenantSlug,
  });
}

async function sendOTP({ phone, otp, tenantSlug }) {
  return sendSMS({
    phone,
    message: `Your BestoClinic verification code is ${otp}. Valid for 10 minutes. Do not share.`,
    tenantSlug,
  });
}

async function sendCheckInConfirmation({ phone, patientName, tokenNumber, doctorName, tenantSlug }) {
  return sendSMS({
    phone,
    message: `Hi ${patientName}, you've checked in successfully! Your token is #${tokenNumber}. Dr. ${doctorName} will see you shortly. — BestoClinic`,
    tenantSlug,
  });
}

async function sendPatientCalled({ phone, patientName, tokenNumber, roomCode, tenantSlug }) {
  const roomInfo = roomCode ? `Room ${roomCode}` : 'the reception';
  return sendSMS({
    phone,
    message: `Hi ${patientName}, it's your turn! Token #${tokenNumber}. Please proceed to ${roomInfo}. — BestoClinic`,
    tenantSlug,
  });
}

async function sendCareReminder({ phone, patientName, taskTitle, tenantSlug }) {
  return sendSMS({
    phone,
    message: `Hi ${patientName}, reminder: ${taskTitle}. Open BestoClinic app to mark as done. — BestoClinic`,
    tenantSlug,
  });
}

module.exports = {
  sendSMS,
  sendAppointmentReminder,
  sendOTP,
  sendCheckInConfirmation,
  sendPatientCalled,
  sendCareReminder,
};
