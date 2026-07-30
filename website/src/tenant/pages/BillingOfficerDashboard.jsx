import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee, FileText, CreditCard, AlertTriangle, Activity,
  Plus, TrendingUp, Wallet, ArrowRight, Clock,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getAnalyticsSummary, listInvoices, getCurrentCashRegister,
  openCashRegister, closeCashRegister, getRevenueAnalytics,
  getDayEndReport, listBranches,
} from '../api';
import { ErrorAlert, Modal } from '../../platform/components/shared';
import { initSocket, getSocket } from '../../lib/socket';
import { useToast } from '../ToastContext';

/* ---- Helpers -------------------------------------------------- */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const todayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const monthStartISO = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const weekStartISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/* ---- Status helpers ------------------------------------------- */
const STATUS_STYLES = {
  draft:          { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  sent:           { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  paid:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  overdue:        { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled:      { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' },
  partially_paid: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ---- Stat cards config ---------------------------------------- */
const STAT_CARDS = [
  { key: 'revenueToday', label: 'Revenue Today', icon: IndianRupee, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', format: 'currency' },
  { key: 'invoicesToday', label: 'Invoices Today', icon: FileText, iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
  { key: 'paymentsToday', label: 'Payments Today', icon: CreditCard, iconBg: 'bg-purple-50', iconText: 'text-purple-600', format: 'currency' },
  { key: 'outstandingTotal', label: 'Outstanding', icon: AlertTriangle, iconBg: 'bg-amber-50', iconText: 'text-amber-600', format: 'currency' },
  { key: 'registerStatus', label: 'Cash Register', icon: Wallet, iconBg: 'bg-primary-50', iconText: 'text-primary-600', format: 'status' },
];

/* ---- Quick Actions -------------------------------------------- */
const QUICK_ACTIONS = [
  { label: 'Create Invoice', icon: FileText, path: '/clinic/billing-officer-invoices', iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
  { label: 'Record Payment', icon: CreditCard, path: '/clinic/billing-officer-payments', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
  { label: 'Insurance Claims', icon: Activity, path: '/clinic/billing-officer-insurance', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
];

/* ---- Skeleton ------------------------------------------------- */
function DashboardSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <div className="animate-pulse">
          <div className="h-7 w-64 bg-neutral-100 rounded-xl mb-2" />
          <div className="h-4 w-80 bg-neutral-100 rounded-lg" />
        </div>
      </div>
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)]">
              <div className="animate-pulse">
                <div className="flex items-start justify-between mb-3"><div className="w-12 h-12 bg-neutral-100 rounded-2xl" /></div>
                <div className="h-8 bg-neutral-100 rounded-lg w-20 mb-2" />
                <div className="h-3 bg-neutral-100 rounded w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-48">
          <div className="animate-pulse"><div className="h-4 bg-neutral-100 rounded w-32 mb-4" /><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => (<div key={i} className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200"><div className="w-11 h-11 bg-neutral-100 rounded-xl" /><div className="h-3 bg-neutral-100 rounded w-20" /></div>))}</div></div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '250ms' }}>
        <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80"><div className="animate-pulse"><div className="h-4 bg-neutral-100 rounded w-36 mb-4" /><div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => (<div key={i} className="flex items-center gap-3"><div className="w-16 h-4 bg-neutral-100 rounded" /><div className="flex-1 h-4 bg-neutral-100 rounded" /><div className="w-20 h-5 bg-neutral-100 rounded-full" /></div>))}</div></div></div>
        <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80"><div className="animate-pulse"><div className="h-4 bg-neutral-100 rounded w-36 mb-4" /><div className="space-y-4">{[0, 1, 2].map((i) => (<div key={i} className="p-4 bg-neutral-50 rounded-xl"><div className="h-3 bg-neutral-100 rounded w-20 mb-2" /><div className="h-7 bg-neutral-100 rounded w-28" /></div>))}</div></div></div>
      </div>
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BillingOfficerDashboard() {
  const { user } = useTenantAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const now = new Date();

  // ---- State --------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({
    revenueToday: 0, invoicesToday: 0, paymentsToday: 0, outstandingTotal: 0, registerStatus: 'Closed',
  });

  const [recentInvoices, setRecentInvoices] = useState([]);
  const [revenue, setRevenue] = useState({ today: 0, thisWeek: 0, thisMonth: 0, outstanding: 0 });
  const [cashRegister, setCashRegister] = useState(null);

  // Register modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // Branch selection
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => {
      const list = res.data || [];
      setBranches(list);
      if (list.length === 1) setSelectedBranch(list[0]._id);
    }).catch(() => {});
  }, []);

  // Denomination tracking
  const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const emptyDenoms = () => Object.fromEntries(DENOMINATIONS.map((d) => [d, '']));
  const [openDenoms, setOpenDenoms] = useState(emptyDenoms());
  const [closeDenoms, setCloseDenoms] = useState(emptyDenoms());
  const [showCloseModal, setShowCloseModal] = useState(false);
  const denomSum = (denoms) => DENOMINATIONS.reduce((sum, d) => sum + (Number(denoms[d]) || 0) * d, 0);

  // Day-end report
  const [dayReport, setDayReport] = useState(null);
  const [showDayReport, setShowDayReport] = useState(false);
  const [dayReportLoading, setDayReportLoading] = useState(false);

  // ---- Fetching -----------------------------------------------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, invoicesRes, registerRes, revenueRes] = await Promise.allSettled([
        getAnalyticsSummary(),
        listInvoices({ from: todayISO(), limit: 10 }),
        selectedBranch ? getCurrentCashRegister({ branch: selectedBranch }) : Promise.resolve(null),
        getRevenueAnalytics({ from: monthStartISO() }),
      ]);

      // Analytics
      if (summaryRes.status === 'fulfilled') {
        const s = summaryRes.value?.data || summaryRes.value || {};
        setStats((prev) => ({
          ...prev,
          revenueToday: s?.revenue?.today ?? s?.revenueToday ?? 0,
          invoicesToday: s?.invoices?.today ?? s?.invoicesToday ?? 0,
          paymentsToday: s?.payments?.today ?? s?.paymentsToday ?? 0,
          outstandingTotal: s?.outstanding?.total ?? s?.outstandingTotal ?? 0,
        }));
      }

      // Invoices
      if (invoicesRes.status === 'fulfilled') {
        const items = invoicesRes.value?.data?.items || invoicesRes.value?.data || [];
        setRecentInvoices(Array.isArray(items) ? items.slice(0, 10) : []);
      }

      // Cash register
      if (registerRes.status === 'fulfilled') {
        const reg = registerRes.value?.data || null;
        setCashRegister(reg);
        setStats((prev) => ({
          ...prev,
          registerStatus: reg?.status === 'open' ? 'Open' : 'Closed',
        }));
      }

      // Revenue
      if (revenueRes.status === 'fulfilled') {
        const r = revenueRes.value?.data || {};
        setRevenue({
          today: r.today ?? r.revenueToday ?? 0,
          thisWeek: r.thisWeek ?? r.revenueThisWeek ?? 0,
          thisMonth: r.thisMonth ?? r.revenueThisMonth ?? 0,
          outstanding: r.totals?.totalOutstanding ?? r.outstanding ?? 0,
        });
      }

      if (
        summaryRes.status === 'rejected' &&
        invoicesRes.status === 'rejected' &&
        registerRes.status === 'rejected' &&
        revenueRes.status === 'rejected'
      ) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  // ---- WebSocket -----------------------------------------------
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('invoice:update', refresh);
    sock.on('payment:update', refresh);
    return () => {
      sock.off('invoice:update', refresh);
      sock.off('payment:update', refresh);
    };
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

  // ---- Register actions ----------------------------------------
  const handleRegisterAction = async () => {
    if (cashRegister?.status === 'open') {
      setCloseDenoms(emptyDenoms());
      setShowCloseModal(true);
    } else {
      setOpenDenoms(emptyDenoms());
      setOpeningBalance('');
      setShowRegisterModal(true);
    }
  };

  const handleOpenRegister = async () => {
    const total = denomSum(openDenoms) || Number(openingBalance) || 0;
    if (total < 0 || !selectedBranch) return;
    setRegisterLoading(true);
    try {
      await openCashRegister({ branch: selectedBranch, openingBalance: total, denominations: openDenoms });
      showToast({ type: 'success', message: 'Cash register opened' });
      setShowRegisterModal(false);
      setOpeningBalance('');
      setOpenDenoms(emptyDenoms());
      setSelectedBranch(branches.length === 1 ? branches[0]._id : '');
      fetchAll();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to open register' });
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleCloseRegister = async () => {
    setRegisterLoading(true);
    try {
      const closingBalance = denomSum(closeDenoms);
      await closeCashRegister(cashRegister._id || cashRegister.id, { closingBalance, denominations: closeDenoms });
      showToast({ type: 'success', message: 'Cash register closed' });
      setShowCloseModal(false);
      setCloseDenoms(emptyDenoms());
      fetchAll();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to close register' });
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleFetchDayReport = async () => {
    setDayReportLoading(true);
    setShowDayReport(true);
    try {
      const res = await getDayEndReport();
      setDayReport(res?.data || res || null);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to load day-end report' });
    } finally {
      setDayReportLoading(false);
    }
  };

  // ---- Loading / Error states ----------------------------------
  if (loading && refreshKey === 0) return <DashboardSkeleton />;

  if (error && recentInvoices.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <ErrorAlert message={error} />
        <button onClick={fetchAll} className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200">
          Retry
        </button>
      </div>
    );
  }

  /* ---- Render ------------------------------------------------- */
  const greeting = getGreeting();
  const displayName = user?.name?.split(' ')[0] || 'Officer';

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Row 0: Greeting + Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Billing Command Center
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clinic/billing-officer-invoices')}
            className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Invoice
          </button>
          <button
            onClick={() => navigate('/clinic/billing-officer-payments')}
            className="h-11 px-4 text-sm font-medium bg-white text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
          >
            View Payments
          </button>
        </div>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card, i) => {
          let value;
          if (card.format === 'currency') value = formatCurrency(stats[card.key]);
          else if (card.format === 'status') value = stats[card.key];
          else value = stats[card.key];

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
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Row 2: Quick Actions */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
              <p className="text-xs text-neutral-500">Common billing tasks at your fingertips</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

            {/* Register toggle button */}
            <button
              onClick={handleRegisterAction}
              disabled={registerLoading}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
                <Wallet className={`h-5 w-5 ${cashRegister?.status === 'open' ? 'text-red-600' : 'text-amber-600'}`} />
              </div>
              <span className="text-xs font-semibold text-neutral-700 text-center leading-tight">
                {registerLoading ? 'Processing...' : cashRegister?.status === 'open' ? 'Close Register' : 'Open Register'}
              </span>
            </button>

            {/* Day-End Report button */}
            <button
              onClick={handleFetchDayReport}
              disabled={dayReportLoading}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-teal-600" />
              </div>
              <span className="text-xs font-semibold text-neutral-700 text-center leading-tight">
                {dayReportLoading ? 'Loading...' : 'Day-End Report'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Recent Invoices + Revenue Summary */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        {/* Left: Recent Invoices */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold font-display text-neutral-900">Recent Invoices</h3>
                  <p className="text-xs text-neutral-500">Today's invoices</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/clinic/billing-officer-invoices')}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition"
              >
                View All <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm text-neutral-400">No invoices today</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="text-left text-xs font-medium text-neutral-500 pb-2 pr-3">#</th>
                      <th className="text-left text-xs font-medium text-neutral-500 pb-2 pr-3">Patient</th>
                      <th className="text-right text-xs font-medium text-neutral-500 pb-2 pr-3">Amount</th>
                      <th className="text-right text-xs font-medium text-neutral-500 pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((inv, idx) => (
                      <tr key={inv._id || inv.id || idx} className="border-b border-neutral-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className="font-semibold text-neutral-900 font-display text-xs">
                            {inv.invoiceNumber || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-neutral-700 text-xs truncate max-w-[180px]">
                          {inv.patient?.name || inv.patientName || 'N/A'}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-neutral-900 text-xs">
                          {formatCurrency(inv.totalAmount ?? inv.amount ?? 0)}
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Revenue Summary */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold font-display text-neutral-900">Revenue Summary</h3>
                <p className="text-xs text-neutral-500">At a glance</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Today */}
              <div className="bg-emerald-50/60 rounded-xl p-4">
                <p className="text-xs font-medium text-emerald-600 mb-1">Today</p>
                <p className="text-2xl font-bold font-display text-neutral-900">{formatCurrency(revenue.today)}</p>
              </div>

              {/* This Week */}
              <div className="bg-blue-50/60 rounded-xl p-4">
                <p className="text-xs font-medium text-blue-600 mb-1">This Week</p>
                <p className="text-2xl font-bold font-display text-neutral-900">{formatCurrency(revenue.thisWeek)}</p>
              </div>

              {/* This Month */}
              <div className="bg-purple-50/60 rounded-xl p-4">
                <p className="text-xs font-medium text-purple-600 mb-1">This Month</p>
                <p className="text-2xl font-bold font-display text-neutral-900">{formatCurrency(revenue.thisMonth)}</p>
              </div>

              {/* Outstanding */}
              {revenue.outstanding > 0 && (
                <div className="bg-amber-50/60 rounded-xl p-4">
                  <p className="text-xs font-medium text-amber-600 mb-1">Outstanding</p>
                  <p className="text-2xl font-bold font-display text-amber-700">{formatCurrency(revenue.outstanding)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cash Register Info Banner */}
      {cashRegister?.status === 'open' && (
        <div
          className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '350ms' }}
        >
          <Wallet className="h-5 w-5 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Cash Register Open</span>
            {' — '}Opening balance: {formatCurrency(cashRegister.openingBalance)}
            {cashRegister.currentBalance != null && ` | Current: ${formatCurrency(cashRegister.currentBalance)}`}
          </p>
        </div>
      )}

      {/* Open Register Modal — Denomination Counting */}
      <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)} title="Open Cash Register">
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Branch</label>
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} required className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer">
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <p className="text-sm text-neutral-600">Count the cash denominations to set the opening balance.</p>
          <div className="grid grid-cols-2 gap-3">
            {DENOMINATIONS.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-600 w-12 text-right">{formatCurrency(d)}</span>
                <span className="text-neutral-400 text-xs">x</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={openDenoms[d]}
                  onChange={(e) => setOpenDenoms((prev) => ({ ...prev, [d]: e.target.value }))}
                  placeholder="0"
                  className="flex-1 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all w-16"
                />
                <span className="text-xs text-neutral-500 w-16 text-right">{formatCurrency((Number(openDenoms[d]) || 0) * d)}</span>
              </div>
            ))}
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-700">Total Opening Balance</span>
            <span className="text-lg font-bold font-display text-emerald-800">{formatCurrency(denomSum(openDenoms))}</span>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button onClick={() => setShowRegisterModal(false)} disabled={registerLoading} className="h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200">
              Cancel
            </button>
            <button
              onClick={handleOpenRegister}
              disabled={registerLoading || denomSum(openDenoms) <= 0 || !selectedBranch}
              className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              {registerLoading ? 'Opening...' : <><Wallet className="h-4 w-4" /> Open Register</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* Close Register Modal — Denomination Counting */}
      <Modal open={showCloseModal} onClose={() => setShowCloseModal(false)} title="Close Cash Register">
        <div className="space-y-5">
          <p className="text-sm text-neutral-600">Count the cash in the drawer to reconcile.</p>
          <div className="grid grid-cols-2 gap-3">
            {DENOMINATIONS.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-600 w-12 text-right">{formatCurrency(d)}</span>
                <span className="text-neutral-400 text-xs">x</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={closeDenoms[d]}
                  onChange={(e) => setCloseDenoms((prev) => ({ ...prev, [d]: e.target.value }))}
                  placeholder="0"
                  className="flex-1 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all w-16"
                />
                <span className="text-xs text-neutral-500 w-16 text-right">{formatCurrency((Number(closeDenoms[d]) || 0) * d)}</span>
              </div>
            ))}
          </div>
          {(() => {
            const closingCount = denomSum(closeDenoms);
            const expected = (cashRegister?.openingBalance || 0) + (cashRegister?.cashIn || 0) - (cashRegister?.cashOut || 0);
            const variance = closingCount - expected;
            return (
              <div className="space-y-2">
                <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-700">Counted Cash</span>
                  <span className="text-lg font-bold font-display text-blue-800">{formatCurrency(closingCount)}</span>
                </div>
                <div className="bg-neutral-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-600">Expected Cash</span>
                  <span className="text-sm font-semibold text-neutral-700">{formatCurrency(expected)}</span>
                </div>
                {closingCount > 0 && (
                  <div className={`rounded-xl p-3 flex items-center justify-between ${variance === 0 ? 'bg-emerald-50' : variance > 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                    <span className={`text-sm font-medium ${variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                      {variance === 0 ? 'Balanced' : variance > 0 ? 'Overage' : 'Shortage'}
                    </span>
                    <span className={`text-sm font-bold ${variance === 0 ? 'text-emerald-800' : variance > 0 ? 'text-amber-800' : 'text-red-800'}`}>
                      {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button onClick={() => setShowCloseModal(false)} disabled={registerLoading} className="h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200">
              Cancel
            </button>
            <button
              onClick={handleCloseRegister}
              disabled={registerLoading}
              className="h-11 px-5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              {registerLoading ? 'Closing...' : <><Wallet className="h-4 w-4" /> Close Register</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* Day-End Report Modal */}
      <Modal open={showDayReport} onClose={() => setShowDayReport(false)} title="Day-End Settlement Report">
        <div className="space-y-5">
          {dayReportLoading ? (
            <div className="animate-pulse space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-neutral-100 rounded-xl" />)}
            </div>
          ) : dayReport ? (
            <>
              <div className="text-xs font-medium text-neutral-500 mb-2">Date: {dayReport.date}</div>

              {/* Collections by mode */}
              <div className="bg-emerald-50 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-semibold text-emerald-800">Collections</h4>
                {dayReport.collections?.byMode?.length > 0 ? dayReport.collections.byMode.map((m) => (
                  <div key={m._id} className="flex justify-between text-sm">
                    <span className="text-emerald-700 capitalize">{m._id}</span>
                    <span className="font-semibold text-emerald-800">{formatCurrency(m.total)} ({m.count})</span>
                  </div>
                )) : <p className="text-xs text-emerald-600">No collections today</p>}
                <div className="border-t border-emerald-200 pt-2 flex justify-between text-sm font-bold text-emerald-900">
                  <span>Total</span>
                  <span>{formatCurrency(dayReport.collections?.total)}</span>
                </div>
              </div>

              {/* Refunds */}
              {dayReport.refunds?.total > 0 && (
                <div className="bg-red-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-red-800">Refunds</h4>
                  {dayReport.refunds.byMode.map((m) => (
                    <div key={m._id} className="flex justify-between text-sm">
                      <span className="text-red-700 capitalize">{m._id}</span>
                      <span className="font-semibold text-red-800">{formatCurrency(m.total)} ({m.count})</span>
                    </div>
                  ))}
                  <div className="border-t border-red-200 pt-2 flex justify-between text-sm font-bold text-red-900">
                    <span>Total Refunds</span>
                    <span>{formatCurrency(dayReport.refunds.total)}</span>
                  </div>
                </div>
              )}

              {/* Net + Invoice summary */}
              <div className="bg-blue-50 rounded-xl p-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-800">Net Collection</span>
                <span className="text-lg font-bold font-display text-blue-900">{formatCurrency(dayReport.netCollection)}</span>
              </div>

              {dayReport.invoices?.length > 0 && (
                <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-neutral-800">Invoices Created</h4>
                  {dayReport.invoices.map((s) => (
                    <div key={s._id} className="flex justify-between text-sm">
                      <span className="text-neutral-600 capitalize">{(s._id || '').replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-neutral-800">{s.count} ({formatCurrency(s.totalAmount)})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cash Register Status */}
              {dayReport.cashRegister && (
                <div className="bg-purple-50 rounded-xl p-4 space-y-1">
                  <h4 className="text-sm font-semibold text-purple-800">Cash Register</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-600">Status</span>
                    <span className="font-semibold text-purple-800 capitalize">{dayReport.cashRegister.status}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-600">Opened by</span>
                    <span className="font-semibold text-purple-800">{dayReport.cashRegister.openedBy?.name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-600">Opening Balance</span>
                    <span className="font-semibold text-purple-800">{formatCurrency(dayReport.cashRegister.openingBalance)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-4">No report data available.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
