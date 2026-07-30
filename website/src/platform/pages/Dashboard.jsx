import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { getDashboard, getRevenueAnalytics, getExpiringTrials, extendTrial } from '../api';
import { StatCard, StatusBadge, Spinner, ErrorAlert } from '../components/shared';
import {
  Building2, TrendingUp, Clock, AlertTriangle,
  IndianRupee, ShieldOff, Plus, ArrowRight, CalendarClock, Users,
} from 'lucide-react';

const PIE_COLORS = ['#0d9488', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CustomTooltip = ({ active, payload, label, prefix = '₹' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-neutral-300/60 shadow-[var(--shadow-md)] px-4 py-3">
      <p className="text-xs text-neutral-900/40 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold text-neutral-900">
          {prefix}{Number(entry.value).toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [extending, setExtending] = useState(null);

  useEffect(() => {
    Promise.all([
      getDashboard(),
      getRevenueAnalytics({ months: 12 }).catch(() => ({ data: { monthly: [] } })),
      getExpiringTrials(7).catch(() => ({ data: [] })),
    ])
      .then(([dashRes, revRes, trialRes]) => {
        setStats(dashRes.data);
        setRevenue(revRes.data?.monthly || []);
        setTrials(Array.isArray(trialRes.data) ? trialRes.data : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleExtendTrial = async (id) => {
    setExtending(id);
    try {
      await extendTrial(id, 7);
      setTrials((prev) => prev.filter((t) => t._id !== id));
    } catch {
      /* silent */
    } finally {
      setExtending(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!stats) return null;

  const planEntries = Object.entries(stats.planDistribution || {});
  const pieData = planEntries.map(([name, value]) => ({ name, value }));
  const mrrGrowth = stats.mrrGrowthRate ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-display text-neutral-900">Platform Overview</h2>
          <p className="text-sm text-neutral-900/40 mt-0.5">Monitor your SaaS metrics at a glance</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/platform/tenants')}
            className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 flex items-center gap-1.5 shadow-sm shadow-primary-600/20"
          >
            <Plus className="h-3.5 w-3.5" /> New Tenant
          </button>
          <button
            onClick={() => navigate('/platform/plans')}
            className="px-4 py-2 text-xs font-medium bg-white border border-neutral-300/60 text-neutral-900/60 rounded-xl hover:bg-neutral-100 hover:text-neutral-900/80 transition-all duration-300"
          >
            Manage Plans
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Building2} title="Total Tenants" value={stats.totalTenants} color="primary" />
        <StatCard icon={TrendingUp} title="Active" value={stats.activeTenants} color="green" />
        <StatCard icon={Clock} title="In Trial" value={stats.trialTenants} color="yellow" />
        <StatCard
          icon={IndianRupee}
          title="MRR"
          value={`₹${(stats.mrr || 0).toLocaleString('en-IN')}`}
          color="green"
          trend={mrrGrowth}
          subtitle="Monthly Recurring Revenue"
        />
        <StatCard icon={AlertTriangle} title="Grace Period" value={stats.gracePeriodTenants || stats.pastDueTenants || 0} color="yellow" />
        <StatCard icon={ShieldOff} title="Suspended" value={stats.suspendedTenants} color="red" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold font-display text-neutral-900">Revenue Trend</h3>
              <p className="text-xs text-neutral-900/30 mt-0.5">Last 12 months</p>
            </div>
            <button
              onClick={() => navigate('/platform/revenue')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
            >
              View Details <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenue} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.3)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.3)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fill="url(#mrrGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px]">
              <p className="text-sm text-neutral-900/30">No revenue data yet</p>
            </div>
          )}
        </div>

        {/* Plan Distribution Pie */}
        <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] p-6">
          <h3 className="font-semibold font-display text-neutral-900 mb-1">Plan Distribution</h3>
          <p className="text-xs text-neutral-900/30 mb-4">Active subscriptions by plan</p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white rounded-lg border border-neutral-300/60 shadow-[var(--shadow-md)] px-3 py-2">
                          <p className="text-xs font-medium text-neutral-900 capitalize">{payload[0].name}: {payload[0].value}</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-2">
                {pieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs text-neutral-900/50">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="capitalize">{d.name}</span>
                    <span className="text-neutral-900/30">({d.value})</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[190px]">
              <p className="text-sm text-neutral-900/30">No plans yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Trials */}
        <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50">
                <CalendarClock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-neutral-900 text-sm">Trials Expiring Soon</h3>
                <p className="text-[11px] text-neutral-900/30">Next 7 days</p>
              </div>
            </div>
          </div>
          {trials.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-neutral-900/30">No expiring trials</p>
            </div>
          ) : (
            <div className="space-y-1">
              {trials.slice(0, 5).map((t) => (
                <div key={t._id} className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-xs font-bold text-amber-700">
                      {(t.clinic?.name || t.clinicSlug || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{t.clinic?.name || t.clinicSlug}</p>
                      <p className="text-[11px] text-neutral-900/30">
                        Expires {new Date(t.trialEndDate || t.currentPeriodEnd).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExtendTrial(t._id)}
                    disabled={extending === t._id}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition disabled:opacity-50"
                  >
                    {extending === t._id ? 'Extending...' : '+7 days'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Signups */}
        <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary-50">
                <Users className="h-4 w-4 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-neutral-900 text-sm">Recent Signups</h3>
                <p className="text-[11px] text-neutral-900/30">Latest registrations</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/platform/tenants')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
            >
              View All <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1">
            {(stats.recentSignups || []).slice(0, 6).map((clinic) => (
              <div
                key={clinic._id}
                className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors"
                onClick={() => navigate(`/platform/tenants/${clinic.slug}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700">
                    {(clinic.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{clinic.name}</p>
                    <p className="text-[11px] text-neutral-900/30">{clinic.email}</p>
                  </div>
                </div>
                <StatusBadge status={clinic.subscription?.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
