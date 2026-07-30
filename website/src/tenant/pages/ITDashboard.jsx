import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Wifi, Settings, BookOpen,
  Activity, RefreshCw,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getClinicSettings, listStaff,
} from '../api';
import { ErrorAlert, Spinner } from '../../platform/components/shared';

/* ─── Helpers ──────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ─── Stat cards config ──────────────────────────── */
const STAT_CARDS = [
  { key: 'totalStaff',    label: 'Total Staff',      icon: Users,    iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  { key: 'systemStatus',  label: 'System Status',    icon: Wifi,     iconBg: 'bg-emerald-50',   iconText: 'text-emerald-600' },
];

/* ─── Quick Actions config ───────────────────────── */
const QUICK_ACTIONS = [
  { label: 'Clinic Settings',   icon: Settings, path: '/clinic/it-settings',      iconBg: 'bg-primary-50',  iconText: 'text-primary-600' },

  { label: 'Staff Directory',   icon: BookOpen, path: null,                        iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
];

/* ─── Role label helper ─────────────────────────── */
const ROLE_LABELS = {
  admin: 'Admins',
  doctor: 'Doctors',
  receptionist: 'Receptionists',
  nurse: 'Nurses',
  it_support: 'IT Support',
  pharmacist: 'Pharmacists',
  lab_tech: 'Lab Techs',
  accountant: 'Accountants',
};

const ROLE_COLORS = {
  admin:        { bg: 'bg-red-50',       text: 'text-red-700' },
  doctor:       { bg: 'bg-primary-50',   text: 'text-primary-700' },
  receptionist: { bg: 'bg-secondary-50', text: 'text-secondary-700' },
  nurse:        { bg: 'bg-emerald-50',   text: 'text-emerald-700' },
  it_support:   { bg: 'bg-purple-50',    text: 'text-purple-700' },
  pharmacist:   { bg: 'bg-amber-50',     text: 'text-amber-700' },
  lab_tech:     { bg: 'bg-teal-50',      text: 'text-teal-700' },
  accountant:   { bg: 'bg-blue-50',      text: 'text-blue-700' },
};

/* ─── Skeleton ──────────────────────────────────── */
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
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-48">
          <div className="animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-36 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 bg-neutral-100 rounded w-full" />
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
export default function ITDashboard() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();
  const now = new Date();

  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({
    totalStaff: 0,
    systemStatus: 'Online',
  });

  const [staffByRole, setStaffByRole] = useState({});

  // ─── Data Fetching ────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clinicRes, staffRes] = await Promise.allSettled([
        getClinicSettings(),
        listStaff({ limit: 200 }),
      ]);

      // Staff
      if (staffRes.status === 'fulfilled') {
        const staffList = staffRes.value?.data || [];
        const grouped = {};
        staffList.forEach((s) => {
          const role = s.role || 'other';
          grouped[role] = (grouped[role] || 0) + 1;
        });
        setStaffByRole(grouped);
        setStats((prev) => ({ ...prev, totalStaff: staffList.length }));
      }

      // If all failed, show error
      if (
        clinicRes.status === 'rejected' &&
        staffRes.status === 'rejected'
      ) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshKey]);

  // ─── Loading state ────────────────────────────────
  if (loading && refreshKey === 0) {
    return <DashboardSkeleton />;
  }

  if (error && Object.keys(staffByRole).length === 0) {
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
  const displayName = user?.name?.split(' ')[0] || 'IT Support';

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Context ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}System overview
          </p>
        </div>

        <button
          onClick={fetchAll}
          className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* ── Row 1: Stat Cards ─────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card, i) => {
          let value;
          if (card.key === 'systemStatus') {
            value = (
              <span className="flex items-center gap-2">
                Online
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </span>
            );
          } else {
            value = stats[card.key];
          }

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
              <Activity className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
              <p className="text-xs text-neutral-500">Common IT tasks at your fingertips</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => {
                  if (action.path) navigate(action.path);
                  else {
                    const el = document.getElementById('staff-summary');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
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

      {/* ── Row 3: Staff Summary by Role ──────────── */}
      <div
        id="staff-summary"
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '400ms' }}
      >
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-secondary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Staff Summary</h3>
              <p className="text-xs text-neutral-500">{stats.totalStaff} total staff member{stats.totalStaff !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {Object.keys(staffByRole).length === 0 ? (
            <p className="text-sm text-neutral-400">No staff data available</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(staffByRole)
                .sort(([, a], [, b]) => b - a)
                .map(([role, count]) => {
                  const colors = ROLE_COLORS[role] || { bg: 'bg-neutral-50', text: 'text-neutral-700' };
                  return (
                    <div
                      key={role}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border border-neutral-200 ${colors.bg} hover:shadow-[var(--shadow-sm)] transition-all duration-200`}
                    >
                      <span className={`text-2xl font-bold font-display ${colors.text}`}>{count}</span>
                      <span className="text-xs font-medium text-neutral-700 capitalize leading-tight">
                        {ROLE_LABELS[role] || role.replace(/_/g, ' ')}
                      </span>
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
