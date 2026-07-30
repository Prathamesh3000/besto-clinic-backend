import React, { useState, useEffect, useCallback } from 'react';
import {
  getMrrBreakdown,
  getTenantGrowth,
  getPlanDistribution,
  getFeatureAdoption,
  getChurnAnalytics,
  getPromotionImpact,
  getActiveSubscriptionAnalytics,
} from '../api';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, DollarSign, Activity,
  BarChart3, RefreshCw, Zap, AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
];

const PLAN_COLORS = {
  free: '#94a3b8',
  starter: '#6366f1',
  professional: '#8b5cf6',
  enterprise: '#ec4899',
};

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'mrr',       label: 'MRR' },
  { key: 'tenants',   label: 'Tenants' },
  { key: 'plans',     label: 'Plans' },
  { key: 'adoption',  label: 'Adoption' },
  { key: 'churn',     label: 'Churn' },
];

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

function fmt(n) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

function pct(n) {
  return (n || 0).toFixed(1) + '%';
}

/* ------------------------------------------------------------------ */
/*  StatCard                                                           */
/* ------------------------------------------------------------------ */

function StatCard({ title, value, subtitle, icon: Icon, trend, trendLabel, className = '' }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : null;

  return (
    <div className={`bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-300 mb-1">{title}</p>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          {subtitle && (
            <p className="text-xs text-neutral-300 mt-1">{subtitle}</p>
          )}
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
              isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-neutral-300'
            }`}>
              {TrendIcon && <TrendIcon className="w-3 h-3" />}
              <span>{isPositive ? '+' : ''}{pct(trend)}</span>
              {trendLabel && <span className="text-neutral-300 ml-1">{trendLabel}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-3 bg-primary-50 rounded-xl">
            <Icon className="w-5 h-5 text-primary-600" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton placeholders                                              */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 animate-pulse">
      <div className="h-4 bg-neutral-100 rounded w-1/3 mb-3" />
      <div className="h-8 bg-neutral-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-neutral-100 rounded w-2/3" />
    </div>
  );
}

function SkeletonChart({ height = 300 }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 animate-pulse">
      <div className="h-4 bg-neutral-100 rounded w-1/4 mb-4" />
      <div className="bg-neutral-100 rounded" style={{ height }} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonChart height={200} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-neutral-900 text-white rounded-lg px-4 py-3 shadow-xl text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-neutral-200">{entry.name}:</span>
          <span className="font-medium">
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OVERVIEW TAB                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({ data }) {
  const { mrr, tenantGrowth, planDist, featureAdoption, churn, promotionImpact, subscriptions } = data;

  // KPI derivations
  const totalMrr = mrr?.totalMrr || mrr?.total || 0;
  const mrrGrowthRate = mrr?.growthRate || mrr?.growth?.rate || 0;
  const totalTenants = tenantGrowth?.total || tenantGrowth?.totalTenants || 0;
  const newThisMonth = tenantGrowth?.newThisMonth || tenantGrowth?.growth?.newThisMonth || 0;
  const activeCount = subscriptions?.active || subscriptions?.totalActive || 0;
  const trialCount = subscriptions?.trial || subscriptions?.totalTrial || 0;
  const churnRate = churn?.monthlyChurnRate || churn?.churnRate || 0;
  const avgAdoption = featureAdoption?.features
    ? (featureAdoption.features.reduce((sum, f) => sum + (f.adoptionRate || 0), 0) / (featureAdoption.features.length || 1))
    : (featureAdoption?.averageAdoption || 0);
  const totalDiscount = promotionImpact?.totalDiscount || promotionImpact?.estimatedDiscount || 0;

  const mrrTrend = mrr?.byPlan || mrr?.trend || [];
  const tenantTrend = tenantGrowth?.monthly || tenantGrowth?.trend || [];
  const planData = planDist?.plans || planDist?.distribution || [];

  return (
    <div className="space-y-6">
      {/* KPI Cards 3x2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Monthly Recurring Revenue"
          value={fmt(totalMrr)}
          icon={DollarSign}
          trend={mrrGrowthRate}
          trendLabel="vs last month"
        />
        <StatCard
          title="Total Tenants"
          value={totalTenants.toLocaleString('en-IN')}
          subtitle={`${newThisMonth} new this month`}
          icon={Users}
          trend={totalTenants > 0 ? (newThisMonth / totalTenants) * 100 : 0}
          trendLabel="growth"
        />
        <StatCard
          title="Active Subscriptions"
          value={activeCount.toLocaleString('en-IN')}
          subtitle={`${trialCount} in trial`}
          icon={Activity}
        />
        <StatCard
          title="Churn Rate"
          value={pct(churnRate)}
          subtitle="Monthly"
          icon={AlertTriangle}
          className={churnRate > 5 ? 'border-red-200 bg-red-50/30' : ''}
          trend={churnRate > 5 ? churnRate : null}
          trendLabel={churnRate > 5 ? '— above threshold' : ''}
        />
        <StatCard
          title="Feature Adoption"
          value={pct(avgAdoption)}
          subtitle="Avg across features"
          icon={Zap}
        />
        <StatCard
          title="Promotion Impact"
          value={fmt(totalDiscount)}
          subtitle="Estimated total discount"
          icon={BarChart3}
        />
      </div>

      {/* 2-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR trend */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">MRR Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={mrrTrend}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" tickFormatter={(v) => '₹' + (v / 1000) + 'k'} />
              <Tooltip content={<CustomTooltip formatter={fmt} />} />
              <Area
                type="monotone"
                dataKey="mrr"
                name="MRR"
                stroke="#6366f1"
                fill="url(#mrrGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="growth"
                name="Growth"
                stroke="#22c55e"
                fill="none"
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tenant growth */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Tenant Growth</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={tenantTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="newTenants"
                name="New Tenants"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Cumulative"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 4, fill: '#22c55e' }}
              />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom: Plan distribution */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Plan Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={planData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a3a094" />
            <YAxis dataKey="plan" type="category" tick={{ fontSize: 12 }} stroke="#a3a094" width={100} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="active" name="Active" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
            <Bar dataKey="trial" name="Trial" stackId="a" fill="#f59e0b" />
            <Bar dataKey="grace" name="Grace" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MRR TAB                                                            */
/* ------------------------------------------------------------------ */

function MrrTab({ data }) {
  const { mrr } = data;
  const totalMrr = mrr?.totalMrr || mrr?.total || 0;
  const growthAmount = mrr?.growthAmount || mrr?.growth?.amount || 0;
  const growthRate = mrr?.growthRate || mrr?.growth?.rate || 0;
  const previousMrr = mrr?.previousMrr || mrr?.growth?.previous || 0;
  const addonRevenue = mrr?.addonRevenue || mrr?.addons?.total || 0;
  const byPlan = mrr?.byPlan || [];
  const billingCycle = mrr?.billingCycle || mrr?.byCycle || [];

  const planKeys = [...new Set(byPlan.flatMap(d => Object.keys(d).filter(k => k !== 'month' && k !== 'mrr' && k !== 'growth')))];

  return (
    <div className="space-y-6">
      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total MRR"
          value={fmt(totalMrr)}
          icon={DollarSign}
          trend={growthRate}
          trendLabel="vs last month"
        />
        <StatCard
          title="MRR Growth"
          value={fmt(growthAmount)}
          subtitle="Net new MRR this month"
          icon={TrendingUp}
        />
        <StatCard
          title="Previous MRR"
          value={fmt(previousMrr)}
          subtitle="Last month"
          icon={BarChart3}
        />
        <StatCard
          title="Add-on Revenue"
          value={fmt(addonRevenue)}
          subtitle="From add-ons"
          icon={Zap}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR by Plan stacked BarChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">MRR by Plan</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={byPlan}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" tickFormatter={(v) => '₹' + (v / 1000) + 'k'} />
              <Tooltip content={<CustomTooltip formatter={fmt} />} />
              <Legend />
              {planKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key.charAt(0).toUpperCase() + key.slice(1)}
                  stackId="mrr"
                  fill={PLAN_COLORS[key] || COLORS[i % COLORS.length]}
                  radius={i === planKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Billing Cycle PieChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Billing Cycle Split</h3>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={billingCycle}
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={120}
                dataKey="value"
                nameKey="name"
                paddingAngle={4}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {billingCycle.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Growth comparison */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Growth Comparison</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-neutral-50 rounded-xl">
            <p className="text-sm text-neutral-300 mb-1">Previous Month</p>
            <p className="text-2xl font-bold text-neutral-900">{fmt(previousMrr)}</p>
          </div>
          <div className="text-center p-4 bg-primary-50 rounded-xl flex flex-col items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-600 mb-1" />
            <p className="text-lg font-bold text-primary-700">
              {growthAmount >= 0 ? '+' : ''}{fmt(growthAmount)}
            </p>
            <p className="text-sm text-primary-600">{pct(growthRate)} growth</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <p className="text-sm text-neutral-300 mb-1">Current Month</p>
            <p className="text-2xl font-bold text-neutral-900">{fmt(totalMrr)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TENANTS TAB                                                        */
/* ------------------------------------------------------------------ */

function TenantsTab({ data }) {
  const { tenantGrowth } = data;
  const monthly = tenantGrowth?.monthly || tenantGrowth?.trend || [];
  const total = tenantGrowth?.total || tenantGrowth?.totalTenants || 0;
  const newThisMonth = tenantGrowth?.newThisMonth || tenantGrowth?.growth?.newThisMonth || 0;
  const growthRate = tenantGrowth?.growthRate || tenantGrowth?.growth?.rate || 0;
  const statusBreakdown = tenantGrowth?.statusBreakdown || tenantGrowth?.byStatus || [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Tenants"
          value={total.toLocaleString('en-IN')}
          icon={Users}
          trend={growthRate}
          trendLabel="growth"
        />
        <StatCard
          title="New This Month"
          value={newThisMonth.toLocaleString('en-IN')}
          subtitle="Newly onboarded"
          icon={TrendingUp}
        />
        <StatCard
          title="Growth Rate"
          value={pct(growthRate)}
          subtitle="Month over month"
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New tenants LineChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">New Tenants (Monthly)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="newTenants"
                name="New Tenants"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cumulative AreaChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Cumulative Total</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Total Tenants"
                stroke="#22c55e"
                fill="url(#cumGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status breakdown PieChart */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Status Breakdown</h3>
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="w-full lg:w-1/2">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {statusBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full lg:w-1/2 grid grid-cols-2 gap-3">
            {statusBreakdown.map((status, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <div>
                  <p className="text-xs text-neutral-300">{status.name}</p>
                  <p className="text-sm font-semibold text-neutral-900">{(status.value || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PLANS TAB                                                          */
/* ------------------------------------------------------------------ */

function PlansTab({ data }) {
  const { planDist } = data;
  const plans = planDist?.plans || planDist?.distribution || [];
  const mrrByPlan = planDist?.mrrByPlan || planDist?.mrrContribution || [];
  const upgrades = planDist?.upgrades || planDist?.flows || [];

  const totalMrr = mrrByPlan.reduce((s, p) => s + (p.value || p.mrr || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan distribution stacked BarChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Plan Distribution</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={plans}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="plan" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="active" name="Active" stackId="a" fill="#6366f1" />
              <Bar dataKey="trial" name="Trial" stackId="a" fill="#f59e0b" />
              <Bar dataKey="grace" name="Grace" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* MRR contribution PieChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">MRR Contribution by Plan</h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={mrrByPlan}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                dataKey="value"
                nameKey="name"
                paddingAngle={4}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {mrrByPlan.map((entry, i) => (
                  <Cell key={i} fill={PLAN_COLORS[entry.name?.toLowerCase()] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Plans table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        <div className="p-6 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">Plan Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50">
                <th className="text-left px-6 py-3 font-medium text-neutral-300">Plan</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Active</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Trial</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Grace</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Total</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">MRR</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">MRR%</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">ARPS</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Conv. Rate</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => {
                const planTotal = (plan.active || 0) + (plan.trial || 0) + (plan.grace || 0);
                const planMrr = plan.mrr || 0;
                const mrrPct = totalMrr > 0 ? (planMrr / totalMrr) * 100 : 0;
                const arps = planTotal > 0 ? planMrr / planTotal : 0;
                const convRate = plan.conversionRate || ((plan.trial || 0) > 0 ? ((plan.active || 0) / ((plan.active || 0) + (plan.trial || 0))) * 100 : 0);

                return (
                  <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: PLAN_COLORS[plan.plan?.toLowerCase()] || COLORS[i % COLORS.length] }}
                        />
                        <span className="font-medium text-neutral-900 capitalize">{plan.plan}</span>
                      </div>
                    </td>
                    <td className="text-right px-6 py-3 text-neutral-900">{(plan.active || 0).toLocaleString('en-IN')}</td>
                    <td className="text-right px-6 py-3 text-neutral-900">{(plan.trial || 0).toLocaleString('en-IN')}</td>
                    <td className="text-right px-6 py-3 text-neutral-900">{(plan.grace || 0).toLocaleString('en-IN')}</td>
                    <td className="text-right px-6 py-3 font-medium text-neutral-900">{planTotal.toLocaleString('en-IN')}</td>
                    <td className="text-right px-6 py-3 font-medium text-neutral-900">{fmt(planMrr)}</td>
                    <td className="text-right px-6 py-3 text-neutral-900">{pct(mrrPct)}</td>
                    <td className="text-right px-6 py-3 text-neutral-900">{fmt(Math.round(arps))}</td>
                    <td className="text-right px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        convRate >= 70 ? 'bg-green-100 text-green-700' :
                        convRate >= 40 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {pct(convRate)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade / Downgrade flows */}
      {upgrades.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="p-6 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">Upgrade / Downgrade Flows</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="text-left px-6 py-3 font-medium text-neutral-300">From</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-300">To</th>
                  <th className="text-right px-6 py-3 font-medium text-neutral-300">Count</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-300">Direction</th>
                </tr>
              </thead>
              <tbody>
                {upgrades.map((flow, i) => {
                  const direction = flow.direction || (flow.to > flow.from ? 'upgrade' : 'downgrade');
                  return (
                    <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-neutral-900 capitalize">{flow.from}</td>
                      <td className="px-6 py-3 font-medium text-neutral-900 capitalize">{flow.to}</td>
                      <td className="text-right px-6 py-3 text-neutral-900">{(flow.count || 0).toLocaleString('en-IN')}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          direction === 'upgrade'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {direction === 'upgrade'
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />
                          }
                          {direction.charAt(0).toUpperCase() + direction.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ADOPTION TAB                                                       */
/* ------------------------------------------------------------------ */

function AdoptionTab({ data }) {
  const { featureAdoption } = data;
  const features = featureAdoption?.features || [];
  const totalActive = featureAdoption?.totalActiveTenants || featureAdoption?.totalActive || 0;

  const sorted = [...features].sort((a, b) => (b.adoptionRate || 0) - (a.adoptionRate || 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Feature Adoption</h3>
          <p className="text-sm text-neutral-300 mt-1">
            Adoption rates across {totalActive.toLocaleString('en-IN')} active tenants
          </p>
        </div>
      </div>

      {/* Horizontal BarChart */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Adoption Rate by Feature</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 40)}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              stroke="#a3a094"
              tickFormatter={(v) => v + '%'}
            />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 12 }}
              stroke="#a3a094"
              width={140}
            />
            <Tooltip
              content={<CustomTooltip formatter={(v) => pct(v)} />}
            />
            <Bar dataKey="adoptionRate" name="Adoption Rate" fill="#6366f1" radius={[0, 6, 6, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Feature table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        <div className="p-6 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">Feature Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50">
                <th className="text-left px-6 py-3 font-medium text-neutral-300">Key</th>
                <th className="text-left px-6 py-3 font-medium text-neutral-300">Name</th>
                <th className="text-center px-6 py-3 font-medium text-neutral-300">Global?</th>
                <th className="text-right px-6 py-3 font-medium text-neutral-300">Enabled</th>
                <th className="text-left px-6 py-3 font-medium text-neutral-300 min-w-[200px]">Adoption Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((feature, i) => (
                <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-6 py-3">
                    <code className="px-2 py-0.5 bg-neutral-50 rounded text-xs text-primary-700 font-mono">
                      {feature.key || feature.featureKey}
                    </code>
                  </td>
                  <td className="px-6 py-3 font-medium text-neutral-900">{feature.name}</td>
                  <td className="text-center px-6 py-3">
                    {feature.isGlobal || feature.global ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        Global
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-300">
                        Per-tenant
                      </span>
                    )}
                  </td>
                  <td className="text-right px-6 py-3 text-neutral-900">
                    {(feature.enabledCount || feature.enabled || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-neutral-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(feature.adoptionRate || 0, 100)}%`,
                            backgroundColor: (feature.adoptionRate || 0) >= 70 ? '#22c55e' :
                              (feature.adoptionRate || 0) >= 40 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-neutral-900 w-12 text-right">
                        {pct(feature.adoptionRate)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CHURN TAB                                                          */
/* ------------------------------------------------------------------ */

function ChurnTab({ data }) {
  const { churn } = data;
  const monthly = churn?.monthly || churn?.trend || [];
  const revenueImpact = churn?.revenueImpact || churn?.revenueTrend || [];
  const reasons = churn?.cancelReasons || churn?.reasons || [];
  const totalChurned = churn?.totalChurned || churn?.cancelled || 0;
  const totalSuspended = churn?.totalSuspended || churn?.suspended || 0;
  const revenueLost = churn?.revenueLost || churn?.revenueImpactTotal || 0;
  const monthlyRate = churn?.monthlyChurnRate || churn?.churnRate || 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Churned"
          value={totalChurned.toLocaleString('en-IN')}
          subtitle="Cancelled accounts"
          icon={TrendingDown}
          className="border-red-200"
        />
        <StatCard
          title="Total Suspended"
          value={totalSuspended.toLocaleString('en-IN')}
          subtitle="Suspended accounts"
          icon={AlertTriangle}
          className="border-amber-200"
        />
        <StatCard
          title="Revenue Impact"
          value={fmt(revenueLost)}
          subtitle="Lost MRR"
          icon={DollarSign}
          className="border-red-200"
        />
        <StatCard
          title="Monthly Churn Rate"
          value={pct(monthlyRate)}
          subtitle={monthlyRate > 5 ? 'Above threshold!' : 'Within target'}
          icon={Activity}
          className={monthlyRate > 5 ? 'border-red-200 bg-red-50/30' : ''}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly churn BarChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Monthly Churn Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="suspended" name="Suspended" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue impact AreaChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Revenue Impact</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenueImpact}>
              <defs>
                <linearGradient id="revImpactGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a094" />
              <YAxis tick={{ fontSize: 12 }} stroke="#a3a094" tickFormatter={(v) => '₹' + (v / 1000) + 'k'} />
              <Tooltip content={<CustomTooltip formatter={fmt} />} />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Lost Revenue"
                stroke="#ef4444"
                fill="url(#revImpactGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cancel reasons row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cancel reasons PieChart */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Cancel Reasons</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={reasons}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                dataKey="value"
                nameKey="name"
                paddingAngle={3}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {reasons.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cancel reasons table */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="p-6 border-b border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900">Reason Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="text-left px-6 py-3 font-medium text-neutral-300">Reason</th>
                  <th className="text-right px-6 py-3 font-medium text-neutral-300">Count</th>
                  <th className="text-right px-6 py-3 font-medium text-neutral-300">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((reason, i) => {
                  const totalReasons = reasons.reduce((s, r) => s + (r.value || 0), 0);
                  const reasonPct = totalReasons > 0 ? ((reason.value || 0) / totalReasons) * 100 : 0;
                  return (
                    <tr key={i} className="border-t border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="font-medium text-neutral-900">{reason.name}</span>
                        </div>
                      </td>
                      <td className="text-right px-6 py-3 text-neutral-900">
                        {(reason.value || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="text-right px-6 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-900">
                          {pct(reasonPct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function PlatformAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({
    mrr: null,
    tenantGrowth: null,
    planDist: null,
    featureAdoption: null,
    churn: null,
    promotionImpact: null,
    subscriptions: null,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        mrr,
        tenantGrowth,
        planDist,
        featureAdoption,
        churn,
        promotionImpact,
        subscriptions,
      ] = await Promise.all([
        getMrrBreakdown(),
        getTenantGrowth(),
        getPlanDistribution(),
        getFeatureAdoption(),
        getChurnAnalytics(),
        getPromotionImpact(),
        getActiveSubscriptionAnalytics(),
      ]);
      setData({ mrr, tenantGrowth, planDist, featureAdoption, churn, promotionImpact, subscriptions });
    } catch (err) {
      console.error('Failed to fetch analytics data:', err);
      setError(err.message || 'Failed to load analytics data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderTabContent = () => {
    if (loading) return <LoadingSkeleton />;

    switch (activeTab) {
      case 'overview':
        return <OverviewTab data={data} />;
      case 'mrr':
        return <MrrTab data={data} />;
      case 'tenants':
        return <TenantsTab data={data} />;
      case 'plans':
        return <PlansTab data={data} />;
      case 'adoption':
        return <AdoptionTab data={data} />;
      case 'churn':
        return <ChurnTab data={data} />;
      default:
        return <OverviewTab data={data} />;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Platform Analytics</h1>
            <p className="text-sm text-neutral-300 mt-1">
              Consolidated view of MRR, tenants, plans, adoption, and churn
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="mt-4 sm:mt-0 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error loading analytics</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-xs font-medium text-red-700 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-neutral-200">
          <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Analytics tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-300 hover:text-neutral-900 hover:border-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {renderTabContent()}
      </div>
    </div>
  );
}
