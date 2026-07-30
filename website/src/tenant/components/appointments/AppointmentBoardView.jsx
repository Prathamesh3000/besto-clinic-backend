import { useState, useEffect, useMemo } from 'react';
import { Clock, Video, User } from 'lucide-react';
import { Spinner, EmptyState, ErrorAlert } from '../../../platform/components/shared';
import { listAppointments } from '../../api';
import {
  BOARD_COLUMNS, APPOINTMENT_STATUS_STYLES,
  TYPE_CONFIG, SOURCE_STYLES,
} from './appointment-constants';
import { displayTime } from '../../../utils/fakeUtcTime';

// ─── Appointment Card ────────────────────────────────────
function AppointmentCard({ appointment, onClick }) {
  const a = appointment;
  const typeConf = TYPE_CONFIG[a.type] || TYPE_CONFIG.consultation;
  const sourceConf = SOURCE_STYLES[a.source] || SOURCE_STYLES.general;
  const isLive = a.type === 'teleconsult' && a.status === 'in_progress';
  // scheduledAt is fake-UTC (IST wall clock + Z) — must be read via getUTC*, not local time
  const time = a.scheduledAt ? displayTime(a.scheduledAt) : '—';

  return (
    <button
      onClick={() => onClick(a._id)}
      className="w-full text-left bg-white rounded-xl border border-neutral-200 p-3.5 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 group"
    >
      {/* Top row: Patient + Time */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 text-[11px] font-bold shrink-0">
            {a.patient?.name?.charAt(0) || '?'}
          </div>
          <p className="text-sm font-medium text-neutral-900 truncate">{a.patient?.name || 'Unknown'}</p>
        </div>
        <span className="text-[11px] text-neutral-400 whitespace-nowrap">{time}</span>
      </div>

      {/* Doctor */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <User className="h-3 w-3 text-neutral-400" />
        <span className="text-xs text-neutral-500 truncate">{a.doctor?.name || 'Unassigned'}</span>
        {a.doctor?.specialization && (
          <span className="text-[10px] text-neutral-400">· {a.doctor.specialization}</span>
        )}
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Type */}
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-neutral-50 border border-neutral-200 ${typeConf.color}`}>
          <typeConf.Icon className="h-2.5 w-2.5" />
          {typeConf.label}
        </span>
        {/* Source */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceConf.bg} ${sourceConf.text}`}>
          {sourceConf.label}
        </span>
      </div>

      {/* Footer: Duration + Live indicator */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-neutral-100">
        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
          <Clock className="h-3 w-3" />
          {a.duration || 30}min
        </span>
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live
          </span>
        )}
        {a.type === 'teleconsult' && !isLive && (
          <Video className="h-3.5 w-3.5 text-teal-500" />
        )}
      </div>
    </button>
  );
}

// ─── Board Column ────────────────────────────────────────
function BoardColumn({ column, appointments, onSelect }) {
  const style = APPOINTMENT_STATUS_STYLES[column.key] || {};
  return (
    <div className="flex flex-col min-w-[260px] w-[260px]">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 mb-3 rounded-xl bg-neutral-50 border border-neutral-200">
        <span className={`w-2 h-2 rounded-full ${style.dot || 'bg-neutral-400'}`} />
        <span className="text-xs font-semibold text-neutral-700">{column.label}</span>
        <span className="ml-auto text-[11px] font-medium text-neutral-400 bg-neutral-200/60 px-1.5 py-0.5 rounded-md">
          {appointments.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0 pr-1 pb-2">
        {appointments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-neutral-400">
            No appointments
          </div>
        ) : (
          appointments.map((a) => (
            <AppointmentCard key={a._id} appointment={a} onClick={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Board View ─────────────────────────────────────
export default function AppointmentBoardView({ filters, onSelectAppointment, refreshKey }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { limit: 200 };
        if (filters.doctor) params.doctor = filters.doctor;
        if (filters.branch) params.branch = filters.branch;
        if (filters.status) params.status = filters.status;
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
        // Default to today if no date filter
        if (!filters.from && !filters.to) {
          const today = new Date().toISOString().split('T')[0];
          params.from = today;
          params.to = today;
        }

        const res = await listAppointments(params);
        if (!cancelled) {
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
          setAppointments(items);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load appointments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [filters, refreshKey]);

  // Group by status
  const grouped = useMemo(() => {
    const map = {};
    BOARD_COLUMNS.forEach((col) => { map[col.key] = []; });
    appointments.forEach((a) => {
      if (map[a.status]) map[a.status].push(a);
    });
    return map;
  }, [appointments]);

  if (error) return <ErrorAlert message={error} />;
  if (loading) return <Spinner />;

  if (appointments.length === 0) {
    return <EmptyState title="No appointments for today" message="Adjust date filters or create a new appointment" />;
  }

  return (
    <div className="flex gap-4 overflow-x-auto h-full pb-4">
      {BOARD_COLUMNS.map((col) => (
        <BoardColumn
          key={col.key}
          column={col}
          appointments={grouped[col.key]}
          onSelect={onSelectAppointment}
        />
      ))}
    </div>
  );
}
