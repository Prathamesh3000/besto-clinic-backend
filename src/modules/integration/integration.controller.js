'use strict';

const externalSyncService = require('../../services/externalSync.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.listIntegrations = async (req, res) => {
  const integrations = await externalSyncService.listIntegrations(req.tenantSlug);
  res.json(ApiResponse.success('Integrations retrieved', integrations));
};

exports.getIntegration = async (req, res) => {
  const integration = await externalSyncService.getIntegration(req.tenantSlug, req.params.type);
  res.json(ApiResponse.success('Integration retrieved', integration));
};

exports.upsertIntegration = async (req, res) => {
  const result = await externalSyncService.upsertIntegration(
    req.tenantSlug,
    req.body,
    { userId: req.user.userId, role: req.user.role },
  );

  // If sync is enabled, set up scheduled sync
  if (req.body.config?.syncEnabled && req.body.config?.syncInterval) {
    await externalSyncService.enableScheduledSync(
      req.tenantSlug,
      req.body.type,
      req.body.config.syncInterval,
    );
  }

  res.status(201).json(ApiResponse.created('Integration configured', result));
};

exports.storeCredentials = async (req, res) => {
  await externalSyncService.storeCredentials(req.tenantSlug, req.params.type, req.body);
  res.json(ApiResponse.success('Credentials stored securely'));
};

exports.testConnection = async (req, res) => {
  const result = await externalSyncService.testConnection(req.tenantSlug, req.params.type);
  res.json(ApiResponse.success('Connection test result', result));
};

exports.triggerSync = async (req, res) => {
  const result = await externalSyncService.executeSync(
    req.tenantSlug,
    req.params.type,
    {
      fullSync: req.body.fullSync || false,
      triggeredBy: 'user',
      triggeredByUserId: req.user.userId,
    },
  );
  res.json(ApiResponse.success('Sync triggered', result));
};

exports.disableIntegration = async (req, res) => {
  await externalSyncService.disableIntegration(
    req.tenantSlug,
    req.params.type,
    { userId: req.user.userId, role: req.user.role },
  );
  res.json(ApiResponse.success('Integration disabled'));
};

exports.getSyncLogs = async (req, res) => {
  const { items, total, page, limit } = await externalSyncService.getSyncLogs(
    req.tenantSlug,
    req.query,
  );
  res.json(ApiResponse.paginated('Sync logs retrieved', items, { page, limit, total }));
};
