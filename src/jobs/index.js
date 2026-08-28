// 'use strict';

// /**
//  * Job worker bootstrap — starts and stops all BullMQ workers.
//  * Called by server.js during boot/shutdown lifecycle.
//  */

// const logger = require('../utils/logger');
// const createEmailWorker = require('./workers/emailWorker');
// const createAppointmentReminderWorker = require('./workers/appointmentReminderWorker');
// const createInvoiceWorker = require('./workers/invoiceWorker');
// const createReportWorker = require('./workers/reportWorker');
// const createSubscriptionLifecycleWorker = require('./workers/subscriptionLifecycleWorker');
// const createProvisioningWorker = require('./workers/provisioningWorker');
// const createSyncWorker = require('./workers/syncWorker');

// /** @type {import('bullmq').Worker[]} */
// let workers = [];

// function startWorkers() {
//   workers = [
//     createEmailWorker(),
//     createAppointmentReminderWorker(),
//     createInvoiceWorker(),
//     createReportWorker(),
//     createSubscriptionLifecycleWorker(),
//     createProvisioningWorker(),
//     createSyncWorker(),
//   ];
//   logger.info('Job workers started: %d workers', workers.length);
// }

// async function stopWorkers() {
//   await Promise.allSettled(workers.map((w) => w.close()));
//   workers = [];
//   logger.info('Job workers stopped');
// }

// /**
//  * Get stats for all job queues (for monitoring dashboard).
//  */
// async function getQueueStats() {
//   const stats = workers.map((w) => ({
//     name: w.name,
//     running: w.isRunning(),
//   }));
//   return { workers: stats, count: workers.length, available: true };
// }

// module.exports = { startWorkers, stopWorkers, getQueueStats };

'use strict';

/**
 * Job worker bootstrap — starts and stops all BullMQ workers.
 * Called by server.js during boot/shutdown lifecycle.
 */

const logger = require('../utils/logger');

/** @type {import('bullmq').Worker[]} */
let workers = [];

async function startWorkers() {
  // ⬇️ Lazy-load workers ONLY after Redis is connected
  //
  // ── CORE WORKERS (always active) ──────────────────────────
  // These handle user-facing or critical-path operations
  const createEmailWorker = require('./workers/emailWorker');
  const createDentalScanWorker = require('./workers/dentalScanAnalysisWorker');
  const createGuestScanWorker = require('./workers/guestScanWorker');
  const createProvisioningWorker = require('./workers/provisioningWorker');
  const createSubscriptionLifecycleWorker = require('./workers/subscriptionLifecycleWorker');

  // ── NOTIFICATION WORKERS (push notifications) ──────────────
  const createAppointmentReminderWorker = require('./workers/appointmentReminderWorker');
  const createAppointmentReminderScanWorker = require('./workers/appointmentReminderScanWorker');
  const createCareReminderWorker = require('./workers/careReminderWorker');
  const createCareReminderScanWorker = require('./workers/careReminderScanWorker');
  const createDependentMajorityScanWorker = require('./workers/dependentMajorityScanWorker');

  // ── DEFERRED WORKERS (disabled to reduce Redis commands) ──
  // Re-enable these when moving to production with dedicated Redis
  // const createInvoiceWorker = require('./workers/invoiceWorker');
  // const createReportWorker = require('./workers/reportWorker');
  // const createSyncWorker = require('./workers/syncWorker');
  // const createInventoryAlertWorker = require('./workers/inventoryAlertWorker');
  // const createRatingRefreshWorker = require('./workers/ratingRefreshWorker');
  const createAutoInvoiceWorker = require('./workers/autoInvoiceWorker');
  // const createComplianceAlertWorker = require('./workers/complianceAlertWorker');
  const createJobPortalWorker = require('./workers/jobPortalWorker');
  const createAutoNoShowScanWorker = require('./workers/autoNoShowScanWorker');

  workers = [
    // Core workers — user-facing operations
    createEmailWorker(),
    createDentalScanWorker(),
    createGuestScanWorker(),
    createProvisioningWorker(),
    createSubscriptionLifecycleWorker(),

    // Notification workers — push notifications
    createAppointmentReminderWorker(),
    createAppointmentReminderScanWorker(),
    createCareReminderWorker(),
    createCareReminderScanWorker(),
    createDependentMajorityScanWorker(),

    // Deferred workers — re-enable for production
    // createInvoiceWorker(),
    // createReportWorker(),
    // createSyncWorker(),
    // createInventoryAlertWorker(),
    // createRatingRefreshWorker(),
    createAutoInvoiceWorker(),
    // createComplianceAlertWorker(),

    // Job Portal
    createJobPortalWorker(),

    // Auto no-show detection
    createAutoNoShowScanWorker(),
  ];

  // Wait for all workers to connect to Redis before proceeding
  await Promise.all(workers.map((w) => w.waitUntilReady()));

  // Schedule repeatable subscription lifecycle check (every 4 hours)
  // Handles: trial expiry, grace period → suspension, scheduled downgrades
  const { subscriptionLifecycleQueue } = require('./queues');
  subscriptionLifecycleQueue.add(
    'subscription-lifecycle-check',
    {},
    {
      repeat: { every: 4 * 60 * 60 * 1000 }, // 4 hours (was 1 hour)
      jobId: 'subscription-lifecycle-repeatable',
    },
  ).catch((err) => {
    logger.error('Failed to schedule subscription lifecycle job: %s', err.message);
  });

  // Schedule repeatable appointment reminder scan (every 1 hour)
  const { appointmentReminderScanQueue } = require('./queues');
  appointmentReminderScanQueue.add(
    'appointment-reminder-scan',
    {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: 'appointment-reminder-scan-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule appointment reminder scan: %s', err.message);
  });

  // Schedule repeatable care reminder scan (every 2 hours)
  const { careReminderScanQueue } = require('./queues');
  careReminderScanQueue.add(
    'care-reminder-scan',
    {},
    { repeat: { every: 2 * 60 * 60 * 1000 }, jobId: 'care-reminder-scan-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule care reminder scan: %s', err.message);
  });

  // Schedule repeatable dependent-turns-18 scan (daily).
  // A birthday only needs catching once a day, and the job flags each dependent
  // so re-runs are cheap.
  const { dependentMajorityScanQueue } = require('./queues');
  dependentMajorityScanQueue.add(
    'dependent-majority-scan',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'dependent-majority-scan-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule dependent majority scan: %s', err.message);
  });

  // // Schedule repeatable inventory alert scan (every 6 hours)
  // const { inventoryAlertQueue } = require('./queues');
  // inventoryAlertQueue.add(
  //   'check-alerts',
  //   {},
  //   { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'inventory-alert-scan-repeatable' },
  // ).catch((err) => {
  //   logger.error('Failed to schedule inventory alert scan: %s', err.message);
  // });

  // // Schedule repeatable featured doctor rating refresh (every 4 hours)
  // const { ratingRefreshQueue } = require('./queues');
  // ratingRefreshQueue.add(
  //   'rating-refresh',
  //   {},
  //   { repeat: { every: 4 * 60 * 60 * 1000 }, jobId: 'rating-refresh-repeatable' },
  // ).catch((err) => {
  //   logger.error('Failed to schedule rating refresh job: %s', err.message);
  // });

  // Schedule repeatable job portal tasks
  const { jobPortalQueue } = require('./queues');
  jobPortalQueue.add(
    'job-expiry-check',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'job-expiry-check-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule job expiry check: %s', err.message);
  });

  // Schedule repeatable auto no-show scan (every 30 minutes)
  const { autoNoShowScanQueue } = require('./queues');
  autoNoShowScanQueue.add(
    'auto-noshow-scan',
    {},
    { repeat: { every: 30 * 60 * 1000 }, jobId: 'auto-noshow-scan-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule auto no-show scan: %s', err.message);
  });

  // Monthly credit grant — 1st of each month at midnight
  jobPortalQueue.add(
    'monthly-credit-grant',
    {},
    { repeat: { pattern: '0 0 1 * *' }, jobId: 'monthly-credit-grant-repeatable' },
  ).catch((err) => {
    logger.error('Failed to schedule monthly credit grant: %s', err.message);
  });

  logger.info('Job workers started: %d workers (6 deferred)', workers.length);
}

async function stopWorkers() {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers = [];
  logger.info('Job workers stopped');
}

/**
 * Get stats for all job queues (for monitoring dashboard).
 */
async function getQueueStats() {
  const stats = workers.map((w) => ({
    name: w.name,
    running: w.isRunning(),
  }));

  return {
    workers: stats,
    count: workers.length,
    available: true,
  };
}

module.exports = { startWorkers, stopWorkers, getQueueStats };