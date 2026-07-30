/**
 * DoctorDashboard — Complete rewrite matching admin portal design system.
 *
 * Layout:
 *   Row 0: Greeting + Room badge + Emergency pulse
 *   Row 1: 5 stat cards (stagger animated)
 *   Row 2: Today's Schedule (7-col) + Current Queue (5-col)
 *   Row 3: Confirmations + Compliance + Reminders
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Users, IndianRupee, AlertTriangle, ClipboardCheck,
  DoorOpen, Bell, HeartPulse, CheckCircle2, Clock, ArrowRight,
  ListOrdered, ChevronDown, Plus,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getDoctorStats, getDoctorCurrentRoom, getDoctorComplianceSummary,
  listAppointments, getCurrentQueue, updateAppointment, updateReminderSettings,
  getDoctorProfile,
} from '../api';
import { ErrorAlert } from '../../platform/components/shared';
import DoctorEmergencyModal from '../components/doctor/DoctorEmergencyModal';
import RoomPickerModal from '../components/appointments/RoomPickerModal';
import useDoctorEmergencies from '../hooks/doctor/useDoctorEmergencies';
import {
  cardCls, formatCurrency, getGreeting, toISODate,
  todayISO, todayEndISO, unwrap, StatCard, StatCardSkeleton,
  ApptBadge, SkeletonLoader, EmptyState, stripDrPrefix,
} from '../components/doctor/shared';

// ─── Queue status config ─────────────────────────────
const QUEUE_STATUS = {
  waiting:         { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Waiting' },
  called:          { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Called' },
  in_consultation: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'In Consult' },
  completed:       { bg: 'bg-secondary-50', text: 'text-secondary-700', label: 'Done' },
  no_show:         { bg: 'bg-red-50',    text: 'text-red-600',    label: 'No Show' },
};

const TIMELINE_STATUS = {
  completed:   { dot: 'bg-secondary-500', text: 'text-neutral-700' },
  confirmed:   { dot: 'bg-primary-500',   text: 'text-neutral-700' },
  requested:   { dot: 'bg-primary-300',   text: 'text-neutral-700' },
  in_progress: { dot: 'bg-purple-500 animate-pulse', text: 'text-purple-700 font-medium' },
  checked_in:  { dot: 'bg-blue-500',      text: 'text-neutral-700' },
  cancelled:   { dot: 'bg-red-400',       text: 'text-neutral-400 line-through' },
  no_show:     { dot: 'bg-amber-500',     text: 'text-neutral-400' },
};

function fmtTime(dateStr) {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--:--';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatWait(createdAt) {
  if (!createdAt) return '';
  const diff = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

// ═══════════════════════════════════════════════════════
export default function DoctorDashboard() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const now = new Date();

  // ─── State ─────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [queue, setQueue] = useState(null);
  const [reminderTimings, setReminderTimings] = useState([1440]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');
  const [updatingApptId, setUpdatingApptId] = useState(null);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [roomPickerAppt, setRoomPickerAppt] = useState(null);

  // Emergency hook
  const emergencyHook = useDoctorEmergencies();

  // ─── Initial data fetch (admin pattern) ────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      const userId = user?.userId;
      const results = await Promise.allSettled([
        getDoctorStats(),
        getDoctorCurrentRoom(),
        getDoctorComplianceSummary(),
        listAppointments({ doctor: userId, from: todayISO(), to: todayEndISO(), sort: 'scheduledAt' }),
        getCurrentQueue({ doctor: userId }),
        getDoctorProfile(),
      ]);

      if (cancelled) return;

      const statsData = unwrap(results[0]);
      if (statsData) {
        // The API (doctorDashboard.service getStats) returns `todayTotal` and
        // `upcomingFollowUps`. Neither `todayAppointments`/`appointmentsToday`
        // nor `pendingFollowUps`/`followUps` has ever existed in that payload,
        // so both cards silently fell through to 0 no matter what the data said.
        const upcoming = statsData.upcomingFollowUps;
        setStats({
          todayAppointments: statsData.todayTotal ?? statsData.todayAppointments ?? statsData.appointmentsToday ?? 0,
          monthPatients: statsData.patientsThisMonth ?? statsData.monthPatients ?? 0,
          monthRevenue: statsData.revenueThisMonth ?? statsData.monthRevenue ?? 0,
          pendingEmergencies: statsData.pendingEmergencies ?? 0,
          followUps: Array.isArray(upcoming)
            ? upcoming.length
            : (upcoming ?? statsData.pendingFollowUps ?? statsData.followUps ?? 0),
        });
      }

      const roomData = unwrap(results[1]);
      setCurrentRoom(roomData?.room || roomData);

      setCompliance(unwrap(results[2]));

      const apptData = unwrap(results[3]);
      const apptList = apptData?.appointments || apptData?.data || (Array.isArray(apptData) ? apptData : []);
      setAppointments(Array.isArray(apptList) ? apptList : []);

      const qData = unwrap(results[4]);
      const qList = qData?.queue || qData?.data || (Array.isArray(qData) ? qData : []);
      setQueue(Array.isArray(qList) ? qList : []);

      const profileData = unwrap(results[5]);
      if (profileData?.defaultReminderTimings?.length) setReminderTimings(profileData.defaultReminderTimings);

      setInitialLoad(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Queue polling (30s) ────────��──────────────────
  useEffect(() => {
    if (!user?.userId) return;
    const interval = setInterval(async () => {
      try {
        const res = await getCurrentQueue({ doctor: user.userId });
        const data = res?.data ?? res;
        setQueue(Array.isArray(data) ? data : data?.queue || data?.data || []);
      } catch { /* silent */ }
    }, 60_000);
    return () => clearInterval(interval);
  }, [user?.userId]);

  // ─── Appointment status update ─────────────────────
  const handleUpdateStatus = useCallback(async (appt, newStatus) => {
    const id = appt._id || appt.id;
    setUpdatingApptId(id);
    try {
      await updateAppointment(id, { status: newStatus });
      const res = await listAppointments({ doctor: user?.userId, from: todayISO(), to: todayEndISO(), sort: 'scheduledAt' });
      const d = res?.data?.appointments || res?.data || [];
      setAppointments(Array.isArray(d) ? d : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingApptId(null);
    }
  }, [user?.userId]);

  // ─── Reminder toggle ──────────────────────────────
  const handleReminderToggle = useCallback((value) => {
    const active = reminderTimings.includes(value);
    const next = active ? reminderTimings.filter((t) => t !== value) : [...reminderTimings, value];
    if (next.length === 0) return;
    setReminderTimings(next);
    setReminderSaving(true);
    updateReminderSettings({ defaultReminderTimings: next })
      .catch(() => setReminderTimings(reminderTimings))
      .finally(() => setReminderSaving(false));
  }, [reminderTimings]);

  // ─── Derived data ──────────────────────────────────
  const sortedAppts = useMemo(() => {
    if (!appointments) return [];
    return [...appointments].sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));
  }, [appointments]);

  const activeQueue = useMemo(() => {
    if (!queue) return [];
    return queue.filter((q) => q.status !== 'completed' && q.status !== 'cancelled');
  }, [queue]);

  const queueStats = useMemo(() => {
    if (!queue?.length) return { waiting: 0, inConsult: 0, completed: 0, avgWait: 0 };
    const waiting = queue.filter((q) => q.status === 'waiting').length;
    const inConsult = queue.filter((q) => q.status === 'in_consultation').length;
    const completed = queue.filter((q) => q.status === 'completed').length;
    const waitEntries = queue.filter((q) => q.status === 'waiting' && q.createdAt);
    const avgWait = waitEntries.length > 0
      ? Math.round(waitEntries.reduce((s, q) => s + (Date.now() - new Date(q.createdAt).getTime()) / 60000, 0) / waitEntries.length)
      : 0;
    return { waiting, inConsult, completed, avgWait };
  }, [queue]);

  const confirmations = useMemo(() => {
    if (!appointments?.length) return null;
    return {
      confirmed: appointments.filter((a) => a.patientConfirmation?.status === 'confirmed').length,
      pending: appointments.filter((a) => !a.patientConfirmation?.status || a.patientConfirmation?.status === 'pending').length,
      declined: appointments.filter((a) => a.patientConfirmation?.status === 'declined').length,
    };
  }, [appointments]);

  // ═══════════════════════════════════════════════════
  const greeting = getGreeting();
  const displayName = stripDrPrefix(user?.name) || 'Doctor';
  const pendingEmergencies = stats?.pendingEmergencies || 0;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Context ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, Dr. {displayName}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {!initialLoad && stats && (
              <>
                {' · '}{stats.todayAppointments} appointment{stats.todayAppointments !== 1 ? 's' : ''} today
                {stats.monthRevenue ? ` · ${formatCurrency(stats.monthRevenue)} this month` : ''}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {currentRoom && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold">
              <DoorOpen className="h-3.5 w-3.5" />
              <span>{currentRoom.code || currentRoom.name}</span>
              {currentRoom.floor && <span className="opacity-60">· Floor {currentRoom.floor}</span>}
            </div>
          )}

          {pendingEmergencies > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-full border border-red-200">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-semibold text-red-700">{pendingEmergencies} Emergency</span>
            </div>
          )}

          <button
            onClick={() => navigate('/clinic/doctor-appointments')}
            className="h-10 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> My Appointments
          </button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ── Row 1: Stat Cards ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {initialLoad ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Today's Appointments" value={stats?.todayAppointments ?? 0} icon={CalendarDays} color="primary" delay={50} />
            <StatCard title="Patients This Month" value={stats?.monthPatients ?? 0} icon={Users} color="blue" delay={100} />
            <StatCard title="Revenue This Month" value={formatCurrency(stats?.monthRevenue ?? 0)} icon={IndianRupee} color="green" delay={150} />
            <StatCard title="Pending Emergencies" value={pendingEmergencies} icon={AlertTriangle} color="red" delay={200} />
            <StatCard title="Follow-Ups Due" value={stats?.followUps ?? 0} icon={ClipboardCheck} color="purple" delay={250} />
          </>
        )}
      </div>

      {/* ── Row 2: Schedule + Queue (7/5 split) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '300ms' }}>
        {/* Today's Schedule */}
        <div className="lg:col-span-7">
          <div className={`${cardCls} p-5 h-full flex flex-col`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold font-display text-neutral-900">Today's Schedule</h3>
                  <p className="text-xs text-neutral-500">
                    {sortedAppts.filter((a) => !['cancelled', 'no_show'].includes(a.status)).length} appointment{sortedAppts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/clinic/doctor-appointments')}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
              >
                View All <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            <div className="flex-1 -mx-1 px-1">
              {initialLoad ? (
                <div className="space-y-3"><SkeletonLoader className="h-12 w-full" count={5} /></div>
              ) : sortedAppts.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No appointments today" message="Appointments will appear here once scheduled" />
              ) : (
                <div className="relative space-y-1">
                  <div className="absolute left-[72px] top-3 bottom-3 w-px bg-neutral-200" />
                  {(timelineExpanded ? sortedAppts : sortedAppts.slice(0, 6)).map((appt, i) => {
                    const time = fmtTime(appt.scheduledAt);
                    const style = TIMELINE_STATUS[appt.status] || { dot: 'bg-primary-400', text: 'text-neutral-700' };
                    const patientName = appt.patientName || appt.patient?.name || 'Unknown';
                    const canAct = ['confirmed', 'checked_in'].includes(appt.status);

                    return (
                      <div key={appt._id || appt.id || i} className="flex items-center gap-4 py-2.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors group">
                        <span className="w-[60px] text-xs font-mono text-neutral-500 text-right shrink-0 tabular-nums">{time}</span>
                        <div className="relative z-10 shrink-0">
                          <span className={`block w-2.5 h-2.5 rounded-full ring-2 ring-white ${style.dot}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${style.text}`}>{patientName}</p>
                          <p className="text-xs text-neutral-500 truncate mt-0.5">{appt.type || 'Consultation'}{appt.duration ? ` · ${appt.duration}min` : ''}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ApptBadge status={appt.status} />
                          {canAct && (
                            <button
                              onClick={() => appt.status === 'in_progress'
                                ? navigate(`/clinic/doctor-consultation/${appt._id || appt.id}`)
                                : setRoomPickerAppt(appt)}
                              disabled={updatingApptId === (appt._id || appt.id)}
                              className="opacity-0 group-hover:opacity-100 px-3 py-1 text-[11px] font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all"
                            >
                              Start
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {sortedAppts.length > 6 && (
              <button
                onClick={() => setTimelineExpanded(!timelineExpanded)}
                className="mt-3 pt-3 border-t border-neutral-100 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                {timelineExpanded ? 'Show Less' : `View ${sortedAppts.length - 6} More`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${timelineExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Current Queue */}
        <div className="lg:col-span-5">
          <div className={`${cardCls} p-5 h-full flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <ListOrdered className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold font-display text-neutral-900">Current Queue</h3>
                    {activeQueue.length > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary-500" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">{activeQueue.length > 0 ? `${activeQueue.length} active` : 'No one in queue'}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {initialLoad ? (
                <div className="space-y-2"><SkeletonLoader className="h-14 w-full" count={4} /></div>
              ) : activeQueue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                  <ListOrdered className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs font-medium">No patients in queue</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Queue updates in real-time</p>
                </div>
              ) : (
                (queueExpanded ? activeQueue : activeQueue.slice(0, 5)).map((entry, i) => {
                  const sc = QUEUE_STATUS[entry.status] || QUEUE_STATUS.waiting;
                  return (
                    <div key={entry._id || i} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${entry.status === 'in_consultation' ? 'bg-purple-50/50' : 'bg-neutral-50 hover:bg-neutral-100'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.priority === 'emergency' ? 'bg-red-100 text-red-700' : entry.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-700'}`}>
                        {entry.tokenNumber || i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-neutral-800 truncate">{entry.patient?.name || 'Unknown'}</p>
                        <p className="text-[11px] text-neutral-500 truncate">{entry.type || 'Consultation'}{entry.createdAt ? ` · ${formatWait(entry.createdAt)}` : ''}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${sc.bg} ${sc.text}`}>{sc.label}</span>
                    </div>
                  );
                })
              )}
            </div>

            {activeQueue.length > 5 && (
              <button
                onClick={() => setQueueExpanded(!queueExpanded)}
                className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                {queueExpanded ? 'Show Less' : `View ${activeQueue.length - 5} More`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${queueExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}

            {queue && queue.length > 0 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500">
                <span><span className="font-semibold text-amber-600">{queueStats.waiting}</span> waiting</span>
                <span><span className="font-semibold text-purple-600">{queueStats.inConsult}</span> in consult</span>
                <span><span className="font-semibold text-secondary-600">{queueStats.completed}</span> done</span>
                {queueStats.avgWait > 0 && <span>~<span className="font-semibold text-neutral-700">{queueStats.avgWait}m</span> wait</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Confirmations + Compliance + Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '350ms' }}>
        {/* Confirmations */}
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Confirmations</h3>
              <p className="text-xs text-neutral-500">Patient attendance today</p>
            </div>
          </div>
          {initialLoad ? (
            <SkeletonLoader className="h-20 w-full" />
          ) : confirmations ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-emerald-50">
                <p className="text-xl font-bold font-display text-emerald-600">{confirmations.confirmed}</p>
                <p className="text-[11px] text-emerald-600/70 mt-0.5">Confirmed</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-50">
                <p className="text-xl font-bold font-display text-amber-600">{confirmations.pending}</p>
                <p className="text-[11px] text-amber-600/70 mt-0.5">Pending</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-50">
                <p className="text-xl font-bold font-display text-red-600">{confirmations.declined}</p>
                <p className="text-[11px] text-red-600/70 mt-0.5">Declined</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">No appointments to confirm</p>
          )}
        </div>

        {/* Compliance */}
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <HeartPulse className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Care Compliance</h3>
              <p className="text-xs text-neutral-500">Patient medication adherence</p>
            </div>
          </div>
          {initialLoad ? (
            <SkeletonLoader className="h-20 w-full" />
          ) : compliance ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-500">Avg Adherence</span>
                <span className={`text-lg font-bold font-display ${(compliance.avgCompliance || 0) >= 75 ? 'text-emerald-600' : (compliance.avgCompliance || 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {(compliance.avgCompliance || 0).toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full ${(compliance.avgCompliance || 0) >= 75 ? 'bg-emerald-500' : (compliance.avgCompliance || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(compliance.avgCompliance || 0, 100)}%` }}
                />
              </div>
              {compliance.lowComplianceCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-medium text-red-700">{compliance.lowComplianceCount} patients below threshold</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">No compliance data available</p>
          )}
        </div>

        {/* Reminders */}
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Reminder Timings</h3>
              <p className="text-xs text-neutral-500">Before each appointment</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Immediately', value: 0 },
              { label: '20 min', value: 20 },
              { label: '30 min', value: 30 },
              { label: '1 hour', value: 60 },
              { label: '24 hours', value: 1440 },
            ].map(({ label, value }) => {
              const active = reminderTimings.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => handleReminderToggle(value)}
                  disabled={reminderSaving}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  } ${reminderSaving ? 'opacity-50' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Emergency Modal ─────────────────────────── */}
      <DoctorEmergencyModal
        open={emergencyHook.showModal}
        onClose={emergencyHook.dismiss}
        emergency={emergencyHook.selected}
        room={emergencyHook.room}
        accepting={emergencyHook.accepting}
        onAccept={emergencyHook.handleAccept}
      />

      {/* ── Room Picker Modal ─────────────────────────── */}
      <RoomPickerModal
        open={!!roomPickerAppt}
        onClose={() => setRoomPickerAppt(null)}
        appointmentId={roomPickerAppt?._id || roomPickerAppt?.id}
        branchId={roomPickerAppt?.branch?._id || roomPickerAppt?.branch || null}
      />
    </div>
  );
}
