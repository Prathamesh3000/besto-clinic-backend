import { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner, ErrorAlert } from '../../../platform/components/shared';
import CalendarView from '../CalendarView';
import { listAppointments } from '../../api';
import { TYPE_CONFIG, SOURCE_STYLES } from './appointment-constants';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, format } from 'date-fns';
import { fakeUtcToLocal } from '../../../utils/fakeUtcTime';

// ─── Compute visible date range for a calendar view mode ─
function getDateRange(date, view) {
  switch (view) {
    case 'month': {
      const ms = startOfMonth(date);
      const me = endOfMonth(date);
      return { from: startOfWeek(ms), to: endOfWeek(me) };
    }
    case 'week':
      return { from: startOfWeek(date), to: endOfWeek(date) };
    case 'day':
      return { from: date, to: date };
    case 'agenda':
      return { from: date, to: addDays(date, 7) };
    default:
      return { from: startOfWeek(date), to: endOfWeek(date) };
  }
}

// ─── Map appointment → calendar event ────────────────────
function toCalendarEvent(a) {
  // react-big-calendar positions events by LOCAL getters, but scheduledAt is
  // fake-UTC (clinic wall clock stamped with Z). Hand it the raw Date and every
  // appointment lands +5:30 from where it should be on the grid.
  const start = fakeUtcToLocal(a.scheduledAt);
  const end = new Date(start.getTime() + (a.duration || 30) * 60000);
  const typeConf = TYPE_CONFIG[a.type] || TYPE_CONFIG.consultation;
  const sourceConf = SOURCE_STYLES[a.source] || SOURCE_STYLES.general;

  return {
    id: a._id,
    title: a.patient?.name || 'Appointment',
    start,
    end,
    resource: {
      status: a.status,
      type: a.type,
      source: a.source,
      typeLabel: typeConf.label,
      sourceLabel: sourceConf.label,
      doctor: a.doctor?.name,
      patientId: a.patient?.patientId,
    },
  };
}

// ─── Main Calendar View Wrapper ──────────────────────────
export default function AppointmentCalendarView({ filters, onSelectAppointment, onSlotClick, refreshKey, fillHeight = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [calDate, setCalDate] = useState(new Date());
  const [calView, setCalView] = useState('week');

  // Compute date range from current calendar view
  const { from, to } = useMemo(() => getDateRange(calDate, calView), [calDate, calView]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        from: format(from, 'yyyy-MM-dd'),
        to: format(to, 'yyyy-MM-dd'),
        limit: 500,
      };
      if (filters.doctor) params.doctor = filters.doctor;
      if (filters.branch) params.branch = filters.branch;
      if (filters.status) params.status = filters.status;

      const res = await listAppointments(params);
      let items = res.data || [];

      // Client-side filters
      if (filters.type) items = items.filter((a) => a.type === filters.type);
      if (filters.source) items = items.filter((a) => a.source === filters.source);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        items = items.filter((a) =>
          a.patient?.name?.toLowerCase().includes(q) || a.doctor?.name?.toLowerCase().includes(q)
        );
      }

      setEvents(items.map(toCalendarEvent));
    } catch (err) {
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [from, to, filters]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  const handleSelectEvent = useCallback((event) => {
    onSelectAppointment(event.id);
  }, [onSelectAppointment]);

  const handleSelectSlot = useCallback((slotInfo) => {
    if (onSlotClick) {
      onSlotClick({
        date: format(slotInfo.start, 'yyyy-MM-dd'),
        startTime: format(slotInfo.start, 'HH:mm'),
        endTime: slotInfo.end ? format(slotInfo.end, 'HH:mm') : undefined,
      });
    }
  }, [onSlotClick]);

  if (error) return <ErrorAlert message={error} />;

  return (
    <div className={`relative ${fillHeight ? 'h-full' : ''}`}>
      {/* When fillHeight, force calendar and all inner containers to stretch */}
      {fillHeight && (
        <style>{`
          .cal-fill-h { height: 100%; min-height: 620px; display: flex; flex-direction: column; }
          .cal-fill-h .calendar-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; }
          .cal-fill-h .calendar-wrapper .rbc-calendar { flex: 1; }
          .cal-fill-h .calendar-wrapper .rbc-time-view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
          .cal-fill-h .calendar-wrapper .rbc-time-content { flex: 1; min-height: 0; overflow-y: auto; }
          .cal-fill-h .calendar-wrapper .rbc-month-view { flex: 1; display: flex; flex-direction: column; }
          .cal-fill-h .calendar-wrapper .rbc-month-row { flex: 1; min-height: 80px; }
          .cal-fill-h .calendar-wrapper .rbc-agenda-view { flex: 1; }
        `}</style>
      )}
      {loading && events.length === 0 && <Spinner />}
      {(!loading || events.length > 0) && (
        <div className={fillHeight ? 'cal-fill-h h-full' : ''}>
          <CalendarView
            events={events}
            defaultView="week"
            view={calView}
            onView={setCalView}
            date={calDate}
            onNavigate={setCalDate}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            selectable
            minHeight={620}
          />
        </div>
      )}
    </div>
  );
}
