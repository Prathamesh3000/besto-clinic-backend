'use strict';

/**
 * External Sync Service — orchestrates integration lifecycle and data synchronization.
 *
 * Responsibilities:
 *  - CRUD for Integration config (platform DB)
 *  - Encrypted credential storage (tenant DB)
 *  - Connection testing via adapters
 *  - Data sync with deduplication (upsert by externalId+externalSource)
 *  - Sync log creation and querying
 *  - Cron job management for scheduled syncs
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { encrypt, decrypt } = require('../utils/encryption');
const { getTenantConnection } = require('../db/tenantConnectionManager');
const { getAdapter } = require('./adapters');
const dataMapper = require('./dataMapper.service');
const { parsePagination } = require('../utils/pagination');

const env = require('../config/env');
const Integration = () => mongoose.model('Integration');

// ─── Integration CRUD ────────────────────────────────

async function upsertIntegration(clinicSlug, data, performedBy) {
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const integration = await Integration().findOneAndUpdate(
    { clinicSlug, type: data.type },
    {
      clinic: clinic._id,
      clinicSlug,
      type: data.type,
      status: 'active',
      config: data.config,
      enabledBy: { userId: performedBy.userId, role: performedBy.role },
      enabledAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info('Integration upserted: %s/%s', clinicSlug, data.type);
  return integration;
}

async function getIntegration(clinicSlug, integrationType) {
  const integration = await Integration().findOne({ clinicSlug, type: integrationType });
  if (!integration) throw ApiError.notFound(`Integration "${integrationType}" not found for this clinic`);
  return integration;
}

async function listIntegrations(clinicSlug) {
  return Integration().find({ clinicSlug });
}

async function disableIntegration(clinicSlug, integrationType, performedBy) {
  const integration = await Integration().findOne({ clinicSlug, type: integrationType });
  if (!integration) throw ApiError.notFound(`Integration "${integrationType}" not found`);

  integration.status = 'inactive';
  integration.config.syncEnabled = false;
  integration.disabledAt = new Date();
  await integration.save();

  // Remove scheduled sync jobs
  try {
    const { syncQueue } = require('../jobs/queues');
    const repeatableJobs = await syncQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `cron:${clinicSlug}:${integrationType}`) {
        await syncQueue.removeRepeatableByKey(job.key);
      }
    }
  } catch (err) {
    logger.warn('Could not remove repeatable sync job: %s', err.message);
  }

  logger.info('Integration disabled: %s/%s by %s', clinicSlug, integrationType, performedBy.userId);
  return integration;
}

// ─── Credential Management ───────────────────────────

async function storeCredentials(clinicSlug, integrationType, credentials) {
  const conn = await getTenantConnection(clinicSlug);
  const IntegrationCredential = conn.model('IntegrationCredential');

  const update = {
    integrationType,
    authType: credentials.authType,
    isActive: true,
  };

  // Encrypt each credential field
  if (credentials.apiKey) {
    update.encryptedApiKey = encrypt(credentials.apiKey, env.APP_ENCRYPTION_KEY);
  }
  if (credentials.clientId) {
    update.encryptedClientId = encrypt(credentials.clientId, env.APP_ENCRYPTION_KEY);
  }
  if (credentials.clientSecret) {
    update.encryptedClientSecret = encrypt(credentials.clientSecret, env.APP_ENCRYPTION_KEY);
  }
  if (credentials.scopes) {
    update.scopes = credentials.scopes;
  }

  await IntegrationCredential.findOneAndUpdate(
    { integrationType },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info('Credentials stored for %s/%s (encrypted)', clinicSlug, integrationType);
}

/**
 * Retrieve and decrypt credentials for an integration.
 * @private
 */
async function _getDecryptedCredentials(clinicSlug, integrationType) {
  const conn = await getTenantConnection(clinicSlug);
  const IntegrationCredential = conn.model('IntegrationCredential');

  const cred = await IntegrationCredential.findOne({ integrationType, isActive: true })
    .select('+encryptedApiKey +encryptedClientId +encryptedClientSecret +encryptedAccessToken +encryptedRefreshToken');

  if (!cred) throw ApiError.notFound(`No credentials found for ${integrationType}`);

  const decrypted = { authType: cred.authType };

  if (cred.encryptedApiKey) {
    decrypted.apiKey = decrypt(cred.encryptedApiKey, env.APP_ENCRYPTION_KEY);
  }
  if (cred.encryptedClientId) {
    decrypted.clientId = decrypt(cred.encryptedClientId, env.APP_ENCRYPTION_KEY);
  }
  if (cred.encryptedClientSecret) {
    decrypted.clientSecret = decrypt(cred.encryptedClientSecret, env.APP_ENCRYPTION_KEY);
  }

  return decrypted;
}

// ─── Connection Testing ──────────────────────────────

async function testConnection(clinicSlug, integrationType) {
  const integration = await getIntegration(clinicSlug, integrationType);
  const credentials = await _getDecryptedCredentials(clinicSlug, integrationType);

  const AdapterClass = getAdapter(integrationType);
  const apiKey = credentials.apiKey || credentials.clientId;
  const adapter = new AdapterClass(integration.config, apiKey);

  const result = await adapter.testConnection();

  // Log test in tenant DB
  const conn = await getTenantConnection(clinicSlug);
  const SyncLog = conn.model('SyncLog');
  await SyncLog.create({
    integrationType,
    action: 'test_connection',
    status: result.success ? 'completed' : 'failed',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: result.latencyMs,
    triggeredBy: 'user',
    metadata: { message: result.message },
  });

  // Update credential test status
  const IntegrationCredential = conn.model('IntegrationCredential');
  await IntegrationCredential.findOneAndUpdate(
    { integrationType },
    { lastTestedAt: new Date(), lastTestResult: result.success ? 'success' : 'failed' },
  );

  return result;
}

// ─── Sync Execution ──────────────────────────────────

async function executeSync(clinicSlug, integrationType, options = {}) {
  const { fullSync = false, triggeredBy = 'system', triggeredByUserId } = options;

  const integration = await getIntegration(clinicSlug, integrationType);
  const credentials = await _getDecryptedCredentials(clinicSlug, integrationType);

  const AdapterClass = getAdapter(integrationType);
  const apiKey = credentials.apiKey || credentials.clientId;
  const adapter = new AdapterClass(integration.config, apiKey);

  const conn = await getTenantConnection(clinicSlug);
  const SyncLog = conn.model('SyncLog');
  const Patient = conn.model('Patient');

  // Create sync log entry
  const syncLog = await SyncLog.create({
    integrationType,
    action: fullSync ? 'sync_full' : 'sync_incremental',
    status: 'in_progress',
    recordType: 'mixed',
    triggeredBy,
    triggeredByUserId: triggeredByUserId || undefined,
  });

  const stats = { totalRecords: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const errors = [];
  const startTime = Date.now();

  try {
    // Determine since date for incremental sync
    const since = fullSync ? null : integration.config.lastSyncAt;

    // ─── Sync Patients ───────────────────────────
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await adapter.fetchPatients({ since, page, limit: 100 });

      for (const extPatient of result.patients) {
        stats.totalRecords++;

        try {
          // Map external data to internal schema
          const mapFn = integrationType === 'rioview'
            ? dataMapper.mapRioViewPatient
            : dataMapper.mapRomexisPatient;
          const mapped = mapFn(extPatient);

          // Validate
          const validation = dataMapper.validateMappedPatient(mapped);
          if (!validation.valid) {
            stats.skipped++;
            errors.push({
              externalId: mapped.externalId,
              message: validation.errors.join(', '),
              code: 'VALIDATION_FAILED',
            });
            continue;
          }

          // Upsert (deduplicate by externalId + externalSource)
          const existing = await Patient.findOne({
            externalId: mapped.externalId,
            externalSource: integrationType,
          });

          if (existing) {
            await Patient.findByIdAndUpdate(existing._id, {
              ...mapped,
              externalLastSyncAt: new Date(),
            });
            stats.updated++;
          } else {
            await Patient.create(mapped);
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
          errors.push({
            externalId: String(extPatient.id || extPatient.patientId || 'unknown'),
            message: err.message,
            code: 'SYNC_ERROR',
          });
        }
      }

      hasMore = result.hasMore;
      page++;

      // Safety: cap at 50 pages
      if (page > 50) break;
    }

    // ─── Sync Treatment Records ──────────────────
    // (similar pattern but linked to patient)
    page = 1;
    hasMore = true;
    const TreatmentRecord = conn.model('TreatmentRecord');

    while (hasMore) {
      const result = await adapter.fetchTreatmentRecords({ since, page, limit: 100 });

      for (const extRecord of result.records) {
        stats.totalRecords++;

        try {
          const extPatientId = String(extRecord.patientId || extRecord.patient_id || '');
          const internalPatient = extPatientId
            ? await Patient.findOne({ externalId: extPatientId, externalSource: integrationType })
            : null;

          if (!internalPatient) {
            stats.skipped++;
            errors.push({
              externalId: String(extRecord.id || extRecord.recordId || 'unknown'),
              message: `Patient not found for external ID: ${extPatientId}`,
              code: 'PATIENT_NOT_FOUND',
            });
            continue;
          }

          const mapFn = integrationType === 'rioview'
            ? dataMapper.mapRioViewTreatmentRecord
            : dataMapper.mapRomexisTreatmentRecord;
          const mapped = mapFn(extRecord, internalPatient._id);

          // Need a doctor reference — use a placeholder or skip if required
          // For synced records, doctor is optional
          const validation = dataMapper.validateMappedTreatmentRecord(mapped);
          if (!validation.valid) {
            stats.skipped++;
            errors.push({
              externalId: mapped.externalId,
              message: validation.errors.join(', '),
              code: 'VALIDATION_FAILED',
            });
            continue;
          }

          const existingRecord = await TreatmentRecord.findOne({
            externalId: mapped.externalId,
            externalSource: integrationType,
          });

          if (existingRecord) {
            await TreatmentRecord.findByIdAndUpdate(existingRecord._id, {
              ...mapped,
              externalLastSyncAt: new Date(),
            });
            stats.updated++;
          } else {
            await TreatmentRecord.create(mapped);
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
          errors.push({
            externalId: String(extRecord.id || extRecord.recordId || 'unknown'),
            message: err.message,
            code: 'SYNC_ERROR',
          });
        }
      }

      hasMore = result.hasMore;
      page++;
      if (page > 50) break;
    }

    // ─── Finalize ────────────────────────────────
    const finalStatus = errors.length > 0 && stats.created + stats.updated > 0 ? 'partial'
      : errors.length > 0 ? 'failed'
        : 'completed';

    syncLog.status = finalStatus;
    syncLog.stats = stats;
    syncLog.errors = errors.slice(0, 100); // cap stored errors
    syncLog.completedAt = new Date();
    syncLog.durationMs = Date.now() - startTime;
    await syncLog.save();

    // Update integration last sync info
    integration.config.lastSyncAt = new Date();
    integration.config.lastSyncStatus = finalStatus;
    integration.config.lastSyncRecordCount = stats.totalRecords;
    await integration.save();

    logger.info('Sync completed: %s/%s — created:%d updated:%d skipped:%d failed:%d (%dms)',
      clinicSlug, integrationType, stats.created, stats.updated, stats.skipped, stats.failed, syncLog.durationMs);

    return syncLog;
  } catch (err) {
    syncLog.status = 'failed';
    syncLog.errors = [{ message: err.message, code: 'FATAL_ERROR' }];
    syncLog.completedAt = new Date();
    syncLog.durationMs = Date.now() - startTime;
    await syncLog.save();

    integration.config.lastSyncStatus = 'failed';
    await integration.save();

    logger.error('Sync failed: %s/%s — %s', clinicSlug, integrationType, err.message);
    throw err;
  }
}

// ─── Sync Logs ───────────────────────────────────────

async function getSyncLogs(clinicSlug, query) {
  const conn = await getTenantConnection(clinicSlug);
  const SyncLog = conn.model('SyncLog');

  const { skip, limit, page } = parsePagination(query);
  const filter = {};

  if (query.integrationType) filter.integrationType = query.integrationType;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    SyncLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SyncLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

// ─── Cron Management ─────────────────────────────────

async function enableScheduledSync(clinicSlug, integrationType, intervalMinutes) {
  const { syncQueue } = require('../jobs/queues');

  await syncQueue.add(
    `cron-sync:${clinicSlug}:${integrationType}`,
    {
      tenantSlug: clinicSlug,
      integrationType,
      action: 'sync',
      options: { fullSync: false, triggeredBy: 'cron' },
    },
    {
      repeat: { every: intervalMinutes * 60 * 1000 },
      jobId: `cron_${clinicSlug}_${integrationType}`,
    },
  );

  logger.info('Scheduled sync enabled: %s/%s every %d min', clinicSlug, integrationType, intervalMinutes);
}

module.exports = {
  upsertIntegration,
  getIntegration,
  listIntegrations,
  disableIntegration,
  storeCredentials,
  testConnection,
  executeSync,
  getSyncLogs,
  enableScheduledSync,
};
