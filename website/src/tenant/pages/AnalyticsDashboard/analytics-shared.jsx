import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

/* ─── Design Tokens ────────────────────────────── */
export const CARD_CLS = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
export const CARD_HOVER = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
export const SELECT_CLS = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';

export const COLORS = ['#2E5FA2', '#4CA626', '#F59E0B', '#EF4444', '#5488D0', '#8b5cf6', '#06b6d4', '#ec4899'];
export const AXIS_STYLE = { fontSize: 11, fill: '#7C8A97' };
export const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#E4E8EC', strokeWidth: 0.5 };
export const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 24px rgba(0,0,0,.08)', padding: '10px 14px' },
  labelStyle: { fontWeight: 600, color: '#1f2937', marginBottom: 4 },
  itemStyle: { fontSize: 12, color: '#374151' },
};

/* ─── Format Helpers ───────────────────────────── */
export function formatCurrency(n) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

export function formatCompact(n) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

export function formatPercent(n) {
  return (n || 0).toFixed(1) + '%';
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatPeriodLabel(raw) {
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

/* ─── Data Helpers ─────────────────────────────── */
export function buildPaymentModeBreakdown(dataPoints) {
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

export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
}

export function unwrap(res) {
  return res?.data ?? res;
}

/* ─── StatCard ─────────────────────────────────── */
export function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, iconBg = 'bg-primary-50', iconText = 'text-primary-600', delay = 0, sparkline }) {
  return (
    <div
      className={`${CARD_CLS} ${CARD_HOVER} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconText}`} />
        </div>
        {trend !== undefined && trend !== null && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              trend >= 0 ? 'bg-secondary-50 text-secondary-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {typeof (trendValue ?? trend) === 'number'
              ? `${Math.abs(trendValue ?? trend).toFixed(1)}%`
              : `${Math.abs(trendValue ?? trend)}%`}
          </span>
        )}
      </div>
      <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-neutral-500 mt-1">{title}</p>
      {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
      {sparkline && sparkline.length >= 2 && <MiniSparkline data={sparkline} color={iconText.includes('secondary') ? '#4CA626' : iconText.includes('primary') ? '#2E5FA2' : iconText.includes('blue') ? '#5488D0' : '#F59E0B'} />}
    </div>
  );
}

/* ─── MiniSparkline ────────────────────────────── */
function MiniSparkline({ data, color }) {
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
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── ChartCard ────────────────────────────────── */
export function ChartCard({ title, subtitle, icon: Icon, iconBg = 'bg-primary-50', iconText = 'text-primary-600', periods, activePeriod, onPeriodChange, footer, className = '', delay = 0, children }) {
  return (
    <div
      className={`${CARD_CLS} p-5 h-full flex flex-col animate-[fadeUp_0.4s_ease-out_both] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${iconText}`} />
            </div>
          )}
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">{title}</h3>
            {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
        {periods && onPeriodChange && (
          <PeriodToggle periods={periods} active={activePeriod} onChange={onPeriodChange} />
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
      {footer && (
        <div className="mt-4 pt-4 border-t border-neutral-100">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ─── DonutCard ────────────────────────────────── */
export function DonutCard({ title, subtitle, icon: Icon, iconBg = 'bg-primary-50', iconText = 'text-primary-600', data = [], colors = COLORS, centerValue, centerLabel, delay = 0, className = '' }) {
  return (
    <div
      className={`${CARD_CLS} p-5 h-full flex flex-col animate-[fadeUp_0.4s_ease-out_both] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <div className="flex items-center gap-3 mb-4">
          {Icon && (
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${iconText}`} />
            </div>
          )}
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">{title}</h3>
            {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center">
        {data.length > 0 ? (
          <div className="relative">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none" animationDuration={400} animationEasing="ease-out">
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            {centerValue !== undefined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold font-display text-neutral-900">{centerValue}</span>
                {centerLabel && <span className="text-[10px] text-neutral-500 font-medium">{centerLabel}</span>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-400 py-8">No data available</p>
        )}
        {data.length > 0 && (
          <div className="w-full mt-4 space-y-2">
            {data.map((item, i) => {
              const total = data.reduce((s, d) => s + d.value, 0) || 1;
              const pct = ((item.value / total) * 100).toFixed(1);
              return (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                    <span className="text-neutral-600">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-800">{item.value}</span>
                    <span className="text-neutral-400 w-10 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Section ──────────────────────────────────── */
export function Section({ title, subtitle, icon: SIcon, iconBg = 'bg-primary-50', iconText = 'text-primary-600', delay = 0, className = '', children }) {
  return (
    <div
      className={`${CARD_CLS} overflow-hidden animate-[fadeUp_0.4s_ease-out_both] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <div className="px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            {SIcon && (
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                <SIcon className={`h-5 w-5 ${iconText}`} />
              </div>
            )}
            <div>
              <h3 className="text-[15px] font-semibold text-neutral-900 font-display">{title}</h3>
              {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ─── PeriodToggle ─────────────────────────────── */
export function PeriodToggle({ periods, active, onChange }) {
  return (
    <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
      {periods.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
            active === p.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Table Helpers ────────────────────────────── */
export function Th({ children, align = 'left' }) {
  return (
    <th className={`text-${align} py-3 px-4 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider`}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`text-${align} py-3 px-4 text-sm text-neutral-600 ${className}`}>
      {children}
    </td>
  );
}

/* ─── ProgressBar ──────────────────────────────── */
export function ProgressBar({ value, color = 'primary' }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const colorMap = { primary: 'bg-primary-500', secondary: 'bg-secondary-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] || colorMap.primary} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-neutral-500 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ─── ErrorMessage ─────────────────────────────── */
export function ErrorMessage({ message, onRetry }) {
  return (
    <div className={`${CARD_CLS} border-red-200 p-6 text-center`}>
      <p className="text-sm text-red-700 mb-3">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition">
          Try Again
        </button>
      )}
    </div>
  );
}

/* ─── EmptyChart ───────────────────────────────── */
export function EmptyChart({ icon: Icon, message = 'No data available', height = 'h-64' }) {
  return (
    <div className={`${height} flex flex-col items-center justify-center text-neutral-400`}>
      {Icon && <Icon className="h-8 w-8 mb-2" />}
      <p className="text-xs">{message}</p>
    </div>
  );
}
