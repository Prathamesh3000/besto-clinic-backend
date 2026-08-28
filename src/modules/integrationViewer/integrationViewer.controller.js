'use strict';

const integrationViewerService = require('./integrationViewer.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.listSyncLogs = async (req, res) => {
  const { items, total, page, limit } = await integrationViewerService.listSyncLogs(
    req.query,
    req.tenantSlug,
  );
  res.json(ApiResponse.paginated('Sync logs retrieved', items, { page, limit, total }));
};

exports.getSyncLogById = async (req, res) => {
  const syncLog = await integrationViewerService.getSyncLogById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Sync log retrieved', syncLog));
};

exports.getIntegrationStatus = async (req, res) => {
  const status = await integrationViewerService.getIntegrationStatus(req.tenantSlug);
  res.json(ApiResponse.success('Integration status retrieved', status));
};

exports.getPatientSyncedData = async (req, res) => {
  const data = await integrationViewerService.getPatientSyncedData(
    req.params.patientId,
    req.tenantSlug,
  );
  res.json(ApiResponse.success('Patient synced data retrieved', data));
};
