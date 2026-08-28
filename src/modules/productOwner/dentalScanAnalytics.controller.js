'use strict';

/**
 * Dental Scan Analytics Controller — platform-level guest scan analytics.
 */

const analyticsService = require('../../services/dentalScanAnalytics.service');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /platform/analytics/dental-scans
 * Returns all dental scan analytics in a single payload.
 */
exports.getDentalScanAnalytics = async (req, res) => {
  const { startDate, endDate, granularity } = req.query;
  const dateRange = (startDate || endDate) ? { startDate, endDate } : null;

  const [
    overview,
    funnel,
    scansOverTime,
    observationDist,
    confidenceDist,
    geminiUsage,
    sourceBreakdown,
    deviceBreakdown,
    peakHours,
    leadAnalytics,
  ] = await Promise.all([
    analyticsService.getOverviewStats(dateRange),
    analyticsService.getConversionFunnel(dateRange),
    analyticsService.getScansOverTime(dateRange, granularity || 'daily'),
    analyticsService.getObservationDistribution(dateRange),
    analyticsService.getConfidenceDistribution(dateRange),
    analyticsService.getGeminiUsageStats(dateRange),
    analyticsService.getSourceBreakdown(dateRange),
    analyticsService.getDeviceBreakdown(dateRange),
    analyticsService.getPeakHours(dateRange),
    analyticsService.getLeadAnalytics(dateRange),
  ]);

  res.json(ApiResponse.success('Dental scan analytics retrieved', {
    overview,
    funnel,
    scansOverTime,
    observationDistribution: observationDist,
    confidenceDistribution: confidenceDist,
    geminiUsage,
    sourceBreakdown,
    deviceBreakdown,
    peakHours,
    leadAnalytics,
  }));
};

/**
 * GET /platform/analytics/dental-scans/recent
 * Returns recent scans for live monitor (paginated).
 */
exports.getRecentScans = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const offset = parseInt(req.query.offset, 10) || 0;

  const scans = await analyticsService.getRecentScans(limit, offset);

  res.json(ApiResponse.success('Recent dental scans retrieved', { scans }));
};
