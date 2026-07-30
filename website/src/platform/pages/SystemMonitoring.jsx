import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Wifi,
  AlertTriangle,
  Clock,
  RefreshCw,
  Server,
  Zap,
  Shield,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';

async function fetchMonitoring(path) {
  const token = localStorage.getItem('platform_token');
  const res = await fetch(`${API_BASE}/monitoring${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${
        ok ? 'bg-emerald-500' : 'bg-red-500'
      }`}
    />
  );
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function ProgressBar({ value, max, color }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  return (
    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function formatTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return ts;
  }
}

function memoryColor(pct) {
  if (pct < 70) return 'bg-emerald-500';
  if (pct < 85) return 'bg-amber-500';
  return 'bg-red-500';
}

function errorRateColor(rate) {
  if (rate < 1) return 'text-emerald-600';
  if (rate < 5) return 'text-amber-600';
  return 'text-red-600';
}

function durationColor(ms) {
  if (ms > 5000) return 'text-red-600 font-semibold';
  if (ms > 2000) return 'text-amber-600 font-semibold';
  return 'text-neutral-900';
}

function statusCodeColor(code) {
  if (code >= 500) return '#ef4444';
  if (code >= 400) return '#f59e0b';
  if (code >= 300) return '#3b82f6';
  return '#10b981';
}

function methodColor(method) {
  const map = {
    GET: '#3b82f6',
    POST: '#10b981',
    PUT: '#f59e0b',
    DELETE: '#ef4444',
    PATCH: '#8b5cf6',
  };
  return map[method] || '#6b7280';
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------
function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white rounded-xl border border-neutral-200 shadow-sm p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 mb-4">
      {Icon && <Icon className="w-5 h-5 text-primary-600" />}
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function SystemMonitoring() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef(null);

  // ---- Fetch data ----
  const loadData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      const [systemReport, apiMetrics] = await Promise.allSettled([
        fetchMonitoring('/system'),
        fetchMonitoring('/metrics'),
      ]);

      const combined = {};

      if (systemReport.status === 'fulfilled') {
        Object.assign(combined, systemReport.value?.data || systemReport.value || {});
      }
      if (apiMetrics.status === 'fulfilled') {
        const metricsPayload = apiMetrics.value?.data || apiMetrics.value || {};
        Object.assign(combined, metricsPayload);
      }

      if (systemReport.status === 'rejected' && apiMetrics.status === 'rejected') {
        throw new Error(
          systemReport.reason?.message || apiMetrics.reason?.message || 'Both endpoints failed'
        );
      }

      setData(combined);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ---- Initial load ----
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // ---- Auto-refresh ----
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadData(false);
      }, refreshInterval * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, refreshInterval, loadData]);

  // ---- Derived data ----
  const system = data?.system || data || {};
  const api = data?.api || data?.metrics || {};
  const health = system?.health || data?.health || {};
  const mongo = health?.mongodb || system?.mongodb || {};
  const redis = health?.redis || system?.redis || {};
  const memory = system?.memory || {};
  const processInfo = system?.process || {};
  const osInfo = system?.os || system?.system || {};

  const requests = api?.requests || {};
  const latency = api?.latency || {};
  const byMethod = api?.byMethod || {};
  const byStatus = api?.byStatus || {};
  const topRoutes = api?.topRoutes || [];
  const topTenants = api?.topTenants || [];
  const recentErrors = api?.recentErrors || data?.recentErrors || [];
  const rateLimitEvents = api?.rateLimitEvents || data?.rateLimitEvents || [];
  const slowRequests = api?.slowRequests || data?.slowRequests || [];

  const heapUsed = memory?.heapUsed || 0;
  const heapTotal = memory?.heapTotal || 0;
  const heapPct = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0;

  // Chart data prep
  const methodChartData = Object.entries(byMethod).map(([method, count]) => ({
    method,
    count,
    fill: methodColor(method),
  }));

  const statusChartData = Object.entries(byStatus).map(([code, count]) => ({
    code,
    count,
    fill: statusCodeColor(Number(code)),
  }));

  const tenantChartData = (topTenants || [])
    .slice(0, 10)
    .map((t) => ({
      tenant: t.tenant || t.name || t._id || 'Unknown',
      requests: t.requests || t.count || 0,
    }));

  const latencyBarData = [
    { label: 'p50', value: latency?.p50 || 0 },
    { label: 'p95', value: latency?.p95 || 0 },
    { label: 'p99', value: latency?.p99 || 0 },
  ];

  // ---- Loading state ----
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-neutral-900 font-medium">Loading system data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* ================================================================ */}
      {/* HEADER */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary-600" />
            System Monitoring
          </h1>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 text-sm text-neutral-900 cursor-pointer select-none">
            <span>Auto-refresh</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoRefresh ? 'bg-primary-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </label>

          {/* Interval dropdown */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="text-sm border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>

          {/* Manual refresh */}
          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium text-sm">
              Failed to load monitoring data
            </p>
            <p className="text-red-600 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ROW 1: Status Indicator Cards */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* API Status */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-gray-500">API Status</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot ok={health?.status === 'ok' || health?.api !== false} />
            <span className="text-lg font-bold text-neutral-900">
              {health?.status === 'ok' || !health?.status ? 'Healthy' : 'Degraded'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Uptime: {formatUptime(system?.uptime || processInfo?.uptime)}
          </p>
        </Card>

        {/* MongoDB */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-gray-500">MongoDB</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot ok={mongo?.status === 'ok' || mongo?.connected !== false} />
            <span className="text-lg font-bold text-neutral-900">
              {mongo?.latency != null ? `${mongo.latency}ms` : 'Connected'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Pool: {mongo?.connections ?? mongo?.poolSize ?? '—'} connections
          </p>
        </Card>

        {/* Redis */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-gray-500">Redis</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot ok={redis?.status === 'ok' || redis?.connected !== false} />
            <span className="text-lg font-bold text-neutral-900">
              {redis?.latency != null ? `${redis.latency}ms` : 'Connected'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {redis?.memory ? formatBytes(redis.memory) : '—'} &middot;{' '}
            {redis?.keys ?? '—'} keys
          </p>
        </Card>

        {/* Memory */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-gray-500">Memory</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-bold text-neutral-900">{heapPct}%</span>
            <span className="text-xs text-gray-500">
              {formatBytes(heapUsed)} / {formatBytes(heapTotal)}
            </span>
          </div>
          <ProgressBar value={heapUsed} max={heapTotal} color={memoryColor(heapPct)} />
        </Card>
      </div>

      {/* ================================================================ */}
      {/* ROW 2: API Performance */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left – stats */}
        <Card>
          <SectionTitle icon={BarChart3}>API Performance</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Requests', value: requests?.total ?? '—' },
              { label: 'Active', value: requests?.active ?? '—' },
              { label: 'Avg Latency', value: latency?.avg != null ? `${Math.round(latency.avg)}ms` : '—' },
              { label: 'p95', value: latency?.p95 != null ? `${Math.round(latency.p95)}ms` : '���' },
              { label: 'p99', value: latency?.p99 != null ? `${Math.round(latency.p99)}ms` : '—' },
              { label: 'Error Rate', value: requests?.errorRate != null ? `${requests.errorRate}%` : '—' },
            ].map((s) => (
              <div key={s.label} className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                <p className="text-xl font-bold text-neutral-900">{s.value}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Right – latency bars */}
        <Card>
          <SectionTitle icon={Clock}>Latency Distribution</SectionTitle>
          <div className="h-48">
            {latencyBarData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyBarData} layout="vertical" barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} unit="ms" />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 12, fill: '#1e293b' }} width={40} />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)}ms`, 'Latency']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8' }}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No latency data available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* ROW 3: Request Distribution */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Method */}
        <Card>
          <SectionTitle icon={Activity}>Requests by Method</SectionTitle>
          <div className="h-52">
            {methodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={methodChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
                  <XAxis dataKey="method" tick={{ fontSize: 12, fill: '#1e293b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {methodChartData.map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No method data available
              </div>
            )}
          </div>
        </Card>

        {/* By Status */}
        <Card>
          <SectionTitle icon={Shield}>Requests by Status Code</SectionTitle>
          <div className="h-52">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
                  <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#1e293b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No status data available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* ROW 4: Top Routes Table */}
      {/* ================================================================ */}
      <Card>
        <SectionTitle icon={Server}>Top Routes</SectionTitle>
        {topRoutes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="pb-2 pr-4 font-medium text-gray-500">Route</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 text-right">Requests</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 text-right">Avg (ms)</th>
                  <th className="pb-2 pr-4 font-medium text-gray-500 text-right">Errors</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {[...topRoutes]
                  .sort((a, b) => (b.requests || b.count || 0) - (a.requests || a.count || 0))
                  .map((route, i) => {
                    const req = route.requests || route.count || 0;
                    const errs = route.errors || 0;
                    const rate = req > 0 ? ((errs / req) * 100).toFixed(1) : '0.0';
                    return (
                      <tr
                        key={i}
                        className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors"
                      >
                        <td className="py-2.5 pr-4 font-mono text-xs text-neutral-900 truncate max-w-xs">
                          {route.route || route.path || '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium text-neutral-900">
                          {req.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-neutral-900">
                          {route.avg != null ? Math.round(route.avg) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-neutral-900">{errs}</td>
                        <td className={`py-2.5 text-right font-medium ${errorRateColor(Number(rate))}`}>
                          {rate}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No route data available</p>
        )}
      </Card>

      {/* ================================================================ */}
      {/* ROW 5: Top Tenants by Traffic */}
      {/* ================================================================ */}
      <Card>
        <SectionTitle icon={Cpu}>Top Tenants by Traffic</SectionTitle>
        <div className="h-64">
          {tenantChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenantChartData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis
                  dataKey="tenant"
                  type="category"
                  tick={{ fontSize: 11, fill: '#1e293b' }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e0d8' }}
                />
                <Bar dataKey="requests" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No tenant data available
            </div>
          )}
        </div>
      </Card>

      {/* ================================================================ */}
      {/* ROW 6: Alerts & Errors */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent 5xx Errors */}
        <Card>
          <SectionTitle icon={AlertTriangle}>Recent 5xx Errors</SectionTitle>
          {recentErrors.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-neutral-200 text-left">
                    <th className="pb-2 pr-3 font-medium text-gray-500">Time</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">Method</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">URL</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">Status</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">Tenant</th>
                    <th className="pb-2 font-medium text-gray-500">Correlation ID</th>
                  </tr>
                </thead>
                <tbody>
                  {recentErrors.map((err, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-100 last:border-b-0 hover:bg-red-50/50 transition-colors"
                    >
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatTime(err.timestamp || err.time)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs font-medium">
                        {err.method || '—'}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs truncate max-w-[180px]">
                        {err.url || err.path || '—'}
                      </td>
                      <td className="py-2 pr-3 text-red-600 font-medium">
                        {err.status || err.statusCode || '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[100px]">
                        {err.tenant || err.tenantId || '—'}
                      </td>
                      <td className="py-2 font-mono text-xs text-gray-400 truncate max-w-[140px]">
                        {err.correlationId || err.requestId || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              <Shield className="w-5 h-5 mr-2" />
              No recent errors
            </div>
          )}
        </Card>

        {/* Rate Limit Events */}
        <Card>
          <SectionTitle icon={Shield}>Rate Limit Events</SectionTitle>
          {rateLimitEvents.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-neutral-200 text-left">
                    <th className="pb-2 pr-3 font-medium text-gray-500">Time</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">IP</th>
                    <th className="pb-2 pr-3 font-medium text-gray-500">Tenant</th>
                    <th className="pb-2 font-medium text-gray-500">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {rateLimitEvents.map((evt, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-100 last:border-b-0 hover:bg-amber-50/50 transition-colors"
                    >
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatTime(evt.timestamp || evt.time)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {evt.ip || '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[100px]">
                        {evt.tenant || evt.tenantId || '—'}
                      </td>
                      <td className="py-2 font-mono text-xs truncate max-w-[200px]">
                        {evt.url || evt.path || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              <Shield className="w-5 h-5 mr-2" />
              No rate limit events
            </div>
          )}
        </Card>
      </div>

      {/* ================================================================ */}
      {/* ROW 7: Slow Requests */}
      {/* ================================================================ */}
      <Card>
        <SectionTitle icon={Clock}>Slow Requests</SectionTitle>
        {slowRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="pb-2 pr-3 font-medium text-gray-500">Time</th>
                  <th className="pb-2 pr-3 font-medium text-gray-500">Method</th>
                  <th className="pb-2 pr-3 font-medium text-gray-500">URL</th>
                  <th className="pb-2 pr-3 font-medium text-gray-500 text-right">Duration (ms)</th>
                  <th className="pb-2 pr-3 font-medium text-gray-500">Status</th>
                  <th className="pb-2 font-medium text-gray-500">Tenant</th>
                </tr>
              </thead>
              <tbody>
                {slowRequests.map((req, i) => {
                  const duration = req.duration || req.responseTime || 0;
                  return (
                    <tr
                      key={i}
                      className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors"
                    >
                      <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatTime(req.timestamp || req.time)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs font-medium">
                        {req.method || '—'}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs truncate max-w-[250px]">
                        {req.url || req.path || '—'}
                      </td>
                      <td className={`py-2.5 pr-3 text-right font-mono ${durationColor(duration)}`}>
                        {Math.round(duration).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {req.status || req.statusCode || '—'}
                      </td>
                      <td className="py-2.5 text-xs truncate max-w-[100px]">
                        {req.tenant || req.tenantId || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            <Zap className="w-5 h-5 mr-2" />
            No slow requests detected
          </div>
        )}
      </Card>

      {/* ================================================================ */}
      {/* ROW 8: System Info */}
      {/* ================================================================ */}
      <Card>
        <SectionTitle icon={Cpu}>System Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Node.js',
              value: processInfo?.nodeVersion || '—',
              icon: Server,
            },
            {
              label: 'PID',
              value: processInfo?.pid || '—',
              icon: Cpu,
            },
            {
              label: 'CPU Count',
              value: osInfo?.cpus?.length || osInfo?.cpuCount || '—',
              icon: Cpu,
            },
            {
              label: 'CPU Model',
              value: osInfo?.cpus?.[0]?.model || osInfo?.cpuModel || '—',
              icon: Cpu,
            },
            {
              label: 'Load Average',
              value: osInfo?.loadAvg
                ? osInfo.loadAvg.map((l) => l.toFixed(2)).join(', ')
                : osInfo?.loadAverage
                ? osInfo.loadAverage.map((l) => l.toFixed(2)).join(', ')
                : '—',
              icon: Activity,
            },
            {
              label: 'Platform',
              value: osInfo?.platform || '—',
              icon: HardDrive,
            },
            {
              label: 'Hostname',
              value: osInfo?.hostname || '—',
              icon: Wifi,
            },
            {
              label: 'Total Memory',
              value: formatBytes(osInfo?.totalMemory || osInfo?.totalmem),
              icon: HardDrive,
            },
          ].map((item) => (
            <div key={item.label} className="bg-neutral-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className="w-3.5 h-3.5 text-primary-500" />
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
              <p className="text-sm font-medium text-neutral-900 truncate" title={String(item.value)}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
