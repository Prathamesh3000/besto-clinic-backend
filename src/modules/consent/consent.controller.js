'use strict';

const consentService = require('./consent.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await consentService.listConsents(req.query, req.tenantSlug, req.user);
  res.json(ApiResponse.paginated('Consents retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const consent = await consentService.getConsentById(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Consent retrieved', consent));
};

exports.create = async (req, res) => {
  const consent = await consentService.createConsent(req.body, req.tenantSlug, req.user.userId, req.ip);
  res.status(201).json(ApiResponse.created('Consent created', consent));
};

exports.update = async (req, res) => {
  const consent = await consentService.updateConsent(req.params.id, req.body, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Consent updated', consent));
};

exports.revoke = async (req, res) => {
  const consent = await consentService.revokeConsent(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Consent revoked', consent));
};
