'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const provisionService = require('../../services/tenantProvision.service');

function createProvisioningWorker() {
  const worker = new Worker(
    'provisioning',
    async (job) => {
      const { provisioningId, action } = job.data;
      logger.info('Provisioning worker: processing %s (job %s)', action, job.id);

      if (action === 'provision') {
        await provisionService.executeProvisioning(provisioningId);
      } else if (action === 'rollback') {
        await provisionService.rollbackProvisioning(provisioningId);
      }

      logger.info('Provisioning worker: completed job %s', job.id);
    },
    {
      connection: getRedis(),
      concurrency: 2,
      drainDelay: 30_000, // 30s idle polling (default 5s) — reduces Redis commands
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Provisioning worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createProvisioningWorker;
