import { useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ChartSkeleton } from './skeletons';

const formatCurrency = (n) => '₹' + (n || 0).toLocaleString('en-IN');
const formatCompact = (n) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
};

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Turn raw API period strings into readable chart labels.
 *  daily:   "2025-03-15" → "15 Mar"
 *  weekly:  "2025-W03"   → "13 Jan" (Monday of ISO week)
 *  monthly: "2025-03"    → "Mar '25"
 */
function formatPeriodLabel(raw) {
  if (!raw) return raw;

  // Weekly: "2025-W03"
  const wk = raw.match(/^(\d{4})-W(\d{2})$/);
  if (wk) {
    const year = +wk[1];
    const week = +wk[2];
    // ISO week → date: Jan 4 is always in week 1
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7; // Mon=1 … Sun=7
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return `${monday.getDate()} ${MONTH_SHORT[monday.getMonth()]}`;
  }

  // Daily: "2025-03-15"
  const daily = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (daily) {
    return `${+daily[3]} ${MONTH_SHORT[+daily[2] - 1]}`;
  }

  // Monthly: "2025-03"
  const monthly = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    return `${MONTH_SHORT[+monthly[2] - 1]} '${monthly[1].slice(2)}`;
  }

  return raw;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-[var(--shadow-lg)] px-4 py-3 text-xs">
      <p className="font-semibold text-neutral-800 mb-1">{data?.label || data?.period}</p>
      <p className="text-neutral-900 font-bold text-sm">{formatCurrency(data?.total)}</p>
      {data?.byMode && Object.keys(data.byMode).length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-neutral-100 pt-2">
          {Object.entries(data.byMode).map(([mode, amount]) => (
            <div key={mode} className="flex justify-between gap-4">
              <span className="text-neutral-500 capitalize">{mode}</span>
              <span className="text-neutral-700 font-medium">{formatCurrency(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RevenueChart({ data, onPeriodChange, activePeriod }) {
  const navigate = useNavigate();

  if (!data) return <ChartSkeleton height="h-[280px]" />;

  const dataPoints = (data.dataPoints || []).map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period),
  }));
  const totals = data.totals || {};

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-secondary-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Revenue Trend</h3>
            <p className="text-xs text-neutral-500">Collection over time</p>
          </div>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange?.(p.key)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                activePeriod === p.key
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {dataPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dataPoints} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E5FA2" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2E5FA2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E8EC" strokeWidth={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7C8A97' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#7C8A97' }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#2E5FA2"
                fill="url(#revenueGradient)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#2E5FA2', strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[280px] text-sm text-neutral-400">
            No revenue data for this period
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-neutral-500">Collected</span>
            <p className="font-semibold text-secondary-700">{formatCurrency(totals.collected)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Refunded</span>
            <p className="font-semibold text-red-600">{formatCurrency(totals.refunded)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Net</span>
            <p className="font-bold text-neutral-900">{formatCurrency(totals.net)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Outstanding</span>
            <p className="font-semibold text-amber-600">{formatCurrency(totals.outstanding)}</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/clinic/analytics')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Details <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
