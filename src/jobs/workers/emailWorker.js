'use strict';

/**
 * Email worker — dispatches email jobs to the appropriate service function.
 * Job data must include { type, payload }.
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const emailService = require('../../services/email.service');

const DISPATCH = {
  verification:               emailService.sendVerificationEmail,
  'password-reset':           emailService.sendPasswordResetEmail,
  'staff-invite':             emailService.sendStaffInviteEmail,
  'invoice-overdue':          emailService.sendInvoiceOverdueNotice,
  'dental-scan-report':       emailService.sendDentalScanReport,
  'clinic-welcome':           emailService.sendClinicWelcomeEmail,
  'application-confirmation': emailService.sendApplicationConfirmationEmail,
  'new-application-notice':   emailService.sendNewApplicationNoticeEmail,
};

function createEmailWorker() {
  const worker = new Worker(
    'email',
    async (job) => {
      const { type, payload } = job.data;
      const handler = DISPATCH[type];

      if (!handler) {
        throw new Error(`Unknown email job type: "${type}"`);
      }

      logger.info('Email worker: processing "%s" job %s', type, job.id);
      await handler(payload);
      logger.info('Email worker: completed job %s', job.id);
    },
    {
      connection: getRedis(),
      concurrency: 5,
      drainDelay: 30_000, // 30s idle polling (default 5s) — reduces Redis commands
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Email worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createEmailWorker;
