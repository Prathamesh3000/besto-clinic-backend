/**
 * DoctorAvailability — Doctor availability overview with date navigation.
 *
 * Redesign: Uniform PageHeader, admin stat-card pattern, toolbar card,
 * doctor card grid with slot progress bars, real-time socket updates.
 */
import { useState, useEffect, useCallback } from 'react';
import { getDoctorsAvailabilityOverview, listBranches, listDepartments } from '../api';
import { initSocket, getSocket } from '../../lib/socket';
import {
  CalendarDays, Stethoscope, Building2, Search,
  ChevronLeft, ChevronRight, Clock, Users, CheckCircle2,
  AlertTriangle, XCircle, Timer, CalendarClock, Hourglass,
} from 'lucide-react';

/* ── Design tokens ────────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';

/* ── Status config ────────────────────────────────── */
const STATUS_CONFIG = {
  available:    { label: 'Available',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', barColor: 'bg-emerald-500' },
  few_left:     { label: 'Few Left',     dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',     barColor: 'bg-amber-500' },
  fully_booked: { label: 'Fully Booked', dot: 'bg-red-500',     badge: 'bg-red-50 text-red-600 ring-1 ring-red-200',           barColor: 'bg-red-500' },
  off:          { label: 'Off',          dot: 'bg-neutral-400',  badge: 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200', barColor: 'bg-neutral-400' },
  leave:        { label: 'On Leave',     dot: 'bg-purple-500',   badge: 'bg-purple-50 text-purple-600 ring-1 ring-purple-200',  barColor: 'bg-purple-500' },
  unavailable:  { label: 'Unavailable',  dot: 'bg-neutral-300',  badge: 'bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200', barColor: 'bg-neutral-300' },
};

/* ── Stat card config ─────────────────────────────── */
const STAT_CONFIG = [
  { key: 'total',     title: 'Total Doctors', icon: Users,         color: 'primary' },
  { key: 'available', title: 'Available',      icon: CheckCircle2,  color: 'green' },
  { key: 'fewLeft',   title: 'Few Slots Left', icon: AlertTriangle, color: 'yellow' },
  { key: 'off',       title: 'Off / Booked',   icon: XCircle,       color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  green:   { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  yellow:  { iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  red:     { iconBg: 'bg-red-50',       iconText: 'text-red-600' },
};

/* ── Helpers ──────────────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-600', 'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600', 'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600', 'from-cyan-400 to-sky-600',
];

function avatarGradient(id) {
  if (!id) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ═══════════════════════════════════════════════════ */
export default function DoctorAvailability() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [branchFilter, setBranchFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(() => {
    if (!date) return;
    setLoading(true);
    setError(null);
    const params = { date };
    if (branchFilter) params.branch = branchFilter;
    if (departmentFilter) params.department = departmentFilter;

    getDoctorsAvailabilityOverview(params)
      .then((res) => setDoctors(res.data || []))
      .catch((err) => setError(err.message || 'Failed to load availability'))
      .finally(() => setLoading(false));
  }, [date, branchFilter, departmentFilter]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => setBranches(Array.isArray(res.data) ? res.data : res.data?.items || [])).catch(() => {});
    listDepartments({ limit: 100 }).then((res) => setDepartments(Array.isArray(res.data) ? res.data : res.data?.items || [])).catch(() => {});
  }, []);

  // Real-time refresh
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const handler = () => fetchOverview();
    sock.on('availability:invalidated', handler);
    sock.on('appointment:update', handler);
    return () => { sock.off('availability:invalidated', handler); sock.off('appointment:update', handler); };
  }, [fetchOverview]);

  const filteredDoctors = searchQuery.trim()
    ? doctors.filter((d) => {
        const q = searchQuery.toLowerCase();
        return (d.doctor?.name || '').toLowerCase().includes(q) || (d.doctor?.specialization || '').toLowerCase().includes(q);
      })
    : doctors;

  const counts = {
    total: filteredDoctors.length,
    available: filteredDoctors.filter((d) => d.status === 'available').length,
    fewLeft: filteredDoctors.filter((d) => d.status === 'few_left').length,
    off: filteredDoctors.filter((d) => ['off', 'leave', 'unavailable', 'fully_booked'].includes(d.status)).length,
  };

  const changeDate = (delta) => {
    const d = new Date(date + 'T00:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Doctor Availability</h1>
          <p className="text-sm text-neutral-500 mt-1">{formatDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-2.5 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-all shadow-sm">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={selectCls}
          />
          <button onClick={() => changeDate(1)} className="p-2.5 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-all shadow-sm">
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== today && (
            <button
              onClick={() => setDate(today)}
              className="px-3.5 py-2.5 text-xs font-semibold text-primary-700 bg-primary-50 ring-1 ring-primary-200 rounded-xl hover:bg-primary-100 transition"
            >
              Today
            </button>
          )}
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
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">
                {loading ? '—' : counts[s.key]}
              </p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Filter Toolbar ───────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor by name or specialization..."
              className={`${inputCls} pl-10`}
            />
          </div>
          <div className="flex gap-2 items-center">
            {branches.length > 1 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className={selectCls}
              >
                <option value="">All Branches</option>
                {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
              </select>
            )}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={selectCls}
            >
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────── */}
      {error && (
        <div className={`${cardCls} border-red-200 bg-red-50 p-4 flex items-center gap-3`}>
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button onClick={fetchOverview} className="text-sm font-semibold text-red-700 underline">Retry</button>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${cardCls} p-5 animate-pulse`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-neutral-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-100 rounded w-32" />
                  <div className="h-3 bg-neutral-100 rounded w-24" />
                </div>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full mb-3" />
              <div className="h-3 bg-neutral-100 rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────── */}
      {!loading && filteredDoctors.length === 0 && (
        <div className={`${cardCls} flex flex-col items-center justify-center py-20 animate-[fadeUp_0.4s_ease-out_both]`}>
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
            <Stethoscope className="h-7 w-7 text-neutral-400" />
          </div>
          <p className="text-sm font-medium text-neutral-600">No doctors found</p>
          <p className="text-xs text-neutral-400 mt-1">Try adjusting your filters or selecting a different date</p>
        </div>
      )}

      {/* ── Doctor Cards ─────────────────────────────── */}
      {!loading && filteredDoctors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDoctors.map((item, idx) => {
            const doc = item.doctor;
            const docId = doc?._id || doc?.id;
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.unavailable;
            const slotPercent = item.totalSlots > 0 ? Math.round((item.availableSlots / item.totalSlots) * 100) : 0;
            const policy = item.policy || { slotDuration: 30, bufferMinutes: 0, minNoticeMinutes: 60, maxAdvanceDays: 60 };
            const noticeLabel = policy.minNoticeMinutes >= 1440
              ? `${Math.round(policy.minNoticeMinutes / 1440)}d notice`
              : policy.minNoticeMinutes >= 60
                ? `${Math.round(policy.minNoticeMinutes / 60)}h notice`
                : `${policy.minNoticeMinutes}m notice`;

            return (
              <div
                key={docId}
                className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
                style={{ animationDelay: `${150 + idx * 40}ms` }}
              >
                {/* Doctor header */}
                <div className="flex items-start gap-3.5 mb-4">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(docId)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                    {getInitials(doc?.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-neutral-900 truncate font-display">{doc?.name || 'Unknown'}</h3>
                    {doc?.specialization && (
                      <p className="text-xs text-neutral-500 truncate">{doc.specialization}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {doc?.branch && (
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {doc.branch.name || 'Unknown'}
                        </span>
                      )}
                      {doc?.department && (
                        <span className="text-[11px] text-neutral-400">{doc.department.name}</span>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusCfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                    {statusCfg.label}
                  </span>
                </div>

                {/* Slot progress bar */}
                {item.totalSlots > 0 ? (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-700">
                        {item.availableSlots} of {item.totalSlots} slots available
                      </span>
                      <span className="text-xs font-semibold text-neutral-500">{slotPercent}%</span>
                    </div>
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${statusCfg.barColor}`}
                        style={{ width: `${slotPercent}%` }}
                      />
                    </div>
                    {item.nextAvailableSlot && (
                      <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Next available: {item.nextAvailableSlot}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                    <p className="text-xs text-neutral-500">
                      {item.isOnLeave ? (item.leaveReason || 'On leave') : 'No slots scheduled for this date'}
                    </p>
                  </div>
                )}

                {/* Booking policy */}
                <div className="pt-3 border-t border-neutral-100">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Booking Policy</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                      <Timer className="h-3 w-3 text-neutral-400" /> {policy.slotDuration} min slots
                    </span>
                    <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                      <CalendarClock className="h-3 w-3 text-neutral-400" /> {noticeLabel}
                    </span>
                    {policy.bufferMinutes > 0 && (
                      <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                        <Hourglass className="h-3 w-3 text-neutral-400" /> {policy.bufferMinutes} min buffer
                      </span>
                    )}
                    <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                      <CalendarDays className="h-3 w-3 text-neutral-400" /> {policy.maxAdvanceDays}d max advance
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
