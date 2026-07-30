import { useState, useMemo, useCallback, useRef } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales,
});

// ─── Status-based event colors ─────────────────
const STATUS_COLORS = {
  requested:   { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  confirmed:   { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
  checked_in:  { bg: '#FDE68A', border: '#D97706', text: '#78350F' },
  in_progress: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  completed:   { bg: '#F3F4F6', border: '#9CA3AF', text: '#374151' },
  cancelled:   { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  no_show:     { bg: '#FCE7F3', border: '#EC4899', text: '#831843' },
};

const SOURCE_LABELS = {
  chatbot: 'Bot',
  general: '',
  walk_in: 'Walk-in',
  portal: 'Portal',
};

// ─── Custom Event Component ────────────────────
function EventComponent({ event }) {
  const colors = STATUS_COLORS[event.resource?.status] || STATUS_COLORS.confirmed;
  const source = event.resource?.source;
  const type = event.resource?.type;
  const doctor = event.resource?.doctor;
  const startTime = event.start
    ? event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  return (
    <div
      className="px-2 py-1.5 rounded-md text-[11px] leading-tight overflow-hidden h-full cursor-pointer"
      style={{
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <div className="flex items-center gap-1">
        <div className="font-semibold truncate flex-1">{event.title}</div>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: colors.border }}
        />
      </div>
      {doctor && (
        <div className="text-[10px] opacity-70 truncate mt-0.5">{doctor}</div>
      )}
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] opacity-60">{startTime}</span>
        {type && type !== 'consultation' && (
          <span className="text-[9px] opacity-50 capitalize ml-auto truncate">{type.replace(/_/g, ' ')}</span>
        )}
        {source && source !== 'general' && !type && (
          <span className="text-[9px] opacity-50 ml-auto shrink-0">{SOURCE_LABELS[source] || source}</span>
        )}
      </div>
    </div>
  );
}

// ─── Month Event Component (compact) ──────────
function MonthEventComponent({ event }) {
  const colors = STATUS_COLORS[event.resource?.status] || STATUS_COLORS.confirmed;
  const startTime = event.start
    ? event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  return (
    <div className="flex items-center gap-1.5 text-[10px] leading-snug truncate">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: colors.border }}
      />
      <span className="font-semibold truncate" style={{ color: colors.text }}>
        {startTime}
      </span>
      <span className="truncate opacity-80" style={{ color: colors.text }}>
        {event.title}
      </span>
    </div>
  );
}

// ─── Helper: Date → YYYY-MM-DD string ────────
function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Custom Toolbar ────────────────────────────
function CustomToolbar({ label, onNavigate, onView, view, date, toolbarExtra, agendaLength, onAgendaRangeChange }) {
  const viewOptions = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'agenda', label: 'Agenda' },
  ];

  // Check if current calendar date is today
  const today = new Date();
  const isOnToday = date &&
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  // Agenda date range values
  const agendaFrom = date ? toDateString(date) : '';
  const agendaTo = date && agendaLength
    ? toDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + agendaLength))
    : '';

  const handleAgendaFromChange = (e) => {
    const newFrom = new Date(e.target.value + 'T00:00:00');
    if (isNaN(newFrom)) return;
    const existingTo = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + (agendaLength || 7)) : new Date();
    onAgendaRangeChange?.(newFrom, existingTo);
  };

  const handleAgendaToChange = (e) => {
    const newTo = new Date(e.target.value + 'T00:00:00');
    if (isNaN(newTo)) return;
    if (date && newTo > date) {
      onAgendaRangeChange?.(date, newTo);
    }
  };

  const isAgenda = view === 'agenda';
  const dateInputClasses = 'px-2.5 py-1 border border-neutral-300/60 rounded-lg text-xs font-medium text-neutral-900 bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all cursor-pointer';

  return (
    <div className="mb-4 px-1 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('TODAY')}
            disabled={isOnToday}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              isOnToday
                ? 'border-primary-200 bg-primary-50 text-primary-600 cursor-default'
                : 'border-neutral-300/60 text-neutral-900/60 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Today
          </button>
          <div className="flex items-center rounded-lg border border-neutral-300/60 overflow-hidden">
            <button
              onClick={() => onNavigate('PREV')}
              className="p-1.5 text-neutral-900/40 hover:bg-neutral-100 hover:text-neutral-900/70 transition border-r border-neutral-300/60"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => onNavigate('NEXT')}
              className="p-1.5 text-neutral-900/40 hover:bg-neutral-100 hover:text-neutral-900/70 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Date label — clickable date pickers in agenda mode, plain text otherwise */}
          {isAgenda && onAgendaRangeChange ? (
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="date"
                value={agendaFrom}
                onChange={handleAgendaFromChange}
                className={dateInputClasses}
                title="Agenda start date"
              />
              <span className="text-xs text-neutral-900/30">–</span>
              <input
                type="date"
                value={agendaTo}
                onChange={handleAgendaToChange}
                min={agendaFrom}
                className={dateInputClasses}
                title="Agenda end date"
              />
            </div>
          ) : (
            <h3 className="text-sm font-semibold text-neutral-900 ml-1">{label}</h3>
          )}
        </div>

        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          {viewOptions.map((v) => (
            <button
              key={v.key}
              onClick={() => onView(v.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === v.key
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-900/40 hover:text-neutral-900/60'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {toolbarExtra && (
        <div className="border-t border-neutral-300/40 pt-3">
          {toolbarExtra}
        </div>
      )}
    </div>
  );
}

// ─── Scroll-to-time default ───────────────────
function getScrollToTime() {
  const now = new Date();
  // Scroll to 1 hour before current time, clamped to 8 AM min
  const scrollHour = Math.max(8, now.getHours() - 1);
  return new Date(1970, 0, 1, scrollHour, 0, 0);
}

/**
 * CalendarView — shared react-big-calendar wrapper
 *
 * Supports controlled view (pass `view` + `onView`) or uncontrolled (just `defaultView`).
 */
export default function CalendarView({
  events = [],
  defaultView = 'week',
  view: controlledView,
  onView: onViewChange,
  date,
  onNavigate,
  onSelectEvent,
  onSelectSlot,
  selectable = false,
  className = '',
  minHeight = 650,
  toolbarExtra,
  agendaLength = 7,
  onAgendaRangeChange,
}) {
  // ─── Internal view state (for uncontrolled usage) ─
  const [internalView, setInternalView] = useState(defaultView);
  const currentView = controlledView ?? internalView;

  const handleViewChange = useCallback((newView) => {
    setInternalView(newView);
    onViewChange?.(newView);
  }, [onViewChange]);

  // ─── Event style getter ──────────────────────
  const eventStyleGetter = useCallback((event) => {
    const colors = STATUS_COLORS[event.resource?.status] || STATUS_COLORS.confirmed;
    return {
      style: {
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        color: colors.text,
        borderRadius: '6px',
        border: 'none',
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid',
        borderLeftColor: colors.border,
        padding: 0,
        fontSize: '11px',
        cursor: 'pointer',
      },
    };
  }, []);

  // ─── Day cell styling ──────────────────────────
  const dayPropGetter = useCallback((date) => {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    if (isToday) {
      return { style: { backgroundColor: 'rgba(79, 70, 229, 0.03)' } };
    }
    return {};
  }, []);

  // ─── Time range formats ──────────────────────
  const formats = useMemo(() => ({
    timeGutterFormat: (date, culture, localizer) =>
      localizer.format(date, 'h:mm a', culture),
    eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
      `${localizer.format(start, 'h:mm a', culture)} - ${localizer.format(end, 'h:mm a', culture)}`,
    dayHeaderFormat: (date, culture, localizer) =>
      localizer.format(date, 'EEEE, MMMM d', culture),
    dayRangeHeaderFormat: ({ start, end }, culture, localizer) =>
      `${localizer.format(start, 'MMMM d', culture)} – ${localizer.format(end, 'MMMM d, yyyy', culture)}`,
    agendaDateFormat: (date, culture, localizer) =>
      localizer.format(date, 'EEE, MMM d', culture),
    agendaTimeFormat: (date, culture, localizer) =>
      localizer.format(date, 'h:mm a', culture),
    agendaTimeRangeFormat: ({ start, end }, culture, localizer) =>
      `${localizer.format(start, 'h:mm a', culture)} – ${localizer.format(end, 'h:mm a', culture)}`,
  }), []);

  // ─── Stable ref for toolbar extras (avoids unmount/remount) ─
  const toolbarExtrasRef = useRef({ toolbarExtra, agendaLength, onAgendaRangeChange });
  toolbarExtrasRef.current = { toolbarExtra, agendaLength, onAgendaRangeChange };

  // Stable toolbar — identity never changes, reads latest values from ref
  const StableToolbar = useCallback((props) => {
    const { toolbarExtra: te, agendaLength: al, onAgendaRangeChange: oarc } = toolbarExtrasRef.current;
    return <CustomToolbar {...props} toolbarExtra={te} agendaLength={al} onAgendaRangeChange={oarc} />;
  }, []);

  const components = useMemo(() => ({
    event: currentView === 'month' ? MonthEventComponent : EventComponent,
    toolbar: StableToolbar,
  }), [currentView, StableToolbar]);

  const scrollToTime = useMemo(() => getScrollToTime(), []);

  return (
    <div className={`calendar-wrapper ${className}`}>
      <style>{`
        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }
        .calendar-wrapper .rbc-header {
          padding: 8px 4px;
          font-size: 12px;
          font-weight: 600;
          color: var(--color-neutral-900, #1a1a2e);
          opacity: 0.5;
          border-bottom: 1px solid #f0ede6;
          background: #faf9f6;
        }
        .calendar-wrapper .rbc-time-header-gutter {
          background: #faf9f6;
        }
        .calendar-wrapper .rbc-time-view,
        .calendar-wrapper .rbc-month-view {
          border: 1px solid #e8e4dc;
          border-radius: 12px;
          overflow: hidden;
        }
        .calendar-wrapper .rbc-time-content {
          border-top: 1px solid #e8e4dc;
        }
        .calendar-wrapper .rbc-timeslot-group {
          border-bottom: 1px solid #f5f3ee;
          min-height: 60px;
        }
        .calendar-wrapper .rbc-time-slot {
          border-top: none;
        }
        .calendar-wrapper .rbc-day-slot .rbc-time-slot {
          border-top: 1px dotted #f0ede6;
        }
        .calendar-wrapper .rbc-time-gutter .rbc-timeslot-group {
          border-bottom: none;
        }
        .calendar-wrapper .rbc-label {
          font-size: 11px;
          color: rgba(26, 26, 46, 0.35);
          padding: 0 8px;
        }
        .calendar-wrapper .rbc-today {
          background-color: rgba(79, 70, 229, 0.03);
        }
        .calendar-wrapper .rbc-current-time-indicator {
          background-color: #4F46E5;
          height: 2px;
        }
        .calendar-wrapper .rbc-current-time-indicator::before {
          content: '';
          position: absolute;
          left: -4px;
          top: -3px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4F46E5;
        }
        .calendar-wrapper .rbc-event {
          border: none !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          border-radius: 6px;
          margin: 1px 2px;
        }
        .calendar-wrapper .rbc-event:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          transform: translateY(-1px);
          transition: all 0.15s ease;
          z-index: 10;
        }
        .calendar-wrapper .rbc-event:focus {
          outline: 2px solid #4F46E5;
          outline-offset: 1px;
        }
        .calendar-wrapper .rbc-event.rbc-selected {
          box-shadow: 0 0 0 2px #4F46E5;
        }
        .calendar-wrapper .rbc-slot-selection {
          background-color: rgba(79, 70, 229, 0.1);
          border: 1px dashed #4F46E5;
          border-radius: 4px;
        }
        .calendar-wrapper .rbc-month-row + .rbc-month-row {
          border-top: 1px solid #f0ede6;
        }
        .calendar-wrapper .rbc-date-cell {
          padding: 4px 8px;
          font-size: 12px;
          color: rgba(26, 26, 46, 0.5);
        }
        .calendar-wrapper .rbc-date-cell.rbc-now {
          font-weight: 700;
          color: #4F46E5;
        }
        .calendar-wrapper .rbc-off-range-bg {
          background: #faf9f6;
        }
        .calendar-wrapper .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid #f0ede6;
        }
        .calendar-wrapper .rbc-month-view .rbc-event {
          margin: 1px 2px;
          padding: 1px 4px;
          border-radius: 4px;
          font-size: 10px;
        }
        .calendar-wrapper .rbc-show-more {
          font-size: 11px;
          color: #4F46E5;
          font-weight: 500;
          padding: 2px 4px;
        }
        .calendar-wrapper .rbc-allday-cell {
          display: none;
        }
        .calendar-wrapper .rbc-time-header-content > .rbc-row.rbc-row-resource {
          border-bottom: none;
        }
        /* Agenda view styling */
        .calendar-wrapper .rbc-agenda-view {
          border: 1px solid #e8e4dc;
          border-radius: 12px;
          overflow: hidden;
        }
        .calendar-wrapper .rbc-agenda-view table {
          border: none;
        }
        .calendar-wrapper .rbc-agenda-view thead th {
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(26, 26, 46, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: #faf9f6;
          border-bottom: 1px solid #e8e4dc;
        }
        .calendar-wrapper .rbc-agenda-view tbody tr {
          border-bottom: 1px solid #f5f3ee;
        }
        .calendar-wrapper .rbc-agenda-view tbody td {
          padding: 8px 12px;
          font-size: 13px;
          color: #1a1a2e;
          vertical-align: middle;
        }
        .calendar-wrapper .rbc-agenda-date-cell {
          font-weight: 600;
          color: rgba(26, 26, 46, 0.7);
          white-space: nowrap;
        }
        .calendar-wrapper .rbc-agenda-time-cell {
          font-size: 12px;
          color: rgba(26, 26, 46, 0.5);
          white-space: nowrap;
        }
        .calendar-wrapper .rbc-agenda-event-cell {
          cursor: pointer;
        }
        .calendar-wrapper .rbc-agenda-empty {
          text-align: center;
          padding: 40px 20px;
          color: rgba(26, 26, 46, 0.35);
          font-size: 14px;
        }
      `}</style>
      <Calendar
        localizer={localizer}
        events={events}
        view={currentView}
        onView={handleViewChange}
        date={date}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        onSelectSlot={onSelectSlot}
        selectable={selectable}
        components={components}
        eventPropGetter={eventStyleGetter}
        dayPropGetter={dayPropGetter}
        formats={formats}
        step={15}
        timeslots={2}
        min={new Date(1970, 0, 1, 8, 0, 0)}
        max={new Date(1970, 0, 1, 20, 0, 0)}
        scrollToTime={scrollToTime}
        style={{ minHeight }}
        popup
        showMultiDayTimes
        length={agendaLength}
        tooltipAccessor={null}
      />
    </div>
  );
}
