/**
 * Floating "return to active call" pill.
 *
 * When the user has navigated away from the active call but the session is
 * still live, this pill floats bottom-right and offers a one-click route
 * back to /patient/video/:id (or whatever path the activeCall was registered
 * with). Auto-hides when activeCall is null or when the current URL already
 * IS the active call URL.
 */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PhoneCall, Undo2 } from 'lucide-react';
import { subscribe } from './callStore';

function fmtDuration(startedAt) {
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function ActiveCallPill() {
  const [call, setCall] = useState(null);
  const [now, setNow] = useState(Date.now());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return subscribe((snap) => setCall(snap.activeCall));
  }, []);

  useEffect(() => {
    if (!call) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [call, now]);

  if (!call) return null;
  // Hide if already on the call page
  if (call.routePath && location.pathname === call.routePath) return null;

  const peerLabel = call.peerName || (call.peerRole === 'doctor' ? 'your clinician' : 'patient');

  return (
    <button
      type="button"
      onClick={() => call.routePath && navigate(call.routePath)}
      className="fixed z-50 bottom-24 right-4 md:bottom-6 md:right-6 flex items-center gap-3 pr-4 pl-3 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_12px_28px_-6px_rgba(16,185,129,0.55)] ring-2 ring-emerald-300/30 transition-all animate-[fadeUp_0.3s_ease-out_both]"
      aria-label="Return to active call"
    >
      <span className="relative inline-flex w-8 h-8 items-center justify-center rounded-full bg-white/20">
        <span className="absolute inset-0 rounded-full bg-white/25 animate-ping" />
        <PhoneCall className="relative w-4 h-4" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">In call · {fmtDuration(call.startedAt)}</span>
        <span className="text-sm font-semibold line-clamp-1">with {peerLabel}</span>
      </span>
      <span className="hidden sm:inline-flex items-center gap-1 pl-2 ml-1 border-l border-white/30">
        <Undo2 className="w-3.5 h-3.5" /> <span className="text-xs">Return</span>
      </span>
    </button>
  );
}

export default ActiveCallPill;
