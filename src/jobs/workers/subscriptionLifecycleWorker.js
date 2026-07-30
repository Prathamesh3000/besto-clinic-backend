'use strict';

/**
 * Subscription lifecycle worker — processes trial expirations, grace period
 * suspensions, and other automated subscription state transitions.
 *
 * Runs as a repeatable BullMQ job (every hour by default).
 * Uses the state machine's transition() method for all status changes,
 * ensuring audit trail integrity.
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { processSubscriptionLifecycle } = require('../../modules/subscription/subscription.service');

function createSubscriptionLifecycleWorker() {
  const worker = new Worker(
    'subscriptionLifecycle',
    async (job) => {
      logger.info('Running subscription lifecycle check (job %s)', job.id);

      const result = await processSubscriptionLifecycle();

      logger.info(
        'Subscription lifecycle complete — expired trials: %d, suspended grace: %d, downgrades: %d, deactivated promos: %d, errors: %d',
        result.expiredTrials,
        result.suspendedGracePeriod,
        result.appliedDowngrades,
        result.deactivatedPromotions,
        result.errors.length,
      );

      if (result.errors.length > 0) {
        logger.warn('Lifecycle errors: %j', result.errors);
      }

      return result;
    },
    {
      connection: getRedis(),
      concurrency: 1, // only one lifecycle check at a time
      drainDelay: 30_000, // 30s idle polling (default 5s) — reduces Redis commands
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Subscription lifecycle job %s failed: %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createSubscriptionLifecycleWorker;
