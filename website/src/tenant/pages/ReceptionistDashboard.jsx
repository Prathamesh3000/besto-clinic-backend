/**
 * ReceptionistDashboard (Wave 3.7)
 *
 * The front-desk command center. Live, ambient, and triage-aware.
 *
 * Layout (top-to-bottom):
 *   1. Hero: greeting + live emergency/active-call badges + primary CTAs
 *   2. Stat row: today's appointments / waiting / checked-in / revenue /
 *      emergencies (pulsing when > 0)
 *   3. Emergency Queue (receptionist variant of EmergencyFeed) side-by-side
 *      with Doctor Presence Board (live-socket)
 *   4. Quick Actions
 *   5. Today's Timeline + Live Queue Monitor (existing sub-components)
 *   6. No-show alert banner
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Users, CheckCircle2, IndianRupee, UserPlus,
  CreditCard, ListOrdered, AlertTriangle, Plus, Siren,
  Stethoscope, Video, Sparkles,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getAnalyticsSummary, listAppointments, getCurrentQueue,
  listDoctors, listEmergencySessions, listVideoSessions,
} from '../api';
import { ErrorAlert } from '../../platform/components/shared';
import { initSocket, getSocket, emergencyBus } from '../../lib/socket';
import TodayTimeline from './Dashboard/TodayTimeline';
import LiveQueueMonitor from './Dashboard/LiveQueueMonitor';
import EmergencyFeed from '../components/EmergencyFeed';
import { usePresence } from '../../lib/telemedicine/usePresence';
import PresenceChip from '../../lib/telemedicine/PresenceChip';

/* ─── Helpers ──────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const todayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const todayEndISO = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

/* ═══════════════════════════════════════════════════
   DOCTOR PRESENCE BOARD
   ═══════════════════════════════════════════════════ */
function DoctorPresenceBoard({ doctors, loading }) {
  const { statusFor, loaded } = usePresence();

  const summary = useMemo(() => {
    const counts = { online: 0, busy: 0, dnd: 0, offline: 0 };
    doctors.forEach((d) => {
      const userId = d.userId || d.user?._id || d.user;
      const status = statusFor(userId);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [doctors, statusFor]);

  const sorted = useMemo(() => {
    // Order: online > busy > dnd > offline
    const priority = { online: 0, busy: 1, dnd: 2, offline: 3 };
    return [...doctors].sort((a, b) => {
      const aS = statusFor(a.userId || a.user?._id || a.user);
      const bS = statusFor(b.userId || b.user?._id || b.user);
      return (priority[aS] ?? 9) - (priority[bS] ?? 9);
    });
  }, [doctors, statusFor]);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-neutral-100 bg-gradient-to-r from-primary-50/40 to-white">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
            <Stethoscope className="w-4 h-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-semibold text-neutral-900 leading-tight">
              Clinician presence
            </h3>
            <p className="text-[11px] text-neutral-500">Who's available right now</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {summary.online}
          </span>
          {summary.busy > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {summary.busy}
            </span>
          )}
        </div>
      </header>

      <div className="p-2 max-h-[320px] overflow-y-auto">
        {loading || !loaded ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 rounded-xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-400">
            No clinicians on record.
          </div>
        ) : (
          sorted.map((d) => {
            const userId = d.userId || d.user?._id || d.user;
            const status = statusFor(userId);
            const initials = (d.name || 'Dr')
              .split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('');
            return (
              <div
                key={d._id || userId}
                className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                <div className="relative">
                  <span className="inline-flex w-9 h-9 rounded-full bg-primary-50 text-primary-700 items-center justify-center text-xs font-semibold">
                    {initials || 'Dr'}
                  </span>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                    status === 'online' ? 'bg-emerald-500' :
                    status === 'busy' ? 'bg-rose-500' :
                    status === 'dnd' ? 'bg-amber-500' : 'bg-neutral-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 leading-tight truncate">
                    {d.name || 'Clinician'}
                  </p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {d.specialization || d.department?.name || 'General practice'}
                  </p>
                </div>
                <PresenceChip status={status} size="xs" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════════════ */
function DashboardSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      <div className="animate-pulse">
        <div className="h-7 w-64 bg-neutral-100 rounded-xl mb-2" />
        <div className="h-4 w-80 bg-neutral-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 animate-pulse">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5">
            <div className="w-12 h-12 bg-neutral-100 rounded-2xl mb-3" />
            <div className="h-8 bg-neutral-100 rounded-lg w-20 mb-2" />
            <div className="h-3 bg-neutral-100 rounded w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-pulse">
        <div className="lg:col-span-7 h-72 bg-white rounded-2xl border border-neutral-200" />
        <div className="lg:col-span-5 h-72 bg-white rounded-2xl border border-neutral-200" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════ */
export default function ReceptionistDashboard() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();
  const now = new Date();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({
    todayAppts: 0, queueWaiting: 0, checkedIn: 0, revenueToday: 0, walkIns: 0, noShows: 0,
    pendingEmergencies: 0, liveVideoCalls: 0,
  });

  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);

  /* ── Data Fetching ────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, apptsRes, queueRes, docsRes, emergencyRes, videoRes] = await Promise.allSettled([
        getAnalyticsSummary(),
        listAppointments({ from: todayISO(), to: todayEndISO(), limit: 200, sort: 'scheduledAt' }),
        getCurrentQueue(),
        listDoctors({ limit: 100 }),
        listEmergencySessions({ status: 'pending', limit: 1 }),
        listVideoSessions({ status: 'active', limit: 1 }),
      ]);

      // Analytics summary
      if (summaryRes.status === 'fulfilled') {
        const s = summaryRes.value?.data || summaryRes.value || {};
        setStats((prev) => ({
          ...prev,
          todayAppts: s?.appointments?.today ?? 0,
          revenueToday: s?.revenue?.today ?? 0,
        }));
      }

      if (apptsRes.status === 'fulfilled') {
        const appts = apptsRes.value?.data?.appointments || apptsRes.value?.data || [];
        setAppointments(appts);
        const checkedIn = appts.filter((a) => a.status === 'checked_in').length;
        const walkIns = appts.filter((a) => a.source === 'walk_in').length;
        const noShows = appts.filter((a) => a.status === 'no_show').length;
        setStats((prev) => ({ ...prev, checkedIn, walkIns, noShows }));
      }
      setApptLoading(false);

      if (queueRes.status === 'fulfilled') {
        const q = queueRes.value?.data?.queue || queueRes.value?.data || [];
        setQueue(q);
        const waiting = q.filter((e) => e.status === 'waiting').length;
        setStats((prev) => ({ ...prev, queueWaiting: waiting }));
      }
      setQueueLoading(false);

      if (docsRes.status === 'fulfilled') {
        const list = docsRes.value?.data?.items || docsRes.value?.data || docsRes.value?.items || [];
        setDoctors(list);
      }
      setDoctorsLoading(false);

      if (emergencyRes.status === 'fulfilled') {
        const totalPending = emergencyRes.value?.data?.total
          ?? (emergencyRes.value?.data?.items || emergencyRes.value?.data || []).length;
        setStats((prev) => ({ ...prev, pendingEmergencies: totalPending || 0 }));
      }

      if (videoRes.status === 'fulfilled') {
        const totalActive = videoRes.value?.data?.total
          ?? (videoRes.value?.data?.items || videoRes.value?.data || []).length;
        setStats((prev) => ({ ...prev, liveVideoCalls: totalActive || 0 }));
      }

      if (
        summaryRes.status === 'rejected'
        && apptsRes.status === 'rejected'
        && queueRes.status === 'rejected'
      ) {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Sockets ──────────────────────────────────── */
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return undefined;
    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('queue:update', refresh);
    sock.on('appointment:update', refresh);
    return () => {
      sock.off('queue:update', refresh);
      sock.off('appointment:update', refresh);
    };
  }, []);

  // Keep emergency counter live
  useEffect(() => {
    const off = emergencyBus.on((event) => {
      if (event === 'emergency:new') {
        setStats((prev) => ({ ...prev, pendingEmergencies: prev.pendingEmergencies + 1 }));
      } else if (event === 'emergency:accepted' || event === 'emergency:cancelled' || event === 'emergency:ended') {
        setStats((prev) => ({ ...prev, pendingEmergencies: Math.max(0, prev.pendingEmergencies - 1) }));
      }
    });
    return off;
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

  if (loading && refreshKey === 0) return <DashboardSkeleton />;

  if (error && appointments.length === 0 && queue.length === 0) {
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

  const greeting = getGreeting();
  const displayName = user?.name?.split(' ')[0] || 'Receptionist';

  const STAT_CARDS = [
    { key: 'todayAppts',   label: "Today's appts",  icon: CalendarDays, iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
    { key: 'queueWaiting', label: 'Waiting',        icon: Users,        iconBg: 'bg-amber-50',     iconText: 'text-amber-600'   },
    { key: 'checkedIn',    label: 'Checked in',     icon: CheckCircle2, iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
    { key: 'revenueToday', label: 'Revenue today',  icon: IndianRupee,  iconBg: 'bg-emerald-50',   iconText: 'text-emerald-600', format: 'currency' },
    {
      key: 'pendingEmergencies',
      label: 'Emergencies',
      icon: Siren,
      iconBg: stats.pendingEmergencies > 0 ? 'bg-rose-100' : 'bg-rose-50',
      iconText: 'text-rose-600',
      pulse: stats.pendingEmergencies > 0,
    },
  ];

  const QUICK_ACTIONS = [
    { label: 'New Appointment', icon: CalendarDays, path: '/clinic/receptionist-appointments', iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
    { label: 'Register Patient', icon: UserPlus, path: '/clinic/receptionist-patients', iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
    { label: 'Record Payment', icon: CreditCard, path: '/clinic/receptionist-billing', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
    { label: 'View Queue', icon: ListOrdered, path: '/clinic/receptionist-queue', iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
  ];

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* ── Hero ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold font-display text-neutral-900">
              {greeting}, {displayName}
            </h1>
            {stats.pendingEmergencies > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-full px-2 py-0.5 animate-pulse">
                <Siren className="w-3 h-3" /> {stats.pendingEmergencies} emergency
              </span>
            )}
            {stats.liveVideoCalls > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 ring-1 ring-primary-200 rounded-full px-2 py-0.5">
                <Video className="w-3 h-3" /> {stats.liveVideoCalls} live
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-600">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{stats.todayAppts} appointment{stats.todayAppts !== 1 ? 's' : ''} today
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clinic/receptionist-appointments')}
            className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Appointment
          </button>
          <button
            onClick={() => navigate('/clinic/receptionist-patients')}
            className="h-11 px-4 text-sm font-medium bg-white text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
          >
            View Patients
          </button>
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card, i) => {
          const value = card.format === 'currency' ? formatCurrency(stats[card.key]) : stats[card.key];
          return (
            <div
              key={card.key}
              className={`relative bg-white rounded-2xl border p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both] ${
                card.pulse ? 'border-rose-300 ring-2 ring-rose-100' : 'border-neutral-200'
              }`}
              style={{ animationDelay: `${50 + i * 50}ms` }}
            >
              {card.pulse && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
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

      {/* ── Emergency Queue + Presence Board ─────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        <div className="lg:col-span-7">
          <EmergencyFeed role="receptionist" limit={5} />
        </div>
        <div className="lg:col-span-5">
          <DoctorPresenceBoard doctors={doctors} loading={doctorsLoading} />
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
              <p className="text-xs text-neutral-500">Common tasks at your fingertips</p>
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

      {/* ── Today's Timeline + Live Queue ─────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '400ms' }}
      >
        <div className="lg:col-span-7">
          <TodayTimeline appointments={appointments} loading={apptLoading} />
        </div>
        <div className="lg:col-span-5">
          <LiveQueueMonitor queue={queue} loading={queueLoading} />
        </div>
      </div>

      {/* ── No-Show Alert ─────────────────────── */}
      {stats.noShows > 0 && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '500ms' }}
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{stats.noShows} no-show{stats.noShows > 1 ? 's' : ''}</span> today — consider sending follow-up reminders.
          </p>
        </div>
      )}
    </div>
  );
}
