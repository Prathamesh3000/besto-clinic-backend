'use strict';

const analyticsService = require('./analytics.service');
const ApiResponse = require('../../utils/ApiResponse');

async function getSummary(req, res) {
  const data = await analyticsService.getAnalyticsSummary(req.tenantSlug);
  res.json(ApiResponse.success('Analytics summary', data));
}

async function getRevenueTrends(req, res) {
  const data = await analyticsService.getRevenueTrends(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Revenue trends', data));
}

async function getAppointmentTrends(req, res) {
  const data = await analyticsService.getAppointmentTrends(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Appointment trends', data));
}

async function getDoctorPerformance(req, res) {
  const data = await analyticsService.getDoctorPerformance(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Doctor performance', data));
}

async function getNoShowAnalysis(req, res) {
  const data = await analyticsService.getNoShowAnalysis(req.query, req.tenantSlug);
  res.json(ApiResponse.success('No-show analysis', data));
}

async function getInsuranceClaimTrends(req, res) {
  const data = await analyticsService.getInsuranceClaimTrends(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Insurance claim trends', data));
}

async function getTelemedicineUsage(req, res) {
  const data = await analyticsService.getTelemedicineUsage(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Telemedicine usage', data));
}

async function getPatientGrowth(req, res) {
  const data = await analyticsService.getPatientGrowth(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Patient growth', data));
}

async function getIntegrationUsage(req, res) {
  const data = await analyticsService.getIntegrationUsage(req.tenantSlug);
  res.json(ApiResponse.success('Integration usage', data));
}

async function getComplianceOverview(req, res) {
  const data = await analyticsService.getComplianceOverview(req.tenantSlug);
  res.json(ApiResponse.success('Compliance overview', data));
}

async function getComplianceAlerts(req, res) {
  const result = await analyticsService.getComplianceAlerts(req.query, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Compliance alerts', items, { total, page, limit }));
}

async function getComplianceTrends(req, res) {
  const data = await analyticsService.getComplianceTrends(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Compliance trends', data));
}

async function resolveComplianceAlert(req, res) {
  const data = await analyticsService.resolveComplianceAlert(
    req.params.alertId, req.body, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Compliance alert resolved', data));
}

module.exports = {
  getSummary,
  getRevenueTrends,
  getAppointmentTrends,
  getDoctorPerformance,
  getNoShowAnalysis,
  getInsuranceClaimTrends,
  getTelemedicineUsage,
  getPatientGrowth,
  getIntegrationUsage,
  getComplianceOverview,
  getComplianceAlerts,
  getComplianceTrends,
  resolveComplianceAlert,
};
