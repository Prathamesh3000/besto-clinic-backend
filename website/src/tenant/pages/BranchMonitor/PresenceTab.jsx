import { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, RefreshCw, Building2, CalendarClock, DoorOpen,
} from 'lucide-react';
import { getDoctorPresence, getAllDoctorSchedules } from '../../api';
import { ErrorAlert, EmptyState } from '../../../platform/components/shared';
import { PRESENCE_STYLES, DAYS, DAY_SHORT, timeAgo, formatTime } from './constants';
import { PresenceSkeleton } from './skeletons';

export default function PresenceTab({ branch, timerRef }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schedules, setSchedules] = useState([]);

  const fetchPresence = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (branch) params.branch = branch;
      const res = await getDoctorPresence(params);
      setData(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load doctor presence');
    } finally {
      setLoading(false);
    }
  }, [branch]);

  const fetchSchedules = useCallback(async () => {
    try {
      const params = { limit: 100 };
      if (branch) params.branch = branch;
      const res = await getAllDoctorSchedules(params);
      setSchedules(Array.isArray(res.data) ? res.data : (res.data?.items || []));
    } catch { /* non-critical */ }
  }, [branch]);

  useEffect(() => {
    fetchPresence();
    fetchSchedules();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchPresence, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchPresence, fetchSchedules]);

  if (error) return <ErrorAlert message={error} />;
  if (loading && data.length === 0) return <PresenceSkeleton />;
  if (data.length === 0) return <EmptyState icon={Stethoscope} title="No doctors found" message="No active doctors in the selected branch." />;

  // Group doctors by status
  const groups = [
    { key: 'consulting', label: 'In Consultation', doctors: data.filter((d) => d.status === 'in_consultation') },
    { key: 'available', label: 'Available', doctors: data.filter((d) => d.status === 'available') },
    { key: 'upcoming', label: 'Upcoming', doctors: data.filter((d) => d.status === 'upcoming') },
    { key: 'away', label: 'Away / Off', doctors: data.filter((d) => ['on_leave', 'shift_ended', 'offline'].includes(d.status)) },
  ].filter((g) => g.doctors.length > 0);

  return (
    <div className="space-y-6">
      {/* Doctor presence table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold font-display text-neutral-900">Doctor Board</h3>
            <p className="text-xs text-neutral-500 mt-0.5">{data.length} doctor{data.length !== 1 ? 's' : ''} on duty today</p>
          </div>
          <button
            onClick={fetchPresence}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition disabled:opacity-30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {groups.map((group) => (
          <div key={group.key}>
            {/* Group header */}
            <div className="px-6 py-2.5 bg-neutral-50 border-b border-neutral-100">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                {group.label} ({group.doctors.length})
              </span>
            </div>

            {/* Doctor rows */}
            {group.doctors.map((d) => {
              const style = PRESENCE_STYLES[d.status] || PRESENCE_STYLES.offline;
              const completedPct = d.appointments?.total > 0
                ? Math.round(((d.appointments.completed || 0) / d.appointments.total) * 100)
                : 0;

              return (
                <div key={d._id} className="px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {(d.name || '?')[0].toUpperCase()}
                    </div>

                    {/* Name + specialization */}
                    <div className="min-w-[140px]">
                      <p className="text-sm font-medium text-neutral-900">{d.name}</p>
                      <p className="text-[11px] text-neutral-500">{d.specialization || 'General'}</p>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <span className={`w-2 h-2 rounded-full ${style.dot} ${style.pulse ? 'animate-pulse' : ''}`} />
                      <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
                    </div>

                    {/* Current patient (if consulting) */}
                    <div className="flex-1 min-w-0">
                      {d.currentPatient ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {(d.currentPatient.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-neutral-700 truncate">{d.currentPatient.name}</p>
                            {d.consultingSince && (
                              <p className="text-[10px] text-neutral-400">{timeAgo(d.consultingSince)}</p>
                            )}
                          </div>
                        </div>
                      ) : d.room ? (
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <DoorOpen className="h-3 w-3" /> {d.room.name}
                        </span>
                      ) : d.nextAppointment ? (
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" /> Next: {d.nextAppointment.patient?.name || 'Patient'} at {formatTime(d.nextAppointment.scheduledAt)}
                        </span>
                      ) : null}
                    </div>

                    {/* Progress */}
                    {d.appointments?.total > 0 && (
                      <div className="w-24 shrink-0">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-neutral-400">{d.appointments.completed || 0}/{d.appointments.total}</span>
                        </div>
                        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${completedPct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Waiting count */}
                    {d.waitingCount > 0 && (
                      <span className="text-xs text-amber-600 font-medium tabular-nums shrink-0">{d.waitingCount} waiting</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Weekly Schedule */}
      {schedules.length > 0 && (
        <ScheduleGrid schedules={schedules} />
      )}
    </div>
  );
}

/* ── Schedule Grid ────────────────────────────── */
function ScheduleGrid({ schedules }) {
  const grouped = {};
  for (const s of schedules) {
    const bid = s.branch?._id || s.branch || 'unknown';
    const bname = s.branch?.name || 'Unknown';
    if (!grouped[bid]) grouped[bid] = { name: bname, items: [] };
    grouped[bid].items.push(s);
  }
  const groups = Object.entries(grouped);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200">
        <h3 className="text-base font-semibold font-display text-neutral-900">Weekly Schedule</h3>
        <p className="text-xs text-neutral-500 mt-0.5">Doctor availability this week</p>
      </div>

      {groups.map(([bid, group]) => (
        <div key={bid}>
          {groups.length > 1 && (
            <div className="px-6 py-2 bg-neutral-50 border-b border-neutral-100 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-primary-500" />
              <span className="text-xs font-semibold text-neutral-600">{group.name}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Doctor</th>
                  {DAYS.map((d) => (
                    <th key={d} className={`text-center py-3 px-2 text-[11px] font-semibold uppercase tracking-wide ${d === today ? 'text-primary-600 bg-primary-50/50' : 'text-neutral-400'}`}>
                      {DAY_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {group.items.map((s) => (
                  <tr key={s._id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                          {(s.doctor?.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-neutral-700">{s.doctor?.name || '--'}</span>
                      </div>
                    </td>
                    {DAYS.map((day) => {
                      const ds = (s.weeklySchedule || []).find((d) => d.day === day);
                      const isToday = day === today;
                      return (
                        <td key={day} className={`py-3 px-2 text-center ${isToday ? 'bg-primary-50/30' : ''}`}>
                          {ds && ds.isWorking ? (
                            <span className={`text-[11px] font-medium ${isToday ? 'text-primary-700 font-semibold' : 'text-primary-600'}`}>
                              {ds.startTime}-{ds.endTime}
                            </span>
                          ) : (
                            <span className="text-[11px] text-neutral-300">OFF</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
