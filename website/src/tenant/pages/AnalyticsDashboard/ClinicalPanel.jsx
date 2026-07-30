import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Calendar, TrendingUp, TrendingDown, Activity, Users, BarChart3,
} from 'lucide-react';
import {
  CARD_CLS, CARD_HOVER, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE,
  StatCard, ChartCard, Section, Th, Td,
  formatCurrency, formatPercent,
} from './analytics-shared';
import { ClinicalSkeleton } from './analytics-skeletons';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ClinicalPanel({ data, loading }) {
  if (loading) return <ClinicalSkeleton />;

  const apptTrends = data?.appointmentTrends || [];
  const apptStats = data?.appointmentStats || {};
  const completionTrend = data?.completionRateTrend || [];
  const doctors = (data?.doctors || []).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  const top5 = doctors.slice(0, 5);
  const noShow = data?.noShowAnalysis || {};

  /* Build day-of-week and hour bar data from noShow analysis */
  const noShowByDay = (noShow.byDayOfWeek || []).map((d) => ({
    name: DAY_LABELS[d.day] || `Day ${d.day}`,
    count: d.count || 0,
    rate: d.rate || 0,
  }));

  const noShowByHour = (noShow.byHour || [])
    .filter((h) => h.count > 0)
    .map((h) => ({
      name: `${h.hour}:00`,
      count: h.count || 0,
    }));

  return (
    <div className="space-y-6">
      {/* ── Row 1: Appointment Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Appointments"
          value={(apptStats.total || 0).toLocaleString('en-IN')}
          icon={Calendar}
          iconBg="bg-primary-50"
          iconText="text-primary-600"
          delay={0}
        />
        <StatCard
          title="Completion Rate"
          value={formatPercent(apptStats.completionRate)}
          icon={TrendingUp}
          iconBg="bg-secondary-50"
          iconText="text-secondary-600"
          trend={apptStats.completionRate >= 80 ? 1 : -1}
          delay={50}
        />
        <StatCard
          title="Cancellation Rate"
          value={formatPercent(apptStats.cancellationRate)}
          icon={TrendingDown}
          iconBg="bg-red-50"
          iconText="text-red-600"
          trend={apptStats.cancellationRate <= 10 ? 1 : -1}
          delay={100}
        />
        <StatCard
          title="Avg Per Day"
          value={apptStats.avgPerDay || 0}
          icon={BarChart3}
          iconBg="bg-blue-50"
          iconText="text-blue-600"
          delay={150}
        />
      </div>

      {/* ── Row 2: Appointment Status Stacked Bar + Completion Rate Line ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ChartCard
            title="Appointment Trends"
            subtitle="Completed, cancelled & no-shows"
            icon={Calendar}
            iconBg="bg-primary-50"
            iconText="text-primary-600"
            delay={200}
          >
            {apptTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={apptTrends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" stackId="a" fill="#4CA626" name="Completed" />
                  <Bar dataKey="cancelled" stackId="a" fill="#EF4444" name="Cancelled" />
                  <Bar dataKey="noShow" stackId="a" fill="#F59E0B" name="No-Show" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-xs text-neutral-400">
                No appointment trend data
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <ChartCard
            title="Completion Rate"
            subtitle="Period-over-period trend"
            icon={TrendingUp}
            iconBg="bg-secondary-50"
            iconText="text-secondary-600"
            delay={250}
          >
            {completionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={completionTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [formatPercent(v), 'Completion Rate']} />
                  {/* 80% target reference line */}
                  <Line type="monotone" dataKey={() => 80} stroke="#E4E8EC" strokeWidth={1} strokeDasharray="6 3" dot={false} name="Target (80%)" />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#4CA626"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#4CA626' }}
                    activeDot={{ r: 6, fill: '#4CA626', strokeWidth: 2, stroke: '#fff' }}
                    name="Completion"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-xs text-neutral-400">
                No completion rate data
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* ── Row 3: Doctor Card Strip + Performance Table ── */}
      <Section
        title="Doctor Performance"
        subtitle="Top performers and detailed metrics"
        icon={Users}
        iconBg="bg-blue-50"
        iconText="text-blue-600"
        delay={300}
      >
        {/* Top 5 doctor cards — horizontal scroll */}
        {top5.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-4 mb-6 -mx-1 px-1 scrollbar-thin">
            {top5.map((doc, idx) => (
              <div
                key={doc._id || doc.id || idx}
                className={`${CARD_CLS} ${CARD_HOVER} min-w-[200px] p-4 shrink-0`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(doc.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{doc.name}</p>
                    {doc.department && <p className="text-[11px] text-neutral-400 truncate">{doc.department}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Revenue</span>
                    <span className="font-semibold text-neutral-900">{formatCurrency(doc.revenue)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Appointments</span>
                    <span className="font-semibold text-neutral-900">{doc.appointments || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Completed</span>
                    <span className="font-semibold text-secondary-700">{doc.completed || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Full performance table */}
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
                            {doc.department && <p className="text-[11px] text-neutral-400">{doc.department}</p>}
                          </div>
                        </div>
                      </Td>
                      <Td align="right">{(doc.appointments || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">{(doc.completed || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">{(doc.noShows || 0).toLocaleString('en-IN')}</Td>
                      <Td align="right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${
                          noShowRate > 15 ? 'bg-red-50 text-red-700'
                            : noShowRate > 10 ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {formatPercent(noShowRate)}
                        </span>
                      </Td>
                      <Td align="right" className="font-semibold text-neutral-900">{formatCurrency(doc.revenue)}</Td>
                      <Td align="right">{formatCurrency(avgRev)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-400">No doctor performance data available</div>
        )}
      </Section>

      {/* ── Row 4: No-Show Analysis — Day of Week + Hour ── */}
      {(noShowByDay.length > 0 || noShowByHour.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {noShowByDay.length > 0 && (
            <ChartCard
              title="No-Shows by Day"
              subtitle="Weekly distribution"
              icon={Calendar}
              iconBg="bg-amber-50"
              iconText="text-amber-600"
              delay={350}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={noShowByDay} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#F59E0B" name="No-Shows" radius={[6, 6, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {noShowByHour.length > 0 && (
            <ChartCard
              title="No-Shows by Hour"
              subtitle="Time-of-day patterns"
              icon={Activity}
              iconBg="bg-amber-50"
              iconText="text-amber-600"
              delay={400}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={noShowByHour} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#EF4444" name="No-Shows" radius={[6, 6, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
