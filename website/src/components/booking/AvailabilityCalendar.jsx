import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_STYLES = {
  available:    'bg-emerald-50 text-neutral-900 hover:bg-emerald-100 border-emerald-200/60 cursor-pointer',
  few_left:     'bg-amber-50 text-neutral-900 hover:bg-amber-100 border-amber-200/60 cursor-pointer',
  fully_booked: 'bg-red-50/60 text-neutral-900/30 border-neutral-200/40 line-through cursor-not-allowed',
  off:          'bg-neutral-50/40 text-neutral-900/20 border-transparent cursor-not-allowed',
  leave:        'bg-neutral-50/40 text-neutral-900/20 border-transparent cursor-not-allowed',
  past:         'bg-transparent text-neutral-900/15 border-transparent cursor-not-allowed',
  unavailable:  'bg-transparent text-neutral-900/15 border-transparent cursor-not-allowed',
};

const DOT_COLORS = {
  available:    'bg-emerald-400',
  few_left:     'bg-amber-400',
  fully_booked: 'bg-red-300',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Month-view availability calendar.
 * Fetches monthly summary and shows color-coded dates.
 *
 * @param {function} fetchSummary - (month, year) => Promise<{ data: { dates, maxAdvanceDays, minNoticeMinutes } }>
 * @param {string}   selectedDate - YYYY-MM-DD
 * @param {function} onDateSelect - (dateStr) => void
 * @param {boolean}  compact      - smaller variant for sidebar
 */
export default function AvailabilityCalendar({
  fetchSummary,
  selectedDate,
  onDateSelect,
  compact = false,
  className = '',
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [dates, setDates] = useState({});
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState({ maxAdvanceDays: 60, minNoticeMinutes: 60 });

  // Fetch summary when month changes
  useEffect(() => {
    if (!fetchSummary) return;
    setLoading(true);
    fetchSummary(viewMonth, viewYear)
      .then((res) => {
        const d = res?.data || res;
        setDates(d.dates || {});
        if (d.maxAdvanceDays) setPolicies({ maxAdvanceDays: d.maxAdvanceDays, minNoticeMinutes: d.minNoticeMinutes || 60 });
      })
      .catch(() => setDates({}))
      .finally(() => setLoading(false));
  }, [fetchSummary, viewMonth, viewYear]);

  // Calendar grid data
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const rows = [];
    let week = new Array(firstDay).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`;
      const status = dates[dateStr] || (dateStr < todayStr ? 'past' : 'available');
      week.push({ day: d, dateStr, status });
      if (week.length === 7) {
        rows.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return rows;
  }, [viewYear, viewMonth, dates, todayStr]);

  const navPrev = useCallback(() => {
    // Don't go before current month
    if (viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1) return;
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth, viewYear, today]);

  const navNext = useCallback(() => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isPrevDisabled = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const cellSize = compact ? 'w-8 h-8 text-[11px]' : 'w-9 h-9 text-xs';

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={navPrev}
          disabled={isPrevDisabled}
          className={`p-1.5 rounded-lg transition ${isPrevDisabled ? 'text-neutral-900/15 cursor-not-allowed' : 'text-neutral-900/50 hover:bg-neutral-100 hover:text-neutral-900'}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className={`font-semibold text-neutral-900 ${compact ? 'text-xs' : 'text-sm'}`}>{monthLabel}</span>
        <button
          onClick={navNext}
          className="p-1.5 rounded-lg text-neutral-900/50 hover:bg-neutral-100 hover:text-neutral-900 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className={`text-center font-medium text-neutral-900/30 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.flat().map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} className={cellSize} />;
            }

            const { day, dateStr, status } = cell;
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            const isClickable = status === 'available' || status === 'few_left';

            return (
              <button
                key={dateStr}
                disabled={!isClickable}
                onClick={() => isClickable && onDateSelect(dateStr)}
                className={`${cellSize} rounded-lg flex flex-col items-center justify-center relative transition-all border ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm shadow-primary-600/20'
                    : STATUS_STYLES[status] || STATUS_STYLES.unavailable
                } ${isToday && !isSelected ? 'ring-1 ring-primary-400/40' : ''}`}
                title={
                  status === 'available' ? 'Available' :
                  status === 'few_left' ? 'Few slots left' :
                  status === 'fully_booked' ? 'Fully booked' :
                  status === 'leave' ? 'Doctor on leave' :
                  status === 'off' ? 'Not available' : ''
                }
              >
                <span className="font-medium">{day}</span>
                {/* Status dot */}
                {!isSelected && DOT_COLORS[status] && (
                  <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${DOT_COLORS[status]}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className={`flex items-center gap-3 mt-3 flex-wrap ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <span className="flex items-center gap-1 text-neutral-900/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Available
        </span>
        <span className="flex items-center gap-1 text-neutral-900/40">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Few left
        </span>
        <span className="flex items-center gap-1 text-neutral-900/40">
          <span className="w-1.5 h-1.5 rounded-full bg-red-300" /> Full
        </span>
        <span className="flex items-center gap-1 text-neutral-900/40">
          <span className="w-2 h-0.5 bg-neutral-900/15 rounded" /> Off
        </span>
      </div>

      {/* Policy info */}
      {policies.minNoticeMinutes > 0 && (
        <p className={`mt-2 text-neutral-900/30 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          Book at least {policies.minNoticeMinutes >= 60 ? `${Math.round(policies.minNoticeMinutes / 60)}h` : `${policies.minNoticeMinutes}min`} in advance
          {policies.maxAdvanceDays && ` / up to ${policies.maxAdvanceDays} days ahead`}
        </p>
      )}
    </div>
  );
}
