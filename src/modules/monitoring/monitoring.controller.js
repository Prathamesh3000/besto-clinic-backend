'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const monitoringService = require('../../services/monitoring.service');
const { getMetricsSnapshot, resetMetrics } = require('../../middleware/performanceMonitor');

/**
 * GET /monitoring/health — Enhanced health check with dependency status
 */
async function healthCheck(req, res) {
  const [redis, mongo] = await Promise.all([
    monitoringService.getRedisHealth(),
    monitoringService.getMongoHealth(),
  ]);

  const healthy = redis.status === 'connected' && mongo.platform.status === 'connected';
  const status = healthy ? 200 : 503;

  res.status(status).json({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      redis: { status: redis.status, latencyMs: redis.latencyMs },
      mongodb: { status: mongo.platform.status, latencyMs: mongo.platform.latencyMs },
    },
  });
}

/**
 * GET /monitoring/ready — Readiness probe (Kubernetes)
 * Returns 200 only when ALL dependencies are ready.
 */
async function readinessProbe(req, res) {
  try {
    const [redis, mongo] = await Promise.all([
      monitoringService.getRedisHealth(),
      monitoringService.getMongoHealth(),
    ]);

    const ready = redis.status === 'connected' && mongo.platform.status === 'connected';

    if (!ready) {
      return res.status(503).json({ ready: false, reason: 'Dependencies not ready' });
    }

    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false, reason: 'Health check failed' });
  }
}

/**
 * GET /monitoring/live — Liveness probe (Kubernetes)
 * Returns 200 if the process is alive.
 */
function livenessProbe(req, res) {
  res.json({
    alive: true,
    uptime: Math.round(process.uptime()),
    pid: process.pid,
  });
}

/**
 * GET /monitoring/metrics — API performance metrics (admin only)
 */
function getApiMetrics(req, res) {
  const snapshot = getMetricsSnapshot();
  res.json(ApiResponse.success('API metrics', snapshot));
}

/**
 * GET /monitoring/system — Full system health report (admin only)
 */
async function getSystemReport(req, res) {
  const report = await monitoringService.getFullHealthReport();
  const apiMetrics = getMetricsSnapshot();
  res.json(ApiResponse.success('System monitoring report', { ...report, apiMetrics }));
}

/**
 * GET /monitoring/memory — Memory usage (admin only)
 */
function getMemory(req, res) {
  const memory = monitoringService.getMemoryUsage();
  res.json(ApiResponse.success('Memory usage', memory));
}

/**
 * GET /monitoring/slow-queries — Recent slow queries (admin only)
 */
function getSlowQueries(req, res) {
  const queries = monitoringService.getSlowQueries();
  res.json(ApiResponse.success('Slow queries', queries));
}

/**
 * GET /monitoring/errors — Recent errors (admin only)
 */
function getRecentErrors(req, res) {
  const apiMetrics = getMetricsSnapshot();
  res.json(ApiResponse.success('Recent errors', {
    total4xx: apiMetrics.errors.total4xx,
    total5xx: apiMetrics.errors.total5xx,
    recentErrors: apiMetrics.errors.recent,
    slowRequests: apiMetrics.slowRequests,
    rateLimitEvents: apiMetrics.rateLimit,
    integrationErrors: monitoringService.getIntegrationErrors(),
    webhookErrors: monitoringService.getWebhookEvents().filter((e) => e.status === 'error'),
  }));
}

/**
 * GET /monitoring/prometheus — Prometheus-compatible metrics export
 */
function prometheusMetrics(req, res) {
  const snapshot = getMetricsSnapshot();
  const memory = monitoringService.getMemoryUsage();

  const lines = [
    '# HELP bestoclinic_requests_total Total HTTP requests',
    '# TYPE bestoclinic_requests_total counter',
    `bestoclinic_requests_total ${snapshot.requests.total}`,
    '',
    '# HELP bestoclinic_requests_active Currently active requests',
    '# TYPE bestoclinic_requests_active gauge',
    `bestoclinic_requests_active ${snapshot.requests.active}`,
    '',
    '# HELP bestoclinic_errors_4xx_total Total 4xx errors',
    '# TYPE bestoclinic_errors_4xx_total counter',
    `bestoclinic_errors_4xx_total ${snapshot.errors.total4xx}`,
    '',
    '# HELP bestoclinic_errors_5xx_total Total 5xx errors',
    '# TYPE bestoclinic_errors_5xx_total counter',
    `bestoclinic_errors_5xx_total ${snapshot.errors.total5xx}`,
    '',
    '# HELP bestoclinic_request_duration_ms Request duration percentiles',
    '# TYPE bestoclinic_request_duration_ms summary',
    `bestoclinic_request_duration_ms{quantile="0.5"} ${snapshot.latency.p50}`,
    `bestoclinic_request_duration_ms{quantile="0.95"} ${snapshot.latency.p95}`,
    `bestoclinic_request_duration_ms{quantile="0.99"} ${snapshot.latency.p99}`,
    '',
    '# HELP bestoclinic_rate_limit_triggered_total Rate limit events',
    '# TYPE bestoclinic_rate_limit_triggered_total counter',
    `bestoclinic_rate_limit_triggered_total ${snapshot.rateLimit.triggered}`,
    '',
    '# HELP bestoclinic_slow_requests_total Slow requests detected',
    '# TYPE bestoclinic_slow_requests_total counter',
    `bestoclinic_slow_requests_total ${snapshot.slowRequests.length}`,
    '',
    '# HELP bestoclinic_heap_used_mb Heap memory used in MB',
    '# TYPE bestoclinic_heap_used_mb gauge',
    `bestoclinic_heap_used_mb ${memory.heap.used}`,
    '',
    '# HELP bestoclinic_heap_total_mb Heap memory total in MB',
    '# TYPE bestoclinic_heap_total_mb gauge',
    `bestoclinic_heap_total_mb ${memory.heap.total}`,
    '',
    '# HELP bestoclinic_rss_mb Resident set size in MB',
    '# TYPE bestoclinic_rss_mb gauge',
    `bestoclinic_rss_mb ${memory.rss}`,
    '',
    '# HELP bestoclinic_uptime_seconds Process uptime in seconds',
    '# TYPE bestoclinic_uptime_seconds gauge',
    `bestoclinic_uptime_seconds ${snapshot.uptime}`,
    '',
  ];

  // Per-method metrics
  for (const [method, count] of Object.entries(snapshot.requests.byMethod)) {
    lines.push(`bestoclinic_requests_by_method{method="${method}"} ${count}`);
  }

  // Per-status metrics
  lines.push('');
  for (const [status, count] of Object.entries(snapshot.requests.byStatus)) {
    lines.push(`bestoclinic_requests_by_status{status="${status}"} ${count}`);
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
}

/**
 * POST /monitoring/reset — Reset metrics (admin only, use with caution)
 */
function resetApiMetrics(req, res) {
  resetMetrics();
  res.json(ApiResponse.success('Metrics reset successfully'));
}

module.exports = {
  healthCheck,
  readinessProbe,
  livenessProbe,
  getApiMetrics,
  getSystemReport,
  getMemory,
  getSlowQueries,
  getRecentErrors,
  prometheusMetrics,
  resetApiMetrics,
};
