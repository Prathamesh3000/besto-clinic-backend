/**
 * Full-screen incoming call takeover.
 *
 * Renders a CallKit / WhatsApp-style ringing UI when the user is the target
 * of a `video:incoming-call` socket event. Features:
 *
 *   - Pulsing caller avatar with animated halo
 *   - Role-aware context (doctor ringing a patient, or patient queueing for
 *     a doctor — same component, polymorphic via callStore payload)
 *   - 64px circular Accept (emerald) / Decline (rose) FABs with labels
 *   - Synthesized ringtone + document title flasher + vibration
 *   - Escape key and backdrop click cannot dismiss — only explicit buttons
 *   - Auto-dismisses after 45s if no action (emits a missed-call)
 *
 * The overlay reads `callStore.incomingCall`. It declines via the
 * `declinePatientVideoSession` REST endpoint and navigates to the session
 * URL on accept. Accept nav target is configurable via props so the same
 * component can be mounted in tenant layouts (Wave 3) with a different
 * route pattern.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, PhoneOff, Stethoscope, User2, AlertTriangle, Video, MessageSquareText,
} from 'lucide-react';
import { subscribe, clearIncomingCall } from './callStore';
import { playRingtone, flashDocumentTitle, tryVibrate } from '../ringtone';
import { declinePatientVideoSession } from '../../patient/api';

const AUTO_DISMISS_MS = 45_000;

const TYPE_META = {
  video:     { icon: Video,             label: 'Video consultation' },
  chat:      { icon: MessageSquareText, label: 'Chat consultation'  },
  emergency: { icon: AlertTriangle,     label: 'Emergency'          },
};

export function IncomingCallOverlay({
  /** Function that turns a call payload into an app route. */
  resolveRoute = (call) => `/patient/video/${call.sessionId}`,
  /** Brand color accent. Defaults to primary-600. */
  accentClassName = 'from-primary-600 via-primary-700 to-primary-900',
  /**
   * Custom decline handler: receives (sessionId, reason).
   * Defaults to patient endpoint. Tenant layout injects its own.
   */
  onDecline = (sid, reason) => declinePatientVideoSession(sid, reason),
  /**
   * Optional render-prop or node shown between the reason chip and the
   * action buttons. Used by the tenant (doctor) variant to surface patient
   * triage context (symptoms, pain score, vitals) before accepting.
   */
  contextSlot = null,
  /**
   * Called before navigating on accept. Good hook for analytics / preparing
   * local state (e.g. doctor acknowledging a pending emergency session).
   */
  onBeforeAccept,
}) {
  const navigate = useNavigate();
  const [call, setCall] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const ringStopRef = useRef(null);
  const titleStopRef = useRef(null);
  const dismissTimerRef = useRef(null);

  // Subscribe to callStore
  useEffect(() => {
    const unsub = subscribe((snap) => setCall(snap.incomingCall));
    return unsub;
  }, []);

  // Sound + vibration lifecycle
  useEffect(() => {
    if (!call) return;
    const isEmergency = call.type === 'emergency';
    ringStopRef.current  = playRingtone(isEmergency ? 'emergency' : 'call');
    titleStopRef.current = flashDocumentTitle(
      isEmergency ? 'Emergency call…' : 'Incoming call…',
    );
    tryVibrate([250, 150, 250, 150, 250]);

    dismissTimerRef.current = setTimeout(() => {
      // Auto-dismiss after timeout — log as missed call via decline API
      const sid = call.sessionId;
      clearIncomingCall();
      if (sid) {
        try { onDecline(sid, 'missed-timeout'); } catch { /* best-effort */ }
      }
    }, AUTO_DISMISS_MS);

    return () => {
      ringStopRef.current?.();
      titleStopRef.current?.();
      clearTimeout(dismissTimerRef.current);
    };
  }, [call]);

  // Browser notification when tab is hidden
  useEffect(() => {
    if (!call) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || document.visibilityState === 'visible') return;
    if (Notification.permission !== 'granted') {
      if (Notification.permission !== 'denied') {
        Notification.requestPermission().catch(() => {});
      }
      return;
    }
    try {
      const n = new Notification(
        call.type === 'emergency' ? 'Emergency consultation' : 'Incoming consultation',
        {
          body: `${call.callerName || 'Clinician'}${call.reason ? ' — ' + call.reason : ''}`,
          tag:  `call-${call.sessionId}`,
          icon: '/favicon.svg',
          requireInteraction: true,
        },
      );
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* Notification API blocked */ }
  }, [call]);

  if (!call) return null;

  const handleAccept = () => {
    const route = resolveRoute(call);
    try { onBeforeAccept?.(call); } catch { /* swallow */ }
    clearIncomingCall();
    navigate(route, { state: { acceptedAt: Date.now(), fromIncomingCall: true } });
  };

  const handleDecline = async () => {
    const sid = call.sessionId;
    setDecliningId(sid);
    clearIncomingCall();
    try {
      await onDecline(sid, 'declined-by-user');
    } catch (err) {
      console.warn('[IncomingCallOverlay] decline failed', err.message);
    } finally {
      setDecliningId(null);
    }
  };

  const TypeIcon = (TYPE_META[call.type] || TYPE_META.video).icon;
  const typeLabel = (TYPE_META[call.type] || TYPE_META.video).label;
  const isDoctor = (call.callerRole || '').toLowerCase() === 'doctor';
  const isEmergency = call.type === 'emergency';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 bg-gradient-to-br ${isEmergency ? 'from-rose-700 via-rose-900 to-rose-950' : accentClassName}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.12),_transparent_60%)]" />

      {/* Content */}
      <div className="relative w-full max-w-md mx-4 text-center text-white">
        {/* Header chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium uppercase tracking-wider ring-1 ring-white/20">
          <TypeIcon className="w-3.5 h-3.5" />
          {typeLabel}{isEmergency && <span className="ml-1 text-rose-100">· URGENT</span>}
        </div>

        {/* Avatar with pulse halo */}
        <div className="mt-8 mb-6 relative mx-auto w-40 h-40">
          <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
          <span className="absolute inset-3 rounded-full bg-white/10 animate-pulse" />
          <div className="relative w-40 h-40 rounded-full bg-white/95 text-neutral-800 flex items-center justify-center shadow-[0_20px_60px_-10px_rgba(0,0,0,0.45)] ring-4 ring-white/30">
            {call.callerAvatar ? (
              <img
                src={call.callerAvatar}
                alt={call.callerName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-5xl font-display font-semibold">
                {getInitials(call.callerName)}
              </span>
            )}
            <span className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-md">
              {isDoctor ? (
                <Stethoscope className="w-6 h-6 text-primary-600" />
              ) : (
                <User2 className="w-6 h-6 text-neutral-700" />
              )}
            </span>
          </div>
        </div>

        {/* Name */}
        <h2 id="incoming-call-title" className="font-display text-3xl font-semibold tracking-tight">
          {call.callerName || (isDoctor ? 'Your clinician' : 'Incoming call')}
        </h2>
        <p className="mt-1 text-white/80 text-sm">
          {isDoctor ? 'is calling you now' : 'is requesting a consultation'}
        </p>

        {/* Reason chip */}
        {call.reason && (
          <div className="mt-5 inline-block max-w-full text-left px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/15">
            <p className="text-[11px] uppercase tracking-wider text-white/70 mb-0.5">Reason</p>
            <p className="text-sm text-white line-clamp-3">{call.reason}</p>
          </div>
        )}

        {/* Context slot (doctor triage preview, patient waiting-room info, etc.) */}
        {contextSlot && (
          <div className="mt-4 text-left">
            {typeof contextSlot === 'function' ? contextSlot(call) : contextSlot}
          </div>
        )}

        {/* Actions */}
        <div className="mt-12 flex items-center justify-center gap-14">
          <button
            type="button"
            onClick={handleDecline}
            disabled={Boolean(decliningId)}
            aria-label="Decline call"
            className="group flex flex-col items-center gap-2"
          >
            <span className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all flex items-center justify-center shadow-[0_12px_28px_-6px_rgba(244,63,94,0.55)] ring-4 ring-rose-300/20 disabled:opacity-60 disabled:cursor-not-allowed">
              <PhoneOff className="w-7 h-7 text-white" />
            </span>
            <span className="text-xs font-medium text-white/80 group-hover:text-white">Decline</span>
          </button>

          <button
            type="button"
            onClick={handleAccept}
            aria-label="Accept call"
            className="group flex flex-col items-center gap-2"
          >
            <span className="relative w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center shadow-[0_12px_28px_-6px_rgba(16,185,129,0.6)] ring-4 ring-emerald-300/30">
              <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
              <Phone className="relative w-7 h-7 text-white" />
            </span>
            <span className="text-xs font-medium text-white/80 group-hover:text-white">Accept</span>
          </button>
        </div>

        <p className="mt-8 text-[11px] uppercase tracking-wider text-white/50">
          BestoClinic secure line · end-to-end encrypted
        </p>
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export default IncomingCallOverlay;
