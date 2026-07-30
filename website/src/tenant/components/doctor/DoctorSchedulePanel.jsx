import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Clock, Play, Check, Ban, CheckCircle2, UserX,
  DoorOpen, Activity, ChevronDown, Phone, FileText, ClipboardList,
} from 'lucide-react';
import CalendarView from '../CalendarView';
import {
  cardCls, btnPrimary, formatTime, ApptBadge, Badge,
  SkeletonLoader, EmptyState,
} from './shared';
import { ErrorAlert } from '../../../platform/components/shared';

// ─── Working hours inline card ──────────────────────
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function MyWorkingHoursCard({ schedules, leaves }) {
  if (!schedules.length) return null;
  const sched = schedules[0];
  const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

  return (
    <div className={`${cardCls} p-5 mb-6`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-xl bg-emerald-50"><Clock className="h-4 w-4 text-emerald-600" /></div>
        <h3 className="font-semibold font-display text-neutral-900 text-sm">My Working Hours</h3>
        {sched.branch?.name && (
          <span className="text-[11px] bg-neutral-100 text-neutral-900/50 px-2 py-0.5 rounded-full">{sched.branch.name}</span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs">
        {(sched.weeklySchedule || []).map((d) => (
          <div
            key={d.day}
            className={`rounded-lg p-2 ${d.day === today ? 'ring-2 ring-primary-500/40' : ''} ${d.isWorking ? 'bg-neutral-50' : 'bg-neutral-900/5 opacity-50'}`}
          >
            <div className="font-semibold text-neutral-900/70 mb-1">{DAY_SHORT[d.day]}</div>
            {d.isWorking ? (
              <>
                {d.slots && d.slots.length > 0 ? (
                  d.slots.map((s, i) => (
                    <div key={i} className="text-primary-600 font-medium">{s.startTime}-{s.endTime}</div>
                  ))
                ) : (
                  <>
                    <div className="text-primary-600 font-medium">{d.startTime}-{d.endTime}</div>
                    {d.breakStart && <div className="text-neutral-900/30 mt-0.5">Break: {d.breakStart}-{d.breakEnd}</div>}
                  </>
                )}
              </>
            ) : (
              <div className="text-neutral-900/30">OFF</div>
            )}
          </div>
        ))}
      </div>
      {leaves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-900/5">
          <p className="text-xs font-medium text-neutral-900/40 mb-1">Upcoming Leaves</p>
          {leaves.map((l) => (
            <span key={l._id} className="inline-block text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full mr-2 mb-1">
              {new Date(l.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(l.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ({l.leaveType})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Status action config ───────────────────────────
function getActions(status) {
  switch (status) {
    case 'requested':
      return [
        { label: 'Confirm', status: 'confirmed', icon: Check, cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
        { label: 'Cancel', status: 'cancelled', icon: Ban, cls: 'bg-red-50 hover:bg-red-100 text-red-600' },
      ];
    case 'confirmed':
      return [
        { label: 'Check In', status: 'checked_in', icon: CheckCircle2, cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
        { label: 'Cancel', status: 'cancelled', icon: Ban, cls: 'bg-red-50 hover:bg-red-100 text-red-600' },
      ];
    case 'checked_in':
      return [
        { label: 'Start Consultation', status: 'start', icon: Play, cls: 'bg-primary-600 hover:bg-primary-700 text-white' },
        { label: 'No Show', status: 'no_show', icon: UserX, cls: 'bg-red-50 hover:bg-red-100 text-red-600' },
      ];
    default:
      return [];
  }
}

function waitTime(checkedInAt) {
  if (!checkedInAt) return null;
  const mins = Math.floor((Date.now() - new Date(checkedInAt)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── Main component ─────────────────────────────────
export default function DoctorSchedulePanel({
  appointments, loading, error, queue, queueLoading,
  calendarEvents, onStart, onStatusChange, updatingId,
  onRetry, mySchedule, myLeaves,
}) {
  const [expandedAppt, setExpandedAppt] = useState(null);
  const [scheduleView, setScheduleView] = useState('timeline');

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <button onClick={onRetry} className={btnPrimary}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MyWorkingHoursCard schedules={mySchedule} leaves={myLeaves} />

      {/* Today's Schedule */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-50">
              <CalendarDays className="h-4 w-4 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold font-display text-neutral-900 text-sm">Today's Schedule</h3>
              <p className="text-[11px] text-neutral-900/30">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!loading && appointments.length > 0 && (
              <span className="text-xs font-medium text-neutral-900/40">
                {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
              </span>
            )}
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              {['timeline', 'calendar'].map((v) => (
                <button
                  key={v}
                  onClick={() => setScheduleView(v)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all capitalize ${
                    scheduleView === v
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-900/40'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar view */}
        {scheduleView === 'calendar' && (
          loading ? (
            <div className="space-y-3"><SkeletonLoader className="h-20 w-full" count={4} /></div>
          ) : (
            <CalendarView
              events={calendarEvents}
              defaultView="day"
              date={new Date()}
              onNavigate={() => {}}
              onSelectEvent={(event) => {
                const appt = event.resource;
                if (appt) setExpandedAppt(expandedAppt === (appt._id || appt.id) ? null : (appt._id || appt.id));
              }}
              minHeight={450}
            />
          )
        )}

        {/* Timeline view */}
        {scheduleView === 'timeline' && (loading ? (
          <div className="space-y-3"><SkeletonLoader className="h-20 w-full" count={4} /></div>
        ) : appointments.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No appointments today" message="Your schedule is clear. Enjoy some free time!" />
        ) : (
          <div className="space-y-3">
            {appointments.map((appt, idx) => {
              const apptId = appt._id || appt.id;
              const isUpdating = updatingId === apptId;
              const isExpanded = expandedAppt === apptId;
              const actions = getActions(appt.status);
              const patientName = appt.patientName || appt.patient?.name || appt.patient?.firstName || 'Patient';
              const patientPhone = appt.patientPhone || appt.patient?.phone || '';
              return (
                <motion.div
                  key={apptId || idx}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`${cardCls} overflow-hidden hover:shadow-[var(--shadow-sm)] transition-shadow`}
                >
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer"
                    onClick={() => setExpandedAppt(isExpanded ? null : apptId)}
                  >
                    <div className="flex flex-col items-center shrink-0 w-16">
                      <span className="text-sm font-bold text-neutral-900">
                        {formatTime(appt.scheduledAt || appt.date || appt.startTime)}
                      </span>
                      {appt.duration && <span className="text-[10px] text-neutral-900/30">{appt.duration} min</span>}
                    </div>
                    <div className="w-px h-10 bg-neutral-300/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{patientName}</p>
                      <p className="text-xs text-neutral-900/40 mt-0.5">
                        {appt.type || appt.appointmentType || 'Consultation'}
                        {appt.reason ? ` — ${appt.reason}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {appt.source === 'chatbot' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700">Chatbot</span>
                      )}
                      <ApptBadge status={appt.status} />
                      <ChevronDown className={`h-4 w-4 text-neutral-900/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 border-t border-neutral-200/60">
                          <div className="flex flex-wrap gap-4 py-3 text-xs text-neutral-900/50">
                            {patientPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {patientPhone}</span>}
                            {appt.reason && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {appt.reason}</span>}
                            {appt.notes && <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {appt.notes}</span>}
                          </div>

                          {appt.status === 'in_progress' && (() => {
                            const linkedQ = queue.find((q) => q.appointment === apptId || q.appointment?._id === apptId);
                            if (linkedQ?.room) {
                              return (
                                <div className="flex items-center gap-2 pb-2">
                                  <span className="flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
                                    <DoorOpen className="h-3.5 w-3.5" /> Room: {linkedQ.room.code || linkedQ.room.name}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {actions.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                              {actions.map((action) => (
                                <button
                                  key={action.status}
                                  disabled={isUpdating}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    action.status === 'start' ? onStart(appt) : onStatusChange(appt, action.status);
                                  }}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 ${action.cls}`}
                                >
                                  {isUpdating
                                    ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    : <action.icon className="h-3.5 w-3.5" />}
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Current Queue */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50">
              <Activity className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold font-display text-neutral-900 text-sm">Current Queue</h3>
              <p className="text-[11px] text-neutral-900/30">Patients waiting to be seen</p>
            </div>
          </div>
          {!queueLoading && queue.length > 0 && (() => {
            const waitingCount = queue.filter((q) => q.status === 'waiting').length;
            const consultingCount = queue.filter((q) => q.status === 'in_consultation').length;
            return (
              <div className="flex items-center gap-2">
                {consultingCount > 0 && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">{consultingCount} consulting</span>}
                {waitingCount > 0 && <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">{waitingCount} waiting</span>}
              </div>
            );
          })()}
        </div>

        {queueLoading ? (
          <SkeletonLoader className="h-12 w-full" count={2} />
        ) : queue.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-4 bg-neutral-50/50 rounded-xl">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-sm text-neutral-900/50">No patients in queue</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.filter((q) => q.status === 'in_consultation').map((q, idx) => (
              <div key={q._id || q.id || `ic-${idx}`} className="flex items-center justify-between p-3 bg-purple-50/60 rounded-xl border border-purple-100/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-xs font-bold text-purple-700">
                    {q.tokenNumber || idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{q.patientName || q.patient?.name || 'Patient'}</p>
                    <p className="text-[11px] text-neutral-900/30">In consultation since {q.calledAt ? formatTime(q.calledAt) : '--'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {q.room && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full"><DoorOpen className="h-3 w-3" /> {q.room.code || q.room.name}</span>
                  )}
                  <Badge color="purple">In Progress</Badge>
                </div>
              </div>
            ))}
            {queue.filter((q) => q.status === 'waiting').map((q, idx) => {
              const wt = waitTime(q.checkedInAt || q.createdAt);
              return (
                <div key={q._id || q.id || `w-${idx}`} className="flex items-center justify-between p-3 bg-neutral-50/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-xs font-bold text-amber-700">{q.tokenNumber || idx + 1}</div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{q.patientName || q.patient?.name || 'Patient'}</p>
                      <p className="text-[11px] text-neutral-900/30">Checked in {q.checkedInAt ? formatTime(q.checkedInAt) : '--'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {wt && <span className="text-[11px] font-medium text-neutral-900/40"><Clock className="h-3 w-3 inline mr-0.5" />{wt}</span>}
                    <Badge color={q.priority === 'emergency' ? 'red' : q.priority === 'high' ? 'amber' : 'primary'}>{q.priority || 'normal'}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
