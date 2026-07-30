import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { IndianRupee, CalendarDays, Users, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { StatCardsSkeleton } from './skeletons';

const formatCurrency = (n) => '₹' + (n || 0).toLocaleString('en-IN');

const CARDS = [
  {
    key: 'revenue',
    icon: IndianRupee,
    label: 'Monthly Revenue',
    color: '#4CA626',
    iconBg: 'bg-secondary-50',
    iconText: 'text-secondary-600',
    getValue: (s) => formatCurrency(s?.revenue?.thisMonth),
    getTrend: (s) => s?.revenue?.growth,
    getSubtitle: (s) => {
      const last = s?.revenue?.lastMonth;
      return last ? `Last month: ${formatCurrency(last)}` : null;
    },
    sparkKey: 'revenue',
  },
  {
    key: 'appointments',
    icon: CalendarDays,
    label: "Today's Appointments",
    color: '#2E5FA2',
    iconBg: 'bg-primary-50',
    iconText: 'text-primary-600',
    getValue: (s) => s?.appointments?.today ?? 0,
    getTrend: (s) => s?.appointments?.completionRate,
    trendSuffix: '% completion',
    getSubtitle: (s) => `${s?.appointments?.thisWeek ?? 0} this week`,
    sparkKey: 'appointments',
  },
  {
    key: 'patients',
    icon: Users,
    label: 'Total Patients',
    color: '#5488D0',
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
    getValue: (s) => (s?.patients?.total ?? 0).toLocaleString('en-IN'),
    getTrend: (s) => null,
    getSubtitle: (s) => {
      const n = s?.patients?.newThisMonth;
      return n ? `+${n} new this month` : 'No new patients this month';
    },
    sparkKey: 'patients',
  },
  {
    key: 'noshow',
    icon: AlertTriangle,
    label: 'No-Show Rate',
    color: '#F59E0B',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    getValue: (s) => `${(s?.noShowRate ?? 0).toFixed(1)}%`,
    getTrend: (s) => null,
    invertTrend: true,
    getSubtitle: () => 'Lower is better',
    sparkKey: 'noshow',
  },
];

function MiniSparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const gradientId = `spark-${color.replace('#', '')}`;
  return (
    <div className="mt-3 -mx-1">
      <ResponsiveContainer width="100%" height={40}>
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashStatCards({ summary, sparklines }) {
  if (!summary) return <StatCardsSkeleton />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((card, i) => {
        const trend = card.getTrend(summary);
        const sparkData = sparklines?.[card.sparkKey];
        return (
          <div
            key={card.key}
            className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${50 + i * 50}ms` }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.iconBg}`}>
                <card.icon className={`h-6 w-6 ${card.iconText}`} />
              </div>
              {trend !== undefined && trend !== null && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    card.trendSuffix
                      ? 'bg-primary-50 text-primary-700'
                      : trend >= 0
                        ? 'bg-secondary-50 text-secondary-700'
                        : 'bg-red-50 text-red-700'
                  }`}
                >
                  {!card.trendSuffix && (trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
                  {card.trendSuffix ? `${trend.toFixed(1)}${card.trendSuffix}` : `${Math.abs(trend).toFixed(1)}%`}
                </span>
              )}
            </div>
            <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">
              {card.getValue(summary)}
            </p>
            <p className="text-xs font-medium text-neutral-500 mt-1">{card.label}</p>
            {card.getSubtitle(summary) && (
              <p className="text-[11px] text-neutral-400 mt-0.5">{card.getSubtitle(summary)}</p>
            )}
            <MiniSparkline data={sparkData} color={card.color} />
          </div>
        );
      })}
    </div>
  );
}
