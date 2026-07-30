'use strict';

/**
 * Report generation worker — generates clinic reports asynchronously.
 * Status tracked in Redis: report:job:<jobId>:status
 */

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

function createReportWorker() {
  const worker = new Worker(
    'reportGeneration',
    async (job) => {
      const { type, tenantSlug, params } = job.data;
      const redis = getRedis();
      const statusKey = `report:job:${job.id}:status`;

      await redis.set(statusKey, 'processing', 'EX', 3600);
      logger.info('Report worker: generating "%s" report (tenant: %s)', type, tenantSlug);

      const conn = await getTenantConnection(tenantSlug);
      let result;

      switch (type) {
        case 'clinical_summary':
          result = await _generateClinicalSummary(conn, params);
          break;
        case 'financial_summary':
          result = await _generateFinancialSummary(conn, params);
          break;
        case 'operational_summary':
          result = await _generateOperationalSummary(conn, params);
          break;
        default:
          throw new Error(`Unknown report type: "${type}"`);
      }

      await redis.set(statusKey, JSON.stringify({ status: 'completed', result }), 'EX', 3600);
      logger.info('Report worker: completed "%s" report', type);
      return result;
    },
    {
      connection: getRedis(),
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    logger.error('Report worker: job %s failed — %s', job?.id, err.message);
    const redis = getRedis();
    await redis.set(`report:job:${job?.id}:status`, JSON.stringify({ status: 'failed', error: err.message }), 'EX', 3600);
  });

  return worker;
}

// ── Report generators (stubs — implement in Phase 3) ──

async function _generateClinicalSummary(conn, _params) {
  const Patient = conn.model('Patient');
  const Appointment = conn.model('Appointment');
  const [totalPatients, totalAppointments] = await Promise.all([
    Patient.countDocuments(),
    Appointment.countDocuments(),
  ]);
  return { totalPatients, totalAppointments, generatedAt: new Date() };
}

async function _generateFinancialSummary(conn, _params) {
  const Invoice = conn.model('Invoice');
  const [total, paid] = await Promise.all([
    Invoice.countDocuments(),
    Invoice.countDocuments({ status: 'paid' }),
  ]);
  return { totalInvoices: total, paidInvoices: paid, generatedAt: new Date() };
}

async function _generateOperationalSummary(conn, _params) {
  const User = conn.model('User');
  const staffCount = await User.countDocuments({ role: { $ne: 'patient' } });
  return { staffCount, generatedAt: new Date() };
}

module.exports = createReportWorker;
