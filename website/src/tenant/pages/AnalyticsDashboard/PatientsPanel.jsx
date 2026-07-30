import {
  AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, TrendingUp, Activity, BarChart3, Video, Calendar,
} from 'lucide-react';
import {
  CARD_CLS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE,
  StatCard, ChartCard, DonutCard,
  formatPercent,
} from './analytics-shared';
import { PatientsSkeleton } from './analytics-skeletons';

export default function PatientsPanel({ data, loading }) {
  if (loading) return <PatientsSkeleton />;

  const growth = data?.growth || [];
  const cumulative = data?.cumulative || [];
  const pStats = data?.patientStats || {};
  const teleTrends = data?.telemedicineTrends || [];
  const teleStats = data?.telemedicineStats || {};
  const teleByType = data?.telemedicineByType || [];

  /* Merge growth + cumulative for ComposedChart */
  const composedData = growth.map((g, i) => ({
    label: g.label,
    newPatients: g.newPatients || 0,
    cumulative: cumulative[i]?.total || 0,
  }));

  return (
    <div className="space-y-6">
      {/* ── Row 1: Patient Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Patients"
          value={(pStats.total || 0).toLocaleString('en-IN')}
          icon={Users}
          iconBg="bg-blue-50"
          iconText="text-blue-600"
          delay={0}
        />
        <StatCard
          title="New This Month"
          value={pStats.newThisMonth || 0}
          icon={TrendingUp}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          trend={pStats.newThisMonth > 0 ? 1 : 0}
          trendValue={pStats.growthPercent}
          delay={50}
        />
        <StatCard
          title="Retention Rate"
          value={formatPercent(pStats.retentionRate)}
          icon={Activity}
          iconBg="bg-primary-50"
          iconText="text-primary-600"
          trend={pStats.retentionRate >= 70 ? 1 : -1}
          delay={100}
        />
        <StatCard
          title="Avg New/Month"
          value={pStats.avgNewPerMonth || 0}
          icon={BarChart3}
          iconBg="bg-amber-50"
          iconText="text-amber-600"
          delay={150}
        />
      </div>

      {/* ── Row 2: ComposedChart (cumulative area + new patients bars) + vertical stat stack ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <ChartCard
            title="Patient Growth"
            subtitle="New patients and cumulative total"
            icon={TrendingUp}
            iconBg="bg-secondary-50"
            iconText="text-secondary-600"
            delay={200}
          >
            {composedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={composedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patCumulGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5488D0" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#5488D0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#5488D0"
                    fill="url(#patCumulGrad)"
                    strokeWidth={2}
                    dot={false}
                    name="Cumulative Total"
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="newPatients"
                    fill="#2E5FA2"
                    name="New Patients"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-xs text-neutral-400">
                No patient growth data available
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-4">
          <div className={`${CARD_CLS} p-5 h-full flex flex-col justify-center space-y-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '250ms' }}>
            <div>
              <p className="text-[11px] font-medium text-neutral-500 mb-1">Total Patients</p>
              <p className="text-2xl font-bold font-display text-neutral-900">{(pStats.total || 0).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-neutral-500 mb-1">Growth Rate</p>
              <p className="text-2xl font-bold font-display text-secondary-600">
                {pStats.growthPercent != null ? `${pStats.growthPercent.toFixed(1)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-neutral-500 mb-1">Retention Rate</p>
              <p className="text-2xl font-bold font-display text-primary-600">{formatPercent(pStats.retentionRate)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Telemedicine Grouped Bar ── */}
      <ChartCard
        title="Telemedicine Sessions"
        subtitle="Emergency, scheduled & follow-up"
        icon={Video}
        iconBg="bg-blue-50"
        iconText="text-blue-600"
        delay={300}
      >
        {teleTrends.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={teleTrends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="emergency" fill="#EF4444" name="Emergency" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scheduled" fill="#2E5FA2" name="Scheduled" radius={[4, 4, 0, 0]} />
              <Bar dataKey="followUp" fill="#4CA626" name="Follow-Up" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-xs text-neutral-400">
            No telemedicine data available
          </div>
        )}
      </ChartCard>

      {/* ── Row 4: Telemedicine Donut + Stat Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <DonutCard
            title="Session Types"
            subtitle="Distribution breakdown"
            icon={BarChart3}
            iconBg="bg-amber-50"
            iconText="text-amber-600"
            data={teleByType}
            centerValue={teleByType.reduce((s, t) => s + t.value, 0)}
            centerLabel="Total"
            delay={350}
          />
        </div>

        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full">
            <StatCard
              title="Total Sessions"
              value={(teleStats.totalSessions || 0).toLocaleString('en-IN')}
              icon={Video}
              iconBg="bg-blue-50"
              iconText="text-blue-600"
              delay={400}
            />
            <StatCard
              title="Avg Duration"
              value={teleStats.avgDuration ? `${teleStats.avgDuration} min` : '--'}
              icon={Calendar}
              iconBg="bg-primary-50"
              iconText="text-primary-600"
              delay={450}
            />
            <StatCard
              title="Completion Rate"
              value={formatPercent(teleStats.completionRate)}
              icon={TrendingUp}
              iconBg="bg-secondary-50"
              iconText="text-secondary-600"
              trend={teleStats.completionRate >= 80 ? 1 : -1}
              delay={500}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
