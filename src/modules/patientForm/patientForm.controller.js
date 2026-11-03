'use strict';

const service = require('./patientForm.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.get = async (req, res) => {
  const config = await service.getConfig(req.tenantSlug, req.user);
  res.json(ApiResponse.success('Patient form retrieved', config));
};

exports.update = async (req, res) => {
  const config = await service.updateConfig(req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Patient form updated', config));
};

exports.regenerateQr = async (req, res) => {
  const config = await service.regenerateQr(req.user, req.tenantSlug);
  res.json(ApiResponse.success('Form QR regenerated', config));
};

exports.toggleQr = async (req, res) => {
  const config = await service.toggleQr(req.body.enabled, req.user, req.tenantSlug);
  res.json(ApiResponse.success(config.qr.enabled ? 'Form QR enabled' : 'Form QR disabled', config));
};
