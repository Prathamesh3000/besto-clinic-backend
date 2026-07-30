'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

/**
 * List sync logs with pagination and optional filters.
 *
 * @param {object} query - { integrationType?, status?, startDate?, endDate?, page?, limit? }
 * @param {string} tenantSlug
 */
async function listSyncLogs(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SyncLog = conn.model('SyncLog');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.integrationType) filter.integrationType = query.integrationType;
  if (query.status) filter.status = query.status;

  if (query.startDate || query.endDate) {
    filter.startedAt = {};
    if (query.startDate) filter.startedAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.startedAt.$lte = new Date(query.endDate);
  }

  const [items, total] = await Promise.all([
    SyncLog.find(filter).sort(sort).skip(skip).limit(limit),
    SyncLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get a single sync log by ID.
 *
 * @param {string} id - SyncLog ObjectId
 * @param {string} tenantSlug
 */
async function getSyncLogById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SyncLog = conn.model('SyncLog');

  const syncLog = await SyncLog.findById(id);
  if (!syncLog) throw ApiError.notFound('Sync log not found');

  return syncLog;
}

/**
 * Get integration status summary — which integrations are active and their last sync time.
 *
 * @param {string} tenantSlug
 */
async function getIntegrationStatus(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const IntegrationCredential = conn.model('IntegrationCredential');
  const SyncLog = conn.model('SyncLog');

  const credentials = await IntegrationCredential.find().lean();

  const integrations = await Promise.all(
    credentials.map(async (cred) => {
      // Find the most recent completed sync for this integration type
      const lastSync = await SyncLog.findOne({
        integrationType: cred.integrationType,
        status: { $in: ['completed', 'partial'] },
      })
        .sort({ completedAt: -1 })
        .select('completedAt')
        .lean();

      return {
        provider: cred.integrationType,
        isActive: cred.isActive,
        lastSyncAt: lastSync ? lastSync.completedAt : null,
      };
    }),
  );

  return { integrations };
}

/**
 * Get synced data (sync log entries) related to a specific patient.
 *
 * Searches SyncLog metadata for records containing the given patientId.
 * Returns matching sync records sorted by most recent first.
 *
 * @param {string} patientId - Patient ObjectId
 * @param {string} tenantSlug
 */
async function getPatientSyncedData(patientId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SyncLog = conn.model('SyncLog');
  const Patient = conn.model('Patient');

  // Verify the patient exists
  const patient = await Patient.findById(patientId).lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  // Build filter: look for sync logs that reference this patient
  // Patient data may appear in metadata or be linked via externalId
  const filter = {
    $or: [
      { 'metadata.patientId': patientId },
      { 'metadata.patientIds': patientId },
    ],
  };

  // If patient has an externalId, also search by that
  if (patient.externalId) {
    filter.$or.push({ 'metadata.externalId': patient.externalId });
    filter.$or.push({ 'metadata.externalIds': patient.externalId });
  }

  // Also search for sync logs matching the patient's external source
  if (patient.externalSource) {
    filter.$or.push({
      integrationType: patient.externalSource,
      recordType: 'patient',
    });
  }

  const syncLogs = await SyncLog.find(filter).sort({ startedAt: -1 }).lean();

  return syncLogs;
}

module.exports = {
  listSyncLogs,
  getSyncLogById,
  getIntegrationStatus,
  getPatientSyncedData,
};
