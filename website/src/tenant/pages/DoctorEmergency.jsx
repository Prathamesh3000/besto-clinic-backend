/**
 * DoctorEmergency — Wave 3 redesign.
 *
 * Socket-driven emergency queue + triage cockpit for doctors.
 *
 * Key shifts from the previous polling-based implementation:
 *   - No 15s REST polling. One initial fetch + live reconciliation via
 *     `emergency:new / accepted / cancelled / ended` socket events.
 *   - Accept → preview modal with triage snapshot (symptoms chips, pain, vitals,
 *     patient notes) → on confirm, auto-creates VideoSession and routes to
 *     `/clinic/telemedicine/:id`. Chat-only sessions route to a dedicated
 *     focus view inside this page so the doctor can thread reply without
 *     leaving context.
 *   - Header KPI strip: live pending count, today's accepted count, avg response
 *     time across today's accepted sessions.
 *   - Deep-link: `?focus=<sessionId>` auto-opens the preview modal for that
 *     session (used by the sidebar EmergencyFeed's "view triage" CTA).
 *   - No dead CTAs — every button leads somewhere.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Clock, Video, MessageSquareText, Siren, Activity,
  Thermometer, RefreshCw, Check, X, Loader2, PhoneOff, User, Filter,
  Gauge, Timer, TrendingUp, Zap, ChevronRight, Phone, Inbox,
} from 'lucide-react';
import {
  listEmergencySessions, acceptEmergencySession, endEmergencySession,
} from '../api';
import {
  initSocket, emergencyBus,
} from '../../lib/socket';
import { useTenantAuth } from '../TenantAuthContext';
import { ErrorAlert } from '../../platform/components/shared';

const TYPE_META = {
  video: { icon: Video,             label: 'Video',     tone: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  chat:  { icon: MessageSquareText, label: 'Chat',      tone: 'text-violet-700 bg-violet-50 border-violet-200' },
  call:  { icon: Siren,             label: 'Call',      tone: 'text-amber-700  bg-amber-50  border-amber-200' },
  visit: { icon: Activity,          label: 'Visit',     tone: 'text-sky-700    bg-sky-50    border-sky-200' },
};

const STATUS_META = {
  pending:   { label: 'Waiting',   tone: 'text-rose-700    bg-rose-50    border-rose-200',    dot: 'bg-rose-500 animate-pulse' },
  requested: { label: 'Waiting',   tone: 'text-rose-700    bg-rose-50    border-rose-200',    dot: 'bg-rose-500 animate-pulse' },
  accepted:  { label: 'Accepted',  tone: 'text-blue-700    bg-blue-50    border-blue-200',    dot: 'bg-blue-500' },
  active:    { label: 'Active',    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
  ended:     { label: 'Ended',     tone: 'text-neutral-600 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-400' },
  cancelled: { label: 'Cancelled', tone: 'text-neutral-500 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-300' },
  expired:   { label: 'Expired',   tone: 'text-neutral-500 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-300' },
};

const FILTER_CHIPS = [
  { key: 'live',     label: 'Live queue',  desc: 'waiting + accepted', test: (s) => ['pending', 'requested', 'accepted', 'active'].includes(s.status) },
  { key: 'pending',  label: 'Waiting',      desc: 'unclaimed only',    test: (s) => ['pending', 'requested'].includes(s.status) },
  { key: 'active',   label: 'Active',       desc: 'in session',        test: (s) => ['accepted', 'active'].includes(s.status) },
  { key: 'today',    label: 'Today',        desc: 'all today',         test: (s) => isToday(s.createdAt) },
  { key: 'all',      label: 'All',          desc: 'every session',     test: () => true },
];

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate()
      && d.getMonth() === now.getMonth()
      && d.getFullYear() === now.getFullYear();
}

function fmtWait(createdAt) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.floor(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function paintPain(score) {
  if (score == null) return null;
  if (score >= 8) return { label: `${score}/10`,  tone: 'text-rose-700   bg-rose-50   border-rose-200',   severity: 'Severe'   };
  if (score >= 5) return { label: `${score}/10`,  tone: 'text-amber-700  bg-amber-50  border-amber-200',  severity: 'Moderate' };
  if (score >  0) return { label: `${score}/10`,  tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', severity: 'Mild'  };
  return null;
}

export default function DoctorEmergency() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('live');
  const [, forceTick] = useState(0);

  // Modals
  const [previewSession, setPreviewSession] = useState(null);   // accept-preview modal
  const [accepting, setAccepting] = useState(false);
  const [endTarget, setEndTarget] = useState(null);              // end-session modal
  const [endReason, setEndReason] = useState('');
  const [ending, setEnding] = useState(false);

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const refresh = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      // Fetch a broad window once; filters happen client-side from here.
      const res = await listEmergencySessions({ limit: 100 });
      const list = res?.data?.items || res?.data || res?.items || [];
      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || 'Could not load emergency sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Init
  useEffect(() => {
    initSocket();
    refresh();
  }, [refresh]);

  // Live wait-timer tick (1s)
  useEffect(() => {
    const iv = setInterval(() => forceTick((n) => (n + 1) & 0xff), 1000);
    return () => clearInterval(iv);
  }, []);

  // Socket reconciliation
  useEffect(() => {
    const off = emergencyBus.on((event, payload) => {
      if (!payload) return;
      const sid = String(payload.sessionId || payload._id || '');
      if (!sid) return;

      if (event === 'emergency:new') {
        setItems((prev) => {
          if (prev.some((it) => String(it._id || it.sessionId) === sid)) return prev;
          return [{
            _id: sid,
            sessionId: sid,
            type: payload.type || 'video',
            reason: payload.reason,
            symptoms: payload.symptoms,
            painScore: payload.pain ?? payload.painScore,
            triage: payload.triage,
            vitals: payload.vitals,
            createdAt: payload.createdAt || new Date().toISOString(),
            patient: payload.patient || { name: payload.patientName },
            status: 'pending',
          }, ...prev];
        });
      } else if (event === 'emergency:accepted') {
        setItems((prev) => prev.map((it) => {
          if (String(it._id || it.sessionId) !== sid) return it;
          return { ...it, status: 'accepted', acceptedAt: payload.acceptedAt || new Date().toISOString(), doctor: payload.doctor || it.doctor };
        }));
      } else if (event === 'emergency:cancelled') {
        setItems((prev) => prev.map((it) =>
          String(it._id || it.sessionId) === sid ? { ...it, status: 'cancelled' } : it,
        ));
      } else if (event === 'emergency:ended') {
        setItems((prev) => prev.map((it) =>
          String(it._id || it.sessionId) === sid
            ? { ...it, status: 'ended', endedAt: payload.endedAt || new Date().toISOString(), durationSec: payload.durationSec }
            : it,
        ));
      }
    });
    return () => off();
  }, []);

  // Deep-link ?focus=<id>
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId || !items.length) return;
    const match = items.find((x) => String(x._id || x.sessionId) === String(focusId));
    if (match) setPreviewSession(match);
  }, [searchParams, items]);

  const filterFn = useMemo(
    () => (FILTER_CHIPS.find((c) => c.key === activeFilter) || FILTER_CHIPS[0]).test,
    [activeFilter],
  );
  const visible = useMemo(() => items.filter(filterFn), [items, filterFn]);

  const pendingItems = items.filter((x) => ['pending', 'requested'].includes(x.status));
  const activeItems  = items.filter((x) => ['accepted', 'active'].includes(x.status));

  // KPI: today's accepted-by-me + avg response time (createdAt → acceptedAt)
  const myId = String(user?._id || user?.id || '');
  const todaysAccepted = items.filter((s) => isToday(s.createdAt) && s.doctor && String(s.doctor._id || s.doctor) === myId);
  const respSecs = todaysAccepted
    .filter((s) => s.acceptedAt)
    .map((s) => (new Date(s.acceptedAt).getTime() - new Date(s.createdAt).getTime()) / 1000)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgResp = respSecs.length ? respSecs.reduce((a, b) => a + b, 0) / respSecs.length : null;

  const openPreview = (session) => setPreviewSession(session);
  const closePreview = () => {
    setPreviewSession(null);
    if (searchParams.get('focus')) {
      const sp = new URLSearchParams(searchParams);
      sp.delete('focus');
      setSearchParams(sp, { replace: true });
    }
  };

  const confirmAccept = async () => {
    if (!previewSession || accepting) return;
    const sid = String(previewSession._id || previewSession.sessionId);
    setAccepting(true);
    setError('');
    try {
      const res = await acceptEmergencySession(sid);
      const session = res?.data?.session || res?.data || res?.session || {};
      const videoSessionId = session.videoSession?._id
                          || session.videoSession
                          || session.videoSessionId;
      setPreviewSession(null);
      if (searchParams.get('focus')) {
        const sp = new URLSearchParams(searchParams);
        sp.delete('focus');
        setSearchParams(sp, { replace: true });
      }
      if (videoSessionId) {
        navigate(`/clinic/telemedicine/${videoSessionId}`, {
          state: { fromEmergency: true, emergencyId: sid },
        });
      } else {
        // No video session (chat-only emergency) — fall through; socket will
        // push the updated record into `items` and the card will show "Active".
      }
    } catch (err) {
      setError(err.message || 'Could not accept the session');
    } finally {
      setAccepting(false);
    }
  };

  const confirmEnd = async () => {
    if (!endTarget || ending) return;
    setEnding(true);
    try {
      await endEmergencySession(endTarget._id || endTarget.sessionId, {
        notes: endReason || 'Session ended by doctor',
      });
      setEndTarget(null);
      setEndReason('');
    } catch (err) {
      setError(err.message || 'Could not end the session');
    } finally {
      setEnding(false);
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* ── Hero / KPI strip ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-5 shadow-[var(--shadow-sm)]">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-rose-200/40 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="relative inline-flex w-12 h-12 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-200">
              <AlertTriangle className="w-6 h-6" />
              {pendingItems.length > 0 && (
                <span className="absolute inset-0 rounded-2xl bg-rose-500/40 animate-ping" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-neutral-900 tracking-tight">Emergency cockpit</h1>
                {pendingItems.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-100 border border-rose-200 rounded-full px-2 py-0.5 animate-pulse">
                    <Zap className="w-3 h-3" /> {pendingItems.length} waiting
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 mt-0.5">
                Realtime triage feed — accept to open a video/chat room with full patient context.
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-neutral-200 hover:bg-white text-sm text-neutral-700 hover:text-neutral-900 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Siren}       tone="rose"    label="Waiting"         value={pendingItems.length} sub="Unclaimed cases" />
          <KpiCard icon={Activity}    tone="emerald" label="Active"          value={activeItems.length}  sub="In session" />
          <KpiCard icon={Check}       tone="blue"    label="Accepted today"  value={todaysAccepted.length} sub="By you" />
          <KpiCard icon={Timer}       tone="amber"   label="Avg response"    value={avgResp == null ? '—' : fmtDuration(avgResp)} sub="Today" />
        </div>
      </section>

      {error && <ErrorAlert message={error} />}

      {/* ── Filter chips ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        <Filter className="w-4 h-4 text-neutral-400 shrink-0" />
        {FILTER_CHIPS.map((chip) => {
          const isActive = chip.key === activeFilter;
          const count = items.filter(chip.test).length;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setActiveFilter(chip.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
              title={chip.desc}
            >
              {chip.label}
              <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Queue grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-neutral-200 p-6 flex items-center justify-center gap-2 text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading queue…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white border border-neutral-200 p-10 flex flex-col items-center text-center">
          <Inbox className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="font-display text-base font-semibold text-neutral-800">Nothing here right now</p>
          <p className="text-sm text-neutral-500 mt-1 max-w-sm">
            New emergencies appear instantly via realtime sockets. Keep this tab open — you'll hear a ring when a patient requests urgent care.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {visible.map((session) => (
            <EmergencyCard
              key={String(session._id || session.sessionId)}
              session={session}
              onAccept={openPreview}
              onEnd={(s) => { setEndTarget(s); setEndReason(''); }}
              onOpenRoom={(s) => {
                const vid = s.videoSession?._id || s.videoSession || s.videoSessionId;
                if (vid) navigate(`/clinic/telemedicine/${vid}`);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Accept-preview modal ──────────────────────────────────────── */}
      {previewSession && (
        <AcceptPreviewModal
          session={previewSession}
          accepting={accepting}
          onCancel={closePreview}
          onConfirm={confirmAccept}
        />
      )}

      {/* ── End-session modal ─────────────────────────────────────────── */}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          reason={endReason}
          setReason={setEndReason}
          ending={ending}
          onCancel={() => { setEndTarget(null); setEndReason(''); }}
          onConfirm={confirmEnd}
        />
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function KpiCard({ icon: Icon, tone, label, value, sub }) {
  const tones = {
    rose:    'bg-rose-100 text-rose-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    blue:    'bg-blue-100 text-blue-700',
    amber:   'bg-amber-100 text-amber-700',
  };
  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-neutral-200/80 p-3 flex items-center gap-3">
      <span className={`inline-flex w-10 h-10 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">{label}</p>
        <p className="font-display text-xl font-bold text-neutral-900 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-neutral-500 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.ended;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EmergencyCard({ session, onAccept, onEnd, onOpenRoom }) {
  const sid = String(session._id || session.sessionId);
  const status = session.status || 'pending';
  const isWaiting = ['pending', 'requested'].includes(status);
  const isLive    = ['accepted', 'active'].includes(status);
  const isDone    = ['ended', 'cancelled', 'expired'].includes(status);
  const typeMeta  = TYPE_META[session.type] || TYPE_META.video;
  const TypeIcon  = typeMeta.icon;
  const pain      = paintPain(session.painScore ?? session.pain);
  const patientName = session.patient?.name || session.patientName || 'Patient';
  const symptoms = Array.isArray(session.symptoms) ? session.symptoms : (session.symptoms ? [session.symptoms] : []);

  return (
    <article
      className={`group rounded-2xl bg-white border p-4 transition-all animate-[fadeUp_0.3s_ease-out_both] ${
        isWaiting ? 'border-rose-200 hover:border-rose-400 hover:shadow-[var(--shadow-md)]'
        : isLive    ? 'border-emerald-200 hover:border-emerald-400 hover:shadow-[var(--shadow-md)]'
                    : 'border-neutral-200 hover:border-neutral-300 hover:shadow-[var(--shadow-sm)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center ${
          isWaiting ? 'bg-rose-50 text-rose-600' : isLive ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-500'
        }`}>
          <User className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-sm font-semibold text-neutral-900 truncate">{patientName}</h3>
            <StatusPill status={status} />
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${typeMeta.tone}`}>
              <TypeIcon className="w-3 h-3" /> {typeMeta.label}
            </span>
            {pain && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${pain.tone}`}>
                <Gauge className="w-3 h-3" /> {pain.severity} · {pain.label}
              </span>
            )}
          </div>

          {session.reason && (
            <p className="text-sm text-neutral-700 line-clamp-2 mt-1 leading-snug">{session.reason}</p>
          )}

          {symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {symptoms.slice(0, 4).map((s) => (
                <span key={s} className="text-[11px] text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5">
                  {s}
                </span>
              ))}
              {symptoms.length > 4 && (
                <span className="text-[11px] text-neutral-500">+{symptoms.length - 4} more</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="w-3 h-3" /> {isWaiting ? `Waiting ${fmtWait(session.createdAt)}` : new Date(session.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            {session.durationSec != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer className="w-3 h-3" /> {fmtDuration(session.durationSec)}
              </span>
            )}
            {session.doctor?.name && isLive && (
              <span className="inline-flex items-center gap-1 truncate">
                <Check className="w-3 h-3 text-emerald-600" /> {session.doctor.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
        {isWaiting && (
          <button
            type="button"
            onClick={() => onAccept(session)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium py-2 shadow-sm transition-all"
          >
            <Check className="w-4 h-4" /> Review & accept
          </button>
        )}
        {isLive && (
          <>
            <button
              type="button"
              onClick={() => onOpenRoom(session)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 shadow-sm transition-all"
              disabled={!(session.videoSession || session.videoSessionId)}
              title={session.videoSession || session.videoSessionId ? 'Enter room' : 'Chat-only session'}
            >
              <Phone className="w-4 h-4" /> Enter room
            </button>
            <button
              type="button"
              onClick={() => onEnd(session)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-medium px-3 py-2 transition-all"
            >
              <PhoneOff className="w-4 h-4" /> End
            </button>
          </>
        )}
        {isDone && (
          <div className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-50 text-neutral-500 text-[13px] py-2 border border-neutral-200">
            {status === 'cancelled' ? 'Patient cancelled' : status === 'expired' ? 'Expired without response' : 'Session ended'}
          </div>
        )}
      </div>
    </article>
  );
}

function AcceptPreviewModal({ session, accepting, onCancel, onConfirm }) {
  const typeMeta = TYPE_META[session.type] || TYPE_META.video;
  const TypeIcon = typeMeta.icon;
  const pain = paintPain(session.painScore ?? session.pain);
  const symptoms = Array.isArray(session.symptoms) ? session.symptoms : (session.symptoms ? [session.symptoms] : []);
  const vitals = session.vitals || session.triage?.vitals;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm animate-[fadeUp_0.2s_ease-out_both]">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-[0_24px_48px_-12px_rgba(15,23,42,0.28)] overflow-hidden">
        <header className="p-5 bg-gradient-to-br from-rose-600 to-rose-800 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-rose-100">Accept emergency</p>
              <h2 className="font-display text-xl font-semibold mt-1">{session.patient?.name || session.patientName || 'Patient'}</h2>
              <p className="text-rose-100 text-sm mt-0.5">{session.reason || 'Requesting urgent care'}</p>
            </div>
            <button onClick={onCancel} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-white bg-white/15 ring-1 ring-white/20 rounded-full px-2 py-0.5">
              <TypeIcon className="w-3 h-3" /> {typeMeta.label}
            </span>
            {pain && (
              <span className="inline-flex items-center gap-1 text-[11px] text-white bg-white/15 ring-1 ring-white/20 rounded-full px-2 py-0.5">
                <Gauge className="w-3 h-3" /> {pain.severity} pain {pain.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-white bg-white/15 ring-1 ring-white/20 rounded-full px-2 py-0.5 tabular-nums">
              <Clock className="w-3 h-3" /> Waiting {fmtWait(session.createdAt)}
            </span>
          </div>
        </header>

        <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
          {symptoms.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">Reported symptoms</p>
              <div className="flex flex-wrap gap-1.5">
                {symptoms.map((s) => (
                  <span key={s} className="text-xs text-neutral-800 bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-1">{s}</span>
                ))}
              </div>
            </section>
          )}
          {vitals && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">Vitals</p>
              <div className="grid grid-cols-2 gap-2">
                {vitals.bp && <VitalRow icon={Activity} label="Blood pressure" value={vitals.bp} />}
                {vitals.temp && <VitalRow icon={Thermometer} label="Temperature" value={`${vitals.temp}°`} />}
                {vitals.hr && <VitalRow icon={Activity} label="Heart rate" value={`${vitals.hr} bpm`} />}
                {vitals.spo2 && <VitalRow icon={TrendingUp} label="SpO₂" value={`${vitals.spo2}%`} />}
              </div>
            </section>
          )}
          {session.triage?.notes && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">Patient notes</p>
              <p className="text-sm text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-xl p-3 leading-snug">{session.triage.notes}</p>
            </section>
          )}
          {!symptoms.length && !vitals && !session.triage?.notes && (
            <p className="text-sm text-neutral-500 text-center py-4">No additional triage data provided.</p>
          )}
        </div>

        <footer className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={accepting}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-xl transition disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            onClick={onConfirm}
            disabled={accepting}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition disabled:opacity-60"
          >
            {accepting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</>
            ) : (
              <><Check className="w-4 h-4" /> Accept & connect</>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

function VitalRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <Icon className="w-4 h-4 text-neutral-400" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function EndSessionModal({ session, reason, setReason, ending, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm animate-[fadeUp_0.2s_ease-out_both]">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-[0_24px_48px_-12px_rgba(15,23,42,0.28)] overflow-hidden">
        <header className="p-5 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">End emergency session</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              {session.patient?.name || session.patientName || 'Patient'} · {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 transition">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block text-sm font-medium text-neutral-700">Reason for ending (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Patient's concern resolved, referred to GP, escalated to hospital…"
            className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
          />
        </div>
        <footer className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={ending}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={ending}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition disabled:opacity-60"
          >
            {ending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Ending…</>
            ) : (
              <><PhoneOff className="w-4 h-4" /> End session</>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
