import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronUp, RefreshCw, Phone, CheckCircle2, XCircle,
  Clock, AlertTriangle,
} from 'lucide-react';
import { getCurrentQueue, callQueuePatient, completeQueueEntry, cancelQueueEntry } from '../../api';
import { initSocket, getSocket } from '../../../lib/socket';
import { useToast } from '../../ToastContext';
import { PRIORITY_STYLES } from './appointment-constants';
import { stripDrPrefix } from '../../../utils/doctorName';

const STATUS_PILL = {
  waiting:         { bg: 'bg-white', text: 'text-neutral-700', border: 'border-neutral-300' },
  in_consultation: { bg: 'bg-primary-600', text: 'text-white', border: 'border-primary-600' },
  completed:       { bg: 'bg-neutral-100', text: 'text-neutral-400', border: 'border-neutral-200' },
};

// ─── Token Pill ──────────────────────────────────────────
function TokenPill({ entry, isCurrent }) {
  const s = STATUS_PILL[entry.status] || STATUS_PILL.waiting;
  return (
    <div
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${s.bg} ${s.text} ${s.border} ${
        isCurrent ? 'ring-2 ring-primary-200 shadow-sm' : ''
      }`}
      title={`${entry.patient?.name || entry.patientName || 'Patient'} — ${entry.status.replace(/_/g, ' ')}`}
    >
      #{entry.tokenNumber || '?'}
      {entry.priority === 'emergency' && <AlertTriangle className="h-3 w-3 text-red-500" />}
      {entry.status === 'in_consultation' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
        </span>
      )}
    </div>
  );
}

// ─── Expanded Queue Card ─────────────────────────────────
function QueueCard({ entry, onCall, onComplete, onCancel, acting }) {
  const priority = PRIORITY_STYLES[entry.priority] || PRIORITY_STYLES.normal;
  const isWaiting = entry.status === 'waiting';
  const isInConsult = entry.status === 'in_consultation';

  return (
    <div className={`flex items-center gap-4 p-3 rounded-xl border-l-4 ${priority.border} bg-white border border-neutral-200`}>
      {/* Token */}
      <div className="w-10 h-10 rounded-xl bg-neutral-50 flex items-center justify-center text-sm font-bold text-neutral-700 shrink-0">
        #{entry.tokenNumber}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-neutral-900 truncate">{entry.patient?.name || entry.patientName || 'Patient'}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priority.badge}`}>
            {entry.priority}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-neutral-500">Dr. {stripDrPrefix(entry.doctor?.name || 'Unassigned')}</span>
          {entry.checkedInAt && (
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <Clock className="h-3 w-3" />
              {new Date(entry.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isWaiting && (
          <>
            <button
              onClick={() => onCall(entry._id)}
              disabled={acting}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition disabled:opacity-50"
            >
              <Phone className="h-3 w-3" /> Call
            </button>
            <button
              onClick={() => onCancel(entry._id)}
              disabled={acting}
              className="p-1.5 text-neutral-400 hover:text-red-500 transition disabled:opacity-50"
              title="Cancel"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </>
        )}
        {isInConsult && (
          <button
            onClick={() => onComplete(entry._id)}
            disabled={acting}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-secondary-600 hover:bg-secondary-700 rounded-lg transition disabled:opacity-50"
          >
            <CheckCircle2 className="h-3 w-3" /> Done
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main LiveQueueBar ───────────────────────────────────
export default function LiveQueueBar({ branchId }) {
  const [queue, setQueue] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const toast = useToast();

  const fetchQueue = useCallback(async () => {
    if (!branchId) return; // branch is required by the backend
    try {
      setLoading(true);
      const res = await getCurrentQueue({ branch: branchId });
      const data = Array.isArray(res.data) ? res.data : res.data?.items || res.data?.queue || [];
      setQueue(data);
    } catch {
      // Silent fail — bar just shows empty
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  // Initial fetch + polling + WebSocket
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 60_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    sock.on('queue:update', fetchQueue);
    sock.on('appointment:update', fetchQueue);
    return () => {
      sock.off('queue:update', fetchQueue);
      sock.off('appointment:update', fetchQueue);
    };
  }, [fetchQueue]);

  // Actions
  const handleCall = async (id) => {
    setActing(true);
    try {
      await callQueuePatient(id);
      toast?.success?.('Patient called');
      fetchQueue();
    } catch (err) {
      toast?.error?.(err.message || 'Failed to call patient');
    } finally { setActing(false); }
  };

  const handleComplete = async (id) => {
    setActing(true);
    try {
      await completeQueueEntry(id);
      toast?.success?.('Consultation completed');
      fetchQueue();
    } catch (err) {
      toast?.error?.(err.message || 'Failed to complete');
    } finally { setActing(false); }
  };

  const handleCancel = async (id) => {
    setActing(true);
    try {
      await cancelQueueEntry(id, { reason: 'Removed from queue' });
      toast?.success?.('Removed from queue');
      fetchQueue();
    } catch (err) {
      toast?.error?.(err.message || 'Failed to cancel');
    } finally { setActing(false); }
  };

  // Stats
  const waiting = queue.filter((e) => e.status === 'waiting');
  const inConsult = queue.filter((e) => e.status === 'in_consultation');
  const activeQueue = queue.filter((e) => e.status !== 'completed');

  if (queue.length === 0 && !loading) return null;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
          <Clock className="h-4 w-4 text-primary-600" />
        </div>

        <span className="text-sm font-semibold text-neutral-700">Today's Queue</span>

        {/* Token pills (collapsed) */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto hide-scrollbar mx-2">
          {activeQueue.slice(0, 15).map((entry) => (
            <TokenPill key={entry._id} entry={entry} isCurrent={entry.status === 'in_consultation'} />
          ))}
          {activeQueue.length > 15 && (
            <span className="text-[11px] text-neutral-400 whitespace-nowrap">+{activeQueue.length - 15} more</span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-neutral-500 shrink-0">
          <span>Waiting: <strong className="text-neutral-700">{waiting.length}</strong></span>
          <span>Active: <strong className="text-emerald-600">{inConsult.length}</strong></span>
        </div>

        {/* Refresh — span instead of button to avoid nested <button> DOM nesting error */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); fetchQueue(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); fetchQueue(); } }}
          className="p-1.5 text-neutral-400 hover:text-primary-600 transition cursor-pointer"
          title="Refresh queue"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </span>

        {expanded ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-neutral-200 px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
          {activeQueue.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">Queue is empty</p>
          ) : (
            activeQueue.map((entry) => (
              <QueueCard
                key={entry._id}
                entry={entry}
                onCall={handleCall}
                onComplete={handleComplete}
                onCancel={handleCancel}
                acting={acting}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
