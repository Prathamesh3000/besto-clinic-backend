'use strict';

const service = require('./consultationTemplate.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.listTemplates = async (req, res) => {
  const { items, total, page, limit } = await service.listTemplates(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Consultation templates retrieved', items, { page, limit, total }));
};

exports.getTemplate = async (req, res) => {
  const result = await service.getTemplateById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Consultation template retrieved', result));
};

exports.createTemplate = async (req, res) => {
  const result = await service.createTemplate(req.body, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Consultation template created', result));
};

exports.updateTemplate = async (req, res) => {
  const result = await service.updateTemplate(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Consultation template updated', result));
};

exports.removeTemplate = async (req, res) => {
  await service.removeTemplate(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Consultation template deleted'));
};
