import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { DonutSkeleton } from './skeletons';

const SEGMENTS = [
  { key: 'completed',  label: 'Completed',  color: '#4CA626' },
  { key: 'cancelled',  label: 'Cancelled',  color: '#EF4444' },
  { key: 'noShow',     label: 'No-Show',    color: '#F59E0B' },
  { key: 'upcoming',   label: 'Upcoming',   color: '#5488D0' },
];

const PERIODS = [
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Previous' },
  { key: 'last_3',     label: 'Last 3 Mo' },
];

export default function AppointmentBreakdown({ data, loading, activePeriod, onPeriodChange }) {
  // Only show skeleton on very first load (no data at all yet)
  if (!data) return <DonutSkeleton />;

  const summary = data.summary || {};
  const dataPoints = data.dataPoints || [];

  // Aggregate from dataPoints for the donut
  const totals = dataPoints.reduce(
    (acc, dp) => ({
      completed: acc.completed + (dp.completed || 0),
      cancelled: acc.cancelled + (dp.cancelled || 0),
      noShow: acc.noShow + (dp.noShow || 0),
      total: acc.total + (dp.total || 0),
    }),
    { completed: 0, cancelled: 0, noShow: 0, total: 0 },
  );
  const upcoming = Math.max(0, totals.total - totals.completed - totals.cancelled - totals.noShow);

  const chartData = [
    { name: 'Completed', value: totals.completed },
    { name: 'Cancelled', value: totals.cancelled },
    { name: 'No-Show', value: totals.noShow },
    { name: 'Upcoming', value: upcoming },
  ].filter((d) => d.value > 0);

  const grandTotal = totals.total || 1;
  const completionRate = summary.completionRate ?? ((totals.completed / grandTotal) * 100);

  const periodLabel = PERIODS.find((p) => p.key === activePeriod)?.label || 'This Month';

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full flex flex-col">
      {/* Header — always crisp, never faded */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Appointment Overview</h3>
            <p className="text-xs text-neutral-500">{periodLabel}&apos;s breakdown</p>
          </div>
        </div>
        {onPeriodChange && (
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => onPeriodChange(p.key)}
                className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                  activePeriod === p.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content — dims smoothly while loading, snaps back when ready */}
      <div
        className="flex-1 flex flex-col items-center justify-center transition-opacity duration-300"
        style={{ opacity: loading ? 0.4 : 1, pointerEvents: loading ? 'none' : 'auto' }}
      >
        {chartData.length > 0 ? (
          <div className="relative">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  animationDuration={400}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, i) => {
                    const seg = SEGMENTS.find((s) => s.label === entry.name);
                    return <Cell key={i} fill={seg?.color || '#CED4DA'} />;
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-display text-neutral-900">{totals.total}</span>
              <span className="text-[10px] text-neutral-500 font-medium">Total</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
            <CalendarDays className="h-8 w-8 mb-2" />
            <p className="text-xs">No appointment data</p>
          </div>
        )}

        {/* Legend */}
        <div className="w-full mt-4 space-y-2">
          {SEGMENTS.map((seg) => {
            const val = seg.key === 'upcoming' ? upcoming : totals[seg.key] || 0;
            const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0.0';
            return (
              <div key={seg.key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-neutral-600">{seg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-800">{val}</span>
                  <span className="text-neutral-400 w-10 text-right">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completion rate bar */}
      <div
        className="mt-4 pt-4 border-t border-neutral-100 transition-opacity duration-300"
        style={{ opacity: loading ? 0.4 : 1 }}
      >
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-neutral-500">Completion Rate</span>
          <span className="font-semibold text-neutral-800">{completionRate.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-secondary-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, completionRate)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
