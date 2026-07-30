import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { EmptyState } from '../../../platform/components/shared';
import { TimelineSkeleton } from './skeletons';

const INITIAL_SHOW = 6;

const STATUS_STYLES = {
  completed:     { dot: 'bg-secondary-500', text: 'text-neutral-700' },
  confirmed:     { dot: 'bg-primary-500',   text: 'text-neutral-700' },
  scheduled:     { dot: 'bg-primary-400',   text: 'text-neutral-700' },
  requested:     { dot: 'bg-primary-300',   text: 'text-neutral-700' },
  'in-progress': { dot: 'bg-purple-500 animate-pulse', text: 'text-purple-700 font-medium' },
  checked_in:    { dot: 'bg-blue-500',      text: 'text-neutral-700' },
  cancelled:     { dot: 'bg-red-400',       text: 'text-neutral-400 line-through' },
  'no-show':     { dot: 'bg-amber-500',     text: 'text-neutral-400' },
};

function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--:--';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function TodayTimeline({ appointments, loading }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (loading) return <TimelineSkeleton />;

  const sorted = [...(appointments || [])].sort((a, b) => {
    const tA = new Date(a.scheduledAt || 0).getTime();
    const tB = new Date(b.scheduledAt || 0).getTime();
    return tA - tB;
  });

  const activeCount = sorted.filter((a) => !['cancelled', 'no-show'].includes(a.status)).length;
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_SHOW);
  const hasMore = sorted.length > INITIAL_SHOW;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Today's Schedule</h3>
            <p className="text-xs text-neutral-500">
              {activeCount > 0 ? `${activeCount} appointment${activeCount !== 1 ? 's' : ''}` : 'No appointments'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/clinic/appointments')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
        >
          View All <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 -mx-1 px-1">
        {sorted.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments today"
            message="Appointments will appear here once scheduled"
          />
        ) : (
          <div className="relative space-y-1">
            {/* Vertical connector line */}
            <div className="absolute left-[72px] top-3 bottom-3 w-px bg-neutral-200" />

            {visible.map((appt, i) => {
              const time = formatTime(appt.scheduledAt);
              const style = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
              const patientName = appt.patientName || appt.patient?.name || 'Unknown';
              const doctorName = appt.doctorName || appt.doctor?.name || '';

              return (
                <div
                  key={appt._id || appt.id || i}
                  className="flex items-center gap-4 py-2.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  {/* Time */}
                  <span className="w-[60px] text-xs font-mono text-neutral-500 text-right shrink-0 tabular-nums">
                    {time}
                  </span>

                  {/* Dot */}
                  <div className="relative z-10 shrink-0">
                    <span className={`block w-2.5 h-2.5 rounded-full ring-2 ring-white ${style.dot}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${style.text}`}>
                      {patientName}
                    </p>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {doctorName}{appt.type ? ` · ${appt.type}` : ''}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize shrink-0 ${
                    appt.status === 'completed' ? 'bg-secondary-50 text-secondary-700' :
                    appt.status === 'in-progress' ? 'bg-purple-50 text-purple-700' :
                    appt.status === 'checked_in' ? 'bg-blue-50 text-blue-700' :
                    appt.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                    appt.status === 'no-show' ? 'bg-amber-50 text-amber-700' :
                    'bg-primary-50 text-primary-700'
                  }`}>
                    {(appt.status || 'scheduled').replace(/[-_]/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View More / View Less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 pt-3 border-t border-neutral-100 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          {expanded ? 'Show Less' : `View ${sorted.length - INITIAL_SHOW} More`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}
