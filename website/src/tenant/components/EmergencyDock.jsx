/**
 * Doctor-facing header widget — glanceable emergency queue with a pulse
 * badge and a dropdown popover that hosts the full <EmergencyFeed />.
 *
 * Mirrors the NotificationBell pattern so the header stays compact. Live
 * count updates come from the shared `emergencyBus` socket subscriber,
 * so no extra polling. Opens with ESC-to-close and click-outside.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Siren } from 'lucide-react';
import { listEmergencySessions } from '../api';
import { initSocket, emergencyBus } from '../../lib/socket';
import { EmergencyFeed } from './EmergencyFeed';

export function EmergencyDock({ role = 'doctor', viewAllHref = '/clinic/doctor-emergency' }) {
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const popRef = useRef(null);

  const pendingCount = pendingIds.size;

  const refreshCount = useCallback(async () => {
    try {
      const res = await listEmergencySessions({ status: 'pending', limit: 50 });
      const list = res?.data?.items || res?.data || res?.items || res || [];
      setPendingIds(new Set((Array.isArray(list) ? list : []).map((e) => String(e?._id || e?.id)).filter(Boolean)));
    } catch {
      /* socket will self-heal */
    }
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    initSocket();
    const off = emergencyBus.on((event, payload) => {
      const sid = String(payload?.sessionId || payload?.session?._id || '');
      if (!sid) return;
      setPendingIds((prev) => {
        const next = new Set(prev);
        if (event === 'emergency:new') next.add(sid);
        else next.delete(sid); // accepted / declined / cancelled / ended → clear
        return next;
      });
    });
    return off;
  }, []);

  // Click-outside + Escape to dismiss
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasPending = pendingCount > 0;
  const buttonTone = useMemo(() => (
    hasPending
      ? 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100'
      : 'text-neutral-500 bg-white border-neutral-200 hover:bg-neutral-50'
  ), [hasPending]);

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={hasPending ? `${pendingCount} emergencies waiting` : 'Emergency queue'}
        className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition ${buttonTone}`}
      >
        <Siren className={`h-4 w-4 ${hasPending ? 'animate-pulse' : ''}`} />
        {hasPending && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[92vw] bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-lg)] z-[80] overflow-hidden">
          <EmergencyFeed
            role={role}
            limit={4}
            viewAllHref={viewAllHref}
            className="!border-0 !shadow-none !rounded-none"
          />
        </div>
      )}
    </div>
  );
}

export default EmergencyDock;
