/**
 * Telemedicine — Admin video session overview.
 *
 * Redesign: Uniform PageHeader, stat cards (Active/Waiting/Emergencies),
 * toolbar card with FilterPill + search + create, session table,
 * create-session modal, socket-driven real-time updates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Plus, Search, Calendar, Clock, User, Users,
  PhoneOff, AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  Stethoscope, Zap, X, Eye, Activity, AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  listVideoSessions, createVideoSession,
  cancelVideoSession, endVideoSession,
  listEmergencySessions,
  listDoctors, listPatients, listBranches,
} from '../api';
import { initSocket, callLife, emergencyBus } from '../../lib/socket';
import { Modal } from '../../platform/components/shared';

/* ── Design tokens ────────────────���───────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ── Stat card config ───────��─────────────────────── */
const STAT_CONFIG = [
  { key: 'active',      title: 'Active Calls',  icon: Video,         color: 'green' },
  { key: 'waiting',     title: 'Waiting',        icon: Clock,         color: 'yellow' },
  { key: 'emergencies', title: 'Emergencies',    icon: AlertTriangle, color: 'red' },
];

const PALETTE = {
  green:  { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  yellow: { iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  red:    { iconBg: 'bg-red-50',       iconText: 'text-red-600' },
};

/* ── Status styles ────────────────────────────────── */
const STATUS_STYLES = {
  requested:  { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400' },
  scheduled:  { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
  waiting:    { bg: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-400 animate-pulse' },
  active:     { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
  paused:     { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400' },
  ended:      { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  cancelled:  { bg: 'bg-rose-50',     text: 'text-rose-600',    dot: 'bg-rose-400' },
  expired:    { bg: 'bg-neutral-50',  text: 'text-neutral-500', dot: 'bg-neutral-300' },
  no_show:    { bg: 'bg-rose-50',     text: 'text-rose-600',    dot: 'bg-rose-400' },
};

const TYPE_OPTIONS = [
  { v: '',          label: 'All types' },
  { v: 'emergency', label: 'Emergency' },
  { v: 'scheduled', label: 'Scheduled' },
  { v: 'follow_up', label: 'Follow-up' },
];

const STATUS_FILTERS = [
  { v: '',          label: 'All' },
  { v: 'active',    label: 'Active' },
  { v: 'waiting',   label: 'Waiting' },
  { v: 'scheduled', label: 'Scheduled' },
  { v: 'ended',     label: 'Ended' },
  { v: 'cancelled', label: 'Cancelled' },
];

/* ── Helpers ──────────────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('');
}

function fmtDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function LiveTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  if (!startedAt) return <span className="text-neutral-400">—</span>;
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return <span className="font-mono tabular-nums tracking-tight">{fmtDuration(secs)}</span>;
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.ended;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

/* ── Create Session Modal ─────────────────────────── */
function CreateSessionModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ type: 'scheduled', patient: '', doctor: '', branch: '', scheduledAt: '', maxDuration: 1800, reason: '' });
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {}),
      listDoctors({ limit: 100 }).then((r) => setDoctors(r.data || [])).catch(() => {}),
      listBranches({ limit: 50 }).then((r) => setBranches(r.data || [])).catch(() => {}),
    ]);
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = { ...form };
      if (!body.doctor) delete body.doctor;
      if (!body.branch) delete body.branch;
      if (!body.scheduledAt) delete body.scheduledAt;
      await createVideoSession(body);
      onCreated?.();
      onClose();
      setForm({ type: 'scheduled', patient: '', doctor: '', branch: '', scheduledAt: '', maxDuration: 1800, reason: '' });
    } catch (err) { setError(err.message || 'Could not create session'); }
    finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="New Video Session" wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Session type */}
        <div>
          <label className={labelCls}>Session Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'emergency', icon: Zap, label: 'Emergency' },
              { v: 'scheduled', icon: Calendar, label: 'Scheduled' },
              { v: 'follow_up', icon: Stethoscope, label: 'Follow-up' },
            ].map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: v }))}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition-all inline-flex items-center justify-center gap-1.5 ${
                  form.type === v
                    ? v === 'emergency'
                      ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-100'
                      : 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-100'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Patient *</label>
          <select required value={form.patient} onChange={(e) => setForm((f) => ({ ...f, patient: e.target.value }))} className={inputCls}>
            <option value="">Select patient…</option>
            {patients.map((p) => <option key={p._id} value={p._id}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Doctor</label>
          <select value={form.doctor} onChange={(e) => setForm((f) => ({ ...f, doctor: e.target.value }))} className={inputCls}>
            <option value="">Auto-assign / select doctor…</option>
            {doctors.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.specialization || 'General'})</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Branch</label>
          <select value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} className={inputCls}>
            <option value="">Select branch…</option>
            {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Scheduled At</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Max Duration (sec)</label>
            <input type="number" min="60" step="60" value={form.maxDuration} onChange={(e) => setForm((f) => ({ ...f, maxDuration: parseInt(e.target.value, 10) || 1800 }))} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Reason / Visit Note</label>
          <textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Optional — shown to the doctor before they join" className={`${inputCls} resize-none`} />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={loading || !form.patient} className={`${btnPrimary} flex items-center gap-2`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Session
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Session Row ──────────────────────────────────── */
function SessionRow({ session, onView, onCancel, onEnd }) {
  const patientName = session.patient?.name || 'Patient';
  const doctorName  = session.doctor?.name  || 'Unassigned';
  const branchName  = session.branch?.name;
  const TypeIcon = session.type === 'emergency' ? Zap : session.type === 'follow_up' ? Stethoscope : Calendar;

  const canCancel = ['requested', 'scheduled', 'waiting'].includes(session.status);
  const canEnd    = ['active', 'paused', 'waiting'].includes(session.status);
  const startedAt = session.startedAt || (session.status === 'active' ? session.updatedAt : null);

  return (
    <tr className="group hover:bg-neutral-50/60 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ${session.type === 'emergency' ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}>
            <TypeIcon className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-900 capitalize leading-tight">{session.type?.replace(/_/g, ' ') || 'Session'}</p>
            <p className="text-[10px] text-neutral-500 font-mono truncate">{session._id?.slice(-8)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 text-xs font-semibold">{getInitials(patientName)}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate leading-tight">{patientName}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-neutral-800 truncate leading-tight">{doctorName}</p>
            {session.doctor?.specialization && <p className="text-[11px] text-neutral-500 truncate leading-tight">{session.doctor.specialization}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">{branchName ? <span className="text-xs text-neutral-600 truncate">{branchName}</span> : <span className="text-xs text-neutral-400">—</span>}</td>
      <td className="px-4 py-3"><StatusBadge status={session.status} /></td>
      <td className="px-4 py-3 text-xs text-neutral-600">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-neutral-400" />
          {session.status === 'active' ? <LiveTimer startedAt={startedAt} /> : session.scheduledAt ? (
            <span className="tabular-nums">{(() => { const _d = new Date(session.scheduledAt); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const _h = _d.getUTCHours(); const _m = _d.getUTCMinutes(); return `${months[_d.getUTCMonth()]} ${_d.getUTCDate()}, ${String(_h % 12 || 12).padStart(2,'0')}:${String(_m).padStart(2,'0')} ${_h >= 12 ? 'PM' : 'AM'}`; })()}</span>
          ) : <span className="text-neutral-400">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => onView(session)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors" title="Open in call panel">
            <Eye className="w-3.5 h-3.5" /> View
          </button>
          {canEnd && (
            <button type="button" onClick={() => onEnd(session)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 rounded-lg transition-colors" title="End session">
              <PhoneOff className="w-3.5 h-3.5" /> End
            </button>
          )}
          {canCancel && (
            <button type="button" onClick={() => onCancel(session)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors" title="Cancel session">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ════════���══════════════════════════════════════════ */
export default function Telemedicine() {
  const { user } = useTenantAuth();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ search: '', type: '', status: '', page: 1 });
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const [liveCounts, setLiveCounts] = useState({ active: 0, waiting: 0, emergencies: 0 });
  const [bannerLoading, setBannerLoading] = useState(true);

  const PAGE_SIZE = 20;
  const refreshTimerRef = useRef(null);
  const [searchLocal, setSearchLocal] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchLocal, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchLocal]);

  /* ── Banner fetch ────────────────────────────────── */
  const loadLiveCounts = useCallback(async () => {
    setBannerLoading(true);
    try {
      const [activeRes, waitingRes, emergencyRes] = await Promise.all([
        listVideoSessions({ status: 'active', limit: 1 }).catch(() => null),
        listVideoSessions({ status: 'waiting', limit: 1 }).catch(() => null),
        listEmergencySessions({ status: 'pending', limit: 1 }).catch(() => null),
      ]);
      setLiveCounts({
        active:      activeRes?.pagination?.total    ?? (activeRes?.data?.length || 0),
        waiting:     waitingRes?.pagination?.total   ?? (waitingRes?.data?.length || 0),
        emergencies: emergencyRes?.pagination?.total ?? (emergencyRes?.data?.length || 0),
      });
    } finally { setBannerLoading(false); }
  }, []);

  /* ── Table fetch ─────────────────────────────────── */
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: filters.page, limit: PAGE_SIZE,
        ...(filters.type   ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { search: filters.search } : {}),
      };
      const res = await listVideoSessions(params);
      setSessions(res.data || []);
      setPagination(res.pagination || { page: filters.page, total: 0, totalPages: 1 });
    } catch (err) { setError(err.message || 'Could not load sessions'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadLiveCounts(); }, [loadLiveCounts]);

  /* ── Socket reconciliation ──────────────────────── */
  const scheduleReload = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      loadLiveCounts();
      loadSessions();
    }, 600);
  }, [loadLiveCounts, loadSessions]);

  useEffect(() => {
    initSocket();
    const offCall = callLife.on((event) => {
      if (['video:peer-joined', 'video:peer-left', 'video:call-ended', 'video:user-joined', 'video:user-left'].includes(event)) scheduleReload();
    });
    const offEm = emergencyBus.on((event) => {
      if (['emergency:new', 'emergency:accepted', 'emergency:cancelled', 'emergency:ended'].includes(event)) scheduleReload();
    });
    return () => { offCall(); offEm(); };
  }, [scheduleReload]);

  /* ── Row actions ─────────────────────────────────── */
  const handleView = (session) => navigate(`/clinic/telemedicine/${session._id}`);
  const handleCancel = async (session) => {
    const reason = window.prompt('Reason for cancellation (optional):') ?? '';
    if (reason === null) return;
    try { await cancelVideoSession(session._id, { reason }); loadSessions(); loadLiveCounts(); }
    catch (err) { setError(err.message || 'Could not cancel session'); }
  };
  const handleEnd = async (session) => {
    if (!window.confirm(`End the active session with ${session.patient?.name || 'the patient'}?`)) return;
    try { await endVideoSession(session._id, { notes: 'Ended by admin' }); loadSessions(); loadLiveCounts(); }
    catch (err) { setError(err.message || 'Could not end session'); }
  };

  const totalPages = pagination.totalPages || Math.max(1, Math.ceil((pagination.total || 0) / PAGE_SIZE));
  const isEmpty = !loading && sessions.length === 0;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Telemedicine</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Real-time video session control room · Updates via WebSocket
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadLiveCounts(); loadSessions(); }} disabled={loading} className={`${btnGhost} flex items-center gap-2`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> New Session
          </button>
        </div>
      </div>

      {/* ── Stat Cards ──────���────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {STAT_CONFIG.map((s, i) => {
          const p = PALETTE[s.color] || PALETTE.green;
          return (
            <div key={s.key} className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: `${50 + i * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                  <s.icon className={`h-6 w-6 ${p.iconText}`} />
                </div>
                {s.key === 'emergencies' && liveCounts.emergencies > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 animate-pulse">
                    Live
                  </span>
                )}
              </div>
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">
                {bannerLoading ? '—' : liveCounts[s.key]}
              </p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ──────────────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by patient, doctor, reason…"
              value={searchLocal}
              onChange={(e) => setSearchLocal(e.target.value)}
              className={`${inputCls} pl-10`}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Status filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STATUS_FILTERS.map((f) => {
                const isActive = filters.status === f.v;
                return (
                  <button
                    key={f.v}
                    onClick={() => setFilters((prev) => ({ ...prev, status: f.v, page: 1 }))}
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

            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}
              className={selectCls}
            >
              {TYPE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>

            <button
              onClick={() => { setSearchLocal(''); setFilters({ search: '', type: '', status: '', page: 1 }); }}
              className="text-xs text-neutral-500 hover:text-neutral-700 font-medium px-2"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────── */}
      {error && (
        <div className={`${cardCls} border-red-200 bg-red-50 p-4 flex items-start gap-2`}>
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Sessions Table ───────────────────────────── */}
      <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 leading-tight">All Sessions</h2>
              <p className="text-[11px] text-neutral-500 leading-tight">
                {pagination.total ? `${pagination.total.toLocaleString()} total` : 'No sessions yet'}
              </p>
            </div>
          </div>
          {loading && (
            <div className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> refreshing
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-100 bg-white">
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Patient</th>
                <th className="px-4 py-2.5 text-left font-medium">Doctor</th>
                <th className="px-4 py-2.5 text-left font-medium">Branch</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">When / Duration</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isEmpty ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="inline-flex flex-col items-center text-neutral-500">
                      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
                        <Video className="h-7 w-7 text-neutral-400" />
                      </div>
                      <p className="text-sm font-medium text-neutral-600">No sessions match these filters</p>
                      <p className="text-xs text-neutral-400 mt-1">Try clearing filters or create a new teleconsult.</p>
                      <button onClick={() => setShowCreate(true)} className={`mt-4 ${btnPrimary} flex items-center gap-2`}>
                        <Plus className="w-3.5 h-3.5" /> New Session
                      </button>
                    </div>
                  </td>
                </tr>
              ) : loading && sessions.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-4"><div className="h-10 bg-neutral-100 rounded-xl animate-pulse" /></td></tr>
                ))
              ) : (
                sessions.map((session) => (
                  <SessionRow key={session._id} session={session} onView={handleView} onCancel={handleCancel} onEnd={handleEnd} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100 bg-neutral-50/40">
            <p className="text-xs text-neutral-500">
              Page <span className="font-semibold text-neutral-700">{pagination.page}</span> of <span className="font-semibold text-neutral-700">{totalPages}</span>
            </p>
            <div className="inline-flex items-center gap-1">
              <button
                disabled={pagination.page <= 1 || loading}
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                disabled={pagination.page >= totalPages || loading}
                onClick={() => setFilters((f) => ({ ...f, page: Math.min(totalPages, f.page + 1) }))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 disabled:opacity-50 transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Modal ─────────────────────────────── */}
      <CreateSessionModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { loadSessions(); loadLiveCounts(); }}
      />
    </div>
  );
}
