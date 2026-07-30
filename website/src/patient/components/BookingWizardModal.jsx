import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X, Loader2, ChevronLeft, ChevronRight, Search,
  Stethoscope, CalendarDays, CheckCircle2, User,
  Building2, MapPin, Clock, Sun, Sunset, Moon, Calendar,
  Video, MessageSquare, Monitor, Headphones, Wifi, Lock,
  Info, Timer, Hourglass, CalendarClock, FileText,
} from 'lucide-react';
import {
  listDepartments, listDoctors, getDoctorAvailability,
  bookAppointment, verifyAppointmentPayment, getDoctorAvailabilitySummary,
} from '../api';
import { initSocket, getSocket } from '../../lib/socket';
import { stripDrPrefix } from '../../utils/doctorName';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function formatCurrency(amount) { return `\u20B9${(amount || 0).toLocaleString('en-IN')}`; }

function formatSlotTime(slot) {
  let t = slot?.display || slot?.time || slot?.startTime;
  if (!t) return '';
  // Handle ISO timestamps (e.g., "2026-04-29T10:00:00.000Z") — extract local time
  if (typeof t === 'string' && t.includes('T')) {
    const d = new Date(t);
    if (!isNaN(d)) {
      t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
  }
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return t;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${ampm}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name[0].toUpperCase();
}

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

/**
 * Bare doctor name with any stored "Dr." prefix removed.
 *
 * Every call site here renders `Dr. {doctorDisplayName(...)}`, so returning the
 * raw DB value produced "Dr. Dr. Amrut Desai" for the many records that already
 * carry the title.
 */
function doctorDisplayName(doc) {
  const raw = doc?.name || `${doc?.firstName || ''} ${doc?.lastName || ''}`.trim();
  return stripDrPrefix(raw) || 'Doctor';
}

// ─── Intent Branding ──────────────────────────────────────────────────────────

const INTENT_CONFIG = {
  visit: {
    label: 'In-Person Visit',
    sublabel: 'Meet your doctor at the clinic',
    icon: Stethoscope,
    sidebarBg: 'bg-primary-900',
    sidebarGradientChip: 'from-primary-500 to-primary-600',
    headerChipBg: 'bg-primary-50 text-primary-700',
    heroIconBg: 'bg-primary-50',
    heroIconText: 'text-primary-600',
    submitType: 'consultation',
  },
  video: {
    label: 'Video Consult',
    sublabel: 'Speak with your doctor from home',
    icon: Video,
    sidebarBg: 'bg-secondary-900',
    sidebarGradientChip: 'from-secondary-500 to-teal-600',
    headerChipBg: 'bg-secondary-50 text-secondary-700',
    heroIconBg: 'bg-secondary-50',
    heroIconText: 'text-secondary-600',
    submitType: 'teleconsult',
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Department', 'Doctor', 'Schedule', 'Confirm'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CAL_STATUS = {
  available:    'bg-emerald-50 text-neutral-900 hover:bg-emerald-100 border-emerald-200 cursor-pointer',
  few_left:     'bg-amber-50 text-neutral-900 hover:bg-amber-100 border-amber-200 cursor-pointer',
  fully_booked: 'bg-red-50 text-neutral-400 border-neutral-200 line-through cursor-not-allowed',
  off:          'bg-neutral-50 text-neutral-300 border-transparent cursor-not-allowed',
  leave:        'bg-neutral-50 text-neutral-300 border-transparent cursor-not-allowed',
  past:         'text-neutral-300 border-transparent cursor-not-allowed',
  unavailable:  'text-neutral-300 border-transparent cursor-not-allowed',
};

// ─── ProgressSidebar ──────────────────────────────────────────────────────────

function ProgressSidebar({ step, selectedDept, selectedDoctor, selectedDate, selectedSlot, activePatient, intentCfg }) {
  const IntentIcon = intentCfg.icon;
  const selections = [
    selectedDept?.name || null,
    selectedDoctor ? `Dr. ${doctorDisplayName(selectedDoctor)}` : null,
    selectedDate && selectedSlot ? `${formatDateShort(selectedDate)}, ${formatSlotTime(selectedSlot)}` : selectedDate ? formatDateShort(selectedDate) : null,
    null,
  ];

  return (
    <div className={`hidden sm:flex flex-col w-[280px] ${intentCfg.sidebarBg} p-6 shrink-0 rounded-l-[20px]`}>
      {/* Intent chip */}
      <div className={`inline-flex items-center gap-2 self-start bg-gradient-to-r ${intentCfg.sidebarGradientChip} px-3 py-1.5 rounded-full mb-4 shadow-sm`}>
        <IntentIcon className="h-3.5 w-3.5 text-white" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-white">
          {intentCfg.label}
        </span>
      </div>

      <h3 className="text-lg font-display font-semibold text-white leading-tight mb-1">
        Book Appointment
      </h3>
      <p className="text-[12px] text-white/50 mb-6">{intentCfg.sublabel}</p>

      <div className="flex-1">
        {STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? 'bg-white text-neutral-900'
                  : active ? 'bg-white/20 text-white ring-2 ring-white'
                  : 'bg-white/10 text-white/30'
                }`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`w-0.5 h-8 my-1 rounded-full ${done ? 'bg-white/60' : 'bg-white/10'}`} />
                )}
              </div>
              <div className="pt-1.5">
                <p className={`text-sm font-medium ${active ? 'text-white' : done ? 'text-white/70' : 'text-white/30'}`}>
                  {label}
                </p>
                {selections[i] && done && (
                  <p className="text-xs text-white/50 mt-0.5 truncate max-w-[180px]">{selections[i]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activePatient && (
        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <User className="h-4 w-4 text-white/70" />
            </div>
            <div>
              <p className="text-sm font-medium text-white truncate max-w-[180px]">{activePatient.name}</p>
              <p className="text-[11px] text-white/40">Patient</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InlineCalendar ───────────────────────────────────────────────────────────

function InlineCalendar({ selectedDate, onDateSelect, month, year, onMonthChange, dateSummary, loading }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isPrevDisabled = year === today.getFullYear() && month === today.getMonth() + 1;
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
      const status = dateSummary[dateStr] || (dateStr < todayStr ? 'past' : 'available');
      cells.push({ day: d, dateStr, status });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, dateSummary, todayStr]);

  const navPrev = () => {
    if (isPrevDisabled) return;
    onMonthChange(month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year);
  };
  const navNext = () => {
    onMonthChange(month === 12 ? 1 : month + 1, month === 12 ? year + 1 : year);
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={navPrev} disabled={isPrevDisabled}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
            isPrevDisabled ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-500 hover:bg-neutral-100'
          }`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold font-display text-neutral-900">{monthLabel}</span>
        <button onClick={navNext}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-neutral-400">{d}</div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, i) => {
            if (!cell) return <div key={`e-${i}`} className="w-10 h-10" />;
            const { day, dateStr, status } = cell;
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            const clickable = status === 'available' || status === 'few_left';

            return (
              <button key={dateStr} disabled={!clickable}
                onClick={() => clickable && onDateSelect(dateStr)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-medium transition-all border ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : CAL_STATUS[status] || CAL_STATUS.unavailable
                } ${isToday && !isSelected ? 'ring-1 ring-primary-300' : ''}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 text-[10px]">
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Few left
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="w-2 h-2 rounded-full bg-red-300" /> Full
        </span>
      </div>
    </div>
  );
}

// ─── InlineTimeSlots ──────────────────────────────────────────────────────────

function InlineTimeSlots({ slots, selectedSlot, onSlotSelect, loading, isOnLeave, isOffDay, leaveReason }) {
  const groups = useMemo(() => {
    const morning = [], afternoon = [], evening = [];
    for (const slot of slots) {
      const hour = parseInt((slot.display || '0').split(':')[0], 10);
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }
    return [
      { key: 'morning', label: 'Morning', icon: Sun, slots: morning, iconColor: 'text-amber-500', bgColor: 'bg-amber-50' },
      { key: 'afternoon', label: 'Afternoon', icon: Sunset, slots: afternoon, iconColor: 'text-orange-500', bgColor: 'bg-orange-50' },
      { key: 'evening', label: 'Evening', icon: Moon, slots: evening, iconColor: 'text-indigo-500', bgColor: 'bg-indigo-50' },
    ].filter(g => g.slots.length > 0);
  }, [slots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (isOnLeave) {
    return (
      <div className="text-center py-8 bg-amber-50 rounded-2xl border border-amber-200">
        <Calendar className="w-7 h-7 text-amber-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-amber-700">Doctor is on leave</p>
        {leaveReason && <p className="text-xs text-amber-500 mt-1">{leaveReason}</p>}
      </div>
    );
  }

  if (isOffDay) {
    return (
      <div className="text-center py-8 bg-neutral-50 rounded-2xl border border-neutral-200">
        <Calendar className="w-7 h-7 text-neutral-300 mx-auto mb-2" />
        <p className="text-sm text-neutral-500">Not available on this day</p>
        <p className="text-xs text-neutral-400 mt-1">Try another date</p>
      </div>
    );
  }

  const availableCount = slots.filter(s => s.available).length;

  if (availableCount === 0 && slots.length > 0) {
    return (
      <div className="text-center py-8 bg-red-50 rounded-2xl border border-red-200">
        <Calendar className="w-7 h-7 text-red-300 mx-auto mb-2" />
        <p className="text-sm text-red-600">Fully booked for this date</p>
        <p className="text-xs text-red-400 mt-1">Try another date</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 bg-neutral-50 rounded-2xl border border-neutral-200">
        <Calendar className="w-7 h-7 text-neutral-300 mx-auto mb-2" />
        <p className="text-sm text-neutral-500">No slots for this date</p>
        <p className="text-xs text-neutral-400 mt-1">Try another date</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ key, label, icon: Icon, slots: groupSlots, iconColor, bgColor }) => {
        const availCount = groupSlots.filter(s => s.available).length;
        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center`}>
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
              </div>
              <span className="text-xs font-semibold text-neutral-700">{label}</span>
              <span className="text-[11px] text-neutral-400">{availCount} available</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {groupSlots.map(s => {
                const isSelected = selectedSlot?.startTime === s.startTime;
                return (
                  <button key={s.startTime} disabled={!s.available}
                    onClick={() => s.available && onSlotSelect(s)}
                    className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                      !s.available
                        ? 'bg-neutral-50 text-neutral-300 border-transparent cursor-not-allowed line-through'
                        : isSelected
                          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-primary-300 hover:bg-primary-50 cursor-pointer'
                    }`}
                  >
                    {s.display}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SummaryItem ──────────────────────────────────────────────────────────────

function SummaryItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-neutral-400" />
      </div>
      <div>
        <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-neutral-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─── Video Readiness Checklist (Confirm step, intent='video') ────────────────

function VideoReadinessChecklist() {
  const items = [
    { Icon: Wifi, title: 'Stable internet', hint: 'Wi-Fi or strong mobile data recommended' },
    { Icon: Monitor, title: 'Quiet, well-lit space', hint: 'Face a light source, minimise background noise' },
    { Icon: Headphones, title: 'Working camera & mic', hint: 'Allow browser permissions when prompted' },
    { Icon: Lock, title: 'End-to-end secure room', hint: 'A private link will be created just for you' },
  ];
  return (
    <div className="mt-5 rounded-2xl border border-secondary-100 bg-gradient-to-br from-secondary-50 to-teal-50/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-secondary-100 flex items-center justify-center">
          <Video className="h-3.5 w-3.5 text-secondary-700" />
        </div>
        <p className="text-[13px] font-semibold font-display text-secondary-900">
          Ready to video call?
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {items.map(({ Icon, title, hint }) => (
          <div key={title} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/70 border border-white">
            <div className="w-7 h-7 rounded-lg bg-secondary-100 flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-secondary-700" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-neutral-800 leading-tight">{title}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{hint}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-secondary-700/80 mt-3 leading-relaxed">
        By confirming, you consent to your doctor recording brief clinical notes from this session. The call itself is not recorded.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingWizardModal({
  open, onClose, activePatientId, activePatient, setToast, onBooked,
  initialDept = null, initialDoctor = null, initialStep = 0,
  intent = 'visit',
}) {
  const contentRef = useRef(null);
  const intentCfg = INTENT_CONFIG[intent] || INTENT_CONFIG.visit;
  const IntentIcon = intentCfg.icon;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 0
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);

  // Step 1
  const [doctors, setDoctors] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Step 2
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [dateSummary, setDateSummary] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsOnLeave, setSlotsOnLeave] = useState(false);
  const [slotsOffDay, setSlotsOffDay] = useState(false);
  const [slotLeaveReason, setSlotLeaveReason] = useState('');
  const [doctorPolicy, setDoctorPolicy] = useState(null);

  // Step 3 (Confirm)
  const [reason, setReason] = useState('');

  // ─── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Seed context if caller provided a doctor/department shortcut
      const seedDept = initialDept || initialDoctor?.department || null;
      const seedDoctor = initialDoctor || null;
      const clampedStep = Math.max(0, Math.min(3, initialStep || 0));

      setStep(clampedStep);
      setDepartments([]);
      setSelectedDept(seedDept);
      setDoctors([]);
      setDoctorSearch('');
      setSelectedDoctor(seedDoctor);
      setCalendarMonth(new Date().getMonth() + 1);
      setCalendarYear(new Date().getFullYear());
      setDateSummary({});
      setSelectedDate('');
      setSlots([]);
      setSelectedSlot(null);
      setSlotsOnLeave(false);
      setSlotsOffDay(false);
      setSlotLeaveReason('');
      setDoctorPolicy(null);
      setReason('');
      setSubmitting(false);
    }
  }, [open, initialDept, initialDoctor, initialStep]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Scroll content to top on step change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [step]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ─── Step 0: Fetch departments ──────────────────────────────────────────────
  useEffect(() => {
    if (!open || step !== 0) return;
    let cancelled = false;
    setLoading(true);
    listDepartments()
      .then(res => { if (!cancelled) setDepartments(res.data || []); })
      .catch(() => { if (!cancelled) setDepartments([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, step]);

  // ─── Step 1: Fetch doctors ──────────────────────────────────────────────────
  const fetchDoctors = useCallback(async () => {
    if (!selectedDept) return;
    setLoading(true);
    try {
      const params = { department: selectedDept._id || selectedDept.name };
      if (doctorSearch.trim()) params.search = doctorSearch.trim();
      const res = await listDoctors(params);
      setDoctors(res.data?.items || res.data || []);
    } catch {
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, doctorSearch]);

  useEffect(() => {
    if (step === 1) fetchDoctors();
  }, [step, fetchDoctors]);

  // ─── Step 2: Fetch calendar summary ─────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !selectedDoctor) return;
    let cancelled = false;
    setCalendarLoading(true);
    getDoctorAvailabilitySummary(selectedDoctor._id, calendarMonth, calendarYear, selectedDoctor.branch?._id)
      .then(res => {
        if (!cancelled) {
          const d = res?.data || res;
          setDateSummary(d.dates || {});
          if (d.slotDuration || d.minNoticeMinutes) {
            setDoctorPolicy({
              slotDuration: d.slotDuration ?? 30,
              bufferMinutes: d.bufferMinutes ?? 0,
              minNoticeMinutes: d.minNoticeMinutes ?? 15,
              maxAdvanceDays: d.maxAdvanceDays ?? 60,
            });
          }
        }
      })
      .catch(() => { if (!cancelled) setDateSummary({}); })
      .finally(() => { if (!cancelled) setCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [step, selectedDoctor, calendarMonth, calendarYear]);

  // ─── Step 2: Fetch slots for selected date ─────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !selectedDoctor || !selectedDate) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSlotsOnLeave(false);
    setSlotsOffDay(false);
    setSlotLeaveReason('');
    getDoctorAvailability(selectedDoctor._id, selectedDate, selectedDoctor.branch?._id)
      .then(res => {
        if (cancelled) return;
        const d = res.data || res;
        setSlots(d.slots || []);
        setSlotsOnLeave(!!d.isOnLeave);
        setSlotsOffDay(!!d.isOffDay || !!d.isOverrideDayOff || !!d.isBranchClosed || !!d.isBeyondMaxAdvance);
        setSlotLeaveReason(d.leaveReason || d.reason || '');
        if (d.bufferMinutes != null || d.minNoticeMinutes != null) {
          setDoctorPolicy(prev => ({
            slotDuration: prev?.slotDuration ?? d.slotDuration ?? 30,
            bufferMinutes: d.bufferMinutes ?? prev?.bufferMinutes ?? 0,
            minNoticeMinutes: d.minNoticeMinutes ?? prev?.minNoticeMinutes ?? 15,
            maxAdvanceDays: d.maxAdvanceDays ?? prev?.maxAdvanceDays ?? 60,
          }));
        }
      })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [step, selectedDoctor, selectedDate]);

  // ─── Real-time availability sync via socket ─────────────────────────────────
  useEffect(() => {
    if (!open || step !== 2 || !selectedDoctor) return;
    const sock = initSocket() || getSocket();
    if (!sock) return;

    const handleAvailabilityUpdate = (payload) => {
      const docMatch = payload?.doctorId === selectedDoctor._id;
      if (!docMatch) return;
      // Re-fetch calendar summary for current month
      getDoctorAvailabilitySummary(selectedDoctor._id, calendarMonth, calendarYear, selectedDoctor.branch?._id)
        .then(res => {
          const d = res?.data || res;
          setDateSummary(d.dates || {});
        })
        .catch(() => {});
      // Re-fetch slots if the invalidated date matches the selected date
      if (selectedDate && (!payload?.date || payload.date === selectedDate)) {
        setSlotsLoading(true);
        setSelectedSlot(null);
        getDoctorAvailability(selectedDoctor._id, selectedDate, selectedDoctor.branch?._id)
          .then(res => {
            const d = res.data || res;
            setSlots(d.slots || []);
            setSlotsOnLeave(!!d.isOnLeave);
            setSlotsOffDay(!!d.isOffDay || !!d.isOverrideDayOff || !!d.isBranchClosed || !!d.isBeyondMaxAdvance);
            setSlotLeaveReason(d.leaveReason || d.reason || '');
          })
          .catch(() => setSlots([]))
          .finally(() => setSlotsLoading(false));
      }
    };

    sock.on('availability:invalidated', handleAvailabilityUpdate);
    sock.on('appointment:update', handleAvailabilityUpdate);
    return () => {
      sock.off('availability:invalidated', handleAvailabilityUpdate);
      sock.off('appointment:update', handleAvailabilityUpdate);
    };
  }, [open, step, selectedDoctor, selectedDate, calendarMonth, calendarYear]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === 0) return !!selectedDept;
    if (step === 1) return !!selectedDoctor;
    if (step === 2) return !!selectedSlot && !!selectedDate;
    return true;
  };

  const next = () => { if (canNext() && step < 3) setStep(step + 1); };
  const back = () => { if (step > 0) setStep(step - 1); };

  // ─── Confirm & Pay ──────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // startTime is a full ISO string (e.g. "2026-04-20T09:00:00.000Z") — use directly
      const scheduledAt = selectedSlot.startTime;

      // Build the payload so we only send fields the server will accept.
      // The server's Joi string validator rejects empty strings, so only
      // include `reason` when the patient actually typed something.
      const payload = {
        doctor: selectedDoctor._id,
        scheduledAt,
        duration: selectedSlot.duration || 30,
        type: intentCfg.submitType,
        source: 'portal',
      };
      if (selectedDoctor?.branch?._id) {
        payload.branch = selectedDoctor.branch._id;
      }
      const trimmedReason = (reason || '').trim();
      if (trimmedReason) payload.reason = trimmedReason;

      // Forward the fee shown on the confirm screen so the backend creates the
      // invoice + Razorpay order. Without this, no payment modal would open.
      // (Backend also falls back to the doctor's configured fee as a safety net.)
      if (selectedDoctor?.consultationFee > 0) {
        payload.consultationFee = selectedDoctor.consultationFee;
      }

      const res = await bookAppointment(activePatientId, payload);
      const appointment = res?.data;
      const paymentOrder = appointment?.paymentOrder;

      const successMsg = intent === 'video'
        ? 'Video consult booked! Join link will be available in your appointments.'
        : 'Appointment confirmed and payment received!';
      const pendingMsg = intent === 'video'
        ? 'Video consult booked! Payment verification pending.'
        : 'Appointment booked! Payment verification pending.';
      const laterMsg = intent === 'video'
        ? 'Video consult booked! You can pay later.'
        : 'Appointment booked! You can pay later.';

      if (paymentOrder?.orderId) {
        if (!window.Razorpay) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        const rzp = new window.Razorpay({
          key: paymentOrder.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency || 'INR',
          order_id: paymentOrder.orderId,
          name: 'BestoClinic',
          description: intent === 'video' ? 'Video Consultation' : 'Appointment Booking',
          prefill: {
            name: activePatient?.name || '',
            email: activePatient?.email || '',
            contact: activePatient?.phone || '',
          },
          handler: async (response) => {
            try {
              await verifyAppointmentPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                appointmentId: appointment._id || appointment.id,
                patientId: activePatientId,
              });
              setToast({ type: 'success', message: successMsg });
            } catch {
              setToast({ type: 'success', message: pendingMsg });
            }
            onBooked?.();
            onClose();
          },
          modal: {
            ondismiss: () => {
              setToast({ type: 'success', message: laterMsg });
              onBooked?.();
              onClose();
            },
          },
        });
        rzp.on('payment.failed', () => {
          setToast({ type: 'success', message: 'Appointment booked! Payment could not be processed.' });
          onBooked?.();
          onClose();
        });
        rzp.open();
      } else {
        setToast({
          type: 'success',
          message: intent === 'video' ? 'Video consult booked successfully!' : 'Appointment booked successfully!',
        });
        onBooked?.();
        onClose();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to book appointment' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  const stepContent = {
    // ── Step 0: Department ─────────────────────────────────────────────────
    0: (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl ${intentCfg.heroIconBg} flex items-center justify-center`}>
            <Building2 className={`h-5 w-5 ${intentCfg.heroIconText}`} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold font-display text-neutral-900">Choose Department</h4>
            <p className="text-xs text-neutral-500">
              {intent === 'video'
                ? 'Pick the department that matches your concern'
                : 'Select the department for your appointment'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">No departments available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {departments.map(dept => {
              const isSelected = selectedDept?._id === dept._id;
              return (
                <button key={dept._id || dept.name}
                  onClick={() => { setSelectedDept(dept); setSelectedDoctor(null); }}
                  className={`p-5 rounded-2xl border text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100'
                      : 'border-neutral-200 hover:border-primary-300 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary-100' : 'bg-neutral-100'
                    }`}>
                      <Stethoscope className={`h-5 w-5 ${isSelected ? 'text-primary-600' : 'text-neutral-400'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{dept.name}</p>
                      {dept.description && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{dept.description}</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="h-5 w-5 text-primary-600 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    ),

    // ── Step 1: Doctor ────────────────────────────────────────────────────
    1: (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl ${intentCfg.heroIconBg} flex items-center justify-center`}>
            <User className={`h-5 w-5 ${intentCfg.heroIconText}`} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold font-display text-neutral-900">Choose Your Doctor</h4>
            <p className="text-xs text-neutral-500">
              {selectedDept?.name ? `Doctors in ${selectedDept.name}` : 'Select a doctor'}
            </p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search doctors by name..."
            value={doctorSearch}
            onChange={e => setDoctorSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-16">
            <User className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">No doctors found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {doctors.map(doc => {
              const isSelected = selectedDoctor?._id === doc._id;
              const name = doctorDisplayName(doc);
              return (
                <button key={doc._id}
                  onClick={() => setSelectedDoctor(doc)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100'
                      : 'border-neutral-200 hover:border-primary-300 hover:bg-neutral-50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${getAvatarColor(name)}`}>
                    <span className="text-sm font-bold">{getInitials(name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">Dr. {name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {doc.specialization || doc.department?.name || selectedDept?.name || ''}
                    </p>
                    {doc.branch?.name && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {doc.branch.name}
                      </p>
                    )}
                  </div>
                  {doc.consultationFee > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary-600">{formatCurrency(doc.consultationFee)}</p>
                      <p className="text-[10px] text-neutral-400">per visit</p>
                    </div>
                  )}
                  {isSelected && <CheckCircle2 className="h-5 w-5 text-primary-600 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    ),

    // ── Step 2: Schedule ──────────────────────────────────────────────────
    2: (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl ${intentCfg.heroIconBg} flex items-center justify-center`}>
            <CalendarDays className={`h-5 w-5 ${intentCfg.heroIconText}`} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold font-display text-neutral-900">Pick a Date & Time</h4>
            <p className="text-xs text-neutral-500">
              {intent === 'video'
                ? `Choose when to meet Dr. ${doctorDisplayName(selectedDoctor)} online`
                : `Choose when you'd like to visit Dr. ${doctorDisplayName(selectedDoctor)}`}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Booking Policy */}
          {(() => {
            const p = doctorPolicy || { slotDuration: 30, bufferMinutes: 0, minNoticeMinutes: 15, maxAdvanceDays: 60 };
            const noticeLabel = p.minNoticeMinutes >= 1440
              ? `${Math.round(p.minNoticeMinutes / 1440)}d advance notice`
              : p.minNoticeMinutes >= 60
                ? `${Math.round(p.minNoticeMinutes / 60)}h advance notice`
                : `${p.minNoticeMinutes}m advance notice`;
            return (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-xs font-semibold text-blue-800">Booking Policy</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-[11px] text-blue-700 flex items-center gap-1.5">
                    <Timer className="h-3 w-3 text-blue-500" />
                    {p.slotDuration} min per slot
                  </span>
                  <span className="text-[11px] text-blue-700 flex items-center gap-1.5">
                    <CalendarClock className="h-3 w-3 text-blue-500" />
                    {noticeLabel}
                  </span>
                  {p.bufferMinutes > 0 && (
                    <span className="text-[11px] text-blue-700 flex items-center gap-1.5">
                      <Hourglass className="h-3 w-3 text-blue-500" />
                      {p.bufferMinutes} min gap between slots
                    </span>
                  )}
                  <span className="text-[11px] text-blue-700 flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3 text-blue-500" />
                    Book up to {p.maxAdvanceDays} days ahead
                  </span>
                </div>
                <p className="text-[10px] text-blue-600 mt-2 pt-2 border-t border-blue-200">
                  Grayed-out dates or slots are outside the booking window.
                </p>
              </div>
            );
          })()}

          <InlineCalendar
            selectedDate={selectedDate}
            onDateSelect={d => setSelectedDate(d)}
            month={calendarMonth}
            year={calendarYear}
            onMonthChange={(m, y) => { setCalendarMonth(m); setCalendarYear(y); }}
            dateSummary={dateSummary}
            loading={calendarLoading}
          />

          {selectedDate && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 mb-3 uppercase tracking-wide">Available Slots</p>
              <InlineTimeSlots
                slots={slots}
                selectedSlot={selectedSlot}
                onSlotSelect={setSelectedSlot}
                loading={slotsLoading}
                isOnLeave={slotsOnLeave}
                isOffDay={slotsOffDay}
                leaveReason={slotLeaveReason}
              />
            </div>
          )}
        </div>
      </div>
    ),

    // ── Step 3: Review & Confirm ──────────────────────────────────────────
    3: (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl ${intentCfg.heroIconBg} flex items-center justify-center`}>
            <CheckCircle2 className={`h-5 w-5 ${intentCfg.heroIconText}`} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold font-display text-neutral-900">Review & Confirm</h4>
            <p className="text-xs text-neutral-500">Make sure everything looks right before booking</p>
          </div>
        </div>

        <div className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden">
          {/* Doctor header */}
          <div className="p-5 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${getAvatarColor(doctorDisplayName(selectedDoctor))}`}>
              <span className="text-lg font-bold">{getInitials(doctorDisplayName(selectedDoctor))}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold font-display text-neutral-900">
                Dr. {doctorDisplayName(selectedDoctor)}
              </p>
              <p className="text-xs text-neutral-500">
                {selectedDoctor?.specialization || selectedDept?.name}
              </p>
              {selectedDoctor?.branch?.name && (
                <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" /> {selectedDoctor.branch.name}
                </p>
              )}
            </div>
            {/* Intent chip */}
            <span className={`inline-flex items-center gap-1.5 ${intentCfg.headerChipBg} px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0`}>
              <IntentIcon className="h-3 w-3" />
              {intentCfg.label}
            </span>
          </div>

          {/* Ticket dashed separator */}
          <div className="relative px-5">
            <div className="border-t-2 border-dashed border-neutral-200" />
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full" />
          </div>

          {/* Detail rows */}
          <div className="p-5 space-y-4">
            <SummaryItem icon={CalendarDays} label="Date" value={formatDateFull(selectedDate)} />
            <SummaryItem icon={Clock} label="Time" value={formatSlotTime(selectedSlot)} />
            <SummaryItem icon={Building2} label="Department" value={selectedDept?.name} />
            <SummaryItem
              icon={intent === 'video' ? Video : Stethoscope}
              label="Type"
              value={intentCfg.label}
            />
          </div>

          {/* Fee footer */}
          {selectedDoctor?.consultationFee > 0 && (
            <div className="px-5 py-4 bg-primary-50 border-t border-primary-100 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">
                {intent === 'video' ? 'Consultation Fee' : 'Consultation Fee'}
              </span>
              <span className="text-lg font-bold font-display text-primary-700">
                {formatCurrency(selectedDoctor.consultationFee)}
              </span>
            </div>
          )}
        </div>

        {/* Reason for visit */}
        <div className="mt-5">
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wide">
            <MessageSquare className="h-3.5 w-3.5 text-neutral-400" />
            What would you like to discuss? <span className="font-normal lowercase tracking-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={intent === 'video'
              ? 'Briefly describe your symptoms or questions — it helps the doctor prepare.'
              : 'Describe your symptoms or reason for the visit.'}
            rows={3}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none"
          />
        </div>

        {/* Video-specific readiness checklist */}
        {intent === 'video' && <VideoReadinessChecklist />}

        {/* In-person-specific hint */}
        {intent === 'visit' && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-primary-50/60 border border-primary-100 p-3.5">
            <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-neutral-800">What to bring</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                A photo ID, prior prescriptions or reports, and a list of medicines you currently take.
              </p>
            </div>
          </div>
        )}
      </div>
    ),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[20px] shadow-[var(--shadow-xl)] w-full mx-4 max-w-4xl max-h-[90vh] flex flex-col sm:flex-row overflow-hidden animate-[fadeUp_0.25s_ease-out_both]">
        {/* Left sidebar (desktop) */}
        <ProgressSidebar
          step={step}
          selectedDept={selectedDept}
          selectedDoctor={selectedDoctor}
          selectedDate={selectedDate}
          selectedSlot={selectedSlot}
          activePatient={activePatient}
          intentCfg={intentCfg}
        />

        {/* Right content panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile progress dots */}
          <div className="sm:hidden flex items-center justify-center gap-1 px-6 py-3 border-b border-neutral-200">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center">
                {i > 0 && <div className={`w-6 h-0.5 rounded-full ${i <= step ? 'bg-primary-500' : 'bg-neutral-200'}`} />}
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i < step ? 'bg-primary-500' : i === step ? 'bg-primary-600 ring-2 ring-primary-200' : 'bg-neutral-200'
                }`} />
              </div>
            ))}
          </div>

          {/* Mobile header */}
          <div className="sm:hidden flex items-center justify-between px-5 py-3 border-b border-neutral-200">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-lg ${intentCfg.heroIconBg} flex items-center justify-center shrink-0`}>
                <IntentIcon className={`h-3.5 w-3.5 ${intentCfg.heroIconText}`} />
              </div>
              <h3 className="text-base font-semibold font-display text-neutral-900 truncate">
                {intentCfg.label}
              </h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Desktop close button */}
          <div className="hidden sm:flex justify-end px-5 pt-4 pb-0">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Step content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-5 min-h-[320px]">
            <div key={step} className="animate-[fadeUp_0.2s_ease-out_both]">
              {stepContent[step]}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 shrink-0">
            <div>
              {step > 0 ? (
                <button onClick={back} disabled={submitting}
                  className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors disabled:opacity-40">
                  <span className="flex items-center gap-1.5"><ChevronLeft className="h-4 w-4" /> Back</span>
                </button>
              ) : (
                <button onClick={onClose}
                  className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">
                  Cancel
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors">
                  Cancel
                </button>
              )}
              {step < 3 ? (
                <button onClick={next} disabled={!canNext()}
                  className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="flex items-center gap-1.5">Continue <ChevronRight className="h-4 w-4" /></span>
                </button>
              ) : (
                <button onClick={handleConfirm} disabled={submitting}
                  className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {submitting ? (
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Booking...</span>
                  ) : selectedDoctor?.consultationFee > 0 ? (
                    `Confirm & Pay ${formatCurrency(selectedDoctor.consultationFee)}`
                  ) : (
                    intent === 'video' ? 'Confirm Video Consult' : 'Confirm Booking'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
