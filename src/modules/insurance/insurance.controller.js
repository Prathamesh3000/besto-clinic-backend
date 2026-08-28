'use strict';

const insuranceService = require('./insurance.service');
const ApiResponse = require('../../utils/ApiResponse');

// ── Insurance Providers ──────────────────────────────────────────────

exports.listProviders = async (req, res) => {
  const { items, total, page, limit } = await insuranceService.listProviders(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Insurance providers retrieved', items, { page, limit, total }));
};

exports.getProviderById = async (req, res) => {
  const provider = await insuranceService.getProviderById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Insurance provider retrieved', provider));
};

exports.createProvider = async (req, res) => {
  const provider = await insuranceService.createProvider(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Insurance provider created', provider));
};

exports.updateProvider = async (req, res) => {
  const provider = await insuranceService.updateProvider(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Insurance provider updated', provider));
};

exports.deleteProvider = async (req, res) => {
  await insuranceService.deleteProvider(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Insurance provider deleted'));
};

// ── Insurance Claims ─────────────────────────────────────────────────

exports.listClaims = async (req, res) => {
  const { items, total, page, limit } = await insuranceService.listClaims(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Insurance claims retrieved', items, { page, limit, total }));
};

exports.getClaimById = async (req, res) => {
  const claim = await insuranceService.getClaimById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Insurance claim retrieved', claim));
};

exports.createClaim = async (req, res) => {
  const claim = await insuranceService.createClaim(req.body, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Insurance claim created', claim));
};

exports.updateClaimStatus = async (req, res) => {
  const claim = await insuranceService.updateClaimStatus(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Insurance claim status updated', claim));
};

exports.deleteClaim = async (req, res) => {
  await insuranceService.deleteClaim(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Insurance claim deleted'));
};

// ── Pre-auth, Co-pay & Settlement ───────────────────────────────────

exports.recordPreAuth = async (req, res) => {
  const claim = await insuranceService.recordPreAuthorization(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Pre-authorization recorded', claim));
};

exports.calculateCoPay = async (req, res) => {
  const result = await insuranceService.calculateCoPayment(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Co-payment calculated', result));
};

exports.reconcileSettlement = async (req, res) => {
  const claim = await insuranceService.reconcileSettlement(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Settlement reconciled', claim));
};
