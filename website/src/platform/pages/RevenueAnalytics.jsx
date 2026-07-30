import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { getMrrBreakdown, getRevenueAnalytics, getPromotionImpact } from '../api';
import { StatCard, Spinner, ErrorAlert, DataTable, EmptyState } from '../components/shared';
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Gift } from 'lucide-react';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const RANGE_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: '1 year', value: 365 },
];

export default function RevenueAnalytics() {
  const [mrr, setMrr] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [promoImpact, setPromoImpact] = useState(null);
  const [range, setRange] = useState(180);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - range * 86400000).toISOString().split('T')[0];

    Promise.all([
      getMrrBreakdown(),
      getRevenueAnalytics({ startDate, endDate }),
      getPromotionImpact({ startDate, endDate }),
    ])
      .then(([mrrRes, revRes, promoRes]) => {
        setMrr(mrrRes.data);
        setRevenue(revRes.data?.monthly || []);
        setPromoImpact(promoRes.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) return <Spinner />;
  if (error) return <ErrorAlert message={error} />;

  const byPlan = mrr?.byPlan || [];
  const byCycle = mrr?.byBillingCycle || {};
  const growth = mrr?.growth || {};
  const cycleData = Object.entries(byCycle).map(([name, value]) => ({ name, value }));
  const promoBreakdown = promoImpact?.promotionBreakdown || [];
  const rebates = promoImpact?.rebateSummary || [];

  const promoColumns = [
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code || r.promotionCode}</span> },
    { key: 'discountType', label: 'Type' },
    { key: 'discountValue', label: 'Discount', render: (r) => r.discountType === 'percentage' ? `${r.discountValue}%` : `₹${r.discountValue}` },
    { key: 'activeSubscriptions', label: 'Active Subs', render: (r) => r.activeSubscriptions || r.redemptionCount || 0 },
    { key: 'estimatedImpact', label: 'Est. Impact', render: (r) => `₹${(r.estimatedImpact || r.estimatedMonthlyImpact || 0).toLocaleString('en-IN')}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Revenue Analytics</h2>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                range === opt.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-900/50 hover:text-neutral-900/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* MRR Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          title="Total MRR"
          value={`₹${(mrr?.totalMrr || 0).toLocaleString('en-IN')}`}
          color="green"
          subtitle="Monthly Recurring Revenue"
        />
        <StatCard
          icon={growth.amount >= 0 ? TrendingUp : TrendingDown}
          title="Growth"
          value={`₹${Math.abs(growth.amount || 0).toLocaleString('en-IN')}`}
          color={growth.amount >= 0 ? 'green' : 'red'}
          trend={growth.rate}
          subtitle="Month-over-month"
        />
        <StatCard
          icon={BarChart3}
          title="Add-on Revenue"
          value={`₹${(mrr?.addOnMrr || 0).toLocaleString('en-IN')}`}
          color="purple"
          subtitle="Storage + Doctors"
        />
        <StatCard
          icon={Gift}
          title="Promo Impact"
          value={`₹${(promoImpact?.totalEstimatedImpact || 0).toLocaleString('en-IN')}`}
          color="yellow"
          subtitle="Estimated discount value"
        />
      </div>

      {/* Revenue Trend */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
        <h3 className="font-semibold font-display text-neutral-900 mb-4">Revenue Trend</h3>
        {revenue.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenue}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No revenue data" message="Revenue data will appear once subscriptions are active" />
        )}
      </div>

      {/* MRR by Plan + Billing Cycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
          <h3 className="font-semibold font-display text-neutral-900 mb-4">MRR by Plan</h3>
          {byPlan.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byPlan}>
                <XAxis dataKey="planName" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'MRR']} />
                <Bar dataKey="mrr" radius={[6, 6, 0, 0]}>
                  {byPlan.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No plan data" />
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
          <h3 className="font-semibold font-display text-neutral-900 mb-4">Billing Cycle Split</h3>
          {cycleData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={cycleData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {cycleData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2">
                {cycleData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-2 text-xs text-neutral-900/60">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i] }} />
                    <span className="capitalize">{d.name}</span>: ₹{d.value.toLocaleString('en-IN')}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No billing data" />
          )}
        </div>
      </div>

      {/* Promotion Impact Table */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
        <h3 className="font-semibold font-display text-neutral-900 mb-4">Promotion Impact</h3>
        {promoBreakdown.length > 0 ? (
          <DataTable columns={promoColumns} data={promoBreakdown} />
        ) : (
          <EmptyState title="No active promotions" message="Promotion impact data will appear when promotions are redeemed" />
        )}
      </div>

      {/* Rebate Summary */}
      {rebates.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
          <h3 className="font-semibold font-display text-neutral-900 mb-4">Rebate Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rebates.map((r) => (
              <div key={r.type || r._id} className="border border-neutral-300/30 rounded-lg p-4">
                <p className="text-xs text-neutral-900/50 uppercase tracking-wider mb-1">{r.type || r.name}</p>
                <p className="text-lg font-bold text-neutral-900">₹{(r.totalAmount || r.amount || 0).toLocaleString('en-IN')}</p>
                <p className="text-xs text-neutral-900/40 mt-1">{r.count || r.activeCount || 0} active rebates</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
