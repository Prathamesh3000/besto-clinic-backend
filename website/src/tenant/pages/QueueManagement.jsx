/**
 * QueueManagement — Live patient queue for admin/staff.
 *
 * Redesign: Uniform PageHeader, admin stat-card pattern, toolbar card
 * with search + priority FilterPill + branch selector, card-based queue,
 * room picker modal, real-time socket + polling.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, AlertCircle, Clock, CheckCircle2, XCircle,
  Phone, User, Zap, Activity, Smartphone, UserPlus, DoorOpen, Search,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { Spinner, ErrorAlert, EmptyState, Modal } from '../../platform/components/shared';
import {
  getCurrentQueue, callQueuePatient, completeQueueEntry,
  cancelQueueEntry, listBranches, listRooms,
  changeQueuePriority, moveQueueEntry,
} from '../api';
import { initSocket, getSocket } from '../../lib/socket';
import { useToast } from '../ToastContext';

/* ── Design tokens ────────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';

/* ── Stat card config ─────────────────────────────── */
const STAT_CONFIG = [
  { key: 'total',      title: 'Total in Queue', icon: Users,       color: 'primary' },
  { key: 'waiting',    title: 'Waiting',         icon: Clock,       color: 'yellow' },
  { key: 'inProgress', title: 'In Consultation', icon: Activity,    color: 'blue' },
  { key: 'emergency',  title: 'Emergency',       icon: AlertCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  yellow:  { iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  blue:    { iconBg: 'bg-blue-50',      iconText: 'text-blue-600' },
  red:     { iconBg: 'bg-red-50',       iconText: 'text-red-600' },
};

/* ── Priority + Status styles ─────────────────────── */
const PRIORITY_STYLES = {
  emergency: { border: 'border-l-red-500',    badge: 'bg-red-50 text-red-700' },
  high:      { border: 'border-l-orange-500',  badge: 'bg-orange-50 text-orange-700' },
  normal:    { border: 'border-l-neutral-300', badge: 'bg-neutral-100 text-neutral-600' },
};

const STATUS_STYLES = {
  waiting:         { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  in_consultation: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  completed:       { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const PRIORITY_FILTERS = [
  { key: '',          label: 'All' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'high',      label: 'High' },
  { key: 'normal',    label: 'Normal' },
];

/* ═══════════════════════════════════════════════════ */
export default function QueueManagement() {
  const { showToast } = useToast();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Room picker
  const [roomPickerEntry, setRoomPickerEntry] = useState(null);
  const [roomPickerRooms, setRoomPickerRooms] = useState([]);
  const [roomPickerLoading, setRoomPickerLoading] = useState(false);
  const [roomPickerSelected, setRoomPickerSelected] = useState(null);

  // Branch selection
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(() => {
    return localStorage.getItem('queue_selected_branch') || '';
  });

  // Fetch branches
  useEffect(() => {
    listBranches({ limit: 200 })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setBranches(data);
        if (!selectedBranch && data.length > 0) {
          const firstBranch = data[0]._id || data[0].id;
          setSelectedBranch(firstBranch);
          localStorage.setItem('queue_selected_branch', firstBranch);
        }
      })
      .catch(() => {});
  }, [selectedBranch]);

  const handleBranchChange = (branchId) => {
    setSelectedBranch(branchId);
    localStorage.setItem('queue_selected_branch', branchId);
  };

  // Fetch queue
  const fetchQueue = useCallback(() => {
    if (!selectedBranch) {
      setError('Please select a branch to view the queue');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getCurrentQueue({ branch: selectedBranch })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setQueue(data);
      })
      .catch((err) => setError(err.message || 'Failed to load queue'))
      .finally(() => setLoading(false));
  }, [selectedBranch]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 60_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // WebSocket
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const handler = () => fetchQueue();
    sock.on('queue:update', handler);
    sock.on('appointment:update', handler);
    return () => { sock.off('queue:update', handler); sock.off('appointment:update', handler); };
  }, [fetchQueue]);

  // Room picker
  const handleCallPatient = async (entry) => {
    setRoomPickerEntry(entry);
    setRoomPickerSelected(null);
    setRoomPickerLoading(true);
    try {
      const branchId = entry.branch?._id || entry.branch;
      const res = await listRooms(branchId ? { branch: branchId } : {});
      const allRooms = res.data || [];
      const freeRooms = allRooms.filter((r) => r.status === 'available');
      setRoomPickerRooms(freeRooms);
      if (freeRooms.length > 0) setRoomPickerSelected(freeRooms[0]._id);
    } catch {
      setRoomPickerRooms([]);
    } finally {
      setRoomPickerLoading(false);
    }
  };

  const confirmCallPatient = async (roomId) => {
    if (!roomPickerEntry) return;
    const id = roomPickerEntry._id;
    setActionLoading(id);
    setRoomPickerEntry(null);
    try {
      await callQueuePatient(id, roomId || undefined);
      showToast({ type: 'success', message: 'Patient called — SMS & notification sent' });
      fetchQueue();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to call patient' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (id, action) => {
    setActionLoading(id);
    try {
      if (action === 'complete') {
        await completeQueueEntry(id);
        showToast({ type: 'success', message: 'Consultation marked complete' });
      } else if (action === 'cancel') {
        await cancelQueueEntry(id, { reason: 'Cancelled by staff' });
        showToast({ type: 'warning', message: 'Queue entry cancelled' });
      }
      fetchQueue();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(null);
    }
  };

  // Move entry up/down
  const handleMove = async (id, direction) => {
    setActionLoading(id);
    try {
      await moveQueueEntry(id, direction);
      fetchQueue();
    } catch (err) {
      showToast({ type: 'error', message: err.message || `Failed to move ${direction}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Change priority
  const handlePriorityChange = async (id, priority) => {
    setActionLoading(id);
    try {
      await changeQueuePriority(id, priority);
      showToast({ type: 'success', message: `Priority changed to ${priority}` });
      fetchQueue();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to change priority' });
    } finally {
      setActionLoading(null);
    }
  };

  // Filter queue
  const filteredQueue = queue.filter((entry) => {
    if (priorityFilter && entry.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (entry.patient?.name || entry.patientName || '').toLowerCase();
      const doctor = (entry.doctor?.name || '').toLowerCase();
      if (!name.includes(q) && !doctor.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: queue.length,
    waiting: queue.filter(e => e.status === 'waiting').length,
    inProgress: queue.filter(e => e.status === 'in_consultation').length,
    emergency: queue.filter(e => e.priority === 'emergency').length,
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Queue Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage today's patient queue · Live updates enabled</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedBranch} onChange={(e) => handleBranchChange(e.target.value)} className={selectCls}>
            <option value="">Select branch...</option>
            {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
          </select>
          <button onClick={fetchQueue} disabled={loading || !selectedBranch} className={`${btnPrimary} flex items-center gap-2`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {STAT_CONFIG.map((s, i) => {
          const p = PALETTE[s.color] || PALETTE.primary;
          return (
            <div
              key={s.key}
              className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
              style={{ animationDelay: `${50 + i * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                  <s.icon className={`h-6 w-6 ${p.iconText}`} />
                </div>
              </div>
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{stats[s.key]}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ──────────────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient or doctor name..."
              className={`${inputCls} pl-10`}
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRIORITY_FILTERS.map((f) => {
              const isActive = priorityFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setPriorityFilter(f.key)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Queue List ───────────────────────────────── */}
      <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        {error ? (
          <div className="p-4"><ErrorAlert message={error} /></div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        ) : filteredQueue.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients in queue"
            message={searchQuery || priorityFilter ? 'Try adjusting your filters' : 'The queue is empty. Patients will appear here when they check in.'}
          />
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredQueue.map((entry, idx) => {
              const priority = PRIORITY_STYLES[entry.priority] || PRIORITY_STYLES.normal;
              const status = STATUS_STYLES[entry.status] || STATUS_STYLES.waiting;
              const isActionLoading = actionLoading === entry._id;

              return (
                <div
                  key={entry._id}
                  className={`p-4 hover:bg-neutral-50/50 transition-colors border-l-4 ${priority.border} animate-[fadeUp_0.3s_ease-out_both]`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Patient info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                          {(entry.patient?.name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-neutral-900">
                              {entry.patient?.name || entry.patientName || 'Unknown'}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.badge}`}>
                              {entry.priority}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${status.bg} ${status.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                              {entry.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {entry.doctor?.name || 'No doctor assigned'}
                            </span>
                            {entry.patient?.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {entry.patient.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.checkedInAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {entry.appointment ? (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">
                                <Smartphone className="h-3 w-3" /> Self check-in
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                                <UserPlus className="h-3 w-3" /> Manual
                              </span>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.status === 'waiting' && (
                        <>
                          {/* Move up/down */}
                          <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => handleMove(entry._id, 'up')}
                              disabled={isActionLoading || idx === 0 || filteredQueue[idx - 1]?.status !== 'waiting'}
                              title="Move up"
                              className="p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-px h-5 bg-neutral-200" />
                            <button
                              onClick={() => handleMove(entry._id, 'down')}
                              disabled={isActionLoading || idx === filteredQueue.length - 1 || filteredQueue[idx + 1]?.status !== 'waiting'}
                              title="Move down"
                              className="p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Priority select */}
                          <select
                            value={entry.priority}
                            onChange={(e) => handlePriorityChange(entry._id, e.target.value)}
                            disabled={isActionLoading}
                            className="px-2 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-700 cursor-pointer focus:border-primary-400 focus:ring-1 focus:ring-primary-100 outline-none disabled:opacity-50"
                          >
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="emergency">Emergency</option>
                          </select>

                          <button
                            onClick={() => handleCallPatient(entry)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Zap className="h-3 w-3" /> Call Patient
                          </button>
                          <button
                            onClick={() => handleAction(entry._id, 'cancel')}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        </>
                      )}
                      {entry.status === 'in_consultation' && (
                        <button
                          onClick={() => handleAction(entry._id, 'complete')}
                          disabled={isActionLoading}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Info Banner ──────────────────────────────── */}
      <div className={`${cardCls} border-blue-200 bg-blue-50 p-4`}>
        <div className="flex gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Live Queue Updates</p>
            <p className="text-blue-700">
              This page updates in real-time via WebSocket and refreshes every 30 seconds as a fallback.
              Calling a patient will send them an SMS and in-app notification.
            </p>
          </div>
        </div>
      </div>

      {/* ── Room Picker Modal ────────────────────────── */}
      <Modal open={!!roomPickerEntry} onClose={() => setRoomPickerEntry(null)} title="Select Room">
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            Choose a room for <span className="font-medium text-neutral-700">{roomPickerEntry?.patient?.name || 'Patient'}</span>
          </p>

          {roomPickerLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-7 w-7 border-3 border-primary-600 border-t-transparent rounded-full" />
            </div>
          ) : roomPickerRooms.length === 0 ? (
            <div className="text-center py-6">
              <DoorOpen className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">No available rooms in this branch</p>
              <p className="text-xs text-neutral-400 mt-1">The patient will be called without a room assignment</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {roomPickerRooms.map((room) => {
                const sel = roomPickerSelected === room._id;
                return (
                  <button
                    key={room._id}
                    onClick={() => setRoomPickerSelected(room._id)}
                    className={`text-left px-3.5 py-3 rounded-xl border-2 transition-all ${
                      sel
                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <p className="text-sm font-semibold text-neutral-900">{room.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-400">
                      <span className="font-mono uppercase">{room.code}</span>
                      <span>&middot;</span>
                      <span className="capitalize">{room.type}</span>
                      {room.floor && <><span>&middot;</span><span>{room.floor}</span></>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button
              onClick={() => confirmCallPatient(null)}
              className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 transition"
            >
              Skip room
            </button>
            <button
              onClick={() => confirmCallPatient(roomPickerSelected)}
              disabled={!roomPickerSelected && roomPickerRooms.length > 0}
              className={`${btnPrimary} flex items-center gap-2`}
            >
              <Zap className="h-3.5 w-3.5" /> Call Patient
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
