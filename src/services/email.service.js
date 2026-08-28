'use strict';

/**
 * Email service — wraps nodemailer transporter.
 * All outbound emails go through these functions.
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let _transporter = null;

function _getTransporter() {
  if (_transporter) return _transporter;

  const env = require('../config/env');
  _transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: Number(env.SMTP_PORT) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  return _transporter;
}

/**
 * Allowed email domains — only these receive real emails.
 * All other addresses are silently blocked and logged.
 * Add your own domain(s) here when you have real users.
 */
const ALLOWED_DOMAINS = [
  'bestoclinic.com',
  'jathardental.in',
];

function _isAllowedRecipient(email) {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} opts.text
 * @param {boolean} [opts.skipDomainCheck] - bypass ALLOWED_DOMAINS for
 *   transactional emails to external recipients (e.g. job applicants)
 */
async function _send({ to, subject, html, text, skipDomainCheck = false }) {
  if (!skipDomainCheck && !_isAllowedRecipient(to)) {
    logger.warn('EMAIL BLOCKED (not in allowed domains): %s → %s', subject, to);
    return { messageId: 'blocked', blocked: true };
  }

  const env = require('../config/env');
  const info = await _getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
    text,
  });
  logger.info('Email sent: %s → %s (messageId: %s)', subject, to, info.messageId);
  return info;
}

async function sendVerificationEmail({ email, name, verificationUrl }) {
  return _send({
    to: email,
    subject: 'Verify your BestoClinic account',
    html: `<p>Hi ${name},</p><p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
    text: `Hi ${name}, verify your email: ${verificationUrl}`,
  });
}

async function sendPasswordResetEmail({ email, name, resetUrl }) {
  return _send({
    to: email,
    subject: 'Reset your BestoClinic password',
    html: `<p>Hi ${name},</p><p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 30 minutes.</p>`,
    text: `Hi ${name}, reset your password: ${resetUrl}`,
  });
}

async function sendStaffInviteEmail({ email, name, clinicName, inviteUrl }) {
  return _send({
    to: email,
    subject: `You've been invited to ${clinicName} on BestoClinic`,
    html: `<p>Hi ${name},</p><p>You've been invited to join ${clinicName}. Click <a href="${inviteUrl}">here</a> to accept.</p>`,
    text: `Hi ${name}, join ${clinicName}: ${inviteUrl}`,
  });
}

async function sendInvoiceOverdueNotice({ email, name, invoiceNumber, totalAmount, dueDate }) {
  const due = new Date(dueDate).toLocaleDateString('en-IN', { dateStyle: 'long' });
  return _send({
    to: email,
    subject: `Invoice ${invoiceNumber} is overdue — BestoClinic`,
    html: `<p>Hi ${name},</p><p>Invoice <strong>${invoiceNumber}</strong> for ₹${totalAmount} was due on ${due}. Please settle at your earliest convenience.</p>`,
    text: `Hi ${name}, invoice ${invoiceNumber} (₹${totalAmount}) overdue since ${due}.`,
  });
}

async function sendDentalScanReport({ email, name, pdfBuffer, reportId }) {
  if (!_isAllowedRecipient(email)) {
    logger.warn('EMAIL BLOCKED (not in allowed domains): dental-scan-report → %s', email);
    return { messageId: 'blocked', blocked: true };
  }

  const env = require('../config/env');
  const buffer = typeof pdfBuffer === 'string' ? Buffer.from(pdfBuffer, 'base64') : pdfBuffer;

  const info = await _getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: `Your BestoClinic Dental Scan Report (${reportId})`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #14b8a6; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">BestoClinic</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">AI Dental Scan Report</p>
      </div>
      <div style="padding: 28px 24px; background: #fefcf9; border: 1px solid #ede5db; border-top: none;">
        <p style="font-size: 15px; color: #0f172a;">Hi ${name},</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">Thank you for using BestoClinic's AI Dental Scanner! Your scan report is attached as a PDF.</p>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
          <p style="margin: 0; font-size: 13px; color: #166534;"><strong>Report ID:</strong> ${reportId}</p>
        </div>
        <p style="font-size: 14px; color: #475569;">We recommend scheduling a visit with a dental professional to discuss the findings.</p>
        <hr style="border: none; border-top: 1px solid #ede5db; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
          <em>This is a preliminary AI assessment only. It is not a professional diagnosis.
          Please consult a licensed dentist for accurate evaluation and treatment.</em>
        </p>
      </div>
    </div>`,
    text: `Hi ${name}, your BestoClinic dental scan report (${reportId}) is attached. This is a preliminary AI assessment — please consult a dentist.`,
    attachments: [
      {
        filename: `BestoClinic-DentalScan-${reportId}.pdf`,
        content: buffer,
        contentType: 'application/pdf',
      },
    ],
  });

  logger.info('Dental scan report sent: %s → %s (messageId: %s)', reportId, email, info.messageId);
  return info;
}

/**
 * Welcome email sent after successful clinic provisioning.
 * Contains clinic code, QR deep link, and login URL.
 */
/**
 * @param {string} [tempPassword] — the generated SuperAdmin password. Omitted for
 *   self-service signups, where the owner set their own during registration.
 */
async function sendClinicWelcomeEmail({ email, name, clinicName, clinicCode, loginUrl, tempPassword }) {
  const deepLink = `bestoclinic://clinic/${clinicCode}`;

  // Only rendered when the password was generated for them — otherwise the block
  // is omitted rather than showing an empty credentials box.
  const credentialsBlock = tempPassword
    ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 20px; margin: 0 0 24px;">
          <p style="font-size: 12px; color: #166534; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Your Sign-In Details</p>
          <p style="font-size: 13px; color: #374151; margin: 0 0 6px;"><strong>Email:</strong> ${email}</p>
          <p style="font-size: 13px; color: #374151; margin: 0 0 12px;"><strong>Temporary password:</strong>
            <code style="background: #ffffff; border: 1px solid #d1d5db; border-radius: 4px; padding: 3px 8px; font-size: 14px; color: #111827; letter-spacing: 1px;">${tempPassword}</code>
          </p>
          <p style="font-size: 12px; color: #15803d; margin: 0; line-height: 1.5;">
            Please change this password immediately after your first sign-in.
          </p>
        </div>`
    : '';

  return _send({
    to: email,
    subject: `Welcome to BestoClinic — Your clinic "${clinicName}" is ready!`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #2E5FA2 0%, #1a4278 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">BestoClinic</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Your clinic is live and ready to go</p>
      </div>

      <div style="padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-bottom: none;">
        <p style="font-size: 16px; color: #111827; margin: 0 0 8px;">Hi ${name},</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
          Congratulations! <strong>${clinicName}</strong> has been successfully set up on BestoClinic. Your clinic is now active and ready to accept patients.
        </p>

        <div style="background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 20px; margin: 0 0 24px; text-align: center;">
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Your Clinic Code</p>
          <p style="font-size: 32px; color: #2E5FA2; margin: 0; font-weight: 800; letter-spacing: 3px; font-family: 'SF Mono', 'Fira Code', monospace;">${clinicCode}</p>
          <p style="font-size: 12px; color: #6b7280; margin: 8px 0 0;">Share this code with your staff so they can log in</p>
        </div>

        ${credentialsBlock}

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin: 0 0 24px;">
          <p style="font-size: 13px; color: #374151; margin: 0 0 12px; font-weight: 600;">QR Code Deep Link</p>
          <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin: 0 0 8px;">
            Patients can scan your clinic's QR code to connect instantly. You can view, download, and print your QR code from your dashboard.
          </p>
          <code style="display: block; background: #ffffff; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #2E5FA2; word-break: break-all;">${deepLink}</code>
        </div>

        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${loginUrl}" style="display: inline-block; background: #2E5FA2; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">Log In to Your Dashboard</a>
        </div>

        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; margin: 0 0 16px;">
          <p style="font-size: 13px; color: #92400e; margin: 0; line-height: 1.5;">
            <strong>Next steps:</strong> Log in and set up your departments, add doctors and staff, configure your schedule, and start accepting appointments.
          </p>
        </div>
      </div>

      <div style="padding: 20px 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="font-size: 11px; color: #9ca3af; margin: 0; line-height: 1.5;">
          You're receiving this because you registered ${clinicName} on BestoClinic.<br/>
          If you didn't initiate this, please contact support immediately.
        </p>
      </div>
    </div>`,
    text: `Hi ${name},

Congratulations! ${clinicName} has been successfully set up on BestoClinic.

Your Clinic Code: ${clinicCode}
Share this code with your staff so they can log in.

QR Deep Link: ${deepLink}
Patients can scan your clinic's QR code to connect instantly.

Log in to your dashboard: ${loginUrl}

Next steps: Set up departments, add doctors and staff, configure your schedule, and start accepting appointments.`,
  });
}

/**
 * Confirmation email sent to a job applicant after they submit an application.
 * Bypasses the domain whitelist — candidates use external email providers.
 */
async function sendApplicationConfirmationEmail({ email, name, jobTitle, clinicName }) {
  return _send({
    to: email,
    subject: `Application Received — ${jobTitle}`,
    skipDomainCheck: true,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0f172a; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">BestoClinic</h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Career Portal</p>
      </div>
      <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 15px; color: #111827; margin: 0 0 8px;">Hi ${name},</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 20px;">
          Thank you for applying! We've received your application for the following position:
        </p>
        <div style="background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="font-size: 16px; color: #1e40af; margin: 0 0 4px; font-weight: 600;">${jobTitle}</p>
          <p style="font-size: 13px; color: #6b7280; margin: 0;">at ${clinicName}</p>
        </div>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
          The hiring team will review your application and reach out if your profile is a match. Please allow some time for the review process.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 11px; color: #9ca3af; line-height: 1.5; margin: 0;">
          This is an automated confirmation from BestoClinic. If you did not apply for this position, please disregard this email.
        </p>
      </div>
    </div>`,
    text: `Hi ${name},\n\nThank you for applying! We've received your application for "${jobTitle}" at ${clinicName}.\n\nThe hiring team will review your application and reach out if your profile is a match.\n\n— BestoClinic`,
  });
}

/**
 * Notification email sent to the clinic admin when a new application arrives.
 */
async function sendNewApplicationNoticeEmail({ email, clinicName, jobTitle, applicantName, applicantEmail, dashboardUrl }) {
  return _send({
    to: email,
    subject: `New applicant for ${jobTitle} — ${applicantName}`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0f172a; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">BestoClinic</h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Job Portal</p>
      </div>
      <div style="padding: 28px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 15px; color: #111827; margin: 0 0 8px;">Hi ${clinicName} team,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 20px;">
          A new application has been submitted for one of your job postings:
        </p>
        <div style="background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="font-size: 16px; color: #1e40af; margin: 0 0 4px; font-weight: 600;">${jobTitle}</p>
          <table style="width: 100%; margin-top: 12px; border-collapse: collapse;">
            <tr>
              <td style="font-size: 12px; color: #6b7280; padding: 4px 0;">Applicant</td>
              <td style="font-size: 14px; color: #111827; padding: 4px 0; font-weight: 500;">${applicantName}</td>
            </tr>
            <tr>
              <td style="font-size: 12px; color: #6b7280; padding: 4px 0;">Email</td>
              <td style="font-size: 14px; color: #111827; padding: 4px 0;"><a href="mailto:${applicantEmail}" style="color: #2563eb; text-decoration: none;">${applicantEmail}</a></td>
            </tr>
          </table>
        </div>
        ${dashboardUrl ? `<div style="text-align: center; margin: 0 0 20px;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #2E5FA2; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Application</a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 11px; color: #9ca3af; line-height: 1.5; margin: 0;">
          You're receiving this because your clinic has an active job posting on BestoClinic.
        </p>
      </div>
    </div>`,
    text: `New application for "${jobTitle}" at ${clinicName}.\n\nApplicant: ${applicantName}\nEmail: ${applicantEmail}\n\n${dashboardUrl ? `View: ${dashboardUrl}` : ''}\n\n— BestoClinic Job Portal`,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStaffInviteEmail,
  sendInvoiceOverdueNotice,
  sendDentalScanReport,
  sendClinicWelcomeEmail,
  sendApplicationConfirmationEmail,
  sendNewApplicationNoticeEmail,
};
