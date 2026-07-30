import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, FileText, IndianRupee,
  ArrowRight, Briefcase, Activity, Clock,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import { listStaff, listPayslips, listSalaryStructures } from '../api';
import { ErrorAlert, Spinner } from '../../platform/components/shared';
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
  { key: 'totalStaff',    label: 'Total Staff',       icon: Users,     iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  { key: 'activeStaff',   label: 'Active Staff',      icon: UserCheck, iconBg: 'bg-emerald-50',   iconText: 'text-emerald-600' },
  { key: 'pendingSlips',  label: 'Pending Payslips',  icon: FileText,  iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  { key: 'payrollMonth',  label: 'Payroll This Month', icon: IndianRupee, iconBg: 'bg-purple-50', iconText: 'text-purple-600', format: 'currency' },
];

/* ─── Quick Actions config ───────────────────────── */
const QUICK_ACTIONS = [
  { label: 'View Staff',     icon: Users,    path: '/clinic/hr-staff',   iconBg: 'bg-primary-50',  iconText: 'text-primary-600' },
  { label: 'Manage Payroll', icon: Briefcase, path: '/clinic/hr-payroll', iconBg: 'bg-purple-50',   iconText: 'text-purple-600' },
];

/* ─── Role badge colors ──────────────────────────── */
const ROLE_COLORS = {
  admin:              { bg: 'bg-purple-50',  text: 'text-purple-700' },
  doctor:             { bg: 'bg-blue-50',    text: 'text-blue-700' },
  receptionist:       { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  billing_officer:    { bg: 'bg-amber-50',   text: 'text-amber-700' },
  accountant:         { bg: 'bg-teal-50',    text: 'text-teal-700' },
  hr_payroll_manager: { bg: 'bg-pink-50',    text: 'text-pink-700' },
  it_support:         { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  support_staff:      { bg: 'bg-neutral-100', text: 'text-neutral-700' },
};

function getRoleColor(role) {
  return ROLE_COLORS[role] || { bg: 'bg-neutral-100', text: 'text-neutral-700' };
}

/* ─── Payslip status badge colors ────────────────── */
const PAYSLIP_STATUS_STYLES = {
  draft:    { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  approved: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  paid:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

/* ─── Skeleton ───────────────────────────────────── */
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)]">
              <div className="animate-pulse">
                <div className="w-12 h-12 bg-neutral-100 rounded-2xl mb-3" />
                <div className="h-8 bg-neutral-100 rounded-lg w-20 mb-2" />
                <div className="h-3 bg-neutral-100 rounded w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom sections skeleton */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-72">
            <div className="animate-pulse">
              <div className="h-5 bg-neutral-100 rounded w-36 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                    <div className="w-8 h-8 bg-neutral-100 rounded-full shrink-0" />
                    <div className="flex-1">
                      <div className="h-3.5 bg-neutral-100 rounded w-32 mb-1" />
                      <div className="h-3 bg-neutral-100 rounded w-24" />
                    </div>
                    <div className="w-16 h-5 bg-neutral-100 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function HRDashboard() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();
  const now = new Date();

  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({
    totalStaff: 0,
    activeStaff: 0,
    pendingSlips: 0,
    payrollMonth: 0,
  });

  const [staffByRole, setStaffByRole] = useState([]);
  const [recentPayslips, setRecentPayslips] = useState([]);

  // ─── Data Fetching ────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [staffRes, payslipRes, structuresRes] = await Promise.allSettled([
        listStaff({ limit: 200 }),
        listPayslips({ limit: 5, sort: '-createdAt' }),
        listSalaryStructures({ limit: 200 }),
      ]);

      // Process staff data
      if (staffRes.status === 'fulfilled') {
        const allStaff = staffRes.value?.data || [];
        const totalStaff = allStaff.length;
        const activeStaff = allStaff.filter(
          (s) => s.status !== 'deleted' && s.status !== 'inactive' && s.isActive !== false
        ).length;

        // Group by role
        const roleMap = {};
        allStaff.forEach((s) => {
          const role = s.role || 'unknown';
          roleMap[role] = (roleMap[role] || 0) + 1;
        });
        const grouped = Object.entries(roleMap)
          .map(([role, count]) => ({ role, count }))
          .sort((a, b) => b.count - a.count);

        setStaffByRole(grouped);
        setStats((prev) => ({ ...prev, totalStaff, activeStaff }));
      }

      // Process payslip data
      if (payslipRes.status === 'fulfilled') {
        const payslips = payslipRes.value?.data || [];
        setRecentPayslips(payslips);

        // Count pending (draft) payslips from meta or data
        const draftCount = payslips.filter((p) => p.status === 'draft').length;
        setStats((prev) => ({ ...prev, pendingSlips: payslipRes.value?.meta?.totalDraft ?? draftCount }));
      }

      // Process salary structures for payroll this month
      if (structuresRes.status === 'fulfilled') {
        const structures = structuresRes.value?.data || [];
        const totalNet = structures.reduce((sum, s) => {
          const base = s.baseSalary || 0;
          const allowances = (s.allowances || []).reduce((a, item) => a + (item.amount || 0), 0);
          const deductions = (s.deductions || []).reduce((d, item) => d + (item.amount || 0), 0);
          return sum + base + allowances - deductions;
        }, 0);
        setStats((prev) => ({ ...prev, payrollMonth: totalNet }));
      }

      // Count draft payslips more accurately if we have full payslip data
      if (payslipRes.status === 'fulfilled') {
        // Re-fetch with draft filter for accurate count
        try {
          const draftRes = await listPayslips({
            limit: 1,
            status: 'draft',
            month: String(now.getMonth() + 1),
            year: String(now.getFullYear()),
          });
          const draftTotal = draftRes.meta?.total ?? draftRes.total ?? 0;
          setStats((prev) => ({ ...prev, pendingSlips: draftTotal }));
        } catch {
          // keep existing count
        }
      }

      if (
        staffRes.status === 'rejected' &&
        payslipRes.status === 'rejected' &&
        structuresRes.status === 'rejected'
      ) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;

    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('payroll:update', refresh);
    sock.on('staff:update', refresh);

    return () => {
      sock.off('payroll:update', refresh);
      sock.off('staff:update', refresh);
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
  if (error && staffByRole.length === 0 && recentPayslips.length === 0) {
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

  /* ─── Render ─────────────────────────────────────── */
  const greeting = getGreeting();
  const displayName = user?.name?.split(' ')[0] || 'HR Manager';

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Date ──────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{stats.totalStaff} staff member{stats.totalStaff !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Row 1: Stat Cards ────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* ── Row 2: Quick Actions ─────────────────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
              <p className="text-xs text-neutral-500">Jump to key HR tasks</p>
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
          </div>
        </div>
      </div>

      {/* ── Row 3: Staff by Role + Recent Payslips ──── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        {/* Staff by Role */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold font-display text-neutral-900">Staff by Role</h3>
                <p className="text-xs text-neutral-500">{staffByRole.length} role{staffByRole.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/clinic/hr-staff')}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 transition"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {staffByRole.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">No staff data available</p>
          ) : (
            <div className="space-y-2">
              {staffByRole.map((item) => {
                const rc = getRoleColor(item.role);
                return (
                  <div
                    key={item.role}
                    className="flex items-center justify-between p-3 rounded-xl bg-neutral-50/80 hover:bg-neutral-100/80 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium capitalize ${rc.bg} ${rc.text}`}>
                        {(item.role || 'unknown').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-sm font-bold font-display text-neutral-900">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Payslip Activity */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold font-display text-neutral-900">Recent Payslip Activity</h3>
                <p className="text-xs text-neutral-500">Last 5 payslips</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/clinic/hr-payroll?tab=payslips')}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 transition"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentPayslips.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">No recent payslip activity</p>
          ) : (
            <div className="space-y-2">
              {recentPayslips.map((slip) => {
                const id = slip._id || slip.id;
                const empName = slip.user?.name || slip.employee?.name || 'N/A';
                const s = PAYSLIP_STATUS_STYLES[slip.status] || PAYSLIP_STATUS_STYLES.draft;
                const net = slip.netSalary ?? slip.netPay ?? 0;

                return (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 rounded-xl bg-neutral-50/80 hover:bg-neutral-100/80 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(empName || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{empName}</p>
                        <p className="text-[11px] text-neutral-500">
                          {slip.month && slip.year
                            ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(slip.month || 1) - 1]} ${slip.year}`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {slip.status || 'draft'}
                      </span>
                      <span className="text-sm font-semibold font-display text-neutral-900">
                        {formatCurrency(net)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
