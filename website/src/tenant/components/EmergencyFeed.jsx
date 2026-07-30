/**
 * Realtime emergency queue for doctors / receptionists.
 *
 * - Fetches the current pending emergencies once on mount.
 * - Subscribes to `emergency:new`, `emergency:accepted`, `emergency:cancelled`,
 *   `emergency:ended` and reconciles the in-memory queue.
 * - Renders a compact, pulse-animated list. Each card shows the patient
 *   triage preview + a wait timer and (for doctors) a one-click Accept that
 *   auto-creates the VideoSession and navigates to it.
 *
 * Designed to live in a sidebar slot (TenantLayout) or as a standalone
 * widget on the receptionist dashboard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Siren, Video, MessageSquareText, Clock, Loader2,
  Activity, Check, Inbox, ChevronRight,
} from 'lucide-react';
import {
  listEmergencySessions,
  acceptEmergencySession,
} from '../api';
import {
  initSocket,
  emergencyBus,
} from '../../lib/socket';

const TYPE_META = {
  video:   { icon: Video,             label: 'Video',     tone: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  chat:    { icon: MessageSquareText, label: 'Chat',      tone: 'text-violet-700 bg-violet-50 border-violet-200' },
  call:    { icon: Siren,             label: 'Call',      tone: 'text-amber-700  bg-amber-50  border-amber-200' },
  visit:   { icon: Activity,          label: 'Visit',     tone: 'text-sky-700    bg-sky-50    border-sky-200' },
};

function fmtWait(createdAt) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function paintPain(score) {
  if (score == null) return null;
  if (score >= 8) return { label: `Pain ${score}`, tone: 'text-rose-700 bg-rose-50 border-rose-200' };
  if (score >= 5) return { label: `Pain ${score}`, tone: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: `Pain ${score}`, tone: 'text-neutral-700 bg-neutral-50 border-neutral-200' };
}

export function EmergencyFeed({
  /** 'doctor' | 'receptionist' | 'owner' — controls action affordances. */
  role = 'doctor',
  /** Limit the visible items. Older items can be reached via navigation CTA. */
  limit = 4,
  /** Click-through path for "view all". */
  viewAllHref = '/clinic/doctor-emergency',
  className = '',
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await listEmergencySessions({ status: 'pending', limit: 20 });
      const list = res?.data?.items || res?.data || res?.items || res || [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      // swallow — socket will self-heal
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    initSocket();
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  // Re-tick timers once per second for live wait counters
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Socket reconciliation
  useEffect(() => {
    const off = emergencyBus.on((event, payload) => {
      if (!payload) return;
      if (event === 'emergency:new') {
        const sid = String(payload.sessionId || payload._id || '');
        setItems((prev) => {
          if (prev.some((it) => String(it._id || it.sessionId) === sid)) return prev;
          const next = [{
            _id: sid,
            sessionId: sid,
            type: payload.type || 'video',
            reason: payload.reason,
            symptoms: payload.symptoms,
            painScore: payload.pain ?? payload.painScore,
            createdAt: payload.createdAt || new Date().toISOString(),
            patient: payload.patient || { name: payload.patientName },
            status: 'pending',
          }, ...prev];
          return next;
        });
      } else if (event === 'emergency:accepted'
              || event === 'emergency:cancelled'
              || event === 'emergency:ended') {
        const sid = String(payload.sessionId || payload._id || '');
        setItems((prev) => prev.filter((it) => String(it._id || it.sessionId) !== sid));
      }
    });
    return () => off();
  }, []);

  const pending = useMemo(() => items.filter((x) => (x.status || 'pending') === 'pending'), [items]);
  const visible = pending.slice(0, limit);

  const onAccept = async (item) => {
    const sid = String(item._id || item.sessionId || '');
    if (!sid || acceptingId) return;
    setAcceptingId(sid);
    try {
      const res = await acceptEmergencySession(sid);
      const session = res?.data?.session || res?.data || res?.session || {};
      const videoSessionId = session.videoSession?._id
                          || session.videoSession
                          || session.videoSessionId;
      setItems((prev) => prev.filter((it) => String(it._id || it.sessionId) !== sid));
      if (videoSessionId) {
        navigate(`/clinic/telemedicine/${videoSessionId}`, {
          state: { fromEmergency: true, emergencyId: sid },
        });
      } else {
        // Chat variant — route to the emergency detail page for the chat thread
        navigate(`/clinic/doctor-emergency?focus=${sid}`);
      }
    } catch (err) {
      console.warn('[EmergencyFeed] accept failed', err.message);
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <div className={`rounded-2xl bg-white border border-neutral-200 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading emergency queue…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-white border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden ${className}`}>
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-neutral-100 bg-gradient-to-r from-rose-50/60 to-white">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex w-7 h-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pending.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white animate-pulse">
                {pending.length > 9 ? '9+' : pending.length}
              </span>
            )}
          </span>
          <div>
            <h3 className="font-display text-sm font-semibold text-neutral-900 leading-tight">Emergency queue</h3>
            <p className="text-[11px] text-neutral-500 leading-tight">
              {pending.length === 0 ? 'No pending cases' : `${pending.length} waiting${pending.length > limit ? ` · showing ${limit}` : ''}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(viewAllHref)}
          className="text-[11px] font-medium text-rose-700 hover:text-rose-800 inline-flex items-center gap-0.5"
        >
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </header>

      <div className="p-2 space-y-1.5">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6 text-neutral-500">
            <Inbox className="w-7 h-7 mb-1.5 opacity-60" />
            <p className="text-xs">Queue is clear. You'll be alerted when a new case arrives.</p>
          </div>
        ) : visible.map((item) => {
          const sid = String(item._id || item.sessionId || '');
          const typeMeta = TYPE_META[item.type] || TYPE_META.video;
          const TypeIcon = typeMeta.icon;
          const painPaint = paintPain(item.painScore ?? item.pain);
          const isAccepting = acceptingId === sid;
          const patientName = item.patient?.name || item.patientName || 'Patient';
          return (
            <article
              key={sid}
              className="group rounded-xl border border-rose-100 hover:border-rose-300 bg-white hover:bg-rose-50/40 transition-all p-3 animate-[fadeUp_0.35s_ease-out_both]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${typeMeta.tone}`}>
                      <TypeIcon className="w-3 h-3" /> {typeMeta.label}
                    </span>
                    {painPaint && (
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border ${painPaint.tone}`}>
                        {painPaint.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500 ml-auto tabular-nums">
                      <Clock className="w-3 h-3" /> {fmtWait(item.createdAt)}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-900 line-clamp-1 leading-tight">{patientName}</h4>
                  {(item.reason || item.symptoms) && (
                    <p className="text-[11px] text-neutral-600 line-clamp-2 mt-0.5 leading-snug">
                      {item.reason || (Array.isArray(item.symptoms) ? item.symptoms.join(', ') : item.symptoms)}
                    </p>
                  )}
                </div>
              </div>

              {role === 'doctor' && (
                <button
                  type="button"
                  onClick={() => onAccept(item)}
                  disabled={isAccepting}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-70 text-white text-xs font-medium py-1.5 shadow-sm transition-all"
                >
                  {isAccepting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Accepting…</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> Accept & connect</>
                  )}
                </button>
              )}
              {role !== 'doctor' && (
                <button
                  type="button"
                  onClick={() => navigate(`/clinic/doctor-emergency?focus=${sid}`)}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 hover:border-rose-300 hover:bg-rose-50 text-neutral-700 hover:text-rose-700 text-xs font-medium py-1.5 transition-all"
                >
                  View triage <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </article>
          );
        })}
      </div>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

export default EmergencyFeed;
