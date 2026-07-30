import { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import {
  getActiveSubscriptionAnalytics, getExpiringSubscriptions,
  getSuspendedTenants, getPlanDistribution, extendTrial,
} from '../api';
import { StatCard, StatusBadge, DataTable, EmptyState, TabBar, Spinner, ErrorAlert } from '../components/shared';
import { Users, Clock, AlertTriangle, ShieldOff, ArrowUpDown } from 'lucide-react';

const COLORS = ['#0d9488', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const STATUS_COLORS_MAP = { active: '#10b981', trial: '#f59e0b', grace_period: '#f97316', suspended: '#ef4444', cancelled: '#9ca3af' };
const DAYS_OPTIONS = [7, 14, 30, 60, 90];

export default function SubscriptionAnalytics() {
  const [active, setActive] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [suspended, setSuspended] = useState([]);
  const [planDist, setPlanDist] = useState(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [extending, setExtending] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getActiveSubscriptionAnalytics(),
      getExpiringSubscriptions(days),
      getSuspendedTenants(),
      getPlanDistribution(),
    ])
      .then(([actRes, expRes, susRes, planRes]) => {
        setActive(actRes.data);
        setExpiring(expRes.data);
        setSuspended(Array.isArray(susRes.data) ? susRes.data : susRes.data?.tenants || []);
        setPlanDist(planRes.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  const handleExtend = async (id) => {
    setExtending(id);
    try {
      await extendTrial(id, 7);
      setExpiring((prev) => ({
        ...prev,
        trials: (prev?.trials || []).filter((t) => t._id !== id),
      }));
    } catch { /* silent */ } finally {
      setExtending(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorAlert message={error} />;

  const summary = active?.summary || {};
  const byPlanStatus = active?.byPlan || [];
  const cycleSplit = active?.byBillingCycle || {};
  const cycleData = Object.entries(cycleSplit).map(([name, value]) => ({ name, value }));
  const trials = expiring?.trials || [];
  const renewals = expiring?.renewals || [];
  const graceDeadlines = expiring?.graceDeadlines || [];
  const flows = planDist?.upgradeDowngradeFlows || [];

  const stackedData = byPlanStatus.map((p) => ({
    plan: p.planName || p._id,
    active: p.active || 0,
    trial: p.trial || 0,
    grace_period: p.grace_period || 0,
    suspended: p.suspended || 0,
  }));

  const suspendedColumns = [
    { key: 'name', label: 'Tenant', render: (r) => r.clinic?.name || r.clinicSlug || r.name },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status="suspended" /> },
    { key: 'daysSuspended', label: 'Days', render: (r) => `${r.daysSuspended || 0}d` },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || r.suspensionReason || '—' },
    { key: 'revenueImpact', label: 'Revenue Impact', render: (r) => `₹${(r.revenueImpact || r.monthlyRevenue || 0).toLocaleString('en-IN')}` },
  ];

  const flowColumns = [
    { key: 'from', label: 'From Plan', render: (r) => r.fromPlan || r.from },
    { key: 'to', label: 'To Plan', render: (r) => r.toPlan || r.to },
    { key: 'direction', label: 'Direction', render: (r) => (
      <span className={`text-xs font-medium ${r.direction === 'upgrade' ? 'text-emerald-600' : 'text-amber-600'}`}>
        {r.direction}
      </span>
    )},
    { key: 'count', label: 'Count' },
  ];

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'expiring', label: 'Expiring' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'flows', label: 'Plan Flows' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold font-display text-neutral-900">Subscription Analytics</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} title="Active" value={summary.active || 0} color="green" />
        <StatCard icon={Clock} title="Trial" value={summary.trial || 0} color="yellow" />
        <StatCard icon={AlertTriangle} title="Grace Period" value={summary.grace_period || 0} color="yellow" />
        <StatCard icon={ShieldOff} title="Suspended" value={summary.suspended || 0} color="red" />
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Plan Breakdown (Stacked Bar) */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">By Plan (Stacked)</h3>
            {stackedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stackedData}>
                  <XAxis dataKey="plan" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="active" stackId="a" fill={STATUS_COLORS_MAP.active} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="trial" stackId="a" fill={STATUS_COLORS_MAP.trial} />
                  <Bar dataKey="grace_period" stackId="a" fill={STATUS_COLORS_MAP.grace_period} name="grace period" />
                  <Bar dataKey="suspended" stackId="a" fill={STATUS_COLORS_MAP.suspended} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No plan data" />
            )}
          </div>

          {/* Billing Cycle Pie */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">Billing Cycle</h3>
            {cycleData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={cycleData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                      {cycleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-2">
                  {cycleData.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-2 text-xs text-neutral-900/60">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                      <span className="capitalize">{d.name}</span>: {d.value}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title="No billing data" />
            )}
          </div>
        </div>
      )}

      {/* Expiring Tab */}
      {tab === 'expiring' && (
        <div className="space-y-6">
          {/* Days Selector */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-neutral-900/50">Expiring within:</span>
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xl transition ${
                  days === d ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-600/20' : 'bg-neutral-200 text-neutral-900/60 hover:bg-neutral-300'
                }`}
              >
                {d} days
              </button>
            ))}
          </div>

          {/* Trials */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">Expiring Trials ({trials.length})</h3>
            {trials.length > 0 ? (
              <div className="space-y-3">
                {trials.map((t) => (
                  <div key={t._id} className="flex items-center justify-between py-2 border-b border-neutral-300/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{t.clinic?.name || t.clinicSlug}</p>
                      <p className="text-xs text-neutral-900/40">Expires {new Date(t.trialEndDate || t.currentPeriodEnd).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => handleExtend(t._id)}
                      disabled={extending === t._id}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 disabled:opacity-50 transition"
                    >
                      {extending === t._id ? 'Extending...' : '+7 days'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No expiring trials" />
            )}
          </div>

          {/* Renewals */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">Upcoming Renewals ({renewals.length})</h3>
            {renewals.length > 0 ? (
              <div className="space-y-3">
                {renewals.map((r) => (
                  <div key={r._id} className="flex items-center justify-between py-2 border-b border-neutral-300/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{r.clinic?.name || r.clinicSlug}</p>
                      <p className="text-xs text-neutral-900/40">Renews {new Date(r.currentPeriodEnd).toLocaleDateString()} — {r.plan?.name || r.planSlug}</p>
                    </div>
                    <span className="text-sm font-medium text-neutral-900/70">₹{(r.billedAmount || 0).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No upcoming renewals" />
            )}
          </div>

          {/* Grace Deadlines */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">Grace Period Deadlines ({graceDeadlines.length})</h3>
            {graceDeadlines.length > 0 ? (
              <div className="space-y-3">
                {graceDeadlines.map((g) => (
                  <div key={g._id} className="flex items-center justify-between py-2 border-b border-neutral-300/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{g.clinic?.name || g.clinicSlug}</p>
                      <p className="text-xs text-red-400">Suspends {new Date(g.gracePeriodEnd || g.currentPeriodEnd).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status="grace_period" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No grace period deadlines" />
            )}
          </div>
        </div>
      )}

      {/* Suspended Tab */}
      {tab === 'suspended' && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
          <h3 className="font-semibold font-display text-neutral-900 mb-4">Suspended Tenant Report</h3>
          {suspended.length > 0 ? (
            <DataTable columns={suspendedColumns} data={suspended} />
          ) : (
            <EmptyState title="No suspended tenants" message="Great — all tenants are in good standing" />
          )}
        </div>
      )}

      {/* Plan Flows Tab */}
      {tab === 'flows' && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpDown className="h-4 w-4 text-neutral-900/40" />
            <h3 className="font-semibold font-display text-neutral-900">Upgrade / Downgrade Flows</h3>
          </div>
          {flows.length > 0 ? (
            <DataTable columns={flowColumns} data={flows} />
          ) : (
            <EmptyState title="No plan changes recorded" message="Upgrade and downgrade flows will appear here" />
          )}
        </div>
      )}
    </div>
  );
}
