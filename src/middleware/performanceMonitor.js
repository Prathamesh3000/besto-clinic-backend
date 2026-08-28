'use strict';

/**
 * Performance monitoring middleware — collects API metrics in-memory.
 *
 * Tracks:
 *  - Total request count (by method, route, status)
 *  - Latency histogram (p50, p95, p99)
 *  - Error count (4xx, 5xx)
 *  - Active requests gauge
 *  - Slow request log (> threshold)
 *  - Requests per tenant
 */

const logger = require('../utils/logger');

// ── Metrics store (singleton) ─────────────────────
const metrics = {
  startedAt: Date.now(),
  requests: {
    total: 0,
    active: 0,
    byMethod: {},      // { GET: 123, POST: 45, ... }
    byStatus: {},      // { 200: 100, 404: 5, 500: 2 }
    byRoute: {},       // { 'GET /api/v1/patients': { count, totalMs, errors } }
    byTenant: {},      // { 'clinic-a': 150, 'clinic-b': 30 }
  },
  errors: {
    total4xx: 0,
    total5xx: 0,
    recent: [],        // Last 50 errors: { ts, method, url, status, message, tenantSlug, correlationId }
  },
  latency: {
    samples: [],       // Circular buffer of last 1000 response times (ms)
    sampleIndex: 0,
    maxSamples: 1000,
  },
  slowRequests: [],    // Last 20 slow requests (> SLOW_THRESHOLD_MS)
  rateLimit: {
    triggered: 0,
    recent: [],        // Last 20: { ts, ip, tenantSlug, url }
  },
};

const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_MS, 10) || 2000;
const MAX_RECENT_ERRORS = 50;
const MAX_SLOW_REQUESTS = 20;
const MAX_RATE_LIMIT_EVENTS = 20;

// ── Latency helpers ──────────────────────────────
function recordLatency(ms) {
  const { latency } = metrics;
  if (latency.samples.length < latency.maxSamples) {
    latency.samples.push(ms);
  } else {
    latency.samples[latency.sampleIndex] = ms;
  }
  latency.sampleIndex = (latency.sampleIndex + 1) % latency.maxSamples;
}

function getPercentile(p) {
  const sorted = [...metrics.latency.samples].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getLatencyStats() {
  const samples = metrics.latency.samples;
  if (samples.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
  const avg = Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
  return {
    p50: Math.round(getPercentile(50)),
    p95: Math.round(getPercentile(95)),
    p99: Math.round(getPercentile(99)),
    avg,
    count: samples.length,
  };
}

// ── Rate limit tracker ───────────────────────────
function recordRateLimitHit(ip, tenantSlug, url) {
  metrics.rateLimit.triggered++;
  metrics.rateLimit.recent.push({ ts: new Date().toISOString(), ip, tenantSlug, url });
  if (metrics.rateLimit.recent.length > MAX_RATE_LIMIT_EVENTS) {
    metrics.rateLimit.recent.shift();
  }
  logger.warn('Rate limit triggered', { ip, tenantSlug, url });
}

// ── Middleware ────────────────────────────────────
function performanceMonitor() {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    metrics.requests.total++;
    metrics.requests.active++;

    // Track by method
    metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;

    // Track by tenant
    if (req.tenantSlug) {
      metrics.requests.byTenant[req.tenantSlug] = (metrics.requests.byTenant[req.tenantSlug] || 0) + 1;
    }

    // Hook into response finish
    const onFinish = () => {
      res.removeListener('finish', onFinish);
      metrics.requests.active--;

      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.round(durationNs / 1e6);
      const status = res.statusCode;

      // Track by status
      metrics.requests.byStatus[status] = (metrics.requests.byStatus[status] || 0) + 1;

      // Track by route pattern
      const routeKey = `${req.method} ${req.route?.path || req.path}`;
      if (!metrics.requests.byRoute[routeKey]) {
        metrics.requests.byRoute[routeKey] = { count: 0, totalMs: 0, errors: 0 };
      }
      const route = metrics.requests.byRoute[routeKey];
      route.count++;
      route.totalMs += durationMs;
      if (status >= 400) route.errors++;

      // Record latency
      recordLatency(durationMs);

      // Track errors
      if (status >= 500) {
        metrics.errors.total5xx++;
        metrics.errors.recent.push({
          ts: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
          status,
          message: res.statusMessage,
          tenantSlug: req.tenantSlug || null,
          correlationId: req.correlationId || null,
        });
        if (metrics.errors.recent.length > MAX_RECENT_ERRORS) metrics.errors.recent.shift();
      } else if (status >= 400) {
        metrics.errors.total4xx++;
      }

      // Track slow requests
      if (durationMs > SLOW_THRESHOLD_MS) {
        metrics.slowRequests.push({
          ts: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
          durationMs,
          status,
          tenantSlug: req.tenantSlug || null,
          correlationId: req.correlationId || null,
        });
        if (metrics.slowRequests.length > MAX_SLOW_REQUESTS) metrics.slowRequests.shift();
        logger.warn('Slow request detected', {
          method: req.method,
          url: req.originalUrl,
          durationMs,
          tenantSlug: req.tenantSlug,
          correlationId: req.correlationId,
        });
      }

      // Rate limit detection (429)
      if (status === 429) {
        recordRateLimitHit(req.ip, req.tenantSlug, req.originalUrl);
      }
    };

    res.on('finish', onFinish);
    next();
  };
}

// ── Snapshot exporter ────────────────────────────
function getMetricsSnapshot() {
  return {
    uptime: Math.round((Date.now() - metrics.startedAt) / 1000),
    requests: {
      total: metrics.requests.total,
      active: metrics.requests.active,
      byMethod: { ...metrics.requests.byMethod },
      byStatus: { ...metrics.requests.byStatus },
      topRoutes: Object.entries(metrics.requests.byRoute)
        .map(([route, data]) => ({
          route,
          count: data.count,
          avgMs: data.count > 0 ? Math.round(data.totalMs / data.count) : 0,
          errors: data.errors,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      topTenants: Object.entries(metrics.requests.byTenant)
        .map(([slug, count]) => ({ slug, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    },
    latency: getLatencyStats(),
    errors: {
      total4xx: metrics.errors.total4xx,
      total5xx: metrics.errors.total5xx,
      recent: metrics.errors.recent.slice(-10),
    },
    slowRequests: metrics.slowRequests.slice(-10),
    rateLimit: {
      triggered: metrics.rateLimit.triggered,
      recent: metrics.rateLimit.recent.slice(-10),
    },
  };
}

// ── Reset (for testing) ──────────────────────────
function resetMetrics() {
  metrics.requests.total = 0;
  metrics.requests.active = 0;
  metrics.requests.byMethod = {};
  metrics.requests.byStatus = {};
  metrics.requests.byRoute = {};
  metrics.requests.byTenant = {};
  metrics.errors.total4xx = 0;
  metrics.errors.total5xx = 0;
  metrics.errors.recent = [];
  metrics.latency.samples = [];
  metrics.latency.sampleIndex = 0;
  metrics.slowRequests = [];
  metrics.rateLimit.triggered = 0;
  metrics.rateLimit.recent = [];
  metrics.startedAt = Date.now();
}

module.exports = { performanceMonitor, getMetricsSnapshot, recordRateLimitHit, resetMetrics };
