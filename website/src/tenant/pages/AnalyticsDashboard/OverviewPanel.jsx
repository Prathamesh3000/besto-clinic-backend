import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, Calendar, Users, Activity, Video, Shield, RefreshCw, TrendingUp,
} from 'lucide-react';
import {
  CARD_CLS, COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE,
  StatCard, ChartCard, DonutCard,
  formatCurrency, formatCompact, formatPercent, formatPeriodLabel,
} from './analytics-shared';
import { OverviewSkeleton } from './analytics-skeletons';

export default function OverviewPanel({ summary, data, loading }) {
  if (loading) return <OverviewSkeleton />;

  const s = summary || {};
  const revenue = data?.revenueTrends || [];
  const appointments = data?.appointmentTrends || [];
  const quickStats = data?.quickStats || {};

  /* ── Build appointment donut from totals across trend data ── */
  const apptTotals = appointments.reduce(
    (acc, d) => ({
      completed: acc.completed + (d.completed || 0),
      cancelled: acc.cancelled + (d.cancelled || 0),
      noShow: acc.noShow + (d.noShow || 0),
    }),
    { completed: 0, cancelled: 0, noShow: 0 },
  );
  const apptDonut = [
    { name: 'Completed', value: apptTotals.completed },
    { name: 'Cancelled', value: apptTotals.cancelled },
    { name: 'No-Show', value: apptTotals.noShow },
  ].filter((d) => d.value > 0);
  const apptTotal = apptDonut.reduce((s, d) => s + d.value, 0);

  /* ── Sparkline data from revenue trends ── */
  const revSparkline = revenue.map((d) => ({ value: d.total || 0 }));
  const apptSparkline = appointments.map((d) => ({ value: d.total || d.completed || 0 }));

  return (
    <div className="space-y-6">
      {/* ── Row 1: Summary Stat Cards WITH sparklines ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Revenue"
          value={formatCompact(s.revenue?.thisMonth || 0)}
          subtitle={`Last month: ${formatCompact(s.revenue?.lastMonth || 0)}`}
          icon={DollarSign}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          trend={s.revenue?.growth}
          trendValue={s.revenue?.growth}
          delay={0}
          sparkline={revSparkline}
        />
        <StatCard
          title="Appointments Today"
          value={s.appointments?.today || 0}
          subtitle={`Completion: ${formatPercent(s.appointments?.completionRate)}`}
          icon={Calendar}
          iconBg="bg-primary-50"
          iconText="text-primary-600"
          delay={50}
          sparkline={apptSparkline}
        />
        <StatCard
          title="Total Patients"
          value={(s.patients?.total || 0).toLocaleString('en-IN')}
          subtitle={`New this month: ${s.patients?.newThisMonth || 0}`}
          icon={Users}
          iconBg="bg-blue-50"
          iconText="text-blue-600"
          trend={s.patients?.newThisMonth > 0 ? 1 : 0}
          trendValue={s.patients?.growthPercent}
          delay={100}
        />
        <StatCard
          title="No-Show Rate"
          value={formatPercent(s.noShowRate)}
          subtitle={s.noShowRate > 10 ? 'Above acceptable threshold' : 'Within acceptable range'}
          icon={Activity}
          iconBg="bg-amber-50"
          iconText="text-amber-600"
          trend={s.noShowRate > 10 ? -1 : 1}
          trendValue={s.noShowRate}
          delay={150}
        />
      </div>

      {/* ── Row 2: Revenue Area + Appointment Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ChartCard
            title="Revenue Trend"
            subtitle="Collection over the selected period"
            icon={TrendingUp}
            iconBg="bg-secondary-50"
            iconText="text-secondary-600"
            delay={200}
          >
            {revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="overviewRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2E5FA2" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#2E5FA2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} width={55} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v), 'Revenue']} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#2E5FA2"
                    fill="url(#overviewRevGrad)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#2E5FA2', strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-xs text-neutral-400">
                No revenue data available
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <DonutCard
            title="Appointment Breakdown"
            subtitle="Status distribution"
            icon={Calendar}
            iconBg="bg-primary-50"
            iconText="text-primary-600"
            data={apptDonut}
            colors={['#4CA626', '#EF4444', '#F59E0B']}
            centerValue={apptTotal}
            centerLabel="Total"
            delay={250}
          />
        </div>
      </div>

      {/* ── Row 3: Quick Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Telemedicine Sessions"
          value={quickStats.telemedicine?.sessionsThisMonth || 0}
          subtitle="This month"
          icon={Video}
          iconBg="bg-blue-50"
          iconText="text-blue-600"
          delay={300}
        />
        <StatCard
          title="Insurance Approval Rate"
          value={formatPercent(quickStats.insurance?.approvalRate)}
          subtitle={`${quickStats.insurance?.totalClaims || 0} total claims`}
          icon={Shield}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          delay={350}
        />
        <StatCard
          title="Active Integrations"
          value={quickStats.integrations?.activeCount || 0}
          subtitle={`${(quickStats.integrations?.totalSynced || 0).toLocaleString('en-IN')} records synced`}
          icon={RefreshCw}
          iconBg="bg-amber-50"
          iconText="text-amber-600"
          delay={400}
        />
      </div>
    </div>
  );
}
