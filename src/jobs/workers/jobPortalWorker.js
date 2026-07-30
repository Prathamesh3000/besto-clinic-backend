'use strict';

/**
 * Job Portal Worker — handles:
 *   - monthly-credit-grant: Grant plan credits to eligible clinics (1st of month)
 *   - job-expiry-check: Close expired active listings (daily)
 */

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');

function createJobPortalWorker() {
  const worker = new Worker(
    'jobPortal',
    async (job) => {
      switch (job.name) {
        case 'monthly-credit-grant':
          return _handleMonthlyCredits();
        case 'job-expiry-check':
          return _handleJobExpiry();
        default:
          logger.warn('JobPortal worker: unknown job name: %s', job.name);
      }
    },
    { connection: getRedis(), concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error('JobPortal worker: job %s (%s) failed — %s', job?.id, job?.name, err.message);
  });

  return worker;
}

/**
 * Grant monthly plan credits to all eligible clinics.
 */
async function _handleMonthlyCredits() {
  logger.info('JobPortal: starting monthly credit grant');

  const Clinic = mongoose.model('Clinic');
  const creditService = require('../../services/credit.service');

  const clinics = await Clinic.find({
    status: 'active',
    'features.jobPortalEnabled': true,
    'features.jobPostingCredits': { $gt: 0 },
    deletedAt: null,
  }).select('_id slug features').lean();

  let granted = 0;

  for (const clinic of clinics) {
    try {
      await creditService.grantMonthlyCredits(clinic._id, clinic.features.jobPostingCredits);
      granted++;
      logger.debug('JobPortal: granted %d credits to %s', clinic.features.jobPostingCredits, clinic.slug);
    } catch (err) {
      logger.error('JobPortal: failed to grant credits to %s — %s', clinic.slug, err.message);
    }
  }

  logger.info('JobPortal: monthly credit grant complete — %d/%d clinics', granted, clinics.length);
  return { eligible: clinics.length, granted };
}

/**
 * Close expired active job listings.
 */
async function _handleJobExpiry() {
  logger.info('JobPortal: starting job expiry check');

  const JobPosting = mongoose.model('JobPosting');

  const result = await JobPosting.updateMany(
    {
      status: 'active',
      expiresAt: { $lte: new Date() },
    },
    {
      $set: { status: 'closed', closedAt: new Date() },
    },
  );

  logger.info('JobPortal: closed %d expired listings', result.modifiedCount);
  return { closed: result.modifiedCount };
}

module.exports = createJobPortalWorker;
