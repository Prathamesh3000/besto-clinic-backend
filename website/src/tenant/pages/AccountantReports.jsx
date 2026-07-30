import { useState, useEffect, useCallback } from 'react';
import {
  IndianRupee, TrendingUp, AlertTriangle, Users,
  Calendar, CreditCard, BarChart3, RefreshCw,
} from 'lucide-react';
import { Spinner, ErrorAlert } from '../../platform/components/shared';
import {
  getRevenueAnalytics, getOutstandingReport, getDoctorRevenue, getRevenueTrends,
} from '../api';

/* ─── Helpers ──────────────────────────────────── */
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';

/* ─── Date presets ───────────────────────────────── */
function getPresetRange(key) {
  const now = new Date();
  const startOfDay = (d) => { d.setHours(0, 0, 0, 0); return d; };
  const endOfDay = (d) => { d.setHours(23, 59, 59, 999); return d; };

  switch (key) {
    case 'this_week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: startOfDay(start), to: endOfDay(new Date(now)) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(start), to: endOfDay(new Date(now)) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      return { from: startOfDay(start), to: endOfDay(new Date(now)) };
    }
    default:
      return null;
  }
}

const PRESETS = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
];

function toInputDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

/* ─── Section wrapper ────────────────────────────── */
function Section({ title, icon: Icon, children, delay = 0 }) {
  return (
    <div
      className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-[fadeUp_0.4s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-neutral-200">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary-600" />
          </div>
        )}
        <h3 className="text-[15px] font-semibold text-neutral-900 font-display">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ─── Stat card (small) ──────────────────────────── */
function MetricCard({ icon: Icon, label, value, iconBg, iconText }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconText}`} />
        </div>
      </div>
      <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

/* ─── Table helpers ──────────────────────────────── */
function Th({ children, align = 'left' }) {
  return (
    <th className={`text-${align} py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`text-${align} py-3 px-4 text-sm text-neutral-700 ${className}`}>
      {children}
    </td>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function AccountantReports() {
  // ─── Date range ────────────────────────────────
  const defaultRange = getPresetRange('this_month');
  const [dateFrom, setDateFrom] = useState(toInputDate(defaultRange.from));
  const [dateTo, setDateTo] = useState(toInputDate(defaultRange.to));
  const [activePreset, setActivePreset] = useState('this_month');

  // ─── Data ──────────────────────────────────────
  const [revenueData, setRevenueData] = useState(null);
  const [outstandingData, setOutstandingData] = useState(null);
  const [doctorData, setDoctorData] = useState([]);
  const [trendData, setTrendData] = useState([]);

  // ─── UI state ─────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // ─── Apply preset ─────────────────────────────
  const applyPreset = (key) => {
    const range = getPresetRange(key);
    if (range) {
      setDateFrom(toInputDate(range.from));
      setDateTo(toInputDate(range.to));
      setActivePreset(key);
    }
  };

  // ─── Fetch data ───────────────────────────────
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    const params = {};
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(dateTo + 'T23:59:59.999Z').toISOString();

    try {
      const [revenueRes, outstandingRes, doctorRes, trendsRes] = await Promise.allSettled([
        getRevenueAnalytics(params),
        getOutstandingReport(),
        getDoctorRevenue(params),
        getRevenueTrends({ ...params, granularity: 'day' }),
      ]);

      if (revenueRes.status === 'fulfilled') {
        setRevenueData(revenueRes.value?.data || revenueRes.value || {});
      }
      if (outstandingRes.status === 'fulfilled') {
        setOutstandingData(outstandingRes.value?.data || outstandingRes.value || {});
      }
      if (doctorRes.status === 'fulfilled') {
        setDoctorData(doctorRes.value?.data || doctorRes.value || []);
      }
      if (trendsRes.status === 'fulfilled') {
        const t = trendsRes.value?.data || trendsRes.value || [];
        setTrendData(Array.isArray(t) ? t : []);
      }

      if (
        revenueRes.status === 'rejected' &&
        outstandingRes.status === 'rejected' &&
        doctorRes.status === 'rejected' &&
        trendsRes.status === 'rejected'
      ) {
        setError('Failed to load report data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Derived values ───────────────────────────
  const totalRevenue = revenueData?.totalRevenue ?? revenueData?.summary?.totalRevenue ?? 0;
  const byMethod = revenueData?.byMethod || revenueData?.paymentMethods || [];
  const outstandingAmount = outstandingData?.totalOutstanding ?? 0;
  const overdueCount = outstandingData?.overdueCount ?? outstandingData?.count ?? 0;
  const outstandingInvoices = outstandingData?.invoices || [];

  const sortedDoctors = [...(Array.isArray(doctorData) ? doctorData : [])].sort(
    (a, b) => (b.revenue || b.totalRevenue || 0) - (a.revenue || a.totalRevenue || 0)
  );

  const maxMethodAmount = Math.max(...(byMethod.map((m) => m.amount || m.total || 0)), 1);

  const daysOverdue = (dueDate) => {
    if (!dueDate) return 0;
    const diff = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  // ─── Loading state ────────────────────────────
  if (loading) return <Spinner />;

  // ─── Error state ──────────────────────────────
  if (error && !revenueData && !outstandingData) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <button onClick={() => fetchData()} className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all duration-200">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Financial Reports</h1>
          <p className="text-sm text-neutral-600 mt-1">Revenue analytics, outstanding balances, and doctor performance</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Date range selector ─────────────────── */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          {/* Preset buttons */}
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`h-9 px-4 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                  activePreset === p.key
                    ? 'bg-primary-600 text-white border-primary-600 shadow-[var(--shadow-sm)]'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-3 ml-auto">
            <div className="w-40">
              <label className={labelCls}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(''); }}
                className={inputCls}
              />
            </div>
            <div className="w-40">
              <label className={labelCls}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(''); }}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ═══ Section 1: Revenue Overview ═══════════ */}
      <Section title="Revenue Overview" icon={TrendingUp} delay={100}>
        {/* Total revenue card */}
        <div className="mb-6">
          <MetricCard
            icon={IndianRupee}
            label="Total Revenue for Period"
            value={INR.format(totalRevenue)}
            iconBg="bg-emerald-50"
            iconText="text-emerald-600"
          />
        </div>

        {/* Revenue by payment method */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-neutral-900 font-display mb-3">Revenue by Payment Method</h4>
          {byMethod.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4 text-center">No payment method data available for the selected period.</p>
          ) : (
            <div className="space-y-3">
              {byMethod.map((method, idx) => {
                const amount = method.amount || method.total || 0;
                const pct = maxMethodAmount > 0 ? (amount / maxMethodAmount) * 100 : 0;
                const methodName = method.mode || method.name || method._id || 'Unknown';

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-neutral-900 capitalize">{methodName}</span>
                        <span className="text-sm font-semibold text-neutral-900">{INR.format(amount)}</span>
                      </div>
                      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Revenue trend */}
        <div>
          <h4 className="text-sm font-semibold text-neutral-900 font-display mb-3">Revenue Trend</h4>
          {trendData.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4 text-center">No trend data available for the selected period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/50">
                    <Th>Date</Th>
                    <Th align="right">Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.map((entry, idx) => {
                    const dateLabel = entry.date
                      ? new Date(entry.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                      : entry.label || `Day ${idx + 1}`;
                    return (
                      <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <Td>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                            <span className="font-medium text-neutral-900">{dateLabel}</span>
                          </div>
                        </Td>
                        <Td align="right" className="font-semibold text-neutral-900">
                          {INR.format(entry.revenue ?? entry.total ?? 0)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ═══ Section 2: Outstanding Report ═════════ */}
      <Section title="Outstanding Report" icon={AlertTriangle} delay={200}>
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <IndianRupee className="h-5 w-5 text-red-600" />
              </div>
              <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Total Outstanding</span>
            </div>
            <p className="text-2xl font-bold font-display text-red-700">{INR.format(outstandingAmount)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Overdue Invoices</span>
            </div>
            <p className="text-2xl font-bold font-display text-amber-700">{overdueCount}</p>
          </div>
        </div>

        {/* Outstanding invoices table */}
        {outstandingInvoices.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center">No outstanding invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  <Th>Patient</Th>
                  <Th>Invoice #</Th>
                  <Th align="right">Amount</Th>
                  <Th>Due Date</Th>
                  <Th align="right">Days Overdue</Th>
                </tr>
              </thead>
              <tbody>
                {outstandingInvoices.map((inv, idx) => {
                  const days = daysOverdue(inv.dueDate);
                  return (
                    <tr key={inv._id || inv.id || idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <Td>
                        <span className="font-medium text-neutral-900">
                          {inv.patient?.name || inv.patientName || 'Unknown'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-neutral-600 font-medium">
                          {inv.invoiceNumber || '—'}
                        </span>
                      </Td>
                      <Td align="right" className="font-semibold text-neutral-900">
                        {INR.format(inv.totalAmount ?? inv.amount ?? 0)}
                      </Td>
                      <Td>
                        <span className="text-neutral-600">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          days > 60 ? 'bg-red-50 text-red-700' : days > 30 ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {days} days
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ═══ Section 3: Doctor Revenue ═════════════ */}
      <Section title="Doctor Revenue" icon={Users} delay={300}>
        {sortedDoctors.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center">No doctor revenue data available for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  <Th>Doctor Name</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Invoice Count</Th>
                  <Th align="right">Avg per Invoice</Th>
                </tr>
              </thead>
              <tbody>
                {sortedDoctors.map((doc, idx) => {
                  const dRevenue = doc.revenue || doc.totalRevenue || 0;
                  const dCount = doc.invoiceCount || doc.count || 0;
                  const avgPerInvoice = dCount > 0 ? dRevenue / dCount : 0;

                  return (
                    <tr
                      key={doc._id || doc.id || idx}
                      className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                    >
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-primary-700">
                            {(doc.name || doc.doctorName || doc.doctor || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900">
                              {doc.name || doc.doctorName || doc.doctor || 'Unknown'}
                            </p>
                            {(doc.specialization || doc.department) && (
                              <p className="text-[11px] text-neutral-500">
                                {doc.specialization || doc.department}
                              </p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td align="right" className="font-semibold text-neutral-900">
                        {INR.format(dRevenue)}
                      </Td>
                      <Td align="right">
                        <span className="inline-flex items-center gap-1 text-neutral-700">
                          <BarChart3 className="h-3.5 w-3.5 text-neutral-400" />
                          {dCount}
                        </span>
                      </Td>
                      <Td align="right" className="text-neutral-600">
                        {INR.format(avgPerInvoice)}
                      </Td>
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
