import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Calendar, DollarSign, Activity,
  Video, Shield, RefreshCw, BarChart3,
} from 'lucide-react';
import {
  getAnalyticsSummary, getRevenueTrends, getAppointmentTrends,
  getDoctorPerformance, getNoShowAnalysis, getInsuranceClaimTrends,
  getTelemedicineUsage, getPatientGrowth, getIntegrationUsage,
} from '../api';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';

// ─── Constants ─────────────────────────────────
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'revenue', label: 'Revenue', icon: DollarSign },
  { key: 'appointments', label: 'Appointments', icon: Calendar },
  { key: 'doctors', label: 'Doctors', icon: Activity },
  { key: 'patients', label: 'Patients', icon: Users },
  { key: 'insurance', label: 'Insurance', icon: Shield },
  { key: 'telemedicine', label: 'Telemedicine', icon: Video },
  { key: 'integrations', label: 'Integrations', icon: RefreshCw },
];

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const CHART_TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 },
};

// ─── Format Helpers ────────���───────────────────
function formatCurrency(n) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

function formatPercent(n) {
  return (n || 0).toFixed(1) + '%';
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Turn backend period strings into readable labels: "2026-04" → "Apr '26" */
function formatPeriodLabel(raw) {
  if (!raw) return raw;
  const wk = raw.match(/^(\d{4})-W(\d{2})$/);
  if (wk) {
    const jan4 = new Date(+wk[1], 0, 4);
    const dow = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dow + 1 + (+wk[2] - 1) * 7);
    return `${monday.getDate()} ${MONTH_SHORT[monday.getMonth()]}`;
  }
  const daily = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (daily) return `${+daily[3]} ${MONTH_SHORT[+daily[2] - 1]}`;
  const monthly = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthly) return `${MONTH_SHORT[+monthly[2] - 1]} '${monthly[1].slice(2)}`;
  return raw;
}

/** Build payment mode breakdown from revenue dataPoints for pie chart */
function buildPaymentModeBreakdown(dataPoints) {
  const totals = {};
  for (const dp of dataPoints) {
    for (const [mode, amount] of Object.entries(dp.byMode || {})) {
      totals[mode] = (totals[mode] || 0) + amount;
    }
  }
  return Object.entries(totals).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// ─── Skeleton Loader ───────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200 rounded-xl ${className}`} />;
}

function ChartSkeleton() {
  return (
    <div className={`${cardCls} p-6`}>
      <Skeleton className="h-4 w-40 mb-6" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CardsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${cardCls} p-5`}>
          <Skeleton className="h-8 w-8 mb-3" />
          <Skeleton className="h-7 w-24 mb-2" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue }) {
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-xl bg-primary-50">
          <Icon className="h-5 w-5 text-primary-600" />
        </div>
        {trend !== undefined && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              trend >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {Math.abs(trendValue || trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500 mt-1">{title}</p>
      {subtitle && <p className="text-[10px] text-neutral-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Section Wrapper ───────────────────────────
function Section({ title, children, className = '', delay = 0 }) {
  return (
    <div
      className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <div className="px-6 py-4 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-neutral-900 font-display">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Table Helpers ─────────────────────────────
function Th({ children, align = 'left' }) {
  return (
    <th className={`text-${align} py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`text-${align} py-3 px-4 text-sm text-neutral-600 ${className}`}>
      {children}
    </td>
  );
}

// ─── Progress Bar ──────────────────────────────
function ProgressBar({ value, color = 'primary' }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const colorMap = {
    primary: 'bg-primary-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorMap[color] || colorMap.primary} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-neutral-500 w-10 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Error Alert ───────────────────────────────
function ErrorMessage({ message, onRetry }) {
  return (
    <div className={`${cardCls} border-red-200 p-6 text-center`}>
      <p className="text-sm text-red-700 mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────
function OverviewTab({ summary, tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <CardsSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <CardsSkeleton count={3} />
      </div>
    );
  }

  const s = summary || {};
  const revenue = tabData?.revenueTrends || [];
  const appointments = tabData?.appointmentTrends || [];
  const quickStats = tabData?.quickStats || {};

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(s.revenue?.thisMonth)}
          subtitle={`Last month: ${formatCurrency(s.revenue?.lastMonth)}`}
          icon={DollarSign}
          trend={s.revenue?.growth}
          trendValue={s.revenue?.growth}
        />
        <StatCard
          title="Appointments Today"
          value={s.appointments?.today || 0}
          subtitle={`Completion rate: ${formatPercent(s.appointments?.completionRate)}`}
          icon={Calendar}
        />
        <StatCard
          title="Total Patients"
          value={(s.patients?.total || 0).toLocaleString('en-IN')}
          subtitle={`New this month: ${s.patients?.newThisMonth || 0}`}
          icon={Users}
          trend={s.patients?.newThisMonth > 0 ? 1 : 0}
          trendValue={s.patients?.growthPercent}
        />
        <StatCard
          title="No-Show Rate"
          value={formatPercent(s.noShowRate)}
          subtitle={s.noShowRate > 10 ? 'Above acceptable threshold' : 'Within acceptable range'}
          icon={Activity}
          trend={s.noShowRate > 10 ? -1 : 1}
          trendValue={s.noShowRate}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Revenue Trend (6 Months)" delay={100}>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'K'} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v), 'Revenue']} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#0d9488"
                  fill="#ccfbf1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0d9488' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-neutral-400">
              No revenue data available
            </div>
          )}
        </Section>

        <Section title="Appointment Trend" delay={150}>
          {appointments.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={appointments}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" stackId="a" fill="#22c55e" name="Completed" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cancelled" stackId="a" fill="#ef4444" name="Cancelled" />
                <Bar dataKey="noShow" stackId="a" fill="#f59e0b" name="No-Show" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-neutral-400">
              No appointment data available
            </div>
          )}
        </Section>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Telemedicine Sessions"
          value={quickStats.telemedicine?.sessionsThisMonth || 0}
          subtitle="This month"
          icon={Video}
        />
        <StatCard
          title="Insurance Approval Rate"
          value={formatPercent(quickStats.insurance?.approvalRate)}
          subtitle={`${quickStats.insurance?.totalClaims || 0} total claims`}
          icon={Shield}
        />
        <StatCard
          title="Active Integrations"
          value={quickStats.integrations?.activeCount || 0}
          subtitle={`${quickStats.integrations?.totalSynced || 0} records synced`}
          icon={RefreshCw}
        />
      </div>
    </div>
  );
}

// ─── Revenue Tab ───────────────────────────────
function RevenueTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton />
        <CardsSkeleton count={4} />
        <ChartSkeleton />
      </div>
    );
  }

  const trends = tabData?.trends || [];
  const totals = tabData?.totals || {};
  const paymentModes = tabData?.paymentModeBreakdown || [];

  return (
    <div className="space-y-6">
      <Section title="Revenue Over Time">
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'K'} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="total" stroke="#0d9488" fill="#ccfbf1" strokeWidth={2} name="Total" />
              {trends[0]?.cash !== undefined && (
                <Area type="monotone" dataKey="cash" stroke="#6366f1" fill="#e0e7ff" strokeWidth={1.5} name="Cash" />
              )}
              {trends[0]?.card !== undefined && (
                <Area type="monotone" dataKey="card" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={1.5} name="Card" />
              )}
              {trends[0]?.online !== undefined && (
                <Area type="monotone" dataKey="online" stroke="#06b6d4" fill="#cffafe" strokeWidth={1.5} name="Online" />
              )}
              {trends[0]?.insurance !== undefined && (
                <Area type="monotone" dataKey="insurance" stroke="#22c55e" fill="#dcfce7" strokeWidth={1.5} name="Insurance" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-neutral-400">
            No revenue trend data available
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Collected" value={formatCurrency(totals.collected)} icon={DollarSign} trend={1} />
        <StatCard title="Refunded" value={formatCurrency(totals.refunded)} icon={TrendingDown} />
        <StatCard title="Outstanding" value={formatCurrency(totals.outstanding)} subtitle={totals.outstanding > 0 ? 'Pending collection' : 'All clear'} icon={DollarSign} />
        <StatCard title="Net Revenue" value={formatCurrency(totals.net)} icon={TrendingUp} trend={totals.net > 0 ? 1 : -1} />
      </div>

      {paymentModes.length > 0 && (
        <Section title="Payment Mode Breakdown">
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <ResponsiveContainer width="100%" height={280} className="max-w-sm">
              <PieChart>
                <Pie
                  data={paymentModes}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#9ca3af' }}
                >
                  {paymentModes.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {paymentModes.map((mode, idx) => (
                <div key={mode.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm text-neutral-600">{mode.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-neutral-900">{formatCurrency(mode.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Appointments Tab ──────────────────────────
function AppointmentsTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton />
        <CardsSkeleton count={4} />
        <ChartSkeleton />
      </div>
    );
  }

  const trends = tabData?.trends || [];
  const stats = tabData?.stats || {};
  const completionRateTrend = tabData?.completionRateTrend || [];

  return (
    <div className="space-y-6">
      <Section title="Appointment Trends by Status">
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" stackId="a" fill="#22c55e" name="Completed" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" name="Cancelled" />
              <Bar dataKey="noShow" stackId="a" fill="#f59e0b" name="No-Show" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-neutral-400">
            No appointment trend data available
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Appointments" value={(stats.total || 0).toLocaleString('en-IN')} icon={Calendar} />
        <StatCard title="Completion Rate" value={formatPercent(stats.completionRate)} icon={TrendingUp} trend={stats.completionRate >= 80 ? 1 : -1} />
        <StatCard title="Cancellation Rate" value={formatPercent(stats.cancellationRate)} icon={TrendingDown} trend={stats.cancellationRate <= 10 ? 1 : -1} />
        <StatCard title="Avg Per Day" value={stats.avgPerDay || 0} icon={BarChart3} />
      </div>

      {completionRateTrend.length > 0 && (
        <Section title="Completion Rate Trend">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={completionRateTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} domain={[0, 100]} tickFormatter={(v) => v + '%'} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatPercent(v), 'Completion Rate']} />
              <Line type="monotone" dataKey="rate" stroke="#0d9488" strokeWidth={2} dot={{ r: 4, fill: '#0d9488' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}

// ─── Doctors Tab ───────────────────────────────
function DoctorsTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton />
        <div className={`${cardCls} p-6`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-3" />
          ))}
        </div>
      </div>
    );
  }

  const doctors = (tabData?.doctors || []).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  const top10 = doctors.slice(0, 10);

  return (
    <div className="space-y-6">
      {top10.length > 0 && (
        <Section title="Top 10 Doctors by Revenue">
          <ResponsiveContainer width="100%" height={Math.max(280, top10.length * 40)}>
            <BarChart data={top10} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'K'} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} width={100} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill="#0d9488" radius={[0, 6, 6, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section title="Doctor Performance">
        {doctors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <Th>Doctor</Th>
                  <Th align="right">Appointments</Th>
                  <Th align="right">Completed</Th>
                  <Th align="right">No-Shows</Th>
                  <Th align="right">No-Show Rate</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Avg Rev/Visit</Th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doc, idx) => {
                  const noShowRate = doc.appointments ? ((doc.noShows || 0) / doc.appointments * 100) : 0;
                  const avgRev = doc.completed ? ((doc.revenue || 0) / doc.completed) : 0;
                  return (
                    <tr key={doc._id || doc.id || idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition">
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-primary-700">
                            {(doc.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-neutral-900">{doc.name}</p>
                            {doc.department && (
                              <p className="text-[11px] text-neutral-400">{doc.department}</p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td align="right">{(doc.appointments || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">{(doc.completed || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">{(doc.noShows || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            noShowRate > 15
                              ? 'bg-red-50 text-red-700'
                              : noShowRate > 10
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {formatPercent(noShowRate)}
                        </span>
                      </Td>
                      <Td align="right" className="font-semibold text-neutral-900">
                        {formatCurrency(doc.revenue)}
                      </Td>
                      <Td align="right">{formatCurrency(avgRev)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-400">
            No doctor performance data available
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Patients Tab ──────────────────────────────
function PatientsTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <CardsSkeleton count={4} />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  const growth = tabData?.growth || [];
  const cumulative = tabData?.cumulative || [];
  const stats = tabData?.stats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Patients" value={(stats.total || 0).toLocaleString('en-IN')} icon={Users} />
        <StatCard title="New This Month" value={stats.newThisMonth || 0} icon={TrendingUp} trend={stats.newThisMonth > 0 ? 1 : 0} trendValue={stats.growthPercent} />
        <StatCard title="Retention Rate" value={formatPercent(stats.retentionRate)} icon={Activity} trend={stats.retentionRate >= 70 ? 1 : -1} />
        <StatCard title="Avg New/Month" value={stats.avgNewPerMonth || 0} icon={BarChart3} />
      </div>

      <Section title="New Patients Per Period">
        {growth.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [v, 'New Patients']} />
              <Line type="monotone" dataKey="newPatients" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-72 flex items-center justify-center text-sm text-neutral-400">
            No patient growth data available
          </div>
        )}
      </Section>

      {cumulative.length > 0 && (
        <Section title="Cumulative Patient Count">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={cumulative}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [(v || 0).toLocaleString('en-IN'), 'Total Patients']} />
              <Area type="monotone" dataKey="total" stroke="#0d9488" fill="#ccfbf1" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}

// ─── Insurance Tab ─────────────────────────────
function InsuranceTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton />
        <CardsSkeleton count={5} />
        <ChartSkeleton />
      </div>
    );
  }

  const trends = tabData?.trends || [];
  const stats = tabData?.stats || {};
  const approvalTrend = tabData?.approvalRateTrend || [];

  return (
    <div className="space-y-6">
      <Section title="Insurance Claims Trend">
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="submitted" stackId="a" fill="#6366f1" name="Submitted" />
              <Bar dataKey="approved" stackId="a" fill="#22c55e" name="Approved" />
              <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rejected" />
              <Bar dataKey="settled" stackId="a" fill="#06b6d4" name="Settled" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-neutral-400">
            No insurance claim data available
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Claims" value={(stats.totalClaims || 0).toLocaleString('en-IN')} icon={Shield} />
        <StatCard title="Approval Rate" value={formatPercent(stats.approvalRate)} icon={TrendingUp} trend={stats.approvalRate >= 70 ? 1 : -1} />
        <StatCard title="Avg Processing Days" value={stats.avgProcessingDays || '--'} subtitle="Days to settle" icon={Calendar} />
        <StatCard title="Settled Amount" value={formatCurrency(stats.totalSettled)} icon={DollarSign} />
        <StatCard title="Pending Amount" value={formatCurrency(stats.pendingAmount)} subtitle={stats.pendingAmount > 0 ? 'Awaiting settlement' : 'All clear'} icon={DollarSign} />
      </div>

      {approvalTrend.length > 0 && (
        <Section title="Approval Rate Trend">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={approvalTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} domain={[0, 100]} tickFormatter={(v) => v + '%'} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v) => [formatPercent(v), 'Approval Rate']} />
              <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}

// ─── Telemedicine Tab ──────────────────────────
function TelemedicineTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton />
        <CardsSkeleton count={3} />
        <ChartSkeleton />
      </div>
    );
  }

  const trends = tabData?.trends || [];
  const stats = tabData?.stats || {};
  const byType = tabData?.byType || [];

  return (
    <div className="space-y-6">
      <Section title="Telemedicine Session Trends">
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="emergency" fill="#ef4444" name="Emergency" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scheduled" fill="#6366f1" name="Scheduled" radius={[4, 4, 0, 0]} />
              <Bar dataKey="followUp" fill="#22c55e" name="Follow-Up" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-neutral-400">
            No telemedicine data available
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Sessions" value={(stats.totalSessions || 0).toLocaleString('en-IN')} icon={Video} />
        <StatCard title="Avg Duration" value={stats.avgDuration ? `${stats.avgDuration} min` : '--'} icon={Calendar} />
        <StatCard title="Completion Rate" value={formatPercent(stats.completionRate)} icon={TrendingUp} trend={stats.completionRate >= 80 ? 1 : -1} />
      </div>

      {byType.length > 0 && (
        <Section title="Sessions by Type">
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <ResponsiveContainer width="100%" height={280} className="max-w-sm">
              <PieChart>
                <Pie
                  data={byType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#9ca3af' }}
                >
                  {byType.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {byType.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm text-neutral-600">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-neutral-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Integrations Tab ──────────────────────────
function IntegrationsTab({ tabData, loading }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <CardsSkeleton count={2} />
      </div>
    );
  }

  const integrations = tabData?.integrations || [];

  if (integrations.length === 0) {
    return (
      <div className={`${cardCls} p-12 text-center`}>
        <RefreshCw className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
        <p className="text-sm text-neutral-500">No integration data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {integrations.map((integration) => {
        const isActive = integration.status === 'active';
        const successRate = integration.syncCount > 0
          ? ((integration.successCount || 0) / integration.syncCount * 100)
          : 0;

        return (
          <div
            key={integration.name || integration.id}
            className={`${cardCls} overflow-hidden`}
          >
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary-50">
                  <RefreshCw className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 font-display">
                    {integration.name}
                  </h3>
                  {integration.type && (
                    <p className="text-[11px] text-neutral-400">{integration.type}</p>
                  )}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Last Sync</span>
                <span className="text-sm text-neutral-600">
                  {integration.lastSync
                    ? new Date(integration.lastSync).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Syncs (30 days)</span>
                <span className="text-sm font-semibold text-neutral-900">
                  {(integration.syncCount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-neutral-500">Success Rate</span>
                </div>
                <ProgressBar
                  value={successRate}
                  color={successRate >= 90 ? 'emerald' : successRate >= 70 ? 'amber' : 'red'}
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                <span className="text-xs text-neutral-500">Total Records Synced</span>
                <span className="text-sm font-semibold text-neutral-900">
                  {(integration.totalRecords || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────
export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('monthly');
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [tabData, setTabData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getAnalyticsSummary({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setSummary(res.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load analytics summary');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // Helper to unwrap API response { success, data } → data
  const unwrap = (res) => res?.data ?? res;

  const fetchTabData = useCallback(async () => {
    const params = {
      period,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    try {
      setTabLoading(true);
      setError('');
      let data = null;

      switch (activeTab) {
        case 'overview': {
          const [revRaw, apptRaw, noShowRaw, teleRaw, insRaw, intRaw] =
            await Promise.all([
              getRevenueTrends(params).catch(() => ({})),
              getAppointmentTrends(params).catch(() => ({})),
              getNoShowAnalysis(params).catch(() => ({})),
              getTelemedicineUsage(params).catch(() => ({})),
              getInsuranceClaimTrends(params).catch(() => ({})),
              getIntegrationUsage(params).catch(() => ({})),
            ]);
          const rev = unwrap(revRaw);
          const appt = unwrap(apptRaw);
          const tele = unwrap(teleRaw);
          const ins = unwrap(insRaw);
          const intg = unwrap(intRaw);
          data = {
            revenueTrends: (rev?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) })),
            appointmentTrends: (appt?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) })),
            quickStats: {
              telemedicine: {
                sessionsThisMonth: tele?.summary?.totalSessions || 0,
              },
              insurance: {
                approvalRate: ins?.summary?.approvalRate || 0,
                totalClaims: ins?.summary?.totalClaims || 0,
              },
              integrations: {
                activeCount: (intg?.integrations || []).filter((i) => i.isActive).length,
                totalSynced: (intg?.integrations || []).reduce((s, i) => s + (i.totalRecords || 0), 0),
              },
            },
          };  
          break;
        }
        case 'revenue': {
          const raw = unwrap(await getRevenueTrends(params));
          data = {
            trends: (raw?.dataPoints || []).map((d) => ({
              ...d,
              label: formatPeriodLabel(d.period),
              ...(d.byMode || {}),
            })),
            totals: raw?.totals || {},
            paymentModeBreakdown: buildPaymentModeBreakdown(raw?.dataPoints || []),
          };
          break;
        }
        case 'appointments': {
          const raw = unwrap(await getAppointmentTrends(params));
          const points = (raw?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            trends: points,
            stats: raw?.summary || {},
            completionRateTrend: points.map((d) => ({
              label: d.label,
              rate: d.total > 0 ? (d.completed / d.total) * 100 : 0,
            })),
          };
          break;
        }
        case 'doctors': {
          const raw = unwrap(await getDoctorPerformance(params));
          data = {
            doctors: (raw?.doctors || []).map((d) => ({
              ...d,
              name: d.doctorName || d.name,
              appointments: d.totalAppointments,
              noShows: d.noShowCount,
            })),
          };
          break;
        }
        case 'patients': {
          const raw = unwrap(await getPatientGrowth(params));
          const points = (raw?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            growth: points,
            cumulative: points.map((d) => ({ label: d.label, total: d.cumulativeTotal || 0 })),
            stats: {
              total: raw?.summary?.totalPatients || 0,
              newThisMonth: raw?.summary?.newThisMonth || 0,
              retentionRate: raw?.summary?.retentionRate || 0,
              avgNewPerMonth: raw?.summary?.avgNewPerMonth || 0,
              growthPercent: raw?.summary?.growthPercent,
            },
          };
          break;
        }
        case 'insurance': {
          const raw = unwrap(await getInsuranceClaimTrends(params));
          const points = (raw?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            trends: points,
            stats: {
              totalClaims: raw?.summary?.totalClaims || 0,
              approvalRate: raw?.summary?.approvalRate || 0,
              avgProcessingDays: raw?.summary?.avgProcessingDays || '--',
              totalSettled: raw?.summary?.totalSettled || 0,
              pendingAmount: raw?.summary?.totalPending || 0,
            },
            approvalRateTrend: points.map((d) => ({
              label: d.label,
              rate: d.submitted > 0 ? (d.approved / d.submitted) * 100 : 0,
            })),
          };
          break;
        }
        case 'telemedicine': {
          const raw = unwrap(await getTelemedicineUsage(params));
          const points = (raw?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            trends: points,
            stats: raw?.summary || {},
            byType: raw?.summary?.byType
              ? Object.entries(raw.summary.byType).map(([name, value]) => ({
                  name: name.charAt(0).toUpperCase() + name.slice(1),
                  value,
                }))
              : [],
          };
          break;
        }
        case 'integrations': {
          const raw = unwrap(await getIntegrationUsage(params));
          data = {
            integrations: (raw?.integrations || []).map((i) => ({
              ...i,
              name: i.name || i.type,
              status: i.isActive ? 'active' : 'inactive',
              syncCount: i.syncCount30d || i.syncCount || 0,
              successCount: i.successRate != null
                ? Math.round((i.successRate / 100) * (i.syncCount30d || 0))
                : (i.successCount || 0),
            })),
          };
          break;
        }
        default:
          break;
      }

      setTabData(data);
    } catch (err) {
      setError(err.message || 'Failed to load tab data');
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, period, dateRange]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const handleRefresh = () => {
    fetchSummary();
    fetchTabData();
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const renderTabContent = () => {
    if (error && !tabLoading) {
      return <ErrorMessage message={error} onRetry={handleRefresh} />;
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewTab summary={summary} tabData={tabData} loading={tabLoading || loading} />;
      case 'revenue':
        return <RevenueTab tabData={tabData} loading={tabLoading} />;
      case 'appointments':
        return <AppointmentsTab tabData={tabData} loading={tabLoading} />;
      case 'doctors':
        return <DoctorsTab tabData={tabData} loading={tabLoading} />;
      case 'patients':
        return <PatientsTab tabData={tabData} loading={tabLoading} />;
      case 'insurance':
        return <InsuranceTab tabData={tabData} loading={tabLoading} />;
      case 'telemedicine':
        return <TelemedicineTab tabData={tabData} loading={tabLoading} />;
      case 'integrations':
        return <IntegrationsTab tabData={tabData} loading={tabLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* ─── Header ──────────────────────────── */}
      <div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 font-display">Clinic Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Comprehensive performance insights and trends
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector */}
          <div className="flex bg-neutral-100 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === p.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className={selectCls}
            />
            <span className="text-xs text-neutral-400">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className={selectCls}
            />
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={loading || tabLoading}
            className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${(loading || tabLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Tab Bar ─────────────────────────── */}
      <div
        className="-mx-4 px-4 overflow-x-auto scrollbar-hide animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex gap-1 min-w-max border-b border-neutral-200">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Tab Content ─────────────────────── */}
      {renderTabContent()}
    </div>
  );
}
