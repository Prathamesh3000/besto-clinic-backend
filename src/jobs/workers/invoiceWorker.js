'use strict';

/**
 * Invoice overdue worker — batch-scans overdue invoices and sends notices.
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const notificationService = require('../../services/notification.service');

function createInvoiceWorker() {
  const worker = new Worker(
    'invoiceOverdue',
    async (job) => {
      const { tenantSlug } = job.data;
      logger.info('Invoice worker: scanning overdue invoices (tenant: %s)', tenantSlug);

      const conn = await getTenantConnection(tenantSlug);
      const Invoice = conn.model('Invoice');
      const Patient = conn.model('Patient');

      const overdueInvoices = await Invoice.find({
        status: { $in: ['sent', 'overdue'] },
        dueDate: { $lt: new Date() },
        'overdueNotification.sent': { $ne: true },
      }).limit(500);

      let sent = 0;
      for (const invoice of overdueInvoices) {
        try {
          const patient = await Patient.findById(invoice.patient);
          if (!patient) continue;

          await notificationService.sendInvoiceOverdueNotice({ patient, invoice });

          invoice.status = 'overdue';
          invoice.overdueNotification.sent = true;
          invoice.overdueNotification.sentAt = new Date();
          await invoice.save();
          sent++;
        } catch (err) {
          logger.error('Invoice worker: error for invoice %s — %s', invoice.invoiceNumber, err.message);
        }
      }

      logger.info('Invoice worker: sent %d overdue notices (tenant: %s)', sent, tenantSlug);
    },
    {
      connection: getRedis(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Invoice worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createInvoiceWorker;
