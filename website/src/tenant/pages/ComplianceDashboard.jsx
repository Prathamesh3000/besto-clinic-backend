import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  HeartPulse, Users, AlertTriangle, TrendingDown, CheckCircle2,
  Search, Filter, Eye, X, ChevronDown,
} from 'lucide-react';
import {
  getComplianceOverview, getComplianceAlerts,
  getComplianceTrends, resolveComplianceAlert,
} from '../api';
import {
  Modal, DataTable, Pagination, Spinner,
  ErrorAlert, TabBar, EmptyState,
} from '../../platform/components/shared';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ─── Stat Card Config ─────────────────────────── */
const STAT_CFG = [
  { key: 'patients',   title: 'Patients with Reminders', icon: Users },
  { key: 'compliance', title: 'Average Compliance',      icon: HeartPulse },
  { key: 'low',        title: 'Low Compliance (<50%)',    icon: TrendingDown },
  { key: 'alerts',     title: 'Active Alerts',           icon: AlertTriangle },
];
const PALETTE = [
  { bg: 'bg-primary-50', text: 'text-primary-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-red-50',     text: 'text-red-600' },
  { bg: 'bg-amber-50',   text: 'text-amber-600' },
];

// ─── Constants ──────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'trends', label: 'Trends' },
];

const PERIODS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'];

const SEVERITY_STYLES = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-blue-50 text-blue-700',
};

const ALERT_STATUS_STYLES = {
  active: 'bg-red-50 text-red-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-neutral-200 text-neutral-500',
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 },
};

// ─── Helpers ────────────────────────────────────
function formatPercent(n) {
  return (n || 0).toFixed(1) + '%';
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getComplianceColor(rate) {
  if (rate >= 75) return 'text-emerald-600';
  if (rate >= 50) return 'text-amber-600';
  return 'text-red-600';
}

// ─── Skeleton ───────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200 rounded-xl ${className}`} />;
}

// ═══════════════════════════════════════════════════
// ─── MAIN COMPONENT ──────────────────────────────
// ═══════════════════════════════════════════════════
export default function ComplianceDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);

  // Alerts tab state
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [alertPage, setAlertPage] = useState(1);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertFilter, setAlertFilter] = useState({ status: '', severity: '' });
  const alertLimit = 15;

  // Trends tab state
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsPeriod, setTrendsPeriod] = useState('weekly');

  // Resolve modal
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  // ─── Fetch overview ──────────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getComplianceOverview();
      setOverview(res.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch alerts ────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError('');
    try {
      const params = { page: alertPage, limit: alertLimit };
      if (alertFilter.status) params.status = alertFilter.status;
      if (alertFilter.severity) params.severity = alertFilter.severity;
      const res = await getComplianceAlerts(params);
      const d = res.data || res;
      setAlerts(d.items || d.alerts || d.data || []);
      setAlertTotal(d.total ?? 0);
    } catch (err) {
      setAlertsError(err.message || 'Failed to load alerts');
    } finally {
      setAlertsLoading(false);
    }
  }, [alertPage, alertFilter]);

  // ─── Fetch trends ────────────────────────────────
  const fetchTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const res = await getComplianceTrends({ period: trendsPeriod });
      const d = res.data || res;
      setTrends(Array.isArray(d) ? d : d.trends || d.data || []);
    } catch {
      setTrends([]);
    } finally {
      setTrendsLoading(false);
    }
  }, [trendsPeriod]);

  // ─── Effects ─────────────────────────────────────
  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'alerts') fetchAlerts();
  }, [activeTab, fetchAlerts]);

  useEffect(() => {
    if (activeTab === 'trends') fetchTrends();
  }, [activeTab, fetchTrends]);

  // ─── Resolve handler ─────────────────────────────
  const handleResolve = async () => {
    if (!resolveModal) return;
    setResolving(true);
    try {
      await resolveComplianceAlert(resolveModal._id || resolveModal.id, { note: resolveNote });
      setResolveModal(null);
      setResolveNote('');
      fetchAlerts();
      fetchOverview();
    } catch {
      // keep modal open
    } finally {
      setResolving(false);
    }
  };

  // ─── Build pie data from overview ────────────────
  const pieData = overview ? [
    { name: 'High (75%+)', value: Math.max(0, (overview.totalPatients || 0) - (overview.lowComplianceCount || 0) - (overview.mediumComplianceCount || 0)) },
    { name: 'Medium (50-74%)', value: overview.mediumComplianceCount || 0 },
    { name: 'Low (<50%)', value: overview.lowComplianceCount || 0 },
    { name: 'No Data', value: overview.noDataCount || 0 },
  ].filter((d) => d.value > 0) : [];

  // ─── Alert table columns ─────────────────────────
  const alertColumns = [
    {
      key: 'patient',
      label: 'Patient',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-[10px] font-bold text-primary-700">
            {(row.patient?.name || row.patientName || '?')[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium text-neutral-900">
            {row.patient?.name || row.patientName || 'Unknown'}
          </span>
        </div>
      ),
    },
    {
      key: 'alertType',
      label: 'Type',
      render: (row) => (
        <span className="text-xs capitalize text-neutral-500">
          {(row.alertType || '').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => (
        <span className={`inline-flex text-xs px-2.5 py-1 rounded-full font-medium capitalize ${SEVERITY_STYLES[row.severity] || 'bg-neutral-200 text-neutral-500'}`}>
          {row.severity || 'N/A'}
        </span>
      ),
    },
    {
      key: 'complianceRate',
      label: 'Compliance',
      render: (row) => (
        <span className={`text-sm font-semibold ${getComplianceColor(row.complianceRate)}`}>
          {row.complianceRate != null ? formatPercent(row.complianceRate) : '--'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex text-xs px-2.5 py-1 rounded-full font-medium capitalize ${ALERT_STATUS_STYLES[row.status] || 'bg-neutral-200 text-neutral-500'}`}>
          {row.status || 'N/A'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row) => (
        <span className="text-xs text-neutral-500">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => row.status === 'active' ? (
        <button
          onClick={(e) => { e.stopPropagation(); setResolveModal(row); }}
          className="px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition flex items-center gap-1"
        >
          <CheckCircle2 className="h-3 w-3" /> Resolve
        </button>
      ) : null,
    },
  ];

  // ─── Doctor compliance table columns ─────────────
  const doctorColumns = [
    {
      key: 'name',
      label: 'Doctor',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-[10px] font-bold text-emerald-700">
            {(row.doctorName || '?')[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium text-neutral-900">
            {row.doctorName || 'Unknown'}
          </span>
        </div>
      ),
    },
    {
      key: 'totalPatients',
      label: 'Patients',
      render: (row) => (
        <span className="text-sm text-neutral-600">{row.totalPatients ?? 0}</span>
      ),
    },
    {
      key: 'avgCompliance',
      label: 'Avg Compliance',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden max-w-[100px]">
            <div
              className={`h-full rounded-full transition-all ${
                (row.avgCompliance || 0) >= 75 ? 'bg-emerald-500' :
                (row.avgCompliance || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, row.avgCompliance || 0)}%` }}
            />
          </div>
          <span className={`text-sm font-semibold ${getComplianceColor(row.avgCompliance)}`}>
            {formatPercent(row.avgCompliance)}
          </span>
        </div>
      ),
    },
    {
      key: 'lowCompliancePatients',
      label: 'Low Compliance',
      render: (row) => {
        const count = row.lowCompliancePatients ?? 0;
        return count > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
            <AlertTriangle className="h-3 w-3" /> {count}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">--</span>
        );
      },
    },
  ];

  // ─── Stat values ─────────────────────────────────
  const statValues = {
    patients: overview?.totalPatients ?? 0,
    compliance: formatPercent(overview?.avgCompliance),
    low: overview?.lowComplianceCount ?? 0,
    alerts: overview?.activeAlerts ?? 0,
  };

  // ═══════════════════════════════════════════════════
  // ─── RENDER ────────────────────────────────────────
  // ═══════════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Care Compliance</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Monitor patient medication adherence and care plan compliance
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${cardCls} p-5`}>
              <Skeleton className="h-10 w-10 mb-4" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      ) : overview ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '50ms' }}
        >
          {STAT_CFG.map((cfg, i) => {
            const Icon = cfg.icon;
            const pal = PALETTE[i];
            return (
              <div
                key={cfg.key}
                className={`${cardCls} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
                style={{ animationDelay: `${100 + i * 50}ms` }}
              >
                <div className={`w-12 h-12 rounded-2xl ${pal.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`h-6 w-6 ${pal.text}`} />
                </div>
                <p className="text-[28px] font-bold text-neutral-900 leading-none">{statValues[cfg.key]}</p>
                <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* ─── Overview Tab ──────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <>
              <div className={`${cardCls} p-6`}><Skeleton className="h-64 w-full" /></div>
              <div className={`${cardCls} p-6`}><Skeleton className="h-48 w-full" /></div>
            </>
          ) : (
            <>
              {/* Compliance Distribution + Doctor Table */}
              <div
                className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-[fadeUp_0.4s_ease-out_both]"
                style={{ animationDelay: '200ms' }}
              >
                {/* Pie Chart */}
                <div className={`${cardCls} p-6 lg:col-span-2`}>
                  <h3 className="text-sm font-semibold text-neutral-900 font-display mb-4">
                    Compliance Distribution
                  </h3>
                  {pieData.length === 0 ? (
                    <EmptyState icon={HeartPulse} title="No data" message="No compliance data available" />
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {pieData.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...CHART_TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Doctor Breakdown Table */}
                <div className={`${cardCls} p-6 lg:col-span-3`}>
                  <h3 className="text-sm font-semibold text-neutral-900 font-display mb-4">
                    Compliance by Doctor
                  </h3>
                  {!overview?.byDoctor || overview.byDoctor.length === 0 ? (
                    <EmptyState icon={Users} title="No doctors" message="No doctor compliance data available" />
                  ) : (
                    <DataTable columns={doctorColumns} data={overview.byDoctor} />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Alerts Tab ────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div
            className={`${cardCls} p-4 flex flex-wrap gap-3 animate-[fadeUp_0.4s_ease-out_both]`}
            style={{ animationDelay: '200ms' }}
          >
            <select
              value={alertFilter.status}
              onChange={(e) => { setAlertFilter((p) => ({ ...p, status: e.target.value })); setAlertPage(1); }}
              className={selectCls}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={alertFilter.severity}
              onChange={(e) => { setAlertFilter((p) => ({ ...p, severity: e.target.value })); setAlertPage(1); }}
              className={selectCls}
            >
              <option value="">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {alertsError && <ErrorAlert message={alertsError} />}

          <div
            className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`}
            style={{ animationDelay: '250ms' }}
          >
            {alertsLoading ? (
              <div className="p-6"><Spinner /></div>
            ) : alerts.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={CheckCircle2}
                  title="No alerts"
                  message={alertFilter.status || alertFilter.severity ? 'Try adjusting your filters' : 'No compliance alerts found'}
                />
              </div>
            ) : (
              <>
                <DataTable columns={alertColumns} data={alerts} />
                {alertTotal > alertLimit && (
                  <div className="px-4 border-t border-neutral-200">
                    <Pagination page={alertPage} limit={alertLimit} total={alertTotal} onChange={setAlertPage} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Trends Tab ────────────────────────────── */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          {/* Period selector */}
          <div
            className="flex gap-2 animate-[fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '200ms' }}
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setTrendsPeriod(p.key)}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
                  trendsPeriod === p.key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div
            className={`${cardCls} p-6 animate-[fadeUp_0.4s_ease-out_both]`}
            style={{ animationDelay: '250ms' }}
          >
            <h3 className="text-sm font-semibold text-neutral-900 font-display mb-4">
              Compliance Rate Over Time
            </h3>

            {trendsLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : trends.length === 0 ? (
              <EmptyState icon={HeartPulse} title="No trend data" message="Not enough data to show trends" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      {...CHART_TOOLTIP_STYLE}
                      formatter={(v) => [`${(v || 0).toFixed(1)}%`, 'Compliance']}
                    />
                    <Line
                      type="monotone"
                      dataKey="complianceRate"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#0d9488', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#0d9488' }}
                    />
                    {trends[0]?.totalReminders !== undefined && (
                      <Line
                        type="monotone"
                        dataKey="totalReminders"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        yAxisId="right"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Resolve Alert Modal ───────────────────── */}
      <Modal
        open={!!resolveModal}
        onClose={() => { setResolveModal(null); setResolveNote(''); }}
        title="Resolve Compliance Alert"
      >
        {resolveModal && (
          <div className="space-y-4">
            <div className="p-4 bg-neutral-50 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <span className={`inline-flex text-xs px-2.5 py-1 rounded-full font-medium capitalize ${SEVERITY_STYLES[resolveModal.severity] || ''}`}>
                  {resolveModal.severity}
                </span>
                <span className="text-xs capitalize text-neutral-500">
                  {(resolveModal.alertType || '').replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-neutral-600">
                Patient: <strong>{resolveModal.patient?.name || resolveModal.patientName || 'Unknown'}</strong>
              </p>
              {resolveModal.message && (
                <p className="text-xs text-neutral-500 mt-1">{resolveModal.message}</p>
              )}
            </div>

            <div>
              <label className={labelCls}>
                Resolution Note (optional)
              </label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={3}
                placeholder="Add a note about how this was resolved..."
                className={inputCls}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setResolveModal(null); setResolveNote(''); }}
                className={btnGhost}
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving}
                className={`${btnPrimary} flex items-center gap-2`}
              >
                {resolving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resolving...
                  </span>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Resolve Alert
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
