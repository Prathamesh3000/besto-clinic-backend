'use strict';

const billingService = require('./billing.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.createInvoice = async (req, res) => {
  const invoice = await billingService.createEnhancedInvoice(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Invoice created', invoice));
};

exports.recordPayment = async (req, res) => {
  const result = await billingService.recordPayment(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Payment recorded', result));
};

exports.listServiceItems = async (req, res) => {
  const { items, total, page, limit } = await billingService.getServiceItems(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Service items retrieved', items, { page, limit, total }));
};

exports.createServiceItem = async (req, res) => {
  const serviceItem = await billingService.createServiceItem(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Service item created', serviceItem));
};

exports.updateServiceItem = async (req, res) => {
  const serviceItem = await billingService.updateServiceItem(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Service item updated', serviceItem));
};

exports.revenueAnalytics = async (req, res) => {
  const analytics = await billingService.getRevenueAnalytics(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Revenue analytics retrieved', analytics));
};

exports.outstandingReport = async (req, res) => {
  const report = await billingService.getOutstandingReport(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Outstanding report retrieved', report));
};

exports.doctorRevenue = async (req, res) => {
  const revenue = await billingService.getDoctorRevenueShare(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Doctor revenue share retrieved', revenue));
};

exports.patientLedger = async (req, res) => {
  const result = await billingService.getPatientLedger(req.params.patientId, req.query, req.user, req.tenantSlug);
  const { items, total, page, limit, currentBalance } = result;
  res.json(ApiResponse.paginated('Patient ledger retrieved', items, { page, limit, total, currentBalance }));
};

exports.recordAdvance = async (req, res) => {
  const entry = await billingService.recordAdvancePayment(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Advance payment recorded', entry));
};

exports.adjustLedger = async (req, res) => {
  const entry = await billingService.adjustLedger(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Ledger adjustment recorded', entry));
};

exports.dayEndReport = async (req, res) => {
  const report = await billingService.getDayEndReport(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Day-end report retrieved', report));
};

exports.gstSummary = async (req, res) => {
  const report = await billingService.getGstSummary(req.query, req.tenantSlug);
  res.json(ApiResponse.success('GST summary retrieved', report));
};

exports.collectionMetrics = async (req, res) => {
  const metrics = await billingService.getCollectionMetrics(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Collection metrics retrieved', metrics));
};

exports.financialAuditTrail = async (req, res) => {
  const { items, total, page, limit } = await billingService.getFinancialAuditTrail(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Financial audit trail retrieved', items, { page, limit, total }));
};

exports.writeOff = async (req, res) => {
  const result = await billingService.writeOffInvoice(req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Invoice written off', result));
};
