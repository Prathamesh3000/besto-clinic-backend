'use strict';

/**
 * BullMQ queue definitions — one Queue per job domain.
 * Workers are registered in ./workers/ and bootstrapped by ./index.js.
 *
 * Uses lazy singleton pattern — queues are created on first access (after
 * Redis is connected) and cached for all subsequent imports.
 *
 * Consumers can destructure directly:
 *   const { provisioningQueue } = require('./queues');
 */

const { Queue } = require('bullmq');
const { getRedis } = require('../config/redis');

/** @type {ReturnType<typeof _createQueues> | null} */
let _queues = null;

function _getQueues() {
  if (!_queues) _queues = _createQueues();
  return _queues;
}

function _createQueues() {
  const connection = getRedis();

  return {
    // ── Retention counts reduced to lower Redis storage/cleanup overhead ──
    // Bump these back up when moving to dedicated Redis in production

    emailQueue: new Queue('email', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    }),

    appointmentReminderQueue: new Queue('appointmentReminder', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    invoiceOverdueQueue: new Queue('invoiceOverdue', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    reportGenerationQueue: new Queue('reportGeneration', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),

    auditArchivalQueue: new Queue('auditArchival', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    subscriptionLifecycleQueue: new Queue('subscriptionLifecycle', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),

    provisioningQueue: new Queue('provisioning', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    syncQueue: new Queue('sync', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    }),

    appointmentReminderScanQueue: new Queue('appointmentReminderScan', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),

    careReminderQueue: new Queue('careReminder', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    }),

    careReminderScanQueue: new Queue('careReminderScan', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),

    inventoryAlertQueue: new Queue('inventoryAlert', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    dentalScanQueue: new Queue('dentalScan', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 50 },
      },
    }),

    guestScanQueue: new Queue('guestScan', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 50 },
      },
    }),

    autoInvoiceQueue: new Queue('autoInvoice', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    complianceAlertQueue: new Queue('complianceAlert', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    ratingRefreshQueue: new Queue('ratingRefresh', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),

    jobPortalQueue: new Queue('jobPortal', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    }),

    autoNoShowScanQueue: new Queue('autoNoShowScan', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    }),
  };
}

// Named getter exports — enables `const { provisioningQueue } = require('./queues')`
// Queues are lazily initialized on first access (after Redis is connected).
module.exports = {
  createQueues: _getQueues,
  get emailQueue() { return _getQueues().emailQueue; },
  get appointmentReminderQueue() { return _getQueues().appointmentReminderQueue; },
  get invoiceOverdueQueue() { return _getQueues().invoiceOverdueQueue; },
  get reportGenerationQueue() { return _getQueues().reportGenerationQueue; },
  get auditArchivalQueue() { return _getQueues().auditArchivalQueue; },
  get subscriptionLifecycleQueue() { return _getQueues().subscriptionLifecycleQueue; },
  get provisioningQueue() { return _getQueues().provisioningQueue; },
  get syncQueue() { return _getQueues().syncQueue; },
  get appointmentReminderScanQueue() { return _getQueues().appointmentReminderScanQueue; },
  get dentalScanQueue() { return _getQueues().dentalScanQueue; },
  get careReminderQueue() { return _getQueues().careReminderQueue; },
  get careReminderScanQueue() { return _getQueues().careReminderScanQueue; },
  get inventoryAlertQueue() { return _getQueues().inventoryAlertQueue; },
  get guestScanQueue() { return _getQueues().guestScanQueue; },
  get autoInvoiceQueue() { return _getQueues().autoInvoiceQueue; },
  get complianceAlertQueue() { return _getQueues().complianceAlertQueue; },
  get ratingRefreshQueue() { return _getQueues().ratingRefreshQueue; },
  get jobPortalQueue() { return _getQueues().jobPortalQueue; },
  get autoNoShowScanQueue() { return _getQueues().autoNoShowScanQueue; },
};
