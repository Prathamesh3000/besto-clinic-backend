'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { analyzeDentalImage } = require('../../services/aiAnalysis.service');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { DENTAL_SCAN_STATUS } = require('../../config/constants');

function createDentalScanWorker() {
  const worker = new Worker(
    'dentalScan',
    async (job) => {
      const { scanId, tenantSlug, base64Image, mimeType, patientUserId } = job.data;

      logger.info('DentalScan worker: processing scan %s for tenant %s (job %s)',
        scanId, tenantSlug, job.id);

      const conn = await getTenantConnection(tenantSlug);
      const DentalScan = conn.model('DentalScan');

      // Mark as processing
      await DentalScan.findByIdAndUpdate(scanId, {
        status: DENTAL_SCAN_STATUS.PROCESSING,
      });

      try {
        // Call Gemini AI
        const result = await analyzeDentalImage(base64Image, mimeType);

        // Update scan with AI results
        await DentalScan.findByIdAndUpdate(scanId, {
          status: DENTAL_SCAN_STATUS.PENDING_REVIEW,
          aiAnalysis: {
            findings: result.findings,
            summary: result.summary,
            rawResponse: result.rawResponse,
            analyzedAt: new Date(),
            modelVersion: result.modelVersion,
            processingMs: result.processingMs,
          },
        });

        // Notify patient that AI analysis is ready
        if (patientUserId) {
          await notifyAndEmit({
            recipient: patientUserId,
            title: 'Scan Analysis Ready',
            message: 'Your dental scan has been analyzed. A doctor will review the results shortly.',
            type: 'dental_scan',
            metadata: { scanId },
          }, tenantSlug);
        }

        // Notify doctors that a scan needs review
        const User = conn.model('User');
        const doctors = await User.find({
          role: { $in: ['doctor', 'admin', 'super_admin'] },
          isActive: true,
          deletedAt: null,
        }).select('_id').lean();

        for (const doc of doctors) {
          await notifyAndEmit({
            recipient: doc._id,
            title: 'Dental Scan Needs Review',
            message: 'A new AI dental scan analysis is ready for your professional review.',
            type: 'dental_scan',
            metadata: { scanId },
          }, tenantSlug);
        }

        logger.info('DentalScan worker: completed scan %s (%dms AI processing)',
          scanId, result.processingMs);
      } catch (err) {
        // Mark as failed
        await DentalScan.findByIdAndUpdate(scanId, {
          status: DENTAL_SCAN_STATUS.FAILED,
          errorMessage: err.message,
          $inc: { retryCount: 1 },
        });

        // Notify patient of failure on final attempt
        if (job.attemptsMade >= (job.opts.attempts || 3) - 1 && patientUserId) {
          await notifyAndEmit({
            recipient: patientUserId,
            title: 'Scan Analysis Failed',
            message: 'We could not analyze your dental scan. Please try again or contact the clinic.',
            type: 'dental_scan',
            metadata: { scanId },
          }, tenantSlug);
        }

        throw err; // Let BullMQ retry
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('DentalScan worker: job %s failed (attempt %d/%d) — %s',
      job?.id, job?.attemptsMade, job?.opts?.attempts, err.message);
  });

  return worker;
}

module.exports = createDentalScanWorker;
