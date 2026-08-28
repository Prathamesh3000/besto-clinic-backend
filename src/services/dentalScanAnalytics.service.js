'use strict';

/**
 * Dental Scan Analytics Service — MongoDB aggregation pipelines
 * for platform-level guest scan analytics.
 */

const GuestScan = require('../models/platform/GuestScan');

const OBS_LABELS = {
  plaque: 'Plaque Buildup',
  inflammation: 'Gum Inflammation',
  discoloration: 'Tooth Discoloration',
  misalignment: 'Misalignment',
  cavity: 'Cavity / Decay',
  gum_recession: 'Gum Recession',
  other: 'Other Finding',
};

const OBS_COLORS = {
  cavity: '#ef4444',
  inflammation: '#f97316',
  gum_recession: '#f97316',
  plaque: '#eab308',
  discoloration: '#a855f7',
  misalignment: '#3b82f6',
  other: '#6b7280',
};

// Gemini 2.5 Flash pricing (USD per 1M tokens) — update if model changes
const GEMINI_FLASH_INPUT_RATE = 0.15;   // per 1M input tokens
const GEMINI_FLASH_OUTPUT_RATE = 0.60;  // per 1M output tokens
const GEMINI_FLASH_THINKING_RATE = 3.50; // per 1M thinking tokens

// ── Helpers ─────────────────────────────────────

function _dateFilter(dateRange) {
  if (!dateRange || (!dateRange.startDate && !dateRange.endDate)) return {};
  const filter = {};
  if (dateRange.startDate) filter.$gte = new Date(dateRange.startDate);
  if (dateRange.endDate) {
    // endDate string like '2026-03-17' creates midnight UTC — shift to end of day
    const end = new Date(dateRange.endDate);
    end.setUTCHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  return { createdAt: filter };
}

function _matchStage(dateRange) {
  const df = _dateFilter(dateRange);
  return Object.keys(df).length > 0 ? { $match: df } : null;
}

function _parseDevice(userAgent) {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) return 'Mobile';
  if (/tablet/.test(ua)) return 'Tablet';
  return 'Desktop';
}

function _parseBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome/i.test(userAgent) && !/chromium/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/opera|opr/i.test(userAgent)) return 'Opera';
  return 'Other';
}

function _extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[0] || null;
  }
}

function _granularityFormat(granularity) {
  switch (granularity) {
    case 'weekly': return '%Y-W%V';
    case 'monthly': return '%Y-%m';
    default: return '%Y-%m-%d';
  }
}

// ── Analytics Functions ─────────────────────────

/**
 * KPI overview stats.
 */
async function getOverviewStats(dateRange) {
  const match = _dateFilter(dateRange);

  const [stats] = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalScans: { $sum: 1 },
              completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
              totalImages: { $sum: { $size: { $ifNull: ['$images', []] } } },
              totalLeads: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lead.email', null] }, null] }, 1, 0] } },
              reportsSent: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$reportSentAt', null] }, null] }, 1, 0] } },
              avgLatencyMs: { $avg: '$result.analysisLatencyMs' },
              totalPromptTokens: { $sum: { $ifNull: ['$result.tokenUsage.promptTokens', 0] } },
              totalCompletionTokens: { $sum: { $ifNull: ['$result.tokenUsage.completionTokens', 0] } },
              totalThinkingTokens: { $sum: { $ifNull: ['$result.tokenUsage.thinkingTokens', 0] } },
              totalTokens: { $sum: { $ifNull: ['$result.tokenUsage.totalTokens', 0] } },
            },
          },
        ],
      },
    },
  ]);

  const t = stats?.totals?.[0] || {};
  const totalScans = t.totalScans || 0;
  const completedScans = t.completedScans || 0;
  const finishedScans = completedScans + (t.failedScans || 0);

  return {
    totalScans,
    completedScans,
    failedScans: t.failedScans || 0,
    completionRate: finishedScans > 0 ? Math.round((completedScans / finishedScans) * 100 * 10) / 10 : 0,
    totalImages: t.totalImages || 0,
    avgImagesPerScan: totalScans > 0 ? Math.round((t.totalImages || 0) / totalScans * 10) / 10 : 0,
    totalLeads: t.totalLeads || 0,
    leadCaptureRate: totalScans > 0 ? Math.round((t.totalLeads || 0) / totalScans * 100 * 10) / 10 : 0,
    reportsSent: t.reportsSent || 0,
    reportConversionRate: completedScans > 0 ? Math.round((t.reportsSent || 0) / completedScans * 100 * 10) / 10 : 0,
    avgLatencyMs: Math.round(t.avgLatencyMs || 0),
    totalTokens: t.totalTokens || 0,
    estimatedCostUsd: _estimateCost(t.totalPromptTokens || 0, t.totalCompletionTokens || 0, t.totalThinkingTokens || 0),
  };
}

function _estimateCost(promptTokens, completionTokens, thinkingTokens = 0) {
  const inputCost = (promptTokens / 1_000_000) * GEMINI_FLASH_INPUT_RATE;
  const outputCost = (completionTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_RATE;
  const thinkingCost = (thinkingTokens / 1_000_000) * GEMINI_FLASH_THINKING_RATE;
  return Math.round((inputCost + outputCost + thinkingCost) * 10000) / 10000;
}

/**
 * Conversion funnel counts.
 */
async function getConversionFunnel(dateRange) {
  const match = _dateFilter(dateRange);

  const [result] = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: null,
        initiated: { $sum: 1 },
        imagesUploaded: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$images', []] } }, 0] }, 1, 0] } },
        leadCaptured: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lead.email', null] }, null] }, 1, 0] } },
        analysisTriggered: { $sum: { $cond: [{ $ne: ['$status', 'capturing'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        reportSent: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$reportSentAt', null] }, null] }, 1, 0] } },
      },
    },
  ]);

  const r = result || {};
  return [
    { stage: 'Initiated', count: r.initiated || 0 },
    { stage: 'Images Uploaded', count: r.imagesUploaded || 0 },
    { stage: 'Lead Captured', count: r.leadCaptured || 0 },
    { stage: 'Analysis Triggered', count: r.analysisTriggered || 0 },
    { stage: 'Completed', count: r.completed || 0 },
    { stage: 'Report Sent', count: r.reportSent || 0 },
  ];
}

/**
 * Scans over time (time series).
 */
async function getScansOverTime(dateRange, granularity = 'daily') {
  const match = _dateFilter(dateRange);
  const fmt = _granularityFormat(granularity);

  return GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$createdAt', timezone: 'Asia/Kolkata' } },
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', total: 1, completed: 1, failed: 1 } },
  ]);
}

/**
 * Observation type distribution.
 */
async function getObservationDistribution(dateRange) {
  const match = _dateFilter(dateRange);

  const pipeline = [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $match: { status: 'completed', 'result.observations': { $exists: true, $ne: [] } } },
    { $unwind: '$result.observations' },
    { $group: { _id: '$result.observations.type', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ];

  const results = await GuestScan.aggregate(pipeline);

  return results.map((r) => ({
    type: r._id,
    label: OBS_LABELS[r._id] || r._id,
    count: r.count,
    color: OBS_COLORS[r._id] || '#6b7280',
  }));
}

/**
 * Confidence level distribution.
 */
async function getConfidenceDistribution(dateRange) {
  const match = _dateFilter(dateRange);

  const results = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $match: { status: 'completed', 'result.observations': { $exists: true, $ne: [] } } },
    { $unwind: '$result.observations' },
    { $group: { _id: '$result.observations.confidence', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const colors = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
  return results.map((r) => ({
    level: r._id,
    count: r.count,
    color: colors[r._id] || '#6b7280',
  }));
}

/**
 * Gemini AI usage stats.
 */
async function getGeminiUsageStats(dateRange) {
  const match = _dateFilter(dateRange);
  const baseMatch = { status: 'completed' };

  const [stats] = await GuestScan.aggregate([
    { $match: { ...baseMatch, ...(Object.keys(match).length ? match : {}) } },
    {
      $group: {
        _id: null,
        totalApiCalls: { $sum: 1 },
        totalPromptTokens: { $sum: { $ifNull: ['$result.tokenUsage.promptTokens', 0] } },
        totalCompletionTokens: { $sum: { $ifNull: ['$result.tokenUsage.completionTokens', 0] } },
        totalThinkingTokens: { $sum: { $ifNull: ['$result.tokenUsage.thinkingTokens', 0] } },
        totalTokens: { $sum: { $ifNull: ['$result.tokenUsage.totalTokens', 0] } },
        avgLatencyMs: { $avg: '$result.analysisLatencyMs' },
        maxLatencyMs: { $max: '$result.analysisLatencyMs' },
        latencies: { $push: '$result.analysisLatencyMs' },
        models: { $push: '$result.analysisModel' },
      },
    },
  ]);

  if (!stats) {
    return {
      totalApiCalls: 0, totalTokens: 0, avgTokensPerScan: 0,
      avgPromptTokens: 0, avgCompletionTokens: 0, estimatedCostUsd: 0,
      avgLatencyMs: 0, p95LatencyMs: 0, maxLatencyMs: 0, modelVersion: 'N/A',
    };
  }

  const calls = stats.totalApiCalls || 1;
  const latencies = (stats.latencies || []).filter(Boolean).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);

  // Most common model
  const modelCounts = {};
  for (const m of (stats.models || [])) {
    if (m) modelCounts[m] = (modelCounts[m] || 0) + 1;
  }
  const modelVersion = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Latency over time
  const latencyOverTime = await GuestScan.aggregate([
    { $match: { ...baseMatch, ...(Object.keys(match).length ? match : {}), 'result.analysisLatencyMs': { $exists: true } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
        avgLatency: { $avg: '$result.analysisLatencyMs' },
        calls: { $sum: 1 },
        avgTokens: { $avg: { $ifNull: ['$result.tokenUsage.totalTokens', 0] } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', avgLatency: { $round: ['$avgLatency', 0] }, calls: 1, avgTokens: { $round: ['$avgTokens', 0] } } },
  ]);

  return {
    totalApiCalls: stats.totalApiCalls,
    totalTokens: stats.totalTokens || 0,
    totalPromptTokens: stats.totalPromptTokens || 0,
    totalCompletionTokens: stats.totalCompletionTokens || 0,
    totalThinkingTokens: stats.totalThinkingTokens || 0,
    avgTokensPerScan: Math.round((stats.totalTokens || 0) / calls),
    avgPromptTokens: Math.round((stats.totalPromptTokens || 0) / calls),
    avgCompletionTokens: Math.round((stats.totalCompletionTokens || 0) / calls),
    avgThinkingTokens: Math.round((stats.totalThinkingTokens || 0) / calls),
    estimatedCostUsd: _estimateCost(stats.totalPromptTokens || 0, stats.totalCompletionTokens || 0, stats.totalThinkingTokens || 0),
    avgLatencyMs: Math.round(stats.avgLatencyMs || 0),
    p95LatencyMs: latencies[p95Index] || 0,
    maxLatencyMs: stats.maxLatencyMs || 0,
    modelVersion,
    latencyOverTime,
  };
}

/**
 * Traffic source breakdown.
 */
async function getSourceBreakdown(dateRange) {
  const match = _dateFilter(dateRange);

  const bySources = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: { $ifNull: ['$source', 'unknown'] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { _id: 0, source: '$_id', count: 1 } },
  ]);

  // Referrer domain breakdown — done in app code since $function isn't available everywhere
  const scansWithReferrer = await GuestScan.find(
    { ...match, referrer: { $exists: true, $nin: [null, ''] } },
    { referrer: 1 },
  ).lean();

  const refCounts = {};
  for (const s of scansWithReferrer) {
    const domain = _extractDomain(s.referrer);
    if (domain) refCounts[domain] = (refCounts[domain] || 0) + 1;
  }
  const byReferrers = Object.entries(refCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { bySources, byReferrers };
}

/**
 * Device and browser breakdown from userAgent.
 */
async function getDeviceBreakdown(dateRange) {
  const match = _dateFilter(dateRange);

  const scans = await GuestScan.find(
    { ...match, userAgent: { $exists: true, $ne: null } },
    { userAgent: 1 },
  ).lean();

  const deviceCounts = {};
  const browserCounts = {};
  for (const s of scans) {
    const device = _parseDevice(s.userAgent);
    const browser = _parseBrowser(s.userAgent);
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    browserCounts[browser] = (browserCounts[browser] || 0) + 1;
  }

  const byDevice = Object.entries(deviceCounts)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);

  const byBrowser = Object.entries(browserCounts)
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count);

  return { byDevice, byBrowser };
}

/**
 * Peak usage hours.
 */
async function getPeakHours(dateRange) {
  const match = _dateFilter(dateRange);

  const results = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, hour: '$_id', count: 1 } },
  ]);

  // Fill all 24 hours so the chart shows the full day
  const hourMap = {};
  for (const r of results) hourMap[r.hour] = r.count;
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`,
    count: hourMap[i] || 0,
  }));
}

/**
 * Recent scans (for live monitor).
 */
async function getRecentScans(limit = 20, offset = 0) {
  const scans = await GuestScan.find()
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .select('sessionToken status lead.name lead.email images source createdAt result.analysisLatencyMs result.observations reportSentAt')
    .lean();

  return scans.map((s) => ({
    id: s._id,
    session: s.sessionToken ? s.sessionToken.slice(-8) : '—',
    status: s.status,
    leadName: s.lead?.name || '—',
    leadEmail: s.lead?.email || '—',
    imageCount: (s.images || []).length,
    observationCount: s.result?.observations?.length || 0,
    latencyMs: s.result?.analysisLatencyMs || null,
    source: s.source || 'unknown',
    reportSent: !!s.reportSentAt,
    createdAt: s.createdAt,
  }));
}

/**
 * Lead quality analytics.
 */
async function getLeadAnalytics(dateRange) {
  const match = _dateFilter(dateRange);

  const [stats] = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        withEmail: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lead.email', null] }, null] }, 1, 0] } },
        withPhone: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lead.phone', null] }, null] }, 1, 0] } },
        withName: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$lead.name', null] }, null] }, 1, 0] } },
        allFields: {
          $sum: {
            $cond: [{
              $and: [
                { $ne: [{ $ifNull: ['$lead.email', null] }, null] },
                { $ne: [{ $ifNull: ['$lead.phone', null] }, null] },
                { $ne: [{ $ifNull: ['$lead.name', null] }, null] },
              ],
            }, 1, 0],
          },
        },
      },
    },
  ]);

  // Repeat visitors (same email, multiple scans)
  const repeatVisitors = await GuestScan.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $match: { 'lead.email': { $exists: true, $ne: null } } },
    { $group: { _id: '$lead.email', scanCount: { $sum: 1 } } },
    { $match: { scanCount: { $gt: 1 } } },
    { $count: 'count' },
  ]);

  return {
    total: stats?.total || 0,
    withEmail: stats?.withEmail || 0,
    withPhone: stats?.withPhone || 0,
    withName: stats?.withName || 0,
    completeLeads: stats?.allFields || 0,
    completenessRate: stats?.total ? Math.round((stats.allFields || 0) / stats.total * 100 * 10) / 10 : 0,
    repeatVisitors: repeatVisitors[0]?.count || 0,
  };
}

module.exports = {
  getOverviewStats,
  getConversionFunnel,
  getScansOverTime,
  getObservationDistribution,
  getConfidenceDistribution,
  getGeminiUsageStats,
  getSourceBreakdown,
  getDeviceBreakdown,
  getPeakHours,
  getRecentScans,
  getLeadAnalytics,
};
