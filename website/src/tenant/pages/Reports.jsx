import { useState, useEffect, lazy, Suspense } from 'react';
import { Spinner, ErrorAlert, TabBar } from '../../platform/components/shared';
import { getDashboard } from '../api';
import {
  BarChart3, DollarSign, Users, CalendarDays, Star, TrendingUp,
  Activity, ClipboardCheck, UserCheck, FileText, PieChart as PieIcon,
} from 'lucide-react';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

/* ─── Stat Card Config ─────────────────────────── */
const STAT_CFG = [
  { key: 'revenue',      title: 'Monthly Revenue',    icon: DollarSign },
  { key: 'patients',     title: 'Total Patients',     icon: Users },
  { key: 'appointments', title: "Today's Appointments", icon: CalendarDays },
  { key: 'rating',       title: 'Average Rating',     icon: Star },
];
const PALETTE = [
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-primary-50', text: 'text-primary-600' },
  { bg: 'bg-blue-50',    text: 'text-blue-600' },
  { bg: 'bg-amber-50',   text: 'text-amber-600' },
];

// ── Fallback bar chart rendered with plain divs ──────────────
function SimpleBarChart({ data, dataKey, labelKey, color = 'bg-primary-500' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d[dataKey] || 0), 1);

  return (
    <div className="flex items-end gap-2 h-48 px-2">
      {data.map((item, i) => {
        const value = item[dataKey] || 0;
        const pct = (value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-neutral-500">{value}</span>
            <div className="w-full rounded-t-lg relative overflow-hidden bg-neutral-100" style={{ height: '100%' }}>
              <div
                className={`absolute bottom-0 left-0 right-0 rounded-t-lg ${color} transition-all duration-500`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-400 truncate max-w-full">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Recharts wrapper (lazy) ──────────────────────────────────
let RechartsBar = null;
try {
  const recharts = await import('recharts');
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = recharts;

  RechartsBar = function RechartsBarChart({ data, dataKey, labelKey }) {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          />
          <Bar dataKey={dataKey} fill="var(--color-primary-500, #6366f1)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };
} catch {
  // recharts not available — fallback is used below
}

// ── Sample monthly data (used when API doesn't return chart data) ──
const SAMPLE_MONTHS = [
  { month: 'Jan', revenue: 42000, patients: 120, appointments: 340 },
  { month: 'Feb', revenue: 48000, patients: 135, appointments: 380 },
  { month: 'Mar', revenue: 51000, patients: 142, appointments: 410 },
  { month: 'Apr', revenue: 46000, patients: 128, appointments: 365 },
  { month: 'May', revenue: 55000, patients: 155, appointments: 430 },
  { month: 'Jun', revenue: 60000, patients: 168, appointments: 460 },
];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'financial', label: 'Financial' },
  { key: 'clinical', label: 'Clinical' },
];

// ── Metric Card (small inline card for tab panels) ───────────
function MetricCard({ icon: Icon, label, value, sub, color = 'primary' }) {
  const palette = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-emerald-50 text-emerald-600',
    yellow: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className={`${cardCls} p-5 hover:shadow-[var(--shadow-md)] transition-shadow`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl ${palette[color] || palette.primary}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-neutral-900 font-display">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────
function Section({ title, children, delay = 0 }) {
  return (
    <div
      className={`${cardCls} p-6 animate-[fadeUp_0.4s_ease-out_both]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="text-sm font-semibold text-neutral-900 font-display mb-5">{title}</h3>
      {children}
    </div>
  );
}

// ── Format helpers ───────────────────────────────────────────
function formatCurrency(n) {
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

// ── Main Component ───────────────────────────────────────────
export default function Reports() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getDashboard();
        setData(res.data || res);
      } catch (err) {
        setError(err.message || 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorAlert message={error} />;

  const stats = data?.stats || data || {};
  const totalRevenue = stats.revenueThisMonth ?? stats.totalRevenue ?? stats.revenue ?? 0;
  const totalPatients = stats.totalPatients ?? stats.patients ?? 0;
  const totalAppointments = stats.todayAppointments ?? stats.totalAppointments ?? stats.appointments ?? 0;
  const avgRating = stats.averageRating ?? stats.avgRating ?? 0;
  const completionRate = stats.completionRate ?? stats.appointmentCompletionRate ?? 0;
  const cancelRate = stats.cancellationRate ?? 0;
  const pendingInvoices = stats.pendingInvoices ?? 0;
  const paidInvoices = stats.paidInvoices ?? 0;
  const monthlyData = data?.monthlyData || data?.chartData || stats.monthlyData || stats.chartData || SAMPLE_MONTHS;

  const statDisplayValues = {
    revenue: formatCurrency(totalRevenue),
    patients: totalPatients.toLocaleString('en-IN'),
    appointments: totalAppointments.toLocaleString('en-IN'),
    rating: avgRating ? `${Number(avgRating).toFixed(1)} / 5` : 'N/A',
  };

  const ChartComponent = RechartsBar || SimpleBarChart;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* ── Page Header ─────────────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Reports</h1>
        <p className="text-sm text-neutral-500 mt-1">Clinic performance overview and analytics</p>
      </div>

      {/* ── Summary Stat Cards ──────────────────────── */}
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
              <p className="text-[28px] font-bold text-neutral-900 leading-none">{statDisplayValues[cfg.key]}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ────────────────────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* ── Overview Tab ────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <Section title="Performance Summary" delay={250}>
            <p className="text-sm text-neutral-500 leading-relaxed mb-6">
              This report summarises key performance indicators across your clinic operations.
              Revenue, patient volume, and appointment metrics are aggregated from all branches.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard icon={TrendingUp} label="Revenue Growth" value={stats.revenueTrend ? `${stats.revenueTrend}%` : '--'} sub="vs. previous period" color="green" />
              <MetricCard icon={UserCheck} label="Patient Retention" value={stats.retentionRate ? `${stats.retentionRate}%` : '--'} sub="returning patients" color="primary" />
              <MetricCard icon={ClipboardCheck} label="Completion Rate" value={completionRate ? `${completionRate}%` : '--'} sub="appointments completed" color="blue" />
            </div>
          </Section>

          <Section title="Monthly Trend" delay={300}>
            <ChartComponent
              data={monthlyData}
              dataKey="revenue"
              labelKey="month"
              color="bg-primary-500"
            />
          </Section>
        </div>
      )}

      {/* ── Financial Tab ───────────────────────────── */}
      {tab === 'financial' && (
        <div className="space-y-6">
          <Section title="Revenue Breakdown" delay={250}>
            <ChartComponent
              data={monthlyData}
              dataKey="revenue"
              labelKey="month"
              color="bg-emerald-500"
            />
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard icon={DollarSign} label="Total Revenue" value={formatCurrency(totalRevenue)} color="green" />
            <MetricCard icon={FileText} label="Pending Invoices" value={pendingInvoices.toLocaleString('en-IN')} sub="awaiting payment" color="yellow" />
            <MetricCard icon={FileText} label="Paid Invoices" value={paidInvoices.toLocaleString('en-IN')} sub="successfully collected" color="green" />
            <MetricCard
              icon={PieIcon}
              label="Collection Rate"
              value={
                paidInvoices + pendingInvoices > 0
                  ? `${Math.round((paidInvoices / (paidInvoices + pendingInvoices)) * 100)}%`
                  : '--'
              }
              sub="paid / total"
              color="primary"
            />
          </div>

          <Section title="Revenue by Month" delay={300}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Month</th>
                    <th className="text-right py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Revenue</th>
                    <th className="text-right py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Patients</th>
                    <th className="text-right py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Avg / Patient</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((row, i) => (
                    <tr key={i} className="border-b border-neutral-100 last:border-0">
                      <td className="py-3 px-4 font-medium text-neutral-700">{row.month}</td>
                      <td className="py-3 px-4 text-right text-neutral-700">{formatCurrency(row.revenue || 0)}</td>
                      <td className="py-3 px-4 text-right text-neutral-700">{(row.patients || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-neutral-500">
                        {row.patients ? formatCurrency(Math.round((row.revenue || 0) / row.patients)) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ── Clinical Tab ────────────────────────────── */}
      {tab === 'clinical' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={CalendarDays}
              label="Total Appointments"
              value={totalAppointments.toLocaleString('en-IN')}
              color="blue"
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Completion Rate"
              value={completionRate ? `${completionRate}%` : '--'}
              sub="appointments completed successfully"
              color="green"
            />
            <MetricCard
              icon={Activity}
              label="Cancellation Rate"
              value={cancelRate ? `${cancelRate}%` : '--'}
              sub="appointments cancelled"
              color="red"
            />
            <MetricCard
              icon={Users}
              label="Patient Volume"
              value={totalPatients.toLocaleString('en-IN')}
              sub="total registered patients"
              color="primary"
            />
          </div>

          <Section title="Appointment Volume by Month" delay={250}>
            <ChartComponent
              data={monthlyData}
              dataKey="appointments"
              labelKey="month"
              color="bg-blue-500"
            />
          </Section>

          <Section title="Patient Volume by Month" delay={300}>
            <ChartComponent
              data={monthlyData}
              dataKey="patients"
              labelKey="month"
              color="bg-purple-500"
            />
          </Section>
        </div>
      )}
    </div>
  );
}
