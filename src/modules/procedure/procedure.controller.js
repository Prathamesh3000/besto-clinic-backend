'use strict';

const service = require('./procedure.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const result = await service.createTemplate(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Procedure template created', result));
};

exports.list = async (req, res) => {
  const result = await service.listTemplates(req.query, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Procedure templates retrieved', items, { total, page, limit }));
};

exports.update = async (req, res) => {
  const result = await service.updateTemplate(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Procedure template updated', result));
};

exports.checkAvailability = async (req, res) => {
  const result = await service.checkAvailability(req.params.id, req.query.branch, req.tenantSlug);
  res.json(ApiResponse.success('Availability checked', result));
};
