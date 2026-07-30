/**
 * DoctorSchedule — Calendar-centric single-page layout.
 * No tabs — all schedule context visible at once:
 * Row 0: Page header + actions
 * Row 1: 4 stat cards
 * Row 2: Monthly calendar (8 cols) + context panel (4 cols)
 * Row 3: Weekly hours + overrides + leaves (3 cols)
 * Row 4: Calendar feed (compact)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Calendar, Plus, Trash2, AlertCircle,
  Link, Copy, RefreshCw, Eye, EyeOff, CalendarX2, Zap, Info,
  ChevronLeft, ChevronRight, Palmtree, CalendarDays, CalendarClock,
} from 'lucide-react';
import {
  getOwnSchedule, getOwnLeaves, requestOwnLeave, deleteOwnLeave,
  getOwnOverrides, createOwnOverride, deleteOwnOverride, getOwnHolidays,
  listCalendarFeeds, generateCalendarFeed, updateCalendarFeed,
  revokeCalendarFeed, regenerateCalendarFeed,
} from '../api';
import { Modal, ConfirmDialog } from '../../platform/components/shared';
import ConflictResolutionModal from '../components/schedule/ConflictResolutionModal';
import {
  cardCls, btnPrimary, btnSecondary, btnGhost, inputCls, labelCls,
  PageHeader, Badge, EmptyState, SkeletonLoader, StatCard, formatDate,
  sectionHeader,
} from '../components/doctor/shared';

// ─── Constants ──────────────────────────────────────
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LEAVE_TYPES = [
  { value: 'planned', label: 'Planned Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal Leave' },
  { value: 'conference', label: 'Conference / CME' },
  { value: 'other', label: 'Other' },
];

const LEAVE_STATUS = {
  pending:   { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:  { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
};

const OVERRIDE_TYPES = [
  { value: 'day_off', label: 'Day Off' },
  { value: 'custom_hours', label: 'Modified Hours' },
  { value: 'extra_day', label: 'Additional Working Day' },
];

const OVERRIDE_COLORS = {
  day_off: 'amber',
  custom_hours: 'primary',
  extra_day: 'green',
};

const PILL_COLORS = [
  { bg: 'bg-amber-100',   text: 'text-amber-700' },
  { bg: 'bg-blue-100',    text: 'text-blue-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-purple-100',  text: 'text-purple-700' },
  { bg: 'bg-rose-100',    text: 'text-rose-700' },
  { bg: 'bg-teal-100',    text: 'text-teal-700' },
];

function getPillColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length];
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFullDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════
export default function DoctorSchedule() {
  // ─── Core data ──────────────────────────────────────
  const [schedule, setSchedule] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Calendar state
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateStr(now));

  // Schedule conflict resolution
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictData, setConflictData] = useState({ conflicts: [], reason: '', branchId: '' });

  // Override form
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ date: '', type: 'day_off', branch: '', startTime: '', endTime: '', reason: '' });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideDeleteTarget, setOverrideDeleteTarget] = useState(null);
  const [overrideDeleting, setOverrideDeleting] = useState(false);

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'personal', startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Calendar feed
  const [feed, setFeed] = useState(null);
  const [feedAction, setFeedAction] = useState('');
  const [showPatientNames, setShowPatientNames] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // ─── Fetch data ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [schedRes, leavesRes, feedRes, ovRes, holRes] = await Promise.allSettled([
        getOwnSchedule(),
        getOwnLeaves({ limit: 50 }),
        listCalendarFeeds(),
        getOwnOverrides({ limit: 50 }),
        getOwnHolidays({ limit: 100 }),
      ]);

      if (schedRes.status === 'fulfilled') {
        const data = schedRes.value?.data || schedRes.value;
        setSchedule(Array.isArray(data) ? data : data?.schedule || []);
      }
      if (leavesRes.status === 'fulfilled') {
        const data = leavesRes.value?.data || leavesRes.value;
        setLeaves(Array.isArray(data) ? data : data?.items || data?.leaves || []);
      }
      if (feedRes.status === 'fulfilled') {
        const feeds = feedRes.value?.data || feedRes.value || [];
        const arr = Array.isArray(feeds) ? feeds : [];
        setFeed(arr.length > 0 ? arr[0] : null);
        if (arr.length > 0) setShowPatientNames(!!arr[0].showPatientNames);
      }
      if (ovRes.status === 'fulfilled') {
        const data = ovRes.value?.data || ovRes.value;
        setOverrides(Array.isArray(data) ? data : data?.items || []);
      }
      if (holRes.status === 'fulfilled') {
        const data = holRes.value?.data || holRes.value;
        setHolidays(Array.isArray(data) ? data : data?.items || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Schedule helpers ──────────────────────────────
  const todayStr = toDateStr(now);
  const todayDayIndex = now.getDay();
  const todayMapped = todayDayIndex === 0 ? 6 : todayDayIndex - 1;

  // Extract the weeklySchedule array from the first DoctorSchedule document.
  // schedule is [{ doctor, branch, weeklySchedule: [{day, isWorking, startTime, endTime, ...}], ... }]
  const weeklySchedule = useMemo(() => {
    if (!schedule.length) return [];
    const doc = schedule[0];
    return doc.weeklySchedule || doc.weekly_schedule || [];
  }, [schedule]);

  // Extract the primary branch from loaded schedule (needed for override requests)
  const primaryBranch = useMemo(() => {
    if (!schedule.length) return null;
    const doc = schedule[0];
    return doc.branch?._id || doc.branch || null;
  }, [schedule]);

  function getScheduleForDay(dayIndex) {
    const dayName = DAY_NAMES[dayIndex].toLowerCase();
    const found = weeklySchedule.find((s) => {
      const sDayRaw = (s.day || s.dayOfWeek || '').toLowerCase();
      return sDayRaw === dayName;
    });
    if (!found) return null;
    if (found.isWorking === false) return found;
    // Build slots from startTime/endTime + break if no explicit slots
    if (!found.slots?.length && found.startTime && found.endTime) {
      const slots = [];
      if (found.breakStart && found.breakEnd) {
        slots.push({ startTime: found.startTime, endTime: found.breakStart });
        slots.push({ startTime: found.breakEnd, endTime: found.endTime });
      } else {
        slots.push({ startTime: found.startTime, endTime: found.endTime });
      }
      return { ...found, slots };
    }
    return found;
  }

  function isDayOff(dayIndex) {
    const sched = getScheduleForDay(dayIndex);
    return !sched || sched.isWorking === false;
  }

  function formatScheduleTime(time) {
    if (!time) return '--';
    if (typeof time === 'string' && time.includes(':')) return time;
    if (typeof time === 'number') {
      const h = Math.floor(time / 60);
      const m = time % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return time;
  }

  function formatOverrideType(type) {
    const labels = { day_off: 'Day Off', custom_hours: 'Modified Hours', extra_day: 'Additional Day' };
    return labels[type] || (type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ─── Calendar grid computation ──────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    // getDay(): 0=Sun. We want Mon=0. Adjust: (getDay() + 6) % 7
    const startPad = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const days = [];
    // Padding days from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      days.push({ date: toDateStr(d), day: d.getDate(), isCurrentMonth: false });
    }
    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: true });
    }
    // Pad to complete last row (multiple of 7)
    while (days.length % 7 !== 0) {
      const d = new Date(viewYear, viewMonth + 1, days.length - startPad - totalDays + 1);
      days.push({ date: toDateStr(d), day: d.getDate(), isCurrentMonth: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  // ─── Event maps ────────────────────────────────────
  const holidaysByDate = useMemo(() => {
    const map = {};
    for (const h of holidays) {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate || h.startDate);
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endNorm = new Date(end);
      endNorm.setHours(23, 59, 59, 999);
      while (cursor <= endNorm) {
        const key = toDateStr(cursor);
        if (!map[key]) map[key] = [];
        map[key].push(h);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [holidays]);

  const leavesByDate = useMemo(() => {
    const map = {};
    for (const l of leaves) {
      if (l.status === 'cancelled' || l.status === 'rejected') continue;
      const start = new Date(l.startDate || l.from);
      const end = new Date(l.endDate || l.to || l.startDate || l.from);
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endNorm = new Date(end);
      endNorm.setHours(23, 59, 59, 999);
      while (cursor <= endNorm) {
        const key = toDateStr(cursor);
        if (!map[key]) map[key] = [];
        map[key].push(l);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [leaves]);

  const overridesByDate = useMemo(() => {
    const map = {};
    for (const ov of overrides) {
      const key = (ov.date || '').slice(0, 10);
      if (key) map[key] = ov;
    }
    return map;
  }, [overrides]);

  // ─── Selected day info ──────────────────────────────
  const selectedDayInfo = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const jsDay = d.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // Mon=0
    const sched = getScheduleForDay(dayIndex);
    const dayOff = isDayOff(dayIndex);
    const dayHolidays = holidaysByDate[selectedDate] || [];
    const dayLeaves = leavesByDate[selectedDate] || [];
    const dayOverride = overridesByDate[selectedDate] || null;

    return { dayIndex, sched, dayOff, dayHolidays, dayLeaves, dayOverride, dayName: DAY_NAMES[dayIndex] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, holidaysByDate, leavesByDate, overridesByDate, weeklySchedule]);

  // ─── Upcoming events (combined timeline) ───────────
  const upcomingEvents = useMemo(() => {
    const events = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    holidays.forEach((h) => {
      if (new Date(h.endDate || h.startDate) >= today) {
        events.push({ type: 'holiday', date: new Date(h.startDate), label: h.name, item: h });
      }
    });
    leaves.forEach((l) => {
      if (l.status !== 'cancelled' && l.status !== 'rejected' && new Date(l.endDate || l.to) >= today) {
        events.push({ type: 'leave', date: new Date(l.startDate || l.from), label: `${l.leaveType || 'Leave'} (${l.status || 'pending'})`, item: l });
      }
    });
    overrides.forEach((ov) => {
      if (new Date(ov.date) >= today) {
        events.push({ type: 'override', date: new Date(ov.date), label: formatOverrideType(ov.type), item: ov });
      }
    });

    events.sort((a, b) => a.date - b.date);
    return events.slice(0, 6);
  }, [holidays, leaves, overrides]);

  // ─── Stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const workingDays = DAY_NAMES.filter((_, i) => !isDayOff(i)).length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingLeaves = leaves.filter((l) => l.status !== 'cancelled' && l.status !== 'rejected' && new Date(l.endDate || l.to) >= today).length;
    const activeOverrides = overrides.filter((o) => new Date(o.date) >= today).length;
    const nextHoliday = holidays.filter((h) => new Date(h.startDate) >= today).sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
    return { workingDays, upcomingLeaves, activeOverrides, nextHoliday };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklySchedule, leaves, overrides, holidays]);

  // ─── Month navigation ──────────────────────────────
  const navMonth = (dir) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayStr);
  };

  // ─── Override handlers ──────────────────────────────
  const handleCreateOverride = useCallback(async (e) => {
    e.preventDefault();
    if (!overrideForm.date || !overrideForm.type) return;
    const branch = overrideForm.branch || primaryBranch;
    if (!branch) {
      setError('No branch found. Please contact your clinic admin to set up your schedule first.');
      return;
    }
    setOverrideSaving(true);
    setError('');
    try {
      const body = {
        date: overrideForm.date,
        type: overrideForm.type,
        branch,
        reason: overrideForm.reason || undefined,
      };
      if (overrideForm.type !== 'day_off' && overrideForm.startTime && overrideForm.endTime) {
        body.slots = [{ startTime: overrideForm.startTime, endTime: overrideForm.endTime }];
      }
      const res = await createOwnOverride(body);
      setShowOverrideForm(false);
      setOverrideForm({ date: '', type: 'day_off', branch: '', startTime: '', endTime: '', reason: '' });
      fetchData();

      // Check for conflicting appointments
      const data = res?.data || res;
      const conflicts = data?.conflicts || [];
      if (conflicts.length > 0) {
        setConflictData({
          conflicts,
          reason: overrideForm.reason || `Schedule change on ${overrideForm.date}`,
          branchId: branch,
        });
        setConflictModalOpen(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setOverrideSaving(false);
    }
  }, [overrideForm, primaryBranch, fetchData]);

  const handleDeleteOverride = useCallback(async () => {
    if (!overrideDeleteTarget) return;
    setOverrideDeleting(true);
    try {
      await deleteOwnOverride(overrideDeleteTarget._id || overrideDeleteTarget.id);
      setOverrideDeleteTarget(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setOverrideDeleting(false);
    }
  }, [overrideDeleteTarget, fetchData]);

  // ─── Leave handlers ─────────────────────────────────
  const handleSubmitLeave = useCallback(async (e) => {
    e.preventDefault();
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    setSubmitting(true);
    try {
      await requestOwnLeave({
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason,
      });
      setShowLeaveForm(false);
      setLeaveForm({ leaveType: 'personal', startDate: '', endDate: '', reason: '' });
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [leaveForm, fetchData]);

  const handleDeleteLeave = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // This page is the doctor's own schedule, so use the self-service endpoint.
      // deleteDoctorLeave() hits /doctors/:id/leaves/:leaveId, which needs admin
      // permissions the doctor does not hold.
      await deleteOwnLeave(deleteTarget._id || deleteTarget.id);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchData]);

  // ─── Calendar feed handlers ────────────────────────
  const handleGenerateFeed = async () => {
    setFeedAction('generating');
    try {
      const res = await generateCalendarFeed({ showPatientNames });
      setFeed(res?.data || res);
    } catch (err) {
      setError(err.message);
    } finally {
      setFeedAction('');
    }
  };

  const handleTogglePatientNames = async (value) => {
    if (!feed) return;
    setShowPatientNames(value);
    try {
      const res = await updateCalendarFeed(feed._id || feed.id, { showPatientNames: value });
      setFeed(res?.data || res);
    } catch (err) {
      setShowPatientNames(!value);
      setError(err.message);
    }
  };

  const handleToggleFeedEnabled = async () => {
    if (!feed) return;
    const newVal = !feed.isEnabled;
    try {
      const res = await updateCalendarFeed(feed._id || feed.id, { isEnabled: newVal });
      setFeed(res?.data || res);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeFeed = async () => {
    if (!feed) return;
    setFeedAction('revoking');
    try {
      await revokeCalendarFeed(feed._id || feed.id);
      setFeed(null);
      setShowRevokeConfirm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setFeedAction('');
    }
  };

  const handleRegenerateFeed = async () => {
    if (!feed) return;
    setFeedAction('regenerating');
    try {
      const res = await regenerateCalendarFeed(feed._id || feed.id);
      setFeed(res?.data || res);
      setShowRegenConfirm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setFeedAction('');
    }
  };

  const handleCopyUrl = () => {
    if (!feed?.feedUrl) return;
    navigator.clipboard.writeText(feed.feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ═══════════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Page Header ────────────────────────── */}
      <PageHeader
        title="My Schedule"
        subtitle="View your availability, manage overrides and time off"
        actions={
          <>
            <button onClick={() => setShowLeaveForm(true)} className={`${btnSecondary} flex items-center gap-2`}>
              <Palmtree className="h-4 w-4" /> Request Leave
            </button>
            <button onClick={() => setShowOverrideForm(true)} className={`${btnPrimary} flex items-center gap-2`}>
              <Plus className="h-4 w-4" /> Adjust Availability
            </button>
          </>
        }
      />

      {/* ── Error ─────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonLoader className="h-32 w-full" count={4} />
          </div>
          <SkeletonLoader className="h-96 w-full" />
        </div>
      ) : (
        <>
          {/* ── Row 1: Stat Cards ──────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={CalendarDays}
              title="Working Days"
              value={`${stats.workingDays} / week`}
              color="primary"
              delay={50}
            />
            <StatCard
              icon={Palmtree}
              title="Upcoming Leaves"
              value={stats.upcomingLeaves}
              color="blue"
              delay={100}
            />
            <StatCard
              icon={Zap}
              title="Adjusted Days"
              value={stats.activeOverrides}
              color="yellow"
              delay={150}
            />
            <StatCard
              icon={CalendarX2}
              title="Next Holiday"
              value={stats.nextHoliday ? formatDate(stats.nextHoliday.startDate) : 'None'}
              subtitle={stats.nextHoliday?.name || 'No upcoming holidays'}
              color="red"
              delay={200}
            />
          </div>

          {/* ── Row 2: Calendar + Context Panel ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '250ms' }}>

            {/* LEFT: Monthly Calendar */}
            <div className="lg:col-span-8 flex flex-col bg-white rounded-xl overflow-hidden">
              {/* Month nav header */}
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
                  <button onClick={() => navMonth(-1)} className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-neutral-700 w-36 text-center select-none">
                    {MONTHS[viewMonth]} {viewYear}
                  </span>
                  <button onClick={() => navMonth(1)} className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button onClick={goToday} className="px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition">
                  Today
                </button>
              </div>

              {/* Day headers (Mon–Sun) */}
              <div className="grid grid-cols-7">
                {DAY_SHORT.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider py-2.5">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar body */}
              <div className="grid grid-cols-7 auto-rows-fr flex-1">
                {calendarDays.map(({ date, day, isCurrentMonth }) => {
                  const isToday = date === todayStr;
                  const isPast = date < todayStr;
                  const isSelected = date === selectedDate;
                  const dayHolidays = holidaysByDate[date] || [];
                  const dayLeaves = leavesByDate[date] || [];
                  const dayOverride = overridesByDate[date];
                  // Determine weekday for working-day dot
                  const d = new Date(date + 'T00:00:00');
                  const jsDay = d.getDay();
                  const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
                  const isWorkingDay = isCurrentMonth && !isDayOff(dayIdx);
                  const isWeekend = jsDay === 0 || jsDay === 6;

                  const pills = [];
                  dayHolidays.slice(0, 1).forEach((h) => {
                    const c = getPillColor(h.name);
                    pills.push({ key: `h-${h._id}`, label: h.name, bg: c.bg, text: c.text });
                  });
                  if (dayLeaves.length > 0) {
                    pills.push({ key: 'leave', label: 'Leave', bg: 'bg-blue-100', text: 'text-blue-700' });
                  }
                  if (dayOverride) {
                    const ovLabels = { day_off: 'Day Off', custom_hours: 'Modified Hrs', extra_day: 'Extra Day' };
                    const ovColors = { day_off: { bg: 'bg-red-50', text: 'text-red-600' }, custom_hours: { bg: 'bg-purple-100', text: 'text-purple-700' }, extra_day: { bg: 'bg-emerald-100', text: 'text-emerald-700' } };
                    const c = ovColors[dayOverride.type] || ovColors.custom_hours;
                    pills.push({ key: 'ov', label: ovLabels[dayOverride.type] || 'Override', bg: c.bg, text: c.text });
                  }
                  const totalEvents = dayHolidays.length + dayLeaves.length + (dayOverride ? 1 : 0);
                  const overflow = totalEvents > 2 ? totalEvents - pills.length : 0;

                  return (
                    <div
                      key={date}
                      onClick={() => { if (isCurrentMonth) setSelectedDate(date); }}
                      className={`border-t border-neutral-100/50 p-1.5 min-h-[100px] transition-colors cursor-pointer ${
                        !isCurrentMonth ? 'opacity-30' :
                        isPast ? 'opacity-50' :
                        'hover:bg-primary-50/20'
                      } ${isSelected && isCurrentMonth ? 'bg-primary-50/40 ring-1 ring-primary-200' : ''} ${
                        isToday && !isSelected ? 'bg-primary-50/30' : ''
                      } ${isWeekend && !isToday && !isSelected && isCurrentMonth ? 'bg-neutral-50/40' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs leading-none ${
                          isToday
                            ? 'bg-primary-600 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold'
                            : `font-medium ${!isCurrentMonth || isPast ? 'text-neutral-400' : 'text-neutral-600'}`
                        }`}>
                          {day}
                        </span>
                        {isWorkingDay && !dayOverride?.type?.includes('off') && isCurrentMonth && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        )}
                      </div>
                      {pills.slice(0, 2).map((p) => (
                        <div key={p.key} className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${p.bg} ${p.text}`} title={p.label}>
                          {p.label}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[10px] text-neutral-400 mt-0.5 px-1.5">+{overflow} more</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 px-5 py-3 border-t border-neutral-100/50 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Working</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Holiday</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> Leave</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400" /> Changed</span>
              </div>
            </div>

            {/* RIGHT: Context Panel */}
            <div className="lg:col-span-4 flex flex-col min-h-0 space-y-6">

              {/* Selected Day */}
              <div>
                <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Selected Day
                </h3>
                <p className="text-lg font-semibold text-neutral-900 mb-3">
                  {formatFullDate(selectedDate)}
                </p>

                {/* Events on this day */}
                {selectedDayInfo.dayHolidays.length > 0 && selectedDayInfo.dayHolidays.map((h) => {
                  const pill = getPillColor(h.name);
                  const branchNames = h.branches?.length
                    ? h.branches.map((b) => typeof b === 'object' ? b.name : b).join(', ')
                    : 'All branches';
                  return (
                    <div key={h._id} className={`${pill.bg} rounded-lg px-3 py-2.5 mb-2`}>
                      <p className={`text-sm font-semibold ${pill.text}`}>{h.name}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{branchNames}{h.isRecurring ? ' · Recurring' : ''}</p>
                    </div>
                  );
                })}

                {selectedDayInfo.dayLeaves.map((l) => (
                  <div key={l._id || l.id} className="bg-blue-50 rounded-lg px-3 py-2.5 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-blue-700">Leave</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${(LEAVE_STATUS[l.status] || LEAVE_STATUS.pending).bg} ${(LEAVE_STATUS[l.status] || LEAVE_STATUS.pending).text}`}>
                        {l.status || 'pending'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{l.leaveType || 'Personal'}{l.reason ? ` · ${l.reason}` : ''}</p>
                  </div>
                ))}

                {selectedDayInfo.dayOverride && (
                  <div className="bg-purple-50 rounded-lg px-3 py-2.5 mb-2">
                    <p className="text-sm font-semibold text-purple-700">{formatOverrideType(selectedDayInfo.dayOverride.type)}</p>
                    {selectedDayInfo.dayOverride.slots?.length > 0 && (
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {selectedDayInfo.dayOverride.slots.map((s) => `${formatScheduleTime(s.startTime)} – ${formatScheduleTime(s.endTime)}`).join(', ')}
                      </p>
                    )}
                    {selectedDayInfo.dayOverride.reason && (
                      <p className="text-[11px] text-neutral-400 mt-0.5">{selectedDayInfo.dayOverride.reason}</p>
                    )}
                  </div>
                )}

                {/* Working hours for selected day */}
                {!selectedDayInfo.dayOverride && (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Working Hours</p>
                    {selectedDayInfo.dayOff ? (
                      <p className="text-sm text-neutral-400 italic">Day off</p>
                    ) : selectedDayInfo.sched?.slots?.length > 0 ? (
                      <div className="space-y-1">
                        {selectedDayInfo.sched.slots.map((s, i) => (
                          <p key={i} className="text-sm font-medium text-neutral-800">
                            {formatScheduleTime(s.startTime)} – {formatScheduleTime(s.endTime)}
                          </p>
                        ))}
                      </div>
                    ) : selectedDayInfo.sched ? (
                      <p className="text-sm font-medium text-neutral-800">
                        {formatScheduleTime(selectedDayInfo.sched.startTime)} – {formatScheduleTime(selectedDayInfo.sched.endTime)}
                      </p>
                    ) : (
                      <p className="text-sm text-neutral-400 italic">Not configured</p>
                    )}
                  </div>
                )}
              </div>

              {/* Upcoming Events */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary-50 flex items-center justify-center">
                      <CalendarClock className="h-3 w-3 text-primary-500" />
                    </div>
                    Upcoming
                  </h3>
                  {upcomingEvents.length > 0 && (
                    <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                      {upcomingEvents.length}
                    </span>
                  )}
                </div>

                {upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                    <CalendarClock className="h-6 w-6 text-neutral-200 mb-2" />
                    <p className="text-xs font-medium text-neutral-500">All clear</p>
                  </div>
                ) : (
                  <div className="space-y-1 overflow-y-auto flex-1">
                    {upcomingEvents.map((ev, i) => {
                      const colors = { holiday: 'border-l-amber-400 bg-amber-50/30', leave: 'border-l-blue-400 bg-blue-50/30', override: 'border-l-purple-400 bg-purple-50/30' };
                      const typeLabels = { holiday: 'Holiday', leave: 'Leave', override: 'Change' };
                      return (
                        <div
                          key={`${ev.type}-${i}`}
                          onClick={() => setSelectedDate(toDateStr(ev.date))}
                          className={`px-3 py-2.5 rounded-lg border-l-2 cursor-pointer hover:shadow-sm transition ${colors[ev.type] || ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-neutral-800 truncate">{ev.label}</p>
                            <span className="text-[10px] text-neutral-400 whitespace-nowrap ml-2">{typeLabels[ev.type]}</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5">{formatDate(ev.date)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 3: Weekly Hours + Overrides + Leaves ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '300ms' }}>

            {/* Weekly Hours */}
            <div className={`${cardCls} p-0 overflow-hidden`}>
              <div className={sectionHeader}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-primary-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900">Clinic Hours</h3>
                </div>
              </div>
              <div className="divide-y divide-neutral-100">
                {weeklySchedule.length === 0 ? (
                  <div className="py-10">
                    <EmptyState icon={Clock} title="Not configured" message="Contact your clinic admin to set up your schedule" />
                  </div>
                ) : (
                  DAY_NAMES.map((day, i) => {
                    const sched = getScheduleForDay(i);
                    const isToday = i === todayMapped;
                    const off = isDayOff(i);
                    const slots = sched?.slots || [];

                    return (
                      <div key={day} className={`flex items-center justify-between px-5 py-3 ${isToday ? 'bg-primary-50/30' : ''}`}>
                        <span className={`text-sm font-medium ${isToday ? 'text-primary-700' : 'text-neutral-700'}`}>
                          {DAY_SHORT[i]}
                        </span>
                        {off ? (
                          <span className="text-sm text-neutral-400 italic">Off</span>
                        ) : slots.length > 0 ? (
                          <div className="text-right">
                            {slots.map((s, si) => (
                              <p key={si} className="text-sm text-neutral-800">
                                {formatScheduleTime(s.startTime)} – {formatScheduleTime(s.endTime)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-800">
                            {formatScheduleTime(sched.startTime || sched.start)} – {formatScheduleTime(sched.endTime || sched.end)}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Overrides */}
            <div className={`${cardCls} p-0 overflow-hidden`}>
              <div className={`${sectionHeader} flex items-center justify-between`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-amber-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900">Availability Changes</h3>
                </div>
                {overrides.length > 0 && (
                  <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{overrides.length}</span>
                )}
              </div>
              {overrides.length === 0 ? (
                <div className="py-10">
                  <EmptyState icon={Zap} title="No changes" message="Regular schedule applies" />
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 max-h-[320px] overflow-y-auto">
                  {overrides.map((ov) => {
                    const isFuture = (ov.date || '').slice(0, 10) >= todayStr;
                    const slots = ov.slots || [];
                    return (
                      <div key={ov._id || ov.id} className="px-5 py-3.5 group hover:bg-neutral-50/50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-neutral-900">{formatDate(ov.date)}</span>
                              <Badge color={OVERRIDE_COLORS[ov.type] || 'primary'}>{formatOverrideType(ov.type)}</Badge>
                            </div>
                            {slots.length > 0 && (
                              <p className="text-xs text-neutral-500 mt-1">
                                {slots.map((s) => `${formatScheduleTime(s.startTime)} – ${formatScheduleTime(s.endTime)}`).join(', ')}
                              </p>
                            )}
                            {ov.reason && <p className="text-xs text-neutral-400 mt-0.5 truncate">{ov.reason}</p>}
                          </div>
                          {isFuture && (
                            <button
                              onClick={() => setOverrideDeleteTarget(ov)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 ml-2 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Leaves */}
            <div className={`${cardCls} p-0 overflow-hidden`}>
              <div className={`${sectionHeader} flex items-center justify-between`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Palmtree className="h-4 w-4 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-900">Leave Requests</h3>
                </div>
                {leaves.length > 0 && (
                  <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{leaves.length}</span>
                )}
              </div>
              {leaves.length === 0 ? (
                <div className="py-10">
                  <EmptyState icon={Calendar} title="No leave requests" message="Requests will appear here" />
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 max-h-[320px] overflow-y-auto">
                  {leaves.map((leave) => {
                    const status = leave.status || 'pending';
                    const sc = LEAVE_STATUS[status] || LEAVE_STATUS.pending;
                    const canDelete = status === 'pending';
                    return (
                      <div key={leave._id || leave.id} className="px-5 py-3.5 group hover:bg-neutral-50/50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-neutral-900">
                                {formatDate(leave.startDate || leave.from)} – {formatDate(leave.endDate || leave.to)}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${sc.bg} ${sc.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                {status}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1 capitalize">{leave.leaveType || 'Leave'}</p>
                            {leave.reason && <p className="text-xs text-neutral-400 mt-0.5 truncate">{leave.reason}</p>}
                          </div>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(leave)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 ml-2 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Row 4: Calendar Feed ────────────────────── */}
          <div className={`${cardCls} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '350ms' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <Link className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">External Calendar Sync</h3>
                <p className="text-xs text-neutral-500 mt-0.5 max-w-xl">
                  Generate a subscription link to view your clinic schedule in Google Calendar, Outlook, or Apple Calendar.
                  Appointments and availability changes will sync automatically.
                </p>
              </div>
            </div>

            {!feed ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPatientNames}
                    onChange={(e) => setShowPatientNames(e.target.checked)}
                    className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  Include patient names in events
                </label>
                <button onClick={handleGenerateFeed} disabled={!!feedAction} className={`${btnPrimary} flex items-center gap-2`}>
                  <Link className="h-4 w-4" />
                  {feedAction === 'generating' ? 'Generating...' : 'Generate Sync Link'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Feed URL */}
                <div>
                  <p className="text-[11px] text-neutral-400 mb-1.5">
                    Copy this link and add it as a "Subscribe by URL" calendar in your preferred calendar app
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={feed.feedUrl || ''}
                      readOnly
                      className={`${inputCls} flex-1 font-mono text-xs bg-neutral-50`}
                      onClick={(e) => e.target.select()}
                    />
                    <button onClick={handleCopyUrl} className={`${btnSecondary} flex items-center gap-1.5 whitespace-nowrap`}>
                      <Copy className="h-4 w-4" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex flex-wrap items-center gap-4">
                  <Badge color={feed.isEnabled ? 'green' : 'amber'}>{feed.isEnabled ? 'Syncing' : 'Paused'}</Badge>

                  {/* Toggle: Sync enabled */}
                  <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                    {feed.isEnabled ? <Eye className="h-4 w-4 text-neutral-500" /> : <EyeOff className="h-4 w-4 text-neutral-400" />}
                    <span>Sync</span>
                    <button
                      onClick={handleToggleFeedEnabled}
                      className={`relative w-9 h-5 rounded-full transition-colors ${feed.isEnabled ? 'bg-primary-500' : 'bg-neutral-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${feed.isEnabled ? 'translate-x-4' : ''}`} />
                    </button>
                  </label>

                  {/* Toggle: Patient names */}
                  <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                    <span>Patient Names</span>
                    <button
                      onClick={() => handleTogglePatientNames(!showPatientNames)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${showPatientNames ? 'bg-primary-500' : 'bg-neutral-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showPatientNames ? 'translate-x-4' : ''}`} />
                    </button>
                  </label>

                  <div className="flex-1" />

                  <button onClick={() => setShowRegenConfirm(true)} disabled={!!feedAction} className="text-xs font-medium text-neutral-500 hover:text-neutral-700 flex items-center gap-1 transition">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {feedAction === 'regenerating' ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button onClick={() => setShowRevokeConfirm(true)} disabled={!!feedAction} className="text-xs font-medium text-red-500 hover:text-red-700 flex items-center gap-1 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                    {feedAction === 'revoking' ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Leave Request Modal ────────────────────────── */}
      <Modal open={showLeaveForm} onClose={() => setShowLeaveForm(false)} title="Request Leave">
        <form onSubmit={handleSubmitLeave} className="space-y-4">
          <div>
            <label className={labelCls}>Leave Type</label>
            <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm((f) => ({ ...f, leaveType: e.target.value }))} className={inputCls}>
              {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} className={inputCls} min={leaveForm.startDate} required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <textarea value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className={inputCls} placeholder="Brief description..." />
          </div>
          {error && <div className="flex items-center gap-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowLeaveForm(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Override Form Modal ─────────────────────────── */}
      <Modal open={showOverrideForm} onClose={() => setShowOverrideForm(false)} title="Adjust Day Availability">
        <form onSubmit={handleCreateOverride} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={overrideForm.date} onChange={(e) => setOverrideForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} min={todayStr} required />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={overrideForm.type} onChange={(e) => setOverrideForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
                {OVERRIDE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {overrideForm.type !== 'day_off' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start Time</label>
                <input type="time" value={overrideForm.startTime} onChange={(e) => setOverrideForm((f) => ({ ...f, startTime: e.target.value }))} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>End Time</label>
                <input type="time" value={overrideForm.endTime} onChange={(e) => setOverrideForm((f) => ({ ...f, endTime: e.target.value }))} className={inputCls} required />
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Reason (optional)</label>
            <textarea value={overrideForm.reason} onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))} rows={2} className={inputCls} placeholder="e.g. Personal appointment, half-day clinic..." />
          </div>
          {error && <div className="flex items-center gap-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowOverrideForm(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={overrideSaving} className={btnPrimary}>{overrideSaving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Dialogs ────────────────────────────── */}
      <ConfirmDialog open={!!deleteTarget} title="Cancel Leave Request" message="Are you sure you want to cancel this leave request? This action cannot be undone." onConfirm={handleDeleteLeave} onCancel={() => setDeleteTarget(null)} danger loading={deleting} />
      <ConfirmDialog open={!!overrideDeleteTarget} title="Remove Availability Change" message="Are you sure? Your regular clinic hours will apply for this date." onConfirm={handleDeleteOverride} onCancel={() => setOverrideDeleteTarget(null)} danger loading={overrideDeleting} />
      <ConfirmDialog open={showRegenConfirm} title="Regenerate Sync Link" message="This will create a new URL. The old URL will stop working immediately. Anyone using the current URL in their calendar app will need the new one." onConfirm={handleRegenerateFeed} onCancel={() => setShowRegenConfirm(false)} loading={feedAction === 'regenerating'} />
      <ConfirmDialog open={showRevokeConfirm} title="Remove Calendar Sync" message="This will permanently disable the sync. Your schedule will no longer appear in any external calendar apps using this link." onConfirm={handleRevokeFeed} onCancel={() => setShowRevokeConfirm(false)} danger loading={feedAction === 'revoking'} />

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        conflicts={conflictData.conflicts}
        overrideReason={conflictData.reason}
        branchId={conflictData.branchId}
      />
    </div>
  );
}
