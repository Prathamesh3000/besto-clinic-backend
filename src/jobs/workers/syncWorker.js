'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const externalSyncService = require('../../services/externalSync.service');

const RATE_LIMIT_KEY_PREFIX = 'sync:ratelimit:';
const MAX_CALLS_PER_MINUTE = 30;

async function checkRateLimit(tenantSlug) {
  const redis = getRedis();
  const key = `${RATE_LIMIT_KEY_PREFIX}${tenantSlug}`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, 60);
  return current <= MAX_CALLS_PER_MINUTE;
}

function createSyncWorker() {
  const worker = new Worker(
    'sync',
    async (job) => {
      const { tenantSlug, integrationType, action, options } = job.data;

      logger.info('Sync worker: %s for %s/%s (job %s)',
        action, tenantSlug, integrationType, job.id);

      // Rate limit check
      const allowed = await checkRateLimit(tenantSlug);
      if (!allowed) {
        throw new Error(`Rate limit exceeded for tenant ${tenantSlug} — will retry`);
      }

      if (action === 'sync') {
        await externalSyncService.executeSync(tenantSlug, integrationType, options);
      }

      logger.info('Sync worker: completed job %s', job.id);
    },
    {
      connection: getRedis(),
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000, // max 10 sync jobs per minute globally
      },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Sync worker: job %s failed (attempt %d/%d) — %s',
      job?.id, job?.attemptsMade, job?.opts?.attempts, err.message);

    // Dead letter on final failure
    if (job?.attemptsMade >= (job?.opts?.attempts || 5)) {
      logger.error('Sync worker: job %s moved to DLQ after %d attempts', job.id, job.attemptsMade);
      const redis = getRedis();
      redis.lpush('sync:dlq', JSON.stringify({
        jobId: job.id,
        data: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
      })).catch(() => {});
    }
  });

  return worker;
}

module.exports = createSyncWorker;
