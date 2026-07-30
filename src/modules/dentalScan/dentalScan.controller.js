'use strict';

const dentalScanService = require('./dentalScan.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.initiate = async (req, res) => {
  const data = { ...req.body, ip: req.ip };
  const scan = await dentalScanService.initiateScan(data, req.tenantSlug, req.user);
  res.status(201).json(ApiResponse.created('Dental scan initiated', scan));
};

exports.uploadImage = async (req, res) => {
  const scan = await dentalScanService.uploadImage(
    req.params.id, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Image uploaded successfully', scan));
};

exports.triggerAnalysis = async (req, res) => {
  const scan = await dentalScanService.triggerAnalysis(
    req.params.id, req.tenantSlug, req.user,
  );
  res.status(202).json(ApiResponse.success('Analysis queued', scan));
};

exports.getResult = async (req, res) => {
  const result = await dentalScanService.getScanResult(
    req.params.id, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Scan result retrieved', result));
};

exports.getRecommendations = async (req, res) => {
  const recommendations = await dentalScanService.getRecommendations(
    req.params.id, req.query, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Recommendations retrieved', recommendations));
};

exports.list = async (req, res) => {
  const { items, total, page, limit } = await dentalScanService.listScans(
    req.query, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.paginated('Dental scans retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const scan = await dentalScanService.getScanById(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Dental scan retrieved', scan));
};

exports.review = async (req, res) => {
  const scan = await dentalScanService.reviewScan(
    req.params.id, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Dental scan review submitted', scan));
};

// ── NEW: Real-time validation and tooth detection ──

exports.validateFrame = async (req, res) => {
  const result = await dentalScanService.validateFrame(
    req.params.id, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Frame validated', result));
};

exports.detectTeeth = async (req, res) => {
  const result = await dentalScanService.detectTeeth(
    req.params.id, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Teeth detected', result));
};
