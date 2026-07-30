/**
 * Doctor presence toggle (header dropdown).
 *
 * Renders a colored-dot chip with the current presence status (Online / Busy /
 * Do Not Disturb / Offline). Clicking opens a menu to change status. On change:
 *   1. Optimistically updates local UI
 *   2. POSTs to /telemedicine/presence
 *   3. Emits `emitPresenceChange(status)` so the backend broadcasts to tenant
 *
 * The component subscribes to `onPresenceChange` and reconciles its own user
 * in the map (so another tab / admin override propagates here too).
 *
 * Only shown when the logged-in user has a role that supports presence
 * (doctor / receptionist). Owners and admins can still toggle to signal
 * availability during on-call rotations.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { setPresence } from '../api';
import {
  initSocket,
  emitPresenceChange,
  onPresenceChange,
  offPresenceChange,
} from '../../lib/socket';

const OPTIONS = [
  { value: 'online',  label: 'Online',         hint: 'Available for calls',   dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  { value: 'busy',    label: 'In a call',      hint: 'Currently on a call',   dot: 'bg-rose-500',    ring: 'ring-rose-200',    text: 'text-rose-700',    bg: 'bg-rose-50' },
  { value: 'dnd',     label: 'Do not disturb', hint: 'Silence incoming',      dot: 'bg-amber-500',   ring: 'ring-amber-200',   text: 'text-amber-700',   bg: 'bg-amber-50' },
  { value: 'offline', label: 'Offline',        hint: 'Not accepting calls',   dot: 'bg-neutral-400', ring: 'ring-neutral-200', text: 'text-neutral-600', bg: 'bg-neutral-50' },
];

function metaFor(value) {
  return OPTIONS.find((o) => o.value === value) || OPTIONS[3];
}

export function PresenceToggle({
  /** Current user id — used to filter presence:change broadcasts back to self. */
  userId,
  /** Initial status if one is known from the auth context. */
  initialStatus = 'online',
  /** Compact variant (dot only, no label) for tight headers. */
  compact = false,
  className = '',
}) {
  const [status, setStatus] = useState(initialStatus);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  // Ensure socket is up (no-op if already connected).
  useEffect(() => { initSocket(); }, []);

  // Reconcile with server broadcasts (other tabs, admin overrides, etc.)
  useEffect(() => {
    if (!userId) return;
    const handler = (payload) => {
      if (!payload?.userId) return;
      if (String(payload.userId) !== String(userId)) return;
      if (payload.status && payload.status !== status) {
        setStatus(payload.status);
      }
    };
    onPresenceChange(handler);
    return () => offPresenceChange(handler);
  }, [userId, status]);

  // Outside-click to close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const current = metaFor(status);

  const change = async (nextValue) => {
    if (saving || nextValue === status) { setOpen(false); return; }
    const prev = status;
    setStatus(nextValue);
    setOpen(false);
    setSaving(true);
    setError(null);
    try {
      await setPresence(nextValue);
      // Broadcast to peers without waiting for REST reply
      emitPresenceChange(nextValue);
    } catch (err) {
      setStatus(prev);
      setError(err.message || 'Could not update presence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current.hint}
        className={`inline-flex items-center gap-2 rounded-full border ${current.bg} ${current.text} ring-1 ${current.ring} px-2.5 py-1.5 text-xs font-medium hover:shadow-sm transition-all ${compact ? '' : 'pr-3'}`}
      >
        <span className="relative inline-flex w-2.5 h-2.5">
          <span className={`absolute inset-0 rounded-full ${current.dot}`} />
          {status === 'online' && (
            <span className={`absolute inset-0 rounded-full ${current.dot} opacity-60 animate-ping`} />
          )}
        </span>
        {!compact && <span>{current.label}</span>}
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-neutral-200 shadow-[0_20px_40px_-12px_rgba(15,23,42,0.18)] p-1.5 z-50"
        >
          <div className="px-3 pt-2 pb-1.5 border-b border-neutral-100 mb-1">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">Set your status</p>
          </div>
          {OPTIONS.map((opt) => {
            const isActive = opt.value === status;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => change(opt.value)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${isActive ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
              >
                <span className="relative inline-flex w-2.5 h-2.5 shrink-0">
                  <span className={`absolute inset-0 rounded-full ${opt.dot}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 leading-tight">{opt.label}</span>
                  <span className="block text-[11px] text-neutral-500 leading-tight">{opt.hint}</span>
                </span>
                {isActive && <Check className="w-4 h-4 text-primary-600" />}
              </button>
            );
          })}
          {error && (
            <div className="mx-3 mt-2 mb-1 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PresenceToggle;
