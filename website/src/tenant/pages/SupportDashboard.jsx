import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Users, CheckCircle2, Activity, AlertTriangle,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getAnalyticsSummary, listAppointments, getCurrentQueue,
} from '../api';
import { ErrorAlert } from '../../platform/components/shared';
import { initSocket, getSocket } from '../../lib/socket';
import TodayTimeline from './Dashboard/TodayTimeline';
import LiveQueueMonitor from './Dashboard/LiveQueueMonitor';

/* ─── Helpers ──────────────────────────────────── */
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

const todayEndISO = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

/* ─── Stat cards config (read-only — no revenue) ── */
const STAT_CARDS = [
  { key: 'todayAppts', label: "Today's Appointments", icon: CalendarDays, iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  { key: 'queueWaiting', label: 'Waiting in Queue', icon: Users, iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
  { key: 'checkedIn', label: 'Checked In', icon: CheckCircle2, iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  { key: 'walkIns', label: 'Walk-ins', icon: Activity, iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
];

/* ─── Skeleton: Stat Cards ────────────────────────── */
function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
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

/* ─── Skeleton: Full Page ─────────────────────────── */
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

      {/* Timeline + Queue skeleton */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '150ms' }}
      >
        <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80">
          <div className="animate-pulse">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
              <div>
                <div className="h-4 bg-neutral-100 rounded w-36 mb-1.5" />
                <div className="h-3 bg-neutral-100 rounded w-28" />
              </div>
            </div>
            <div className="space-y-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-14 h-4 bg-neutral-100 rounded" />
                  <div className="w-2.5 h-2.5 bg-neutral-100 rounded-full shrink-0" />
                  <div className="flex-1 h-4 bg-neutral-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-80">
          <div className="animate-pulse">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-neutral-100 rounded-xl" />
              <div>
                <div className="h-4 bg-neutral-100 rounded w-28 mb-1.5" />
                <div className="h-3 bg-neutral-100 rounded w-20" />
              </div>
            </div>
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
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
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function SupportDashboard() {
  const { user } = useTenantAuth();
  const now = new Date();

  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    todayAppts: 0, queueWaiting: 0, checkedIn: 0, walkIns: 0, noShows: 0,
  });

  // Timeline + Queue data
  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);


  // ─── Data Fetching ────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, apptsRes, queueRes] = await Promise.allSettled([
        getAnalyticsSummary(),
        listAppointments({ from: todayISO(), to: todayEndISO(), limit: 200, sort: 'scheduledAt' }),
        getCurrentQueue(),
      ]);

      // Analytics summary
      if (summaryRes.status === 'fulfilled') {
        const s = summaryRes.value?.data || summaryRes.value || {};
        setStats({
          todayAppts: s?.appointments?.today ?? 0,
          queueWaiting: 0,
          checkedIn: 0,
          walkIns: 0,
          noShows: 0,
        });
      } else {
        console.warn('[SupportDashboard] Analytics failed:', summaryRes.reason);
      }

      // Appointments
      if (apptsRes.status === 'fulfilled') {
        const appts = apptsRes.value?.data?.appointments || apptsRes.value?.data || [];
        setAppointments(appts);
        const checkedIn = appts.filter(a => a.status === 'checked_in').length;
        const walkIns = appts.filter(a => a.source === 'walk_in').length;
        const noShows = appts.filter(a => a.status === 'no_show').length;
        setStats(prev => ({ ...prev, checkedIn, walkIns, noShows }));
      } else {
        console.warn('[SupportDashboard] Appointments failed:', apptsRes.reason);
      }
      setApptLoading(false);

      // Queue
      if (queueRes.status === 'fulfilled') {
        const q = queueRes.value?.data?.queue || queueRes.value?.data || [];
        setQueue(q);
        const waiting = q.filter(e => e.status === 'waiting').length;
        setStats(prev => ({ ...prev, queueWaiting: waiting }));
      } else {
        console.warn('[SupportDashboard] Queue failed:', queueRes.reason);
      }
      setQueueLoading(false);

      // If all three failed, show error
      if (
        summaryRes.status === 'rejected' &&
        apptsRes.status === 'rejected' &&
        queueRes.status === 'rejected'
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

    const refresh = () => setRefreshKey(k => k + 1);
    sock.on('queue:update', refresh);
    sock.on('appointment:update', refresh);

    return () => {
      sock.off('queue:update', refresh);
      sock.off('appointment:update', refresh);
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

  /* ─── Render ─────────────────────────────────────── */
  const greeting = getGreeting();
  const displayName = user?.name?.split(' ')[0] || 'Support';
  const todayApptCount = stats.todayAppts;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Date (no action buttons) ── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{todayApptCount} appointment{todayApptCount !== 1 ? 's' : ''} today
          </p>
        </div>
      </div>

      {/* ── Row 1: Stat Cards ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STAT_CARDS.map((card, i) => (
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
              {stats[card.key]}
            </p>
            <p className="text-xs font-medium text-neutral-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Row 2: Today's Timeline + Live Queue ──── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        <div className="lg:col-span-7">
          <TodayTimeline appointments={appointments} loading={apptLoading} />
        </div>
        <div className="lg:col-span-5">
          <LiveQueueMonitor queue={queue} loading={queueLoading} />
        </div>
      </div>

      {/* ── Row 3: No-Show Alert Banner ───────────── */}
      {stats.noShows > 0 && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '350ms' }}
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{stats.noShows} no-show{stats.noShows > 1 ? 's' : ''}</span> today — follow-up reminders may be needed.
          </p>
        </div>
      )}
    </div>
  );
}
