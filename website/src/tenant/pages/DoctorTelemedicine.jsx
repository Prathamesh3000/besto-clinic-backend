/**
 * DoctorTelemedicine — Wave 3 redesign.
 *
 * Doctor's telemedicine dock. Three tabs:
 *   - Live     : sessions currently in progress (status: active, waiting, requested)
 *                + sessions scheduled within the next 15 min (ready-to-join)
 *   - Upcoming : scheduled sessions further in the future
 *   - History  : ended / cancelled / expired / no_show sessions
 *
 * No polling. The list reconciles via socket events:
 *   - `video:peer-joined` → bump patient to top + surface "Patient here" badge
 *   - `video:call-ended`  → flip status to ended and strip from Live
 *   - `emergency:accepted`→ prepend to Live (emergency auto-creates VideoSession)
 *
 * Each card renders a rich preview (patient avatar, reason snippet, pain chip
 * if telemedicine follows an emergency, scheduled countdown, duration) and
 * wires Accept / Join / Cancel / End to the live REST endpoints with
 * optimistic updates.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Video, Plus, Search, Clock, User, Phone, PhoneOff,
  AlertCircle, RefreshCw, Zap, X, Eye, Calendar, Inbox,
  Check, Stethoscope, Loader2, Sparkles, Timer, Radio,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  listVideoSessions, createVideoSession, acceptVideoSession,
  cancelVideoSession, endVideoSession, listDoctorPatients,
} from '../api';
import { initSocket, callLife, emergencyBus } from '../../lib/socket';

// ── Status meta ────────────────────────────────
const STATUS_META = {
  requested: { label: 'Requested',  tone: 'text-amber-700  bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  scheduled: { label: 'Scheduled',  tone: 'text-blue-700   bg-blue-50   border-blue-200',   dot: 'bg-blue-500' },
  waiting:   { label: 'Waiting',    tone: 'text-purple-700 bg-purple-50 border-purple-200', dot: 'bg-purple-500 animate-pulse' },
  active:    { label: 'In session', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
  paused:    { label: 'Paused',     tone: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  ended:     { label: 'Ended',      tone: 'text-neutral-600 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-400' },
  cancelled: { label: 'Cancelled',  tone: 'text-rose-700   bg-rose-50   border-rose-200',   dot: 'bg-rose-400' },
  expired:   { label: 'Expired',    tone: 'text-neutral-500 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-300' },
  no_show:   { label: 'No show',    tone: 'text-rose-700   bg-rose-50   border-rose-200',   dot: 'bg-rose-400' },
};

const TYPE_META = {
  emergency: { icon: Zap,         tone: 'text-rose-700  bg-rose-50  border-rose-200',  label: 'Emergency' },
  scheduled: { icon: Calendar,    tone: 'text-blue-700  bg-blue-50  border-blue-200',  label: 'Scheduled' },
  follow_up: { icon: Stethoscope, tone: 'text-violet-700 bg-violet-50 border-violet-200', label: 'Follow-up' },
};

const NEAR_TERM_MS = 15 * 60 * 1000;

const TAB_CONFIG = {
  live: {
    label: 'Live',
    icon: Radio,
    description: 'Active, ringing, and starting in the next 15 min',
    test: (s) => {
      if (['active', 'waiting', 'requested'].includes(s.status)) return true;
      if (s.status === 'scheduled' && s.scheduledAt) {
        const diff = new Date(s.scheduledAt).getTime() - Date.now();
        return diff > -30 * 60 * 1000 && diff < NEAR_TERM_MS; // starts within 15min, includes up to 30min late
      }
      return false;
    },
  },
  upcoming: {
    label: 'Upcoming',
    icon: Calendar,
    description: 'Scheduled for later',
    test: (s) => {
      if (s.status !== 'scheduled' || !s.scheduledAt) return false;
      return new Date(s.scheduledAt).getTime() - Date.now() >= NEAR_TERM_MS;
    },
  },
  history: {
    label: 'History',
    icon: Inbox,
    description: 'Completed and archived sessions',
    test: (s) => ['ended', 'cancelled', 'expired', 'no_show'].includes(s.status),
  },
};

function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.floor(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const absMin = Math.abs(diffMs) / 60000;
  if (absMin < 1) return diffMs > 0 ? 'Starting now' : 'Just started';
  if (absMin < 60) {
    const rounded = Math.round(absMin);
    return diffMs > 0 ? `In ${rounded}m` : `${rounded}m ago`;
  }
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function initialOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
}

export default function DoctorTelemedicine() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const doctorId = user?._id || user?.id;

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // History pagination (server-side)
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyLimit = 10;

  // Join-preview modal (instead of window.confirm for cancel/end)
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'cancel'|'end', session }

  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const isHistory = activeTab === 'history';
      const params = {
        doctor: doctorId,
        limit: isHistory ? historyLimit : 100,
        page: isHistory ? historyPage : 1,
      };
      if (isHistory) params.status = 'ended,cancelled,expired,no_show';
      const res = await listVideoSessions(params);
      const list = res?.data || res?.items || [];
      setSessions(Array.isArray(list) ? list : []);
      setHistoryTotal(res?.meta?.total || list.length || 0);
    } catch (err) {
      setError(err.message || 'Could not load video sessions');
    } finally {
      setLoading(false);
    }
  }, [doctorId, activeTab, historyPage]);

  // Init
  useEffect(() => {
    initSocket();
    fetchSessions();
  }, [fetchSessions]);

  // Live lifecycle reconciliation
  useEffect(() => {
    const offLife = callLife.on((event, payload) => {
      if (!payload) return;
      const sid = String(payload.sessionId || payload.session || payload._id || '');
      if (!sid) return;

      if (event === 'video:peer-joined') {
        // Mark "patient here" flag + move to top
        setSessions((prev) => {
          const idx = prev.findIndex((s) => String(s._id || s.sessionId) === sid);
          if (idx < 0) return prev;
          const updated = { ...prev[idx], _peerHereAt: Date.now(), status: prev[idx].status === 'scheduled' ? 'waiting' : prev[idx].status };
          const next = [...prev];
          next.splice(idx, 1);
          return [updated, ...next];
        });
      } else if (event === 'video:call-ended') {
        setSessions((prev) => prev.map((s) =>
          String(s._id || s.sessionId) === sid
            ? { ...s, status: 'ended', endedAt: payload.endedAt || new Date().toISOString(), duration: payload.durationSec ?? s.duration }
            : s,
        ));
      }
    });

    const offEmergency = emergencyBus.on((event, payload) => {
      if (event !== 'emergency:accepted') return;
      const vid = payload?.videoSession?._id || payload?.videoSession || payload?.videoSessionId;
      if (!vid) return;
      // If the auto-created VideoSession belongs to this doctor, drop it in at top.
      if (String(payload?.doctor?._id || payload?.doctor) !== String(doctorId)) return;
      setSessions((prev) => {
        if (prev.some((s) => String(s._id || s.sessionId) === String(vid))) return prev;
        return [{
          _id: String(vid),
          sessionId: String(vid),
          type: 'emergency',
          status: 'waiting',
          patient: payload.patient,
          reason: payload.reason,
          scheduledAt: null,
          createdAt: new Date().toISOString(),
          _peerHereAt: Date.now(),
        }, ...prev];
      });
    });

    return () => { offLife(); offEmergency(); };
  }, [doctorId]);

  // Filter + search
  const visible = useMemo(() => {
    const tabFn = TAB_CONFIG[activeTab].test;
    const q = search.trim().toLowerCase();
    return sessions.filter(tabFn).filter((s) => {
      if (!q) return true;
      const name = (s.patient?.name || '').toLowerCase();
      const reason = (s.reason || '').toLowerCase();
      return name.includes(q) || reason.includes(q);
    });
  }, [sessions, activeTab, search]);

  const liveCount     = sessions.filter(TAB_CONFIG.live.test).length;
  const upcomingCount = sessions.filter(TAB_CONFIG.upcoming.test).length;
  const historyCount  = activeTab === 'history' ? historyTotal : sessions.filter(TAB_CONFIG.history.test).length;

  // Actions
  const handleAccept = async (s) => {
    const id = s._id || s.sessionId;
    if (!id) return;
    setBusyId(id);
    try {
      await acceptVideoSession(id);
      navigate(`/clinic/telemedicine/${id}`, { state: { fromTelemedicine: true } });
    } catch (err) {
      setError(err.message || 'Could not accept session');
    } finally {
      setBusyId(null);
    }
  };

  const handleJoin = (s) => {
    const id = s._id || s.sessionId;
    if (id) navigate(`/clinic/telemedicine/${id}`);
  };

  const handleCancel = async () => {
    if (!confirmAction?.session) return;
    const id = confirmAction.session._id || confirmAction.session.sessionId;
    setBusyId(id);
    try {
      await cancelVideoSession(id, { reason: 'Cancelled by doctor' });
      setSessions((prev) => prev.map((s) => (String(s._id || s.sessionId) === String(id)
        ? { ...s, status: 'cancelled' } : s)));
      setConfirmAction(null);
    } catch (err) {
      setError(err.message || 'Could not cancel session');
    } finally {
      setBusyId(null);
    }
  };

  const handleEnd = async () => {
    if (!confirmAction?.session) return;
    const id = confirmAction.session._id || confirmAction.session.sessionId;
    setBusyId(id);
    try {
      await endVideoSession(id, { notes: 'Ended by doctor' });
      setSessions((prev) => prev.map((s) => (String(s._id || s.sessionId) === String(id)
        ? { ...s, status: 'ended', endedAt: new Date().toISOString() } : s)));
      setConfirmAction(null);
    } catch (err) {
      setError(err.message || 'Could not end session');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 p-5 shadow-[var(--shadow-sm)]">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-primary-200/40 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-200">
              <Video className="w-6 h-6" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-neutral-900 tracking-tight">Telemedicine</h1>
              <p className="text-sm text-neutral-600 mt-0.5 max-w-lg">
                Live, secure video consultations. Sessions reconcile in real-time via sockets — no need to refresh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSessions}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-neutral-200 hover:bg-white text-sm text-neutral-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> New session
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
        {Object.entries(TAB_CONFIG).map(([key, cfg]) => {
          const isActive = key === activeTab;
          const count = key === 'live' ? liveCount : key === 'upcoming' ? upcomingCount : historyCount;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key === 'history') setHistoryPage(1);
              }}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
              title={cfg.description}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
              <span className={`ml-1 tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {count}
              </span>
              {key === 'live' && liveCount > 0 && !isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search ────────────────────────────────────────── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient or reason…"
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-200 focus:border-primary-500 outline-none"
        />
      </div>

      {/* ── Grid ──────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-neutral-200 p-10 flex items-center justify-center gap-2 text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
        </div>
      ) : visible.length === 0 ? (
        <EmptyTab tab={activeTab} onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {visible.map((s) => (
            <SessionCard
              key={String(s._id || s.sessionId)}
              session={s}
              busy={busyId && String(busyId) === String(s._id || s.sessionId)}
              onAccept={() => handleAccept(s)}
              onJoin={() => handleJoin(s)}
              onCancel={() => setConfirmAction({ type: 'cancel', session: s })}
              onEnd={() => setConfirmAction({ type: 'end', session: s })}
              onView={() => navigate(`/clinic/telemedicine/${s._id || s.sessionId}`)}
            />
          ))}
        </div>
      )}

      {/* History pagination */}
      {activeTab === 'history' && historyTotal > historyLimit && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-neutral-200 px-4 py-2.5">
          <p className="text-xs text-neutral-500 tabular-nums">
            Showing {(historyPage - 1) * historyLimit + 1}–{Math.min(historyPage * historyLimit, historyTotal)} of {historyTotal}
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((p) => p - 1)}
              className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-neutral-600 px-2 tabular-nums">
              {historyPage} / {Math.ceil(historyTotal / historyLimit)}
            </span>
            <button
              disabled={historyPage >= Math.ceil(historyTotal / historyLimit)}
              onClick={() => setHistoryPage((p) => p + 1)}
              className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <CreateSessionModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); fetchSessions(); }}
        doctorId={doctorId}
      />

      {confirmAction && (
        <ConfirmModal
          kind={confirmAction.type}
          session={confirmAction.session}
          busy={Boolean(busyId)}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.type === 'end' ? handleEnd : handleCancel}
        />
      )}

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
    </motion.div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.ended;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function TypeChip({ type }) {
  const meta = TYPE_META[type] || { icon: Video, tone: 'text-neutral-700 bg-neutral-50 border-neutral-200', label: type || 'Session' };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${meta.tone}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

function SessionCard({ session, busy, onAccept, onJoin, onCancel, onEnd, onView }) {
  const status = session.status;
  const isRinging = ['requested', 'waiting'].includes(status);
  const isActive = status === 'active';
  const isScheduled = status === 'scheduled';
  const isTerminal = ['ended', 'cancelled', 'expired', 'no_show'].includes(status);
  const patientName = session.patient?.name || 'Patient';
  const patientPhoto = session.patient?.photo || session.patient?.avatar;
  const peerHere = Boolean(session._peerHereAt);
  const scheduledAt = session.scheduledAt;
  const duration = session.duration ?? session.durationSec;

  return (
    <article
      className={`group relative rounded-2xl bg-white border p-4 transition-all animate-[fadeUp_0.3s_ease-out_both] ${
        isActive ? 'border-emerald-200 hover:border-emerald-400 hover:shadow-[var(--shadow-md)]'
        : isRinging ? 'border-amber-200 hover:border-amber-400 hover:shadow-[var(--shadow-md)]'
        : isTerminal ? 'border-neutral-200 hover:border-neutral-300 opacity-95'
        : 'border-neutral-200 hover:border-primary-300 hover:shadow-[var(--shadow-sm)]'
      }`}
    >
      {peerHere && !isTerminal && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-1.5 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Patient here
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        {patientPhoto ? (
          <img src={patientPhoto} alt={patientName} className="w-11 h-11 rounded-xl object-cover shrink-0" />
        ) : (
          <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-sm font-semibold ${
            isActive ? 'bg-emerald-50 text-emerald-700'
            : isRinging ? 'bg-amber-50 text-amber-700'
            : 'bg-primary-50 text-primary-700'
          }`}>
            {initialOf(patientName)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-sm font-semibold text-neutral-900 truncate">{patientName}</h3>
            <StatusPill status={status} />
            <TypeChip type={session.type} />
          </div>

          {session.reason && (
            <p className="text-sm text-neutral-700 line-clamp-2 mt-1 leading-snug">{session.reason}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500 flex-wrap">
            {scheduledAt && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar className="w-3 h-3" /> {fmtWhen(scheduledAt)}
              </span>
            )}
            {session.maxDuration != null && !isTerminal && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer className="w-3 h-3" /> Max {Math.round(session.maxDuration / 60)}m
              </span>
            )}
            {duration != null && isTerminal && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer className="w-3 h-3" /> {fmtDuration(duration)}
              </span>
            )}
            {session.patient?.patientId && (
              <span className="inline-flex items-center gap-1 text-neutral-400">
                <User className="w-3 h-3" /> {session.patient.patientId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
        {isRinging && (
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 shadow-sm transition disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            {busy ? 'Accepting…' : 'Accept & join'}
          </button>
        )}
        {isActive && (
          <>
            <button
              type="button"
              onClick={onJoin}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 shadow-sm transition"
            >
              <Video className="w-4 h-4" /> Return to room
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-medium px-3 py-2 transition"
            >
              <PhoneOff className="w-4 h-4" /> End
            </button>
          </>
        )}
        {isScheduled && !isRinging && (
          <>
            <button
              type="button"
              onClick={onJoin}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 shadow-sm transition"
            >
              <Video className="w-4 h-4" /> Open waiting room
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-sm font-medium px-3 py-2 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
        {isTerminal && (
          <button
            type="button"
            onClick={onView}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-sm font-medium py-2 transition"
          >
            <Eye className="w-4 h-4" /> View summary
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyTab({ tab, onCreate }) {
  const copy = {
    live:     { icon: Sparkles, title: 'Quiet on the line',         body: 'Active and ringing sessions show up here. Keep this tab open — you\'ll hear a ring the moment a patient dials in.' },
    upcoming: { icon: Calendar, title: 'No upcoming sessions yet',  body: 'Scheduled consultations further than 15 minutes out will appear here.' },
    history:  { icon: Inbox,    title: 'No past sessions',          body: 'Finished consultations will appear here with their call summary.' },
  }[tab];
  const Icon = copy.icon;
  return (
    <div className="rounded-2xl bg-white border border-neutral-200 p-10 flex flex-col items-center text-center">
      <Icon className="w-10 h-10 text-neutral-300 mb-3" />
      <p className="font-display text-base font-semibold text-neutral-800">{copy.title}</p>
      <p className="text-sm text-neutral-500 mt-1 max-w-md">{copy.body}</p>
      {tab !== 'history' && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Schedule new session
        </button>
      )}
    </div>
  );
}

function ConfirmModal({ kind, session, busy, onCancel, onConfirm }) {
  const isEnd = kind === 'end';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm animate-[fadeUp_0.2s_ease-out_both]">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-[0_24px_48px_-12px_rgba(15,23,42,0.28)] overflow-hidden">
        <header className="p-5 border-b border-neutral-200">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEnd ? 'End this session?' : 'Cancel this session?'}
          </h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            {session.patient?.name || 'Patient'} · {session.reason || 'No reason set'}
          </p>
        </header>
        <div className="p-5 text-sm text-neutral-700">
          {isEnd
            ? 'The patient will be notified that the call has ended. You can always start a follow-up from their profile.'
            : 'The patient will be notified that the session was cancelled. They can rebook from the patient portal.'}
        </div>
        <footer className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-xl transition disabled:opacity-50"
          >
            Keep session
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition disabled:opacity-60 ${
              isEnd ? 'bg-rose-600 hover:bg-rose-700' : 'bg-neutral-800 hover:bg-neutral-900'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEnd ? <PhoneOff className="w-4 h-4" /> : <X className="w-4 h-4" />)}
            {busy ? 'Working…' : isEnd ? 'End session' : 'Cancel session'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Create-session modal (preserved + visually refreshed) ───────────

function CreateSessionModal({ isOpen, onClose, onCreated, doctorId }) {
  const [form, setForm] = useState({
    type: 'scheduled', patient: '', scheduledAt: '', maxDuration: 1800, reason: '',
  });
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    listDoctorPatients({ limit: 200 })
      .then((r) => setPatients(r?.data || r?.items || []))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = { ...form, doctor: doctorId };
      if (!body.scheduledAt) delete body.scheduledAt;
      await createVideoSession(body);
      setForm({ type: 'scheduled', patient: '', scheduledAt: '', maxDuration: 1800, reason: '' });
      onCreated();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-200 focus:border-primary-500 outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-[0_24px_48px_-12px_rgba(15,23,42,0.28)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">New video session</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Schedule a teleconsult or start one immediately</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Session type</label>
            <div className="flex gap-2">
              {['emergency', 'scheduled', 'follow_up'].map((t) => {
                const meta = TYPE_META[t] || TYPE_META.scheduled;
                const Icon = meta.icon;
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium border transition ${
                      active
                        ? t === 'emergency' ? 'bg-rose-50 border-rose-300 text-rose-700'
                        : t === 'follow_up' ? 'bg-violet-50 border-violet-300 text-violet-700'
                        : 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Patient */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Patient *</label>
            <select required value={form.patient} onChange={(e) => setForm((f) => ({ ...f, patient: e.target.value }))} className={inputClass}>
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>{p.name} ({p.patientId || p.phone})</option>
              ))}
            </select>
          </div>

          {form.type !== 'emergency' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Scheduled date &amp; time</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Max duration</label>
            <select value={form.maxDuration} onChange={(e) => setForm((f) => ({ ...f, maxDuration: Number(e.target.value) }))} className={inputClass}>
              <option value={900}>15 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={2700}>45 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={7200}>2 hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Brief clinical context for the call…"
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.patient}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : form.type === 'emergency' ? <Zap className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {loading ? 'Creating…' : form.type === 'emergency' ? 'Start emergency' : 'Schedule session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
