'use strict';

/**
 * Rating Refresh Worker — periodically refreshes averageRating + totalReviews
 * for all active FeaturedDoctor entries in the platform DB.
 *
 * Handles 'rating-refresh' jobs from the ratingRefreshQueue.
 * Scheduled as a repeatable job every 4 hours.
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { refreshAllRatings } = require('../../modules/featuredDoctor/featuredDoctor.service');

module.exports = function createRatingRefreshWorker() {
  const worker = new Worker(
    'ratingRefresh',
    async (job) => {
      logger.info('[ratingRefresh] Job %s started', job.id);
      await refreshAllRatings();
      logger.info('[ratingRefresh] Job %s completed', job.id);
    },
    {
      connection: getRedis(),
      concurrency: 1,
      limiter: { max: 1, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('[ratingRefresh] Job %s failed: %s', job?.id, err.message);
  });

  return worker;
};
