import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Clock, CalendarOff, Palmtree,
  GraduationCap, Briefcase, HeartPulse, HelpCircle, Coffee,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const LEAVE_TYPE_CONFIG = {
  planned:    { label: 'Planned Leave', icon: CalendarOff, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  sick:       { label: 'Sick Leave', icon: HeartPulse, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  personal:   { label: 'Personal', icon: Palmtree, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  conference: { label: 'Conference', icon: GraduationCap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  other:      { label: 'Other', icon: HelpCircle, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
};

const cardCls = 'bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)]';

// ─── Helpers ─────────────────────────────────────
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function isDateInRange(date, start, end) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);
  return d >= s && d <= e;
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const days = [];

  // Previous month padding
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLast - i),
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    days.push({
      date: new Date(year, month, d),
      isCurrentMonth: true,
    });
  }

  // Next month padding (fill to 42 cells = 6 rows)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      date: new Date(year, month + 1, d),
      isCurrentMonth: false,
    });
  }

  return days;
}

// ─── Day Cell Component ──────────────────────────
function DayCell({ day, schedule, leaves, isToday, onSelect, isSelected }) {
  const dayOfWeek = DAY_MAP[day.date.getDay()];
  const daySchedule = schedule?.weeklySchedule?.find((d) => d.day === dayOfWeek);
  const isWorking = daySchedule?.isWorking ?? false;

  // Check if this day has any leaves
  const dayLeaves = leaves.filter((l) =>
    isDateInRange(day.date, l.startDate, l.endDate),
  );
  const isOnLeave = dayLeaves.length > 0;
  const leaveInfo = dayLeaves[0]; // Primary leave
  const leaveConfig = leaveInfo ? (LEAVE_TYPE_CONFIG[leaveInfo.leaveType] || LEAVE_TYPE_CONFIG.other) : null;

  // Determine cell styling
  let cellBg = '';
  let textColor = 'text-neutral-900/80';
  let statusIndicator = null;

  if (!day.isCurrentMonth) {
    cellBg = 'bg-neutral-50/30';
    textColor = 'text-neutral-900/20';
  } else if (isOnLeave) {
    cellBg = `${leaveConfig.bg}`;
    statusIndicator = (
      <div className={`flex items-center gap-1 mt-1 ${leaveConfig.color}`}>
        <leaveConfig.icon className="h-3 w-3" />
        <span className="text-[9px] font-medium leading-tight truncate">{leaveConfig.label}</span>
      </div>
    );
  } else if (isWorking) {
    cellBg = 'bg-emerald-50/50';
    statusIndicator = (
      <div className="mt-1">
        <span className="text-[10px] font-semibold text-emerald-600 leading-tight">
          {daySchedule.startTime}–{daySchedule.endTime}
        </span>
        {daySchedule.breakStart && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <Coffee className="h-2.5 w-2.5 text-neutral-900/25" />
            <span className="text-[9px] text-neutral-900/30">
              {daySchedule.breakStart}–{daySchedule.breakEnd}
            </span>
          </div>
        )}
      </div>
    );
  } else {
    cellBg = 'bg-neutral-900/[0.02]';
    statusIndicator = (
      <span className="text-[10px] font-medium text-neutral-900/25 mt-1">OFF</span>
    );
  }

  return (
    <motion.button
      whileHover={day.isCurrentMonth ? { scale: 1.02 } : {}}
      whileTap={day.isCurrentMonth ? { scale: 0.98 } : {}}
      onClick={() => day.isCurrentMonth && onSelect?.(day)}
      className={`
        relative flex flex-col items-start p-1.5 sm:p-2 min-h-[72px] sm:min-h-[88px] rounded-xl border transition-all text-left w-full
        ${cellBg}
        ${isSelected ? 'ring-2 ring-primary-500/50 border-primary-300' : 'border-transparent hover:border-neutral-300/60'}
        ${!day.isCurrentMonth ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      {/* Date number */}
      <span className={`
        text-xs sm:text-sm font-semibold leading-none
        ${isToday ? 'bg-primary-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : textColor}
      `}>
        {day.date.getDate()}
      </span>

      {/* Status indicator */}
      {day.isCurrentMonth && statusIndicator}

      {/* Leave status badge */}
      {day.isCurrentMonth && isOnLeave && leaveInfo.status === 'pending' && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Pending approval" />
      )}
    </motion.button>
  );
}

// ─── Detail Panel for selected day ──────────────
function DayDetailPanel({ day, schedule, leaves }) {
  const dayOfWeek = DAY_MAP[day.date.getDay()];
  const daySchedule = schedule?.weeklySchedule?.find((d) => d.day === dayOfWeek);
  const isWorking = daySchedule?.isWorking ?? false;

  const dayLeaves = leaves.filter((l) =>
    isDateInRange(day.date, l.startDate, l.endDate),
  );

  const dateStr = day.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`${cardCls} p-5 mt-4`}
    >
      <h4 className="text-sm font-bold text-neutral-900 mb-3">{dateStr}</h4>

      {/* Working hours */}
      {isWorking && !dayLeaves.length ? (
        <div className="flex items-start gap-3 p-3 bg-emerald-50/80 rounded-xl border border-emerald-100">
          <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Working Day</p>
            <p className="text-xs text-emerald-600/80 mt-0.5">
              {daySchedule.slots && daySchedule.slots.length > 0
                ? daySchedule.slots.map((s) => `${s.startTime}–${s.endTime}`).join(', ')
                : `${daySchedule.startTime} – ${daySchedule.endTime}`}
              {schedule?.slotDuration && <span className="ml-2">({schedule.slotDuration} min slots)</span>}
            </p>
            {!daySchedule.slots?.length && daySchedule.breakStart && (
              <p className="text-xs text-emerald-600/60 mt-0.5 flex items-center gap-1">
                <Coffee className="h-3 w-3" />
                Break: {daySchedule.breakStart} – {daySchedule.breakEnd}
              </p>
            )}
          </div>
        </div>
      ) : !dayLeaves.length ? (
        <div className="flex items-center gap-3 p-3 bg-neutral-50/80 rounded-xl border border-neutral-200">
          <div className="p-2 bg-neutral-100 rounded-lg">
            <CalendarOff className="h-4 w-4 text-neutral-900/40" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900/60">Day Off</p>
            <p className="text-xs text-neutral-900/30">Not scheduled to work</p>
          </div>
        </div>
      ) : null}

      {/* Leaves */}
      {dayLeaves.map((leave) => {
        const cfg = LEAVE_TYPE_CONFIG[leave.leaveType] || LEAVE_TYPE_CONFIG.other;
        const LeaveIcon = cfg.icon;
        const startStr = new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = new Date(leave.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const sameDay = new Date(leave.startDate).toDateString() === new Date(leave.endDate).toDateString();

        return (
          <div key={leave._id || leave.id} className={`flex items-start gap-3 p-3 ${cfg.bg} rounded-xl border ${cfg.border} ${dayLeaves.length > 0 && isWorking ? 'mt-3' : ''}`}>
            <div className={`p-2 rounded-lg shrink-0 ${cfg.bg}`}>
              <LeaveIcon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
                {leave.status === 'pending' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>
                )}
                {leave.status === 'approved' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Approved</span>
                )}
              </div>
              <p className="text-xs text-neutral-900/50 mt-0.5">
                {sameDay ? startStr : `${startStr} – ${endStr}`}
              </p>
              {leave.reason && (
                <p className="text-xs text-neutral-900/40 mt-1 italic">{leave.reason}</p>
              )}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}


// ─── Main Calendar Component ────────────────────
export default function WorkScheduleCalendar({ schedules = [], leaves = [] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  // Use the first schedule (primary branch)
  const schedule = schedules[0] || null;

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  // Count working/off/leave days for this month
  const monthStats = useMemo(() => {
    let working = 0;
    let off = 0;
    let leaveDays = 0;

    calendarDays.forEach(({ date, isCurrentMonth }) => {
      if (!isCurrentMonth) return;
      const dayOfWeek = DAY_MAP[date.getDay()];
      const daySchedule = schedule?.weeklySchedule?.find((d) => d.day === dayOfWeek);
      const isWorking = daySchedule?.isWorking ?? false;
      const isOnLeave = leaves.some((l) => isDateInRange(date, l.startDate, l.endDate));

      if (isOnLeave) leaveDays++;
      else if (isWorking) working++;
      else off++;
    });

    return { working, off, leaveDays };
  }, [calendarDays, schedule, leaves]);

  const navigateMonth = (direction) => {
    setSelectedDay(null);
    if (direction === 'prev') {
      if (month === 0) { setMonth(11); setYear(year - 1); }
      else setMonth(month - 1);
    } else {
      if (month === 11) { setMonth(0); setYear(year + 1); }
      else setMonth(month + 1);
    }
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(null);
  };

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  if (!schedule) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <CalendarOff className="h-10 w-10 text-neutral-900/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-neutral-900/50">No schedule configured</p>
        <p className="text-xs text-neutral-900/30 mt-1">
          Contact your clinic admin to set up your working hours
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar card */}
      <div className={`${cardCls} p-5`}>
        {/* Header: Month nav + stats */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={goToToday}
              disabled={isCurrentMonth}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                isCurrentMonth
                  ? 'border-primary-200 bg-primary-50 text-primary-600 cursor-default'
                  : 'border-neutral-300/60 text-neutral-900/60 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              Today
            </button>
            <div className="flex items-center rounded-lg border border-neutral-300/60 overflow-hidden">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-1.5 text-neutral-900/40 hover:bg-neutral-100 hover:text-neutral-900/70 transition border-r border-neutral-300/60"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateMonth('next')}
                className="p-1.5 text-neutral-900/40 hover:bg-neutral-100 hover:text-neutral-900/70 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-sm font-bold text-neutral-900 ml-1">
              {MONTH_NAMES[month]} {year}
            </h3>
          </div>

          {/* Month stats pills */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              {monthStats.working} working
            </span>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-900/50 font-medium">
              {monthStats.off} off
            </span>
            {monthStats.leaveDays > 0 && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                {monthStats.leaveDays} leave
              </span>
            )}
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="text-center text-[11px] font-semibold text-neutral-900/40 py-2 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(({ date, isCurrentMonth }, idx) => (
            <DayCell
              key={idx}
              day={{ date, isCurrentMonth }}
              schedule={schedule}
              leaves={leaves}
              isToday={isSameDay(date, today)}
              isSelected={selectedDay && isSameDay(date, selectedDay.date)}
              onSelect={setSelectedDay}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-neutral-200/60">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
            <span className="text-[11px] text-neutral-900/40">Working</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-neutral-900/[0.03] border border-neutral-900/10" />
            <span className="text-[11px] text-neutral-900/40">Day Off</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />
            <span className="text-[11px] text-neutral-900/40">Planned Leave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200" />
            <span className="text-[11px] text-neutral-900/40">Conference</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-purple-50 border border-purple-200" />
            <span className="text-[11px] text-neutral-900/40">Personal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />
            <span className="text-[11px] text-neutral-900/40">Sick Leave</span>
          </div>
        </div>
      </div>

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedDay && (
          <DayDetailPanel
            day={selectedDay}
            schedule={schedule}
            leaves={leaves}
          />
        )}
      </AnimatePresence>

      {/* Branch info + slot duration */}
      {schedule.branch && (
        <div className={`${cardCls} p-4 flex items-center gap-3`}>
          <div className="p-2 rounded-xl bg-primary-50">
            <Briefcase className="h-4 w-4 text-primary-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-neutral-900/70">
              {schedule.branch.name || 'Branch'}
            </p>
            <p className="text-[11px] text-neutral-900/30">
              {schedule.slotDuration} min consultation slots
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
