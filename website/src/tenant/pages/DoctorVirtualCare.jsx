/**
 * DoctorVirtualCare — Combined Telemedicine + Emergency page.
 * 3 tabs: Active Sessions, Scheduled, Emergency Queue.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Calendar, AlertTriangle, Phone, MessageSquare, Clock,
  CheckCircle2, XCircle, Play, Timer, Wifi,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  listVideoSessions, acceptVideoSession, declineVideoSession,
  endVideoSession, joinVideoSession, listEmergencySessions,
  acceptEmergencySession, declineEmergencySession,
} from '../api';
import { initSocket, emergencyBus } from '../../lib/socket';
import { ErrorAlert, ConfirmDialog } from '../../platform/components/shared';
import DoctorEmergencyModal from '../components/doctor/DoctorEmergencyModal';
import {
  cardCls, cardHover, btnPrimary, btnSecondary, btnGhost,
  PageHeader, TabBar, Badge, EmptyState, SkeletonLoader,
  formatDate, formatTime,
} from '../components/doctor/shared';

// ─── Session status config ───────────────────────────
const SESSION_STATUS = {
  active:    { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
  waiting:   { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Waiting' },
  scheduled: { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Scheduled' },
  ended:     { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Ended' },
  cancelled: { bg: 'bg-red-50',     text: 'text-red-600',     label: 'Cancelled' },
};

const PRIORITY_COLORS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-400',
};

const TABS = [
  { key: 'active', label: 'Active Sessions' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'emergency', label: 'Emergency Queue' },
];

// ═══════════════════════════════════════════════════════
export default function DoctorVirtualCare() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();

  const [tab, setTab] = useState('active');
  const [activeSessions, setActiveSessions] = useState([]);
  const [scheduledSessions, setScheduledSessions] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  // ─── Fetch data ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeRes, schedRes, emergRes] = await Promise.allSettled([
        listVideoSessions({ status: 'active,waiting', limit: 50 }),
        listVideoSessions({ status: 'scheduled', sort: 'scheduledAt', limit: 50 }),
        listEmergencySessions({ status: 'requested' }),
      ]);

      const parseList = (res) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value?.data || res.value;
        const list = d?.sessions || d?.data || (Array.isArray(d) ? d : []);
        return Array.isArray(list) ? list : [];
      };

      setActiveSessions(parseList(activeRes));
      setScheduledSessions(parseList(schedRes));
      setEmergencies(parseList(emergRes));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Socket listeners ──────────────────────────────
  useEffect(() => {
    initSocket();
    const off = emergencyBus.on((event) => {
      // Refresh on any emergency or session event
      if (event.startsWith('emergency:') || event.startsWith('video:')) {
        fetchData();
      }
    });
    return off;
  }, [fetchData]);

  // ─── Actions ───────────────────────────────────────
  const handleJoinSession = useCallback(async (session) => {
    const id = session._id || session.id;
    setActionLoading(id);
    try {
      const res = await joinVideoSession(id);
      const data = res?.data || res;
      if (data?.joinUrl || data?.token) {
        navigate(`/clinic/video-call/${id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [navigate]);

  const handleAcceptSession = useCallback(async (session) => {
    const id = session._id || session.id;
    setActionLoading(id);
    try {
      await acceptVideoSession(id);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [fetchData]);

  const handleDeclineSession = useCallback(async (session) => {
    const id = session._id || session.id;
    setActionLoading(id);
    try {
      await declineVideoSession(id);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [fetchData]);

  const handleAcceptEmergency = useCallback(async (session) => {
    const id = session._id || session.id;
    setActionLoading(id);
    try {
      const res = await acceptEmergencySession(id);
      const data = res?.data || res;
      if (data?.roomId || data?.videoSession) {
        navigate(`/clinic/video-call/${data.videoSession || id}`);
      }
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [navigate, fetchData]);

  const handleDeclineEmergency = useCallback(async (session) => {
    const id = session._id || session.id;
    setActionLoading(id);
    try {
      await declineEmergencySession(id);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [fetchData]);

  // ═══════════════════════════════════════════════════
  const emergencyCount = emergencies.length;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Header */}
      <PageHeader
        title="Virtual Care"
        subtitle={`${activeSessions.length} active · ${scheduledSessions.length} scheduled · ${emergencyCount} emergency`}
        actions={
          emergencyCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-full border border-red-200">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-semibold text-red-700">{emergencyCount} Emergency</span>
            </div>
          )
        }
      />

      {error && <ErrorAlert message={error} />}

      {/* Tab bar */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <TabBar
          tabs={TABS.map((t) => ({
            ...t,
            label: t.key === 'emergency' && emergencyCount > 0 ? `${t.label} (${emergencyCount})` : t.label,
          }))}
          active={tab}
          onChange={setTab}
        />
      </div>

      {/* Tab content */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <div className="space-y-4">
            <SkeletonLoader className="h-28 w-full" count={3} />
          </div>
        ) : (
          <>
            {/* Active Sessions */}
            {tab === 'active' && (
              activeSessions.length === 0 ? (
                <EmptyState icon={Video} title="No active sessions" message="Active video sessions will appear here" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeSessions.map((s) => {
                    const sc = SESSION_STATUS[s.status] || SESSION_STATUS.active;
                    const isLoading = actionLoading === (s._id || s.id);
                    return (
                      <div key={s._id || s.id} className={`${cardCls} ${cardHover} p-5`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                              <Video className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{s.patientName || s.patient?.name || 'Patient'}</p>
                              <p className="text-xs text-neutral-500">{s.type || 'Video Consultation'}</p>
                            </div>
                          </div>
                          <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
                        </div>
                        {s.startedAt && (
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-3">
                            <Timer className="h-3.5 w-3.5" />
                            Started {formatTime(s.startedAt)}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleJoinSession(s)}
                            disabled={isLoading}
                            className={`${btnPrimary} flex-1 flex items-center justify-center gap-2`}
                          >
                            <Play className="h-4 w-4" /> {isLoading ? 'Joining...' : 'Join Call'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Scheduled Sessions */}
            {tab === 'scheduled' && (
              scheduledSessions.length === 0 ? (
                <EmptyState icon={Calendar} title="No scheduled sessions" message="Upcoming teleconsults will appear here" />
              ) : (
                <div className="space-y-3">
                  {scheduledSessions.map((s) => {
                    const isLoading = actionLoading === (s._id || s.id);
                    return (
                      <div key={s._id || s.id} className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                            <Calendar className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">{s.patientName || s.patient?.name || 'Patient'}</p>
                            <p className="text-xs text-neutral-500">
                              {formatDate(s.scheduledAt || s.startTime)} at {formatTime(s.scheduledAt || s.startTime)}
                              {s.type ? ` · ${s.type}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge color="blue">Scheduled</Badge>
                          <button onClick={() => handleAcceptSession(s)} disabled={isLoading} className={btnPrimary}>
                            {isLoading ? '...' : 'Accept'}
                          </button>
                          <button onClick={() => handleDeclineSession(s)} disabled={isLoading} className={btnGhost}>
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Emergency Queue */}
            {tab === 'emergency' && (
              emergencies.length === 0 ? (
                <EmptyState icon={AlertTriangle} title="No pending emergencies" message="Emergency requests will appear here in real-time" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {emergencies.map((e) => {
                    const priority = e.priority || e.triageLevel || 'medium';
                    const isLoading = actionLoading === (e._id || e.id);
                    return (
                      <div key={e._id || e.id} className={`${cardCls} p-5 border-l-4 ${
                        priority === 'critical' ? 'border-l-red-500' :
                        priority === 'high' ? 'border-l-orange-500' :
                        'border-l-amber-500'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                              <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">
                                {e.patientName || e.patient?.name || 'Unknown Patient'}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {formatDate(e.createdAt)} at {formatTime(e.createdAt)}
                              </p>
                            </div>
                          </div>
                          <Badge color={priority === 'critical' ? 'red' : priority === 'high' ? 'amber' : 'blue'}>
                            {priority}
                          </Badge>
                        </div>

                        {(e.reason || e.description) && (
                          <p className="text-sm text-neutral-600 mb-3 line-clamp-2">{e.reason || e.description}</p>
                        )}

                        {/* Pain level bar */}
                        {e.painLevel != null && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
                              <span>Pain Level</span>
                              <span className="font-semibold">{e.painLevel}/10</span>
                            </div>
                            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${e.painLevel >= 7 ? 'bg-red-500' : e.painLevel >= 4 ? 'bg-amber-500' : 'bg-blue-400'}`}
                                style={{ width: `${(e.painLevel / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Badge color={e.type === 'video' ? 'purple' : 'blue'}>
                            {e.type === 'video' ? <><Video className="h-3 w-3 mr-1 inline" /> Video</> : <><MessageSquare className="h-3 w-3 mr-1 inline" /> Chat</>}
                          </Badge>
                        </div>

                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => handleAcceptEmergency(e)}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="h-4 w-4" /> {isLoading ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => handleDeclineEmergency(e)}
                            disabled={isLoading}
                            className={`${btnGhost} flex-1 flex items-center justify-center gap-2`}
                          >
                            <XCircle className="h-4 w-4" /> Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
