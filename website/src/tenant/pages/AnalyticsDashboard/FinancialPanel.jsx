import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, Shield, Calendar,
} from 'lucide-react';
import {
  COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE,
  StatCard, ChartCard, DonutCard,
  formatCurrency, formatCompact, formatPercent,
} from './analytics-shared';
import { FinancialSkeleton } from './analytics-skeletons';

export default function FinancialPanel({ data, loading }) {
  if (loading) return <FinancialSkeleton />;

  const revTrends = data?.revenueTrends || [];
  const revTotals = data?.revenueTotals || {};
  const paymentModes = data?.paymentModeBreakdown || [];
  const insTrends = data?.insuranceTrends || [];
  const insStats = data?.insuranceStats || {};
  const approvalTrend = data?.approvalRateTrend || [];

  return (
    <div className="space-y-6">
      {/* ── Row 1: Revenue Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Net Revenue"
          value={formatCompact(revTotals.net || 0)}
          icon={DollarSign}
          iconBg="bg-primary-50"
          iconText="text-primary-600"
          trend={revTotals.net > 0 ? 1 : -1}
          delay={0}
        />
        <StatCard
          title="Collected"
          value={formatCompact(revTotals.collected || 0)}
          icon={TrendingUp}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          trend={1}
          delay={50}
        />
        <StatCard
          title="Outstanding"
          value={formatCompact(revTotals.outstanding || 0)}
          subtitle={revTotals.outstanding > 0 ? 'Pending collection' : 'All clear'}
          icon={DollarSign}
          iconBg="bg-amber-50"
          iconText="text-amber-600"
          delay={100}
        />
        <StatCard
          title="Refunded"
          value={formatCompact(revTotals.refunded || 0)}
          icon={TrendingDown}
          iconBg="bg-red-50"
          iconText="text-red-600"
          delay={150}
        />
      </div>

      {/* ── Row 2: Revenue Stacked Area Chart (full width) ── */}
      <ChartCard
        title="Revenue Over Time"
        subtitle="Breakdown by payment mode"
        icon={TrendingUp}
        iconBg="bg-secondary-50"
        iconText="text-secondary-600"
        delay={200}
        footer={
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Collected', value: formatCurrency(revTotals.collected || 0), color: 'text-secondary-600' },
              { label: 'Refunded', value: formatCurrency(revTotals.refunded || 0), color: 'text-red-600' },
              { label: 'Net', value: formatCurrency(revTotals.net || 0), color: 'text-primary-600' },
              { label: 'Outstanding', value: formatCurrency(revTotals.outstanding || 0), color: 'text-amber-600' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-[11px] text-neutral-500">{s.label}</p>
                <p className={`text-sm font-bold font-display ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        }
      >
        {revTrends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={revTrends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="finRevTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E5FA2" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2E5FA2" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finRevCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5488D0" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#5488D0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finRevCard" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finRevOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finRevIns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4CA626" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#4CA626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} width={55} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="total" stroke="#2E5FA2" fill="url(#finRevTotal)" strokeWidth={2} name="Total" dot={false} activeDot={{ r: 4, fill: '#2E5FA2', strokeWidth: 2, stroke: '#fff' }} />
              {revTrends[0]?.cash !== undefined && <Area type="monotone" dataKey="cash" stroke="#5488D0" fill="url(#finRevCash)" strokeWidth={1.5} name="Cash" dot={false} />}
              {revTrends[0]?.card !== undefined && <Area type="monotone" dataKey="card" stroke="#8b5cf6" fill="url(#finRevCard)" strokeWidth={1.5} name="Card" dot={false} />}
              {revTrends[0]?.online !== undefined && <Area type="monotone" dataKey="online" stroke="#06b6d4" fill="url(#finRevOnline)" strokeWidth={1.5} name="Online" dot={false} />}
              {revTrends[0]?.insurance !== undefined && <Area type="monotone" dataKey="insurance" stroke="#4CA626" fill="url(#finRevIns)" strokeWidth={1.5} name="Insurance" dot={false} />}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[320px] flex items-center justify-center text-xs text-neutral-400">
            No revenue trend data available
          </div>
        )}
      </ChartCard>

      {/* ── Row 3: Payment Donut (narrow) + Insurance Claims Bar (wide) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <DonutCard
            title="Payment Modes"
            subtitle="Distribution by method"
            icon={DollarSign}
            iconBg="bg-primary-50"
            iconText="text-primary-600"
            data={paymentModes}
            centerValue={formatCompact(paymentModes.reduce((s, m) => s + m.value, 0))}
            centerLabel="Total"
            delay={250}
          />
        </div>
        <div className="lg:col-span-8">
          <ChartCard
            title="Insurance Claims"
            subtitle="Status breakdown over time"
            icon={Shield}
            iconBg="bg-primary-50"
            iconText="text-primary-600"
            delay={300}
          >
            {insTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={insTrends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="submitted" stackId="a" fill="#2E5FA2" name="Submitted" />
                  <Bar dataKey="approved" stackId="a" fill="#4CA626" name="Approved" />
                  <Bar dataKey="rejected" stackId="a" fill="#EF4444" name="Rejected" />
                  <Bar dataKey="settled" stackId="a" fill="#5488D0" name="Settled" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-xs text-neutral-400">
                No insurance claim data available
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* ── Row 4: Insurance Stat Cards (5-col) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Claims"
          value={(insStats.totalClaims || 0).toLocaleString('en-IN')}
          icon={Shield}
          iconBg="bg-primary-50"
          iconText="text-primary-600"
          delay={350}
        />
        <StatCard
          title="Approval Rate"
          value={formatPercent(insStats.approvalRate)}
          icon={TrendingUp}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          trend={insStats.approvalRate >= 70 ? 1 : -1}
          delay={400}
        />
        <StatCard
          title="Avg Processing"
          value={insStats.avgProcessingDays != null ? `${insStats.avgProcessingDays}d` : '--'}
          subtitle="Days to settle"
          icon={Calendar}
          iconBg="bg-blue-50"
          iconText="text-blue-600"
          delay={450}
        />
        <StatCard
          title="Settled"
          value={formatCompact(insStats.totalSettled || 0)}
          icon={DollarSign}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          delay={500}
        />
        <StatCard
          title="Pending"
          value={formatCompact(insStats.pendingAmount || 0)}
          subtitle={insStats.pendingAmount > 0 ? 'Awaiting settlement' : 'All clear'}
          icon={DollarSign}
          iconBg="bg-amber-50"
          iconText="text-amber-600"
          delay={550}
        />
      </div>

      {/* ── Row 5: Approval Rate LineChart ── */}
      {approvalTrend.length > 0 && (
        <ChartCard
          title="Approval Rate Trend"
          subtitle="Monthly progression"
          icon={TrendingUp}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          delay={600}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={approvalTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [formatPercent(v), 'Approval Rate']} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#4CA626"
                strokeWidth={2}
                dot={{ r: 4, fill: '#4CA626' }}
                activeDot={{ r: 6, fill: '#4CA626', strokeWidth: 2, stroke: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
