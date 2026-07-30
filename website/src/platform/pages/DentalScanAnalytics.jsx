import { useState, useEffect, useCallback, useRef } from 'react';
import { getDentalScanAnalytics, getRecentDentalScans } from '../api';
import { StatCard } from '../components/shared';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  ScanLine, CheckCircle2, Camera, UserPlus, Mail, Zap,
  RefreshCw, Clock, DollarSign, Cpu, Smartphone, TrendingUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const CONFIDENCE_COLORS = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
const DEVICE_COLORS = { Desktop: '#6366f1', Mobile: '#22c55e', Tablet: '#f59e0b', Unknown: '#94a3b8' };

const DATE_RANGES = [
  { key: '7d', label: '7 Days', startDate: () => daysAgo(7) },
  { key: '30d', label: '30 Days', startDate: () => daysAgo(30) },
  { key: '90d', label: '90 Days', startDate: () => daysAgo(90) },
  { key: 'all', label: 'All Time', startDate: () => null },
];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ai', label: 'AI & Gemini Usage' },
  { key: 'marketing', label: 'Marketing & Leads' },
  { key: 'live', label: 'Live Monitor' },
];

const SCAN_STATUS_STYLES = {
  capturing: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  processing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n || 0);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ScanStatusBadge({ status }) {
  const s = SCAN_STATUS_STYLES[status] || SCAN_STATUS_STYLES.capturing;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-3 text-sm">
      <p className="font-medium text-neutral-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 animate-pulse">
      <div className="h-4 bg-neutral-100 rounded w-1/3 mb-3" />
      <div className="h-8 bg-neutral-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-neutral-100 rounded w-2/3" />
    </div>
  );
}

function SkeletonChart({ height = 280 }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 animate-pulse">
      <div className="h-4 bg-neutral-100 rounded w-1/4 mb-4" />
      <div className="bg-neutral-100 rounded" style={{ height }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Conversion Funnel                                                  */
/* ------------------------------------------------------------------ */

function ConversionFunnel({ data }) {
  if (!data?.length) return null;
  const max = data[0]?.count || 1;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6">
      <h3 className="text-sm font-semibold text-neutral-900 mb-4">Conversion Funnel</h3>
      <div className="space-y-3">
        {data.map((step, i) => {
          const pct = max > 0 ? (step.count / max * 100) : 0;
          const prevCount = i > 0 ? data[i - 1].count : null;
          const dropOff = prevCount ? Math.round((1 - step.count / prevCount) * 100) : null;

          return (
            <div key={step.stage} className="flex items-center gap-3">
              <div className="w-36 text-xs text-neutral-900/60 text-right shrink-0">{step.stage}</div>
              <div className="flex-1 bg-neutral-100 rounded-full h-7 relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-700"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-neutral-900">
                  {step.count.toLocaleString()}
                </span>
              </div>
              <div className="w-16 text-xs text-right shrink-0">
                {dropOff !== null ? (
                  <span className="text-red-500">-{dropOff}%</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Overview                                                      */
/* ------------------------------------------------------------------ */

function OverviewTab({ data }) {
  const { scansOverTime, observationDistribution, confidenceDistribution } = data;

  return (
    <div className="space-y-6">
      {/* Scans Over Time */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Scans Over Time <span className="font-normal text-slate-400">(IST)</span></h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={scansOverTime}>
            <defs>
              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" fill="url(#gradTotal)" strokeWidth={2} />
            <Area type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" fill="url(#gradCompleted)" strokeWidth={2} />
            <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Observation Distribution */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Finding Distribution</h3>
          {observationDistribution?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={observationDistribution} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Occurrences" radius={[0, 4, 4, 0]}>
                  {observationDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No observation data yet</p>
          )}
        </div>

        {/* Confidence Distribution */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Confidence Levels</h3>
          {confidenceDistribution?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={confidenceDistribution}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90}
                  dataKey="count" nameKey="level"
                  paddingAngle={3}
                >
                  {confidenceDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No confidence data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: AI & Gemini Usage                                             */
/* ------------------------------------------------------------------ */

function AiUsageTab({ data }) {
  const g = data.geminiUsage || {};
  const calls = g.totalApiCalls || 0;
  const dailyAvg = g.latencyOverTime?.length > 0
    ? Math.round(calls / g.latencyOverTime.length)
    : 0;
  const monthlyCostProjection = g.latencyOverTime?.length > 0
    ? ((g.estimatedCostUsd || 0) / g.latencyOverTime.length * 30).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* AI KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Total API Calls" value={fmtNum(calls)} icon={Cpu} color="primary" />
        <StatCard title="Total Tokens" value={fmtNum(g.totalTokens || 0)} icon={Zap} color="yellow" />
        <StatCard title="Avg Tokens/Scan" value={fmtNum(g.avgTokensPerScan || 0)} icon={TrendingUp} color="blue" />
        <StatCard title="Estimated Cost" value={`$${(g.estimatedCostUsd || 0).toFixed(2)}`} icon={DollarSign} color="green" />
        <StatCard title="P95 Latency" value={`${g.p95LatencyMs || 0}ms`} icon={Clock} color="purple" />
      </div>

      {/* Model Info Callout */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-100/50 rounded-2xl border border-primary-200 p-5 flex items-start gap-4">
        <div className="p-2.5 bg-white rounded-xl shadow-sm">
          <Cpu className="h-5 w-5 text-primary-600" />
        </div>
        <div>
          <h4 className="font-semibold text-neutral-900 text-sm">Current Model: {g.modelVersion || 'N/A'}</h4>
          <p className="text-xs text-neutral-900/60 mt-1">
            Avg latency: {g.avgLatencyMs || 0}ms | Max: {g.maxLatencyMs || 0}ms | Daily avg: ~{dailyAvg} calls/day
          </p>
          <p className="text-xs text-neutral-900/60 mt-0.5">
            Token split: ~{g.avgPromptTokens || 0} input + ~{g.avgCompletionTokens || 0} output + ~{g.avgThinkingTokens || 0} thinking per scan
          </p>
          <p className="text-xs font-medium text-primary-700 mt-2">
            Projected monthly cost at current rate: ${monthlyCostProjection}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Over Time */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Latency Trend (ms) <span className="font-normal text-slate-400">(IST)</span></h3>
          {g.latencyOverTime?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={g.latencyOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="avgLatency" name="Avg Latency (ms)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No latency data yet</p>
          )}
        </div>

        {/* Token Usage Over Time */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Daily API Calls & Tokens <span className="font-normal text-slate-400">(IST)</span></h3>
          {g.latencyOverTime?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={g.latencyOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="calls" name="API Calls" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgTokens" name="Avg Tokens" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No usage data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Marketing & Leads                                             */
/* ------------------------------------------------------------------ */

function MarketingTab({ data }) {
  const { sourceBreakdown, deviceBreakdown, peakHours, leadAnalytics } = data;
  const sources = sourceBreakdown?.bySources || [];
  const referrers = sourceBreakdown?.byReferrers || [];
  const devices = deviceBreakdown?.byDevice || [];
  const browsers = deviceBreakdown?.byBrowser || [];

  return (
    <div className="space-y-6">
      {/* Lead quality stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Complete Leads" value={leadAnalytics?.completeLeads || 0} subtitle={`${leadAnalytics?.completenessRate || 0}% completeness`} icon={UserPlus} color="green" />
        <StatCard title="With Email" value={leadAnalytics?.withEmail || 0} icon={Mail} color="primary" />
        <StatCard title="With Phone" value={leadAnalytics?.withPhone || 0} icon={Smartphone} color="blue" />
        <StatCard title="Repeat Visitors" value={leadAnalytics?.repeatVisitors || 0} icon={RefreshCw} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Breakdown */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Traffic Sources</h3>
          {sources.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sources} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="source" paddingAngle={3}>
                  {sources.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No source data</p>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Devices</h3>
          {devices.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={devices} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="device" paddingAngle={3}>
                  {devices.map((entry, i) => <Cell key={i} fill={DEVICE_COLORS[entry.device] || CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No device data</p>
          )}
        </div>

        {/* Referrers */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Top Referrers</h3>
          {referrers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={referrers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="domain" tick={{ fontSize: 10 }} stroke="#94a3b8" width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Visits" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No referrer data</p>
          )}
        </div>

        {/* Peak Hours */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Peak Usage Hours (IST)</h3>
          {peakHours?.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={peakHours} margin={{ bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={0} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} labelFormatter={(_, payload) => payload?.[0]?.payload?.label ? `${payload[0].payload.label} IST` : ''} />
                <Bar dataKey="count" name="Scans" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No hourly data</p>
          )}
        </div>
      </div>

      {/* Browser breakdown */}
      {browsers.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Browser Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={browsers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="browser" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Users" radius={[4, 4, 0, 0]}>
                {browsers.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Live Monitor                                                  */
/* ------------------------------------------------------------------ */

function LiveMonitorTab() {
  const [scans, setScans] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetchScans = useCallback(async () => {
    try {
      const res = await getRecentDentalScans({ limit: 25 });
      setScans(res.data?.scans || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchScans, 30_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchScans]);

  const columns = [
    { key: 'session', label: 'Session', render: (r) => <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{r.session}</code> },
    { key: 'status', label: 'Status', render: (r) => <ScanStatusBadge status={r.status} /> },
    { key: 'leadName', label: 'Lead' },
    { key: 'leadEmail', label: 'Email', render: (r) => <span className="text-xs">{r.leadEmail}</span> },
    { key: 'imageCount', label: 'Images', render: (r) => <span className="font-medium">{r.imageCount}</span> },
    { key: 'observationCount', label: 'Findings', render: (r) => r.observationCount > 0 ? <span className="font-medium text-primary-600">{r.observationCount}</span> : '—' },
    { key: 'latencyMs', label: 'Latency', render: (r) => r.latencyMs ? `${r.latencyMs}ms` : '—' },
    { key: 'source', label: 'Source', render: (r) => <span className="text-xs capitalize">{r.source?.replace(/_/g, ' ')}</span> },
    { key: 'reportSent', label: 'Report', render: (r) => r.reportSent ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span> },
    { key: 'createdAt', label: 'Time (IST)', render: (r) => (
      <div className="text-xs">
        <span className="text-slate-500">{timeAgo(r.createdAt)}</span>
        <br />
        <span className="text-slate-400">{new Date(r.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-neutral-100 text-slate-500 border border-neutral-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <span className="text-xs text-slate-400">Updates every 10s</span>
        </div>
        <button onClick={fetchScans} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-neutral-200 text-neutral-900 hover:bg-neutral-50 transition">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading recent scans...</div>
        ) : scans.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No scan sessions yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  {columns.map((col) => (
                    <th key={col.key} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scans.map((scan, idx) => (
                  <tr key={scan.id || idx} className="border-b border-neutral-100 hover:bg-neutral-50/30 transition">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-neutral-900/70">
                        {col.render ? col.render(scan) : scan[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function DentalScanAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = DATE_RANGES.find((r) => r.key === dateRange);
      const params = {};
      const start = range?.startDate?.();
      if (start) {
        params.startDate = start;
        params.endDate = new Date().toISOString().split('T')[0];
      }

      const res = await getDentalScanAnalytics(params);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const overview = data?.overview || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 font-display">Dental Scan Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">AI dental scan chatbot engagement, Gemini usage, and marketing insights</p>
        </div>
        <div className="flex items-center gap-2">
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                dateRange === r.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-neutral-900/60 border border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button onClick={fetchData} className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-900/60 hover:bg-neutral-50 transition ml-1">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="text-xs font-medium text-red-700 underline">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Total Scans" value={fmtNum(overview.totalScans)} icon={ScanLine} color="primary" />
          <StatCard title="Completion Rate" value={`${overview.completionRate || 0}%`} icon={CheckCircle2} color="green" />
          <StatCard title="Total Images" value={fmtNum(overview.totalImages)} subtitle={`~${overview.avgImagesPerScan || 0} per scan`} icon={Camera} color="blue" />
          <StatCard title="Leads Captured" value={fmtNum(overview.totalLeads)} subtitle={`${overview.leadCaptureRate || 0}% rate`} icon={UserPlus} color="purple" />
          <StatCard title="Reports Sent" value={fmtNum(overview.reportsSent)} subtitle={`${overview.reportConversionRate || 0}% of completed`} icon={Mail} color="green" />
          <StatCard title="Avg AI Latency" value={`${overview.avgLatencyMs || 0}ms`} icon={Zap} color="yellow" />
        </div>
      )}

      {/* Conversion Funnel */}
      {!loading && data?.funnel && <ConversionFunnel data={data.funnel} />}

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-neutral-900/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab data={data || {}} />}
          {activeTab === 'ai' && <AiUsageTab data={data || {}} />}
          {activeTab === 'marketing' && <MarketingTab data={data || {}} />}
          {activeTab === 'live' && <LiveMonitorTab />}
        </>
      )}
    </div>
  );
}
