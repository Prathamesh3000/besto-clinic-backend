import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, Users, Building2,
  Calendar, RefreshCw, AlertTriangle, Clock,
} from 'lucide-react';
import { Spinner, ErrorAlert } from '../../platform/components/shared';
import {
  getRevenueAnalytics, getOutstandingReport, getDoctorRevenue, listBranches,
} from '../api';

/* ─── Design tokens ─────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ─── Helpers ───────────────────────────────────── */
const formatINR = (n) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Convert a period key (today/week/month/quarter/year) to { from, to } date range. */
function periodToDateRange(periodKey) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from;
  switch (periodKey) {
    case 'today': from = to; break;
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      from = d.toISOString().split('T')[0]; break;
    }
    case 'quarter': {
      const q = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      from = q.toISOString().split('T')[0]; break;
    }
    case 'year': from = `${now.getFullYear()}-01-01`; break;
    default: { // 'month'
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; break;
    }
  }
  return { from, to };
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
];

const AGING_BUCKETS = [
  { key: '0_30', label: '0–30 Days', color: 'emerald', icon: Clock },
  { key: '31_60', label: '31–60 Days', color: 'amber', icon: Clock },
  { key: '61_90', label: '61–90 Days', color: 'orange', icon: AlertTriangle },
  { key: '90_plus', label: '90+ Days', color: 'red', icon: AlertTriangle },
];

const STAT_CFG = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign },
  { key: 'collected', title: 'Collected Amount', icon: TrendingUp },
  { key: 'outstanding', title: 'Outstanding', icon: AlertTriangle },
  { key: 'refunds', title: 'Refunds / Credits', icon: TrendingDown },
];

const PALETTE = [
  { icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
  { icon: 'bg-primary-100 text-primary-600', value: 'text-primary-700' },
  { icon: 'bg-amber-100 text-amber-600', value: 'text-amber-700' },
  { icon: 'bg-red-100 text-red-600', value: 'text-red-700' },
];

/* ─── Section wrapper ───────────────────────────── */
function Section({ title, icon: Icon, children, actions, delay = 0 }) {
  return (
    <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          {Icon && <div className="p-2 rounded-xl bg-primary-50 text-primary-600"><Icon className="h-4 w-4" /></div>}
          <h3 className="text-sm font-semibold text-neutral-900 font-display">{title}</h3>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ─── Table cells ───────────────────────────────── */
function Th({ children, align = 'left' }) {
  return <th className={`text-${align} py-3 px-4 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider`}>{children}</th>;
}

function Td({ children, align = 'left', className = '' }) {
  return <td className={`text-${align} py-3 px-4 text-sm text-neutral-600 ${className}`}>{children}</td>;
}

/* ─── Progress bar ──────────────────────────────── */
function ProgressBar({ value }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-neutral-500 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ─── Trend badge ───────────────────────────────── */
function TrendBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-neutral-400">—</span>;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

/* ═══ Main Component ═══════════════════════════════ */
export default function RevenueAnalytics() {
  const [period, setPeriod] = useState('month');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [doctorRevenue, setDoctorRevenue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => setBranches(res.data || res.branches || [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    const { from, to } = periodToDateRange(period);
    const params = { from, to };
    if (branchId) params.branch = branchId;
    try {
      const [revenueRes, outstandingRes, doctorRes] = await Promise.all([
        getRevenueAnalytics(params), getOutstandingReport(params), getDoctorRevenue(params),
      ]);
      setRevenue(revenueRes.data || revenueRes);
      setOutstanding(outstandingRes.data || outstandingRes);
      setDoctorRevenue(doctorRes.data || doctorRes.doctors || []);
    } catch (err) { setError(err.message || 'Failed to load revenue analytics'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [period, branchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Revenue totals from billing analytics
  const totals = revenue?.totals || {};
  const branchRevenue = revenue?.byBranch || [];
  const rawMonthly = revenue?.monthlyTrend || [];
  const monthlyTrend = rawMonthly.map((item) => ({
    month: item._id ? `${MONTH_NAMES[(item._id.month || 1) - 1]} ${item._id.year}` : (item.month || ''),
    revenue: item.totalRevenue || 0,
    collected: item.totalCollected || 0,
    invoiceCount: item.invoiceCount || 0,
  }));

  // Outstanding aging — backend uses '0-30' keys with { count, totalOutstanding }
  const agingSummary = outstanding?.summary || {};
  const agingBuckets = agingSummary.aging || {};
  const agingData = {
    '0_30': { amount: agingBuckets['0-30']?.totalOutstanding || 0, count: agingBuckets['0-30']?.count || 0 },
    '31_60': { amount: agingBuckets['31-60']?.totalOutstanding || 0, count: agingBuckets['31-60']?.count || 0 },
    '61_90': { amount: agingBuckets['61-90']?.totalOutstanding || 0, count: agingBuckets['61-90']?.count || 0 },
    '90_plus': { amount: agingBuckets['90+']?.totalOutstanding || 0, count: agingBuckets['90+']?.count || 0 },
  };

  const totalRevenue = totals.totalInvoiced || 0;
  const collected = totals.totalCollected || 0;
  const outstandingAmt = totals.totalOutstanding || 0;
  const refunds = totals.totalRefunded || 0;
  const statValues = { totalRevenue, collected, outstanding: outstandingAmt, refunds };

  // Branch name lookup from branches dropdown data
  const branchMap = {};
  branches.forEach((b) => { branchMap[String(b._id || b.id)] = b.name; });

  const sortedDoctors = [...doctorRevenue].sort((a, b) => (b.totalCollected || b.totalInvoiced || 0) - (a.totalCollected || a.totalInvoiced || 0));

  if (loading) return <Spinner />;

  if (error && !revenue) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <div className="flex justify-center"><button onClick={() => fetchData(true)} className={btnPrimary}><span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Retry</span></button></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 font-display">Revenue Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">Track revenue, collections, and financial performance across your clinic</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className={labelCls}>Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={`${selectCls} w-40`}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Branch</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${selectCls} w-44`}>
              <option value="">All Branches</option>
              {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>&nbsp;</label>
            <button onClick={() => fetchData(true)} disabled={refreshing} className={`${btnGhost} flex items-center gap-1.5`}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CFG.map((cfg, i) => {
          const pal = PALETTE[i];
          const Icon = cfg.icon;
          return (
            <div key={cfg.key} className={`${cardCls} p-5`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${50 + i * 50}ms` }}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${pal.icon}`}><Icon className="h-6 w-6" /></div>
                <div>
                  <p className={`text-[28px] font-bold leading-none ${pal.value}`}>{formatINR(statValues[cfg.key])}</p>
                  <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue by Branch */}
      <Section title="Revenue by Branch" icon={Building2} delay={300}>
        {branchRevenue.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">No branch revenue data available for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 bg-neutral-50/50"><Th>Branch Name</Th><Th align="right">Revenue</Th><Th align="right">Collections</Th><Th align="right">Outstanding</Th><Th>Collection %</Th></tr></thead>
              <tbody>
                {branchRevenue.map((branch, idx) => {
                  const bRevenue = branch.totalRevenue || 0;
                  const bCollected = branch.totalCollected || 0;
                  const bOutstanding = branch.totalOutstanding || 0;
                  const collectionPct = bRevenue > 0 ? (bCollected / bRevenue) * 100 : 0;
                  return (
                    <tr key={branch._id || branch.id || idx} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center"><Building2 className="h-3.5 w-3.5 text-primary-700" /></div>
                          <span className="font-medium text-neutral-900">{branch.branchName || branchMap[String(branch._id)] || 'Unknown Branch'}</span>
                        </div>
                      </Td>
                      <Td align="right" className="font-semibold text-neutral-900">{formatINR(bRevenue)}</Td>
                      <Td align="right" className="text-emerald-700 font-medium">{formatINR(bCollected)}</Td>
                      <Td align="right" className="text-amber-700 font-medium">{formatINR(bOutstanding)}</Td>
                      <Td><ProgressBar value={collectionPct} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Doctor Revenue Share */}
      <Section title="Doctor Revenue Share" icon={Users} delay={350}>
        {sortedDoctors.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">No doctor revenue data available for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 bg-neutral-50/50"><Th>Doctor Name</Th><Th align="right">Invoices</Th><Th align="right">Revenue Generated</Th><Th align="right">Avg per Invoice</Th></tr></thead>
              <tbody>
                {sortedDoctors.map((doc, idx) => {
                  const dRevenue = doc.totalInvoiced || doc.totalCollected || 0;
                  const dPatients = doc.invoiceCount || 0;
                  const avgPerPatient = dPatients > 0 ? dRevenue / dPatients : 0;
                  return (
                    <tr key={doc._id || doc.id || idx} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-primary-700">{(doc.name || doc.doctorName || '?')[0].toUpperCase()}</div>
                          <div>
                            <p className="font-medium text-neutral-900">{doc.name || doc.doctorName || 'Unknown'}</p>
                            {(doc.specialization || doc.department) && <p className="text-[11px] text-neutral-400">{doc.specialization || doc.department}</p>}
                          </div>
                        </div>
                      </Td>
                      <Td align="right"><span className="inline-flex items-center gap-1 text-neutral-600"><Users className="h-3.5 w-3.5 text-neutral-400" />{dPatients}</span></Td>
                      <Td align="right" className="font-semibold text-neutral-900">{formatINR(dRevenue)}</Td>
                      <Td align="right" className="text-neutral-500">{formatINR(avgPerPatient)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Outstanding Aging Report */}
      <Section title="Outstanding Aging Report" icon={AlertTriangle} delay={400}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AGING_BUCKETS.map((bucket) => {
            const data = agingData[bucket.key] || { amount: 0, count: 0 };
            const BucketIcon = bucket.icon;
            const colorMap = {
              emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', border: 'border-emerald-200/60', amountText: 'text-emerald-700' },
              amber:   { bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', border: 'border-amber-200/60', amountText: 'text-amber-700' },
              orange:  { bg: 'bg-orange-50', iconBg: 'bg-orange-100', iconText: 'text-orange-600', border: 'border-orange-200/60', amountText: 'text-orange-700' },
              red:     { bg: 'bg-red-50', iconBg: 'bg-red-100', iconText: 'text-red-600', border: 'border-red-200/60', amountText: 'text-red-700' },
            };
            const c = colorMap[bucket.color] || colorMap.emerald;
            return (
              <div key={bucket.key} className={`${c.bg} border ${c.border} rounded-2xl p-5 transition-shadow hover:shadow-sm`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`p-2 rounded-xl ${c.iconBg} ${c.iconText}`}><BucketIcon className="h-4 w-4" /></div>
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{bucket.label}</span>
                </div>
                <p className={`text-xl font-bold font-display ${c.amountText}`}>{formatINR(data.amount)}</p>
                <p className="text-[11px] text-neutral-400 mt-1">{data.count} {data.count === 1 ? 'invoice' : 'invoices'}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Total Outstanding</span>
          <div className="text-right">
            <p className="text-lg font-bold text-neutral-900 font-display">{formatINR(outstandingAmt)}</p>
            <p className="text-[11px] text-neutral-400">{(agingSummary?.totalInvoices || 0)} total invoices</p>
          </div>
        </div>
      </Section>

      {/* Monthly Revenue Trend */}
      <Section title="Monthly Revenue Trend" icon={BarChart3} delay={450}>
        {monthlyTrend.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">No monthly trend data available for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 bg-neutral-50/50"><Th>Month</Th><Th align="right">Revenue</Th><Th align="right">vs Previous</Th></tr></thead>
              <tbody>
                {monthlyTrend.map((item, idx) => {
                  const mRevenue = item.revenue || 0;
                  const prevRevenue = idx < monthlyTrend.length - 1 ? (monthlyTrend[idx + 1]?.revenue || 0) : null;
                  const pctChange = item.change !== undefined ? item.change : (item.percentChange !== undefined ? item.percentChange : (prevRevenue !== null && prevRevenue > 0 ? ((mRevenue - prevRevenue) / prevRevenue) * 100 : null));
                  return (
                    <tr key={item.month || item.label || idx} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <Td><div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-neutral-400" /><span className="font-medium text-neutral-900">{item.month || item.label || `Month ${idx + 1}`}</span></div></Td>
                      <Td align="right" className="font-semibold text-neutral-900">{formatINR(mRevenue)}</Td>
                      <Td align="right"><TrendBadge value={pctChange} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
