import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee, AlertTriangle, CreditCard, FileText,
  Wallet, TrendingUp, Calendar, ArrowRight,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getAnalyticsSummary, getOutstandingReport, getRevenueTrends, getCurrentCashRegister,
  listBranches, listCashRegisters,
} from '../api';
import { ErrorAlert } from '../../platform/components/shared';
import { initSocket, getSocket } from '../../lib/socket';

/* ─── Helpers ──────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

/* ─── Stat cards config ──────────────────────────── */
const STAT_CARDS = [
  { key: 'revenueThisMonth', label: 'Revenue This Month', icon: IndianRupee, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', format: 'currency' },
  { key: 'outstanding', label: 'Outstanding Amount', icon: AlertTriangle, iconBg: 'bg-red-50', iconText: 'text-red-600', format: 'currency' },
  { key: 'paymentsToday', label: 'Payments Today', icon: CreditCard, iconBg: 'bg-blue-50', iconText: 'text-blue-600', format: 'currency' },
  { key: 'invoicesThisMonth', label: 'Invoices This Month', icon: FileText, iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
  { key: 'cashRegisterBalance', label: 'Cash Register Balance', icon: Wallet, iconBg: 'bg-amber-50', iconText: 'text-amber-600', format: 'currency' },
];

/* ─── Quick Actions config ───────────────────────── */
const QUICK_ACTIONS = [
  { label: 'View Invoices', icon: FileText, path: '/clinic/accountant-invoices', iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  { label: 'Revenue Reports', icon: TrendingUp, path: '/clinic/accountant-reports', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
];

/* ─── Skeleton: Stat Cards ───────────────────────── */
function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)]">
          <div className="animate-pulse">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 bg-neutral-100 rounded-2xl" />
            </div>
            <div className="h-8 bg-neutral-100 rounded-lg w-20 mb-2" />
            <div className="h-3 bg-neutral-100 rounded w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Skeleton: Full Page ────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Greeting skeleton */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <div className="animate-pulse">
          <div className="h-7 w-64 bg-neutral-100 rounded-xl mb-2" />
          <div className="h-4 w-80 bg-neutral-100 rounded-lg" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <StatCardsSkeleton />
      </div>

      {/* Quick actions skeleton */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-28 mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200">
                  <div className="w-11 h-11 bg-neutral-100 rounded-xl" />
                  <div className="h-3 bg-neutral-100 rounded w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Two columns skeleton */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '250ms' }}
      >
        <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80">
          <div className="animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-44 mb-5" />
            <div className="space-y-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 bg-neutral-100 rounded w-36" />
                  <div className="h-4 bg-neutral-100 rounded w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80">
          <div className="animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-32 mb-5" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 bg-neutral-100 rounded w-24" />
                  <div className="h-3 bg-neutral-100 rounded w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function AccountantDashboard() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();
  const now = new Date();

  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    revenueThisMonth: 0, outstanding: 0, paymentsToday: 0,
    invoicesThisMonth: 0, cashRegisterBalance: 0,
  });

  // Outstanding invoices
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  // Revenue trends (last 7 days)
  const [weeklyRevenue, setWeeklyRevenue] = useState([]);
  // Branch + pending reconciliations
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [pendingReconciliations, setPendingReconciliations] = useState(0);

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => {
      const list = res.data || [];
      setBranches(list);
      if (list.length === 1) setSelectedBranch(list[0]._id);
    }).catch(() => {});
  }, []);

  // ─── Data Fetching ────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    try {
      const [summaryRes, outstandingRes, trendsRes, cashRes, pendingRes] = await Promise.allSettled([
        getAnalyticsSummary(),
        getOutstandingReport(),
        getRevenueTrends({ from: sevenDaysAgo.toISOString(), to: today.toISOString(), granularity: 'day' }),
        selectedBranch ? getCurrentCashRegister({ branch: selectedBranch }) : Promise.resolve(null),
        listCashRegisters({ status: 'closed', limit: 1 }),
      ]);

      // Analytics summary
      if (summaryRes.status === 'fulfilled') {
        const s = summaryRes.value?.data || summaryRes.value || {};
        setStats((prev) => ({
          ...prev,
          revenueThisMonth: s.revenueThisMonth ?? s.revenue?.thisMonth ?? 0,
          paymentsToday: s.revenueToday ?? s.revenue?.today ?? 0,
          invoicesThisMonth: s.invoicesThisMonth ?? s.invoices?.thisMonth ?? 0,
        }));
      } else {
        console.warn('[AccountantDashboard] Analytics failed:', summaryRes.reason);
      }

      // Outstanding report
      if (outstandingRes.status === 'fulfilled') {
        const o = outstandingRes.value?.data || outstandingRes.value || {};
        setStats((prev) => ({
          ...prev,
          outstanding: o.totalOutstanding ?? 0,
        }));
        const invoices = (o.invoices || [])
          .filter((inv) => inv.status === 'overdue')
          .slice(0, 5);
        setOverdueInvoices(invoices);
      } else {
        console.warn('[AccountantDashboard] Outstanding report failed:', outstandingRes.reason);
      }

      // Revenue trends
      if (trendsRes.status === 'fulfilled') {
        const t = trendsRes.value?.data || trendsRes.value || [];
        setWeeklyRevenue(Array.isArray(t) ? t : []);
      } else {
        console.warn('[AccountantDashboard] Revenue trends failed:', trendsRes.reason);
      }

      // Cash register
      if (cashRes.status === 'fulfilled') {
        const c = cashRes.value?.data || cashRes.value || {};
        setStats((prev) => ({
          ...prev,
          cashRegisterBalance: c.currentBalance ?? c.balance ?? 0,
        }));
      } else {
        console.warn('[AccountantDashboard] Cash register failed:', cashRes.reason);
      }

      // Pending reconciliations
      if (pendingRes.status === 'fulfilled') {
        const p = pendingRes.value || {};
        setPendingReconciliations(p.meta?.total ?? p.total ?? (p.data?.length ?? 0));
      }

      // If all failed, show error
      if (
        summaryRes.status === 'rejected' &&
        outstandingRes.status === 'rejected' &&
        trendsRes.status === 'rejected' &&
        cashRes.status === 'rejected'
      ) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;

    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('payment:update', refresh);
    sock.on('invoice:update', refresh);

    return () => {
      sock.off('payment:update', refresh);
      sock.off('invoice:update', refresh);
    };
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshKey]);

  // ─── Loading state ────────────────────────────────
  if (loading && refreshKey === 0) {
    return <DashboardSkeleton />;
  }

  // ─── Error state ──────────────────────────────────
  if (error && overdueInvoices.length === 0 && weeklyRevenue.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <ErrorAlert message={error} />
        <button
          onClick={fetchAll}
          className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200"
        >
          Retry
        </button>
      </div>
    );
  }

  /* ─── Helpers ─────────────────────────────────────── */
  const daysOverdue = (dueDate) => {
    if (!dueDate) return 0;
    const diff = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  /* ─── Render ─────────────────────────────────────── */
  const greeting = getGreeting();
  const displayName = user?.name?.split(' ')[0] || 'Accountant';

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Context ─────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Financial Overview
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clinic/accountant-invoices')}
            className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <FileText className="h-4 w-4" /> View Invoices
          </button>
          <button
            onClick={() => navigate('/clinic/accountant-reports')}
            className="h-11 px-4 text-sm font-medium bg-white text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
          >
            Revenue Reports
          </button>
        </div>
      </div>

      {/* ── Pending Reconciliations Banner ──────────── */}
      {pendingReconciliations > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '25ms' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">{pendingReconciliations} Register{pendingReconciliations !== 1 ? 's' : ''} Pending Reconciliation</p>
              <p className="text-xs text-amber-600">Closed registers with unresolved variances need approval</p>
            </div>
          </div>
          <button onClick={() => navigate('/clinic/billing?tab=register')} className="px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition flex items-center gap-1.5">
            Review <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Row 1: Stat Cards ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card, i) => {
          const value = card.format === 'currency' ? formatCurrency(stats[card.key]) : stats[card.key];
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
              </div>
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">
                {value}
              </p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── Row 2: Quick Actions ──────────────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
              <p className="text-xs text-neutral-500">Navigate to key financial modules</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
              >
                <div className={`w-11 h-11 rounded-xl ${action.iconBg} flex items-center justify-center`}>
                  <action.icon className={`h-5 w-5 ${action.iconText}`} />
                </div>
                <span className="text-xs font-semibold text-neutral-700 text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Outstanding Invoices + Revenue This Week ── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        {/* Outstanding Invoices Summary (left, 7-col) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold font-display text-neutral-900">Outstanding Invoices</h3>
                  <p className="text-xs text-neutral-500">Top 5 overdue invoices</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/clinic/accountant-invoices')}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition"
              >
                View All <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {overdueInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                  <IndianRupee className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-neutral-600">No overdue invoices</p>
                <p className="text-xs text-neutral-400 mt-1">All invoices are up to date</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueInvoices.map((inv, idx) => (
                  <div
                    key={inv._id || inv.id || idx}
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-200 hover:bg-neutral-100 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {inv.patient?.name || inv.patientName || 'Unknown Patient'}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {inv.invoiceNumber || '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-red-700">
                        {formatCurrency(inv.totalAmount ?? inv.amount ?? 0)}
                      </p>
                      <p className="text-xs text-red-500 mt-0.5">
                        {daysOverdue(inv.dueDate)} days overdue
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Revenue This Week (right, 5-col) */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold font-display text-neutral-900">Revenue This Week</h3>
                <p className="text-xs text-neutral-500">Last 7 days</p>
              </div>
            </div>

            {weeklyRevenue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-medium text-neutral-600">No revenue data</p>
                <p className="text-xs text-neutral-400 mt-1">Revenue will appear as payments are recorded</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {weeklyRevenue.map((entry, idx) => {
                  const dateLabel = entry.date
                    ? new Date(entry.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                    : entry.label || `Day ${idx + 1}`;
                  const amount = entry.revenue ?? entry.total ?? 0;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-neutral-50 transition"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-sm text-neutral-700">{dateLabel}</span>
                      </div>
                      <span className="text-sm font-semibold text-neutral-900">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
