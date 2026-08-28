'use strict';

/**
 * SMS service — NO PROVIDER IS INTEGRATED.
 *
 * Every function here returns `{ success: false, delivered: false, reason }`
 * until one is. That is deliberate: this module used to log the message, return
 * `{ success: true }` and increment the clinic's paid SMS quota, so a clinic
 * watched its monthly allowance deplete and concluded delivery was working while
 * nothing was sent. Callers treated the truthy result as proof of delivery.
 *
 * The unconfigured state is declared in src/config/stubs.js, so it appears in
 * the boot report, on /monitoring, and on the clinic settings screen rather than
 * only in this file's comments.
 *
 * When a provider is wired: implement _dispatch(), flip `sms.configured` in
 * stubs.js, and the quota accounting below starts applying again.
 *
 * See docs/BestoClinic_Defect_Register.docx §2.5.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { isConfigured } = require('../config/stubs');

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
  // No provider — say so, and do NOT touch the quota. Charging a clinic for a
  // message that was never sent is what made this defect invisible.
  if (!isConfigured('sms')) {
    logger.warn(
      'SMS not sent — no provider is configured (tenant: %s, to: %s)',
      tenantSlug, _maskPhone(phone),
    );
    return {
      success: false,
      delivered: false,
      reason: 'SMS provider is not configured',
    };
  }

  // Enforce plan limits
  const check = await _checkSmsQuota(tenantSlug);
  if (!check.allowed) {
    logger.warn('SMS blocked for %s: %s', tenantSlug, check.reason);
    return { success: false, delivered: false, reason: check.reason };
  }

  const result = await _dispatch({ phone, message });
  if (!result.delivered) {
    return { success: false, delivered: false, reason: result.reason };
  }

  // Only a real send consumes quota.
  await _incrementSmsUsage(tenantSlug);

  return { success: true, delivered: true, provider: result.provider };
}

/**
 * Hand the message to the provider. Unreachable until stubs.js reports SMS as
 * configured; throwing rather than returning keeps a half-finished integration
 * from silently resurrecting the old always-succeeds behaviour.
 */
async function _dispatch(/* { phone, message } */) {
  throw new Error(
    'sms._dispatch() is not implemented — stubs.js reports SMS as configured, '
    + 'but no provider client exists. Implement the provider or set sms.configured=false.',
  );
}

/** Last four digits only — full numbers should not reach the logs. */
function _maskPhone(phone) {
  const str = String(phone || '');
  return str.length > 4 ? `••••${str.slice(-4)}` : '••••';
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
