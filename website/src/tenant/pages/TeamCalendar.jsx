import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  listBranches, listAppointments, listDoctors,
  getAllDoctorLeaves, getAllDoctorSchedules,
} from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { ErrorAlert } from '../../platform/components/shared';
import { PageHeader } from '../components/doctor/shared';
import AppointmentDrawer from '../components/appointments/AppointmentDrawer';
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, Clock,
  Building2, Stethoscope, CalendarX2, Activity,
} from 'lucide-react';

// ─── Time helpers ──────────────────────────────
const START_HOUR = 7;
const END_HOUR = 22;
const SLOT_HEIGHT = 28;
const TOTAL_ROWS = (END_HOUR - START_HOUR) * 4;

function timeToRow(isoOrHHMM) {
  let h, m;
  if (typeof isoOrHHMM === 'string' && isoOrHHMM.includes('T')) {
    const d = new Date(isoOrHHMM);
    h = d.getUTCHours();
    m = d.getUTCMinutes();
  } else if (typeof isoOrHHMM === 'string' && isoOrHHMM.includes(':')) {
    [h, m] = isoOrHHMM.split(':').map(Number);
  } else {
    return 0;
  }
  return ((h - START_HOUR) * 4) + Math.floor(m / 15);
}

function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatTimeShort(isoStr) {
  const d = new Date(isoStr);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Status colors for appointment blocks
const STATUS_COLORS = {
  requested:   'bg-yellow-100 border-yellow-300 text-yellow-800',
  confirmed:   'bg-blue-100 border-blue-300 text-blue-800',
  checked_in:  'bg-indigo-100 border-indigo-300 text-indigo-800',
  in_progress: 'bg-green-100 border-green-300 text-green-800',
  completed:   'bg-neutral-100 border-neutral-300 text-neutral-600',
  cancelled:   'bg-red-50 border-red-200 text-red-400 opacity-50',
  no_show:     'bg-red-50 border-red-200 text-red-400 opacity-50',
};

const STATUS_LABELS = {
  requested: 'Requested', confirmed: 'Confirmed', checked_in: 'Checked In',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No Show',
};

const LEAVE_TYPE_COLORS = {
  planned:    { bg: 'bg-blue-50', text: 'text-blue-700' },
  sick:       { bg: 'bg-red-50', text: 'text-red-700' },
  personal:   { bg: 'bg-purple-50', text: 'text-purple-700' },
  conference: { bg: 'bg-amber-50', text: 'text-amber-700' },
  other:      { bg: 'bg-neutral-100', text: 'text-neutral-600' },
};

const AVATAR_COLORS = [
  'from-primary-100 to-primary-200 text-primary-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-rose-100 to-rose-200 text-rose-700',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ═══════════════════════════════════════════════════════
export default function TeamCalendar() {
  const { hasPermission, user } = useTenantAuth();
  const canConsult = ['doctor', 'admin', 'super_admin', 'manager', 'department_manager'].includes(user?.role);

  // ─── State ─────────────────────────────────────
  const [date, setDate] = useState(getToday());
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedApptId, setSelectedApptId] = useState(null);
  const scrollRef = useRef(null);

  // ─── Fetch branches ───────────────────────────
  useEffect(() => {
    listBranches({ limit: 100, status: 'active' })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setBranches(data);
        if (data.length > 0 && !selectedBranch) {
          setSelectedBranch(data[0]._id);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch all data ───────────────────────────
  const fetchData = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true);
    setError(null);
    try {
      const endDate = addDays(date, 7);
      const [docRes, apptRes, schedRes, leaveRes] = await Promise.all([
        listDoctors({ branch: selectedBranch, limit: 50 }),
        listAppointments({
          branch: selectedBranch,
          from: `${date}T00:00:00.000Z`,
          to: `${date}T23:59:59.999Z`,
          limit: 500,
        }),
        getAllDoctorSchedules({ branch: selectedBranch, limit: 100 }),
        getAllDoctorLeaves({
          branch: selectedBranch,
          from: date,
          to: endDate,
          status: 'approved',
          limit: 100,
        }),
      ]);

      const docItems = Array.isArray(docRes.data) ? docRes.data : docRes.data?.items || [];
      setDoctors(docItems.filter((d) => d.role === 'doctor'));

      const apptItems = Array.isArray(apptRes.data) ? apptRes.data : apptRes.data?.items || [];
      setAppointments(apptItems);

      const schedItems = Array.isArray(schedRes.data) ? schedRes.data : schedRes.data?.items || [];
      setSchedules(schedItems);

      const leaveItems = Array.isArray(leaveRes.data) ? leaveRes.data : leaveRes.data?.items || [];
      setLeaves(leaveItems);
    } catch (err) {
      setError(err.message || 'Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [date, selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll to current time on initial load
  useEffect(() => {
    if (scrollRef.current && date === getToday()) {
      const now = new Date();
      const row = ((now.getHours() - START_HOUR) * 4) + Math.floor(now.getMinutes() / 15);
      const offset = Math.max(0, (row - 4) * SLOT_HEIGHT);
      scrollRef.current.scrollTop = offset;
    }
  }, [loading, date]);

  // ─── Group appointments by doctor ─────────────
  const apptsByDoctor = useMemo(() => {
    const map = {};
    for (const appt of appointments) {
      const docId = (appt.doctor && typeof appt.doctor === 'object') ? appt.doctor._id : appt.doctor;
      if (!map[docId]) map[docId] = [];
      map[docId].push(appt);
    }
    return map;
  }, [appointments]);

  // ─── Schedule map ─────────────────────────────
  const scheduleByDoctor = useMemo(() => {
    const map = {};
    for (const sch of schedules) {
      const docId = (sch.doctor && typeof sch.doctor === 'object') ? sch.doctor._id : sch.doctor;
      map[docId] = sch;
    }
    return map;
  }, [schedules]);

  // ─── Today's leaves by doctor ─────────────────
  const todayLeavesForDoctor = useMemo(() => {
    const map = {};
    const dateObj = new Date(date + 'T00:00:00');
    for (const leave of leaves) {
      const docId = (leave.doctor && typeof leave.doctor === 'object') ? leave.doctor._id : leave.doctor;
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (dateObj >= start && dateObj <= end) {
        if (!map[docId]) map[docId] = [];
        map[docId].push(leave);
      }
    }
    return map;
  }, [leaves, date]);

  // ─── Doctor availability status ───────────────
  const getDoctorStatus = useCallback((docId) => {
    if (todayLeavesForDoctor[docId]?.length > 0) {
      return { status: 'leave', label: 'On Leave', dot: 'bg-red-500' };
    }
    const schedule = scheduleByDoctor[docId];
    if (!schedule?.weeklySchedule) {
      return { status: 'unknown', label: 'No Schedule', dot: 'bg-neutral-300' };
    }
    const dayOfWeek = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
    const daySchedule = schedule.weeklySchedule.find((d) => d.day === dayOfWeek);
    if (!daySchedule || !daySchedule.isWorking) {
      return { status: 'off', label: 'Day Off', dot: 'bg-neutral-300' };
    }
    const slots = daySchedule.slots || [];
    if (slots.length > 0) {
      const first = slots[0].startTime;
      const last = slots[slots.length - 1].endTime;
      return { status: 'working', label: `${first} – ${last}`, dot: 'bg-emerald-500' };
    }
    if (daySchedule.startTime && daySchedule.endTime) {
      return { status: 'working', label: `${daySchedule.startTime} – ${daySchedule.endTime}`, dot: 'bg-emerald-500' };
    }
    return { status: 'working', label: 'Working', dot: 'bg-emerald-500' };
  }, [scheduleByDoctor, todayLeavesForDoctor, date]);

  // ─── Upcoming leaves (sidebar) ────────────────
  const upcomingLeaves = useMemo(() => {
    const today = new Date(date + 'T00:00:00');
    return [...leaves]
      .filter((l) => new Date(l.startDate) >= today || new Date(l.endDate) >= today)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 5);
  }, [leaves, date]);

  // ─── Stats ────────────────────────────────────
  const activeAppts = appointments.filter((a) => !['cancelled', 'no_show'].includes(a.status));
  const totalAppts = activeAppts.length;
  const isToday = date === getToday();
  const doctorsOnDuty = doctors.filter((d) => getDoctorStatus(d._id).status === 'working').length;
  const doctorsOnLeave = doctors.filter((d) => getDoctorStatus(d._id).status === 'leave').length;

  // Current time indicator row
  const nowRow = useMemo(() => {
    if (!isToday) return -1;
    const now = new Date();
    return ((now.getHours() - START_HOUR) * 4) + Math.floor(now.getMinutes() / 15);
  }, [isToday]);

  // ═══════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full h-[calc(100vh-7rem)] flex flex-col">

      {/* ── Page Header + inline date nav + branch select ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Team Calendar</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {formatDateDisplay(date)}
            <span className="text-neutral-300 mx-2">·</span>
            {doctors.length} doctor{doctors.length !== 1 ? 's' : ''}
            <span className="text-neutral-300 mx-1">·</span>
            {totalAppts} appt{totalAppts !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date nav */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
            <button onClick={() => setDate(d => { const dd = new Date(d + 'T00:00:00'); dd.setDate(dd.getDate() - 1); return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`; })}
              className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1 bg-transparent text-sm font-medium text-neutral-700 outline-none cursor-pointer"
            />
            <button onClick={() => setDate(d => { const dd = new Date(d + 'T00:00:00'); dd.setDate(dd.getDate() + 1); return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`; })}
              className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!isToday && (
            <button onClick={() => setDate(getToday())}
              className="px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition">
              Today
            </button>
          )}
          {/* Branch select */}
          <div className="flex items-center gap-1.5 ml-1">
            <Building2 className="h-4 w-4 text-neutral-400" />
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-700 focus:border-primary-300 outline-none transition cursor-pointer">
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <div className="mt-4 shrink-0"><ErrorAlert message={error} /></div>}

      {/* ── Main Content — NO card wrappers ──────── */}
      <div className="flex gap-5 flex-1 min-h-0 mt-5 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>

        {/* ── Calendar Grid (borderless white container) ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white rounded-xl">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-[3px] border-neutral-200" />
                <div className="absolute inset-0 rounded-full border-[3px] border-primary-600 border-t-transparent animate-spin" />
              </div>
              <p className="text-xs text-neutral-400 font-medium">Loading...</p>
            </div>
          ) : doctors.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-neutral-400">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                  <Stethoscope className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-neutral-600">No doctors assigned to this branch</p>
                <p className="text-xs text-neutral-400 mt-1">Select a different branch or add doctors</p>
              </div>
            </div>
          ) : (
            <>
              {/* Doctor column headers */}
              <div className="flex border-b border-neutral-200/60 shrink-0">
                <div className="w-16 shrink-0 px-2 py-3 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Time
                </div>
                {doctors.map((doc) => {
                  const info = getDoctorStatus(doc._id);
                  return (
                    <div key={doc._id} className="flex-1 min-w-[140px] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(doc.name)} flex items-center justify-center text-[10px] font-bold`}>
                            {(doc.name || 'D').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${info.dot}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-800 truncate">{doc.name}</p>
                          <p className="text-[10px] text-neutral-400 truncate">{doc.specialization || 'Doctor'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scrollable time grid */}
              <div className="flex-1 overflow-y-auto" ref={scrollRef}>
                <div className="flex relative" style={{ height: TOTAL_ROWS * SLOT_HEIGHT }}>
                  {/* Time gutter */}
                  <div className="w-16 shrink-0 relative">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 flex items-start justify-end pr-2"
                        style={{ top: i * 4 * SLOT_HEIGHT - 6 }}
                      >
                        <span className="text-[10px] text-neutral-400 font-medium tabular-nums">
                          {formatHour(START_HOUR + i)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Doctor columns */}
                  {doctors.map((doc, colIdx) => {
                    const docAppts = apptsByDoctor[doc._id] || [];
                    return (
                      <div key={doc._id} className={`flex-1 min-w-[140px] relative ${colIdx > 0 ? 'border-l border-neutral-100/60' : ''}`}>
                        {/* Hour lines */}
                        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                          <div key={i} className="absolute left-0 right-0 border-t border-neutral-100/80" style={{ top: i * 4 * SLOT_HEIGHT }} />
                        ))}
                        {/* Half-hour lines */}
                        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                          <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-neutral-100/40" style={{ top: (i * 4 + 2) * SLOT_HEIGHT }} />
                        ))}

                        {/* Appointment blocks */}
                        {docAppts.map((appt) => {
                          const startRow = timeToRow(appt.scheduledAt);
                          const durationRows = Math.ceil((appt.duration || 30) / 15);
                          const top = startRow * SLOT_HEIGHT;
                          const height = durationRows * SLOT_HEIGHT - 2;
                          const colorCls = STATUS_COLORS[appt.status] || STATUS_COLORS.confirmed;

                          if (startRow < 0 || startRow >= TOTAL_ROWS) return null;

                          const patientName = (appt.patient && typeof appt.patient === 'object')
                            ? appt.patient.name || 'Patient'
                            : '';

                          return (
                            <button
                              key={appt._id}
                              onClick={() => setSelectedApptId(appt._id)}
                              className={`absolute left-1 right-1 rounded-lg border px-2 py-1 overflow-hidden text-left cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] hover:z-10 ${colorCls}`}
                              style={{ top, height: Math.max(height, SLOT_HEIGHT - 2) }}
                              title={`${patientName}\n${formatTimeShort(appt.scheduledAt)} · ${appt.duration}min\n${STATUS_LABELS[appt.status] || appt.status}`}
                            >
                              <p className="text-[11px] font-semibold truncate leading-tight">
                                {patientName || 'Patient'}
                              </p>
                              {height >= SLOT_HEIGHT * 1.5 && (
                                <p className="text-[10px] opacity-75 truncate">
                                  {formatTimeShort(appt.scheduledAt)} · {appt.duration || 30}m
                                </p>
                              )}
                              {height >= SLOT_HEIGHT * 2.5 && (
                                <p className="text-[10px] opacity-60 truncate">
                                  {appt.type === 'teleconsult' ? 'Teleconsult' : appt.reason || appt.type}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Current time indicator */}
                  {isToday && nowRow >= 0 && nowRow < TOTAL_ROWS && (
                    <div
                      className="absolute left-16 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                      style={{ top: nowRow * SLOT_HEIGHT }}
                    >
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right Sidebar (open, no card box) ── */}
        <div className="w-64 shrink-0 flex flex-col min-h-0 space-y-5">

          {/* Stats — inline metrics, no card */}
          <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
            <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
              Overview
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Appts', value: totalAppts, icon: CalendarDays, color: 'text-primary-600', bg: 'bg-primary-50' },
                { label: 'On Duty', value: doctorsOnDuty, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Leave', value: doctorsOnLeave, icon: CalendarX2, color: 'text-red-500', bg: 'bg-red-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="text-center">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-1.5`}>
                    <Icon className={`h-4.5 w-4.5 ${color}`} />
                  </div>
                  <p className="text-lg font-bold font-display text-neutral-900 leading-none">{value}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Doctor Availability — open list */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
            <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
              Availability
            </h3>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-neutral-100" />
                    <div className="flex-1">
                      <div className="h-3 bg-neutral-100 rounded w-24 mb-1" />
                      <div className="h-2.5 bg-neutral-100 rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : doctors.length === 0 ? (
              <p className="text-xs text-neutral-400 py-4">No doctors in this branch</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1">
                {doctors.map((doc) => {
                  const info = getDoctorStatus(doc._id);
                  return (
                    <div key={doc._id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white transition">
                      <div className="relative shrink-0">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(doc.name)} flex items-center justify-center text-[10px] font-bold`}>
                          {(doc.name || 'D').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${info.dot}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-neutral-800 truncate">{doc.name}</p>
                        <p className={`text-[10px] truncate ${info.status === 'leave' ? 'text-red-500' : info.status === 'working' ? 'text-emerald-600' : 'text-neutral-400'}`}>
                          {info.label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Leaves — open list */}
          {upcomingLeaves.length > 0 && (
            <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '250ms' }}>
              <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                Upcoming Leaves
              </h3>
              <div className="space-y-2">
                {upcomingLeaves.map((leave) => {
                  const docName = (leave.doctor && typeof leave.doctor === 'object')
                    ? leave.doctor.name
                    : 'Doctor';
                  const start = new Date(leave.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  const end = new Date(leave.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  const sameDay = start === end;
                  const ltc = LEAVE_TYPE_COLORS[leave.leaveType] || LEAVE_TYPE_COLORS.other;

                  return (
                    <div key={leave._id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white transition">
                      <div className={`w-7 h-7 rounded-lg ${ltc.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <CalendarX2 className={`h-3.5 w-3.5 ${ltc.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-neutral-800 truncate">{docName}</p>
                        <p className="text-[10px] text-neutral-500">
                          {sameDay ? start : `${start} – ${end}`}
                          <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${ltc.bg} ${ltc.text}`}>
                            {leave.leaveType || 'planned'}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend — inline, no box */}
      <div className="mt-3 flex items-center gap-4 flex-wrap text-[11px] text-neutral-500 shrink-0">
        {Object.entries(STATUS_LABELS)
          .filter(([k]) => !['cancelled', 'no_show'].includes(k))
          .map(([status, label]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded border ${STATUS_COLORS[status]}`} />
              <span>{label}</span>
            </div>
          ))}
      </div>

      {/* ── Appointment Detail Drawer ────────────── */}
      <AppointmentDrawer
        open={!!selectedApptId}
        appointmentId={selectedApptId}
        onClose={() => setSelectedApptId(null)}
        onUpdated={() => { setSelectedApptId(null); fetchData(); }}
        canConsult={canConsult}
        userRole={user?.role}
      />
    </div>
  );
}
