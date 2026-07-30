'use strict';

const legacyUploadService = require('./legacyUpload.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await legacyUploadService.listUploads(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Uploads retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const upload = await legacyUploadService.getUploadById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Upload retrieved', upload));
};

exports.create = async (req, res) => {
  const upload = await legacyUploadService.createUpload(req.body, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Upload created', upload));
};

exports.process = async (req, res) => {
  const upload = await legacyUploadService.processUpload(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Upload processed', upload));
};

exports.remove = async (req, res) => {
  await legacyUploadService.deleteUpload(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Upload deleted'));
};
