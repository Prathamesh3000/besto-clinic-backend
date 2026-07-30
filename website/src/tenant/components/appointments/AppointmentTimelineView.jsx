import { useState, useEffect, useMemo } from 'react';
import { Clock, Video } from 'lucide-react';
import { Spinner, EmptyState, ErrorAlert } from '../../../platform/components/shared';
import { listAppointments } from '../../api';
import {
  APPOINTMENT_STATUS_STYLES, TYPE_CONFIG, SOURCE_STYLES,
} from './appointment-constants';
import { format } from 'date-fns';
import { stripDrPrefix } from '../../../utils/doctorName';
import { displayTime, fakeUtcMinutes, clinicNowMinutes } from '../../../utils/fakeUtcTime';

// ─── Timeline Card ───────────────────────────────────────
function TimelineCard({ appointment, onClick }) {
  const a = appointment;
  const statusStyle = APPOINTMENT_STATUS_STYLES[a.status] || {};
  const typeConf = TYPE_CONFIG[a.type] || TYPE_CONFIG.consultation;
  const isLive = a.status === 'in_progress';

  return (
    <button
      onClick={() => onClick(a._id)}
      className={`w-full text-left rounded-xl border p-3.5 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ${
        isLive ? 'border-emerald-300 bg-emerald-50/50' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Patient + Status */}
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{a.patient?.name || 'Unknown'}</p>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyle.bg} ${statusStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${isLive ? 'animate-pulse' : ''}`} />
              {statusStyle.label || a.status}
            </span>
          </div>

          {/* Doctor */}
          <p className="text-xs text-neutral-500 mb-1.5">
            Dr. {stripDrPrefix(a.doctor?.name || 'Unassigned')}
            {a.doctor?.specialization && <span className="text-neutral-400"> · {a.doctor.specialization}</span>}
          </p>

          {/* Badges */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-neutral-50 border border-neutral-200 ${typeConf.color}`}>
              <typeConf.Icon className="h-2.5 w-2.5" />
              {typeConf.label}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-neutral-400">
              <Clock className="h-2.5 w-2.5" /> {a.duration || 30}min
            </span>
            {a.type === 'teleconsult' && (
              <Video className="h-3 w-3 text-teal-500" />
            )}
          </div>
        </div>

        {/* Live indicator */}
        {isLive && (
          <span className="relative flex h-3 w-3 mt-1 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main Timeline View ──────────────────────────────────
export default function AppointmentTimelineView({ filters, onSelectAppointment, refreshKey }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().split('T')[0];
        const params = { from: today, to: today, limit: 100, sort: 'scheduledAt' };
        if (filters.doctor) params.doctor = filters.doctor;
        if (filters.branch) params.branch = filters.branch;
        if (filters.status) params.status = filters.status;

        const res = await listAppointments(params);
        if (!cancelled) {
          let items = res.data || [];
          if (filters.type) items = items.filter((a) => a.type === filters.type);
          if (filters.source) items = items.filter((a) => a.source === filters.source);
          if (filters.search) {
            const q = filters.search.toLowerCase();
            items = items.filter((a) =>
              a.patient?.name?.toLowerCase().includes(q) || a.doctor?.name?.toLowerCase().includes(q)
            );
          }
          // Sort by scheduledAt
          items.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
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

  // Compute "now" marker position on the clinic wall clock, so it lines up with
  // the fake-UTC appointment positions below rather than the browser's timezone.
  const nowMinutes = useMemo(() => clinicNowMinutes(now), [now]);

  if (error) return <ErrorAlert message={error} />;
  if (loading) return <Spinner />;
  if (appointments.length === 0) {
    return <EmptyState icon={Clock} title="No appointments today" message="Check back later or create a new appointment" />;
  }

  // Get the time range for the day (fake-UTC — read as clinic wall clock)
  const dayStart = fakeUtcMinutes(appointments[0].scheduledAt);
  const dayEnd = fakeUtcMinutes(appointments[appointments.length - 1].scheduledAt) + 60;

  // Calculate position for the "Now" marker (relative to timeline range)
  const nowPosition = ((nowMinutes - dayStart) / (dayEnd - dayStart)) * 100;
  const showNowMarker = nowPosition >= -5 && nowPosition <= 105;

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-neutral-600">
          Today · <span className="text-neutral-900">{format(now, 'EEEE, MMMM d')}</span>
        </p>
        <p className="text-xs text-neutral-400">{appointments.length} appointments</p>
      </div>

      {/* Timeline */}
      <div className="relative ml-20">
        {/* Vertical connecting line */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-neutral-200" />

        {/* Now marker */}
        {showNowMarker && (
          <div
            className="absolute left-0 right-0 z-10 pointer-events-none"
            style={{ top: `${Math.max(0, Math.min(100, nowPosition))}%` }}
          >
            <div className="flex items-center -ml-20">
              <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded mr-2">
                Now
              </span>
              <div className="flex-1 h-px bg-red-400 opacity-60" />
            </div>
          </div>
        )}

        {/* Appointment entries */}
        {appointments.map((a) => {
          const isActive = a.status === 'in_progress';

          return (
            <div key={a._id} className="relative flex items-start mb-4 last:mb-0">
              {/* Time label */}
              <div className="absolute -left-20 w-16 text-right pr-4">
                <p className={`text-xs font-medium ${isActive ? 'text-emerald-600' : 'text-neutral-500'}`}>
                  {a.scheduledAt ? displayTime(a.scheduledAt) : '—'}
                </p>
              </div>

              {/* Status dot */}
              <div className={`absolute -left-[5px] top-3 w-[10px] h-[10px] rounded-full border-2 border-white z-[1] ${
                APPOINTMENT_STATUS_STYLES[a.status]?.dot || 'bg-neutral-400'
              } ${isActive ? 'ring-4 ring-emerald-100' : ''}`} />

              {/* Card */}
              <div className="ml-5 flex-1">
                <TimelineCard appointment={a} onClick={onSelectAppointment} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
