import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, CalendarCheck, CalendarClock, CheckCircle2,
  Clock, Search, Filter, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { listAppointments } from '../api';
import { initSocket, getSocket } from '../../lib/socket';
import { EmptyState, Pagination, Spinner, ErrorAlert } from '../../platform/components/shared';

/* ─── Helpers ──────────────────────────────────── */
function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--:--';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const toDateInput = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayStr = () => toDateInput(new Date());

const weekStartStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toDateInput(d);
};

const weekEndStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 6);
  return toDateInput(d);
};

/* ─── Status badge styles ─────────────────────── */
const STATUS_STYLES = {
  requested:   { bg: 'bg-amber-50',    text: 'text-amber-700' },
  confirmed:   { bg: 'bg-blue-50',     text: 'text-blue-700' },
  checked_in:  { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  in_progress: { bg: 'bg-purple-50',   text: 'text-purple-700' },
  completed:   { bg: 'bg-neutral-100', text: 'text-neutral-600' },
  cancelled:   { bg: 'bg-red-50',      text: 'text-red-700' },
  no_show:     { bg: 'bg-neutral-100', text: 'text-neutral-500' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'requested', label: 'Requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
];

const selectClasses =
  'h-9 px-3 text-sm bg-white border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition';

/* ─── Inline Micro-Stat ──────────────────────────── */
function MicroStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
      <Icon className="h-3.5 w-3.5 text-neutral-400" />
      <span className="font-semibold text-neutral-700">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

/* ─── Table Skeleton ──────────────────────────────── */
function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="animate-pulse">
        {/* Header row */}
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 bg-neutral-200 rounded w-20" />
          ))}
        </div>
        {/* Body rows */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="grid grid-cols-5 gap-4 px-5 py-4 border-b border-neutral-50">
            <div className="h-4 bg-neutral-100 rounded w-16" />
            <div className="h-4 bg-neutral-100 rounded w-28" />
            <div className="h-4 bg-neutral-100 rounded w-24" />
            <div className="h-4 bg-neutral-100 rounded-full w-20" />
            <div className="h-4 bg-neutral-100 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function SupportAppointments() {
  // ─── State ────────────────────────────────────────
  const [appointments, setAppointments] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [status, setStatus] = useState('');

  // Micro stats
  const [stats, setStats] = useState({ today: 0, week: 0, confirmed: 0, pending: 0 });

  // ─── Fetch appointments ───────────────────────────
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20, sort: 'scheduledAt' };
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (status) params.status = status;

      const res = await listAppointments(params);
      setAppointments(res.data?.appointments || res.data || []);
      setMeta(res.meta || { total: (res.data?.appointments || res.data || []).length, page, limit: 20 });
    } catch (err) {
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, status, refreshKey]);

  // ─── Fetch micro-stats ────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const today = todayStr();
      const wStart = weekStartStr();
      const wEnd = weekEndStr();

      const [todayRes, weekRes] = await Promise.all([
        listAppointments({ from: today, to: today, limit: 1 }),
        listAppointments({ from: wStart, to: wEnd, limit: 1 }),
      ]);

      const todayTotal = todayRes.meta?.total || 0;
      const weekTotal = weekRes.meta?.total || 0;

      // Get today's full list for confirmed/pending breakdown
      const todayFull = await listAppointments({ from: today, to: today, limit: 200 });
      const todayItems = todayFull.data?.appointments || todayFull.data || [];
      const confirmed = todayItems.filter((a) => a.status === 'confirmed').length;
      const pending = todayItems.filter((a) => a.status === 'requested').length;

      setStats({ today: todayTotal, week: weekTotal, confirmed, pending });
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);
  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, status]);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('appointment:update', refresh);
    return () => { sock.off('appointment:update', refresh); };
  }, []);


  /* ─── Render ─────────────────────────────────────── */
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Header: Title + Micro-stats ────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Appointments</h1>
          <div className="hidden md:flex items-center gap-3 pl-4 border-l border-neutral-200">
            <MicroStat icon={CalendarDays} label="Today" value={stats.today} />
            <MicroStat icon={CalendarClock} label="This Week" value={stats.week} />
            <MicroStat icon={CalendarCheck} label="Confirmed" value={stats.confirmed} />
            <MicroStat icon={CheckCircle2} label="Pending" value={stats.pending} />
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ── Filters ─────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-500">Filters</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={selectClasses}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={selectClasses}
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClasses}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Appointment Table ───────────────────────── */}
      {loading && refreshKey === 0 ? (
        <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
          <TableSkeleton />
        </div>
      ) : appointments.length === 0 ? (
        <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
          <EmptyState
            icon={CalendarDays}
            title="No appointments found"
            message="Try adjusting your date range or status filter."
          />
        </div>
      ) : (
        <div
          className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '100ms' }}
        >
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-[100px_1fr_1fr_120px_120px] gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Time</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Patient</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Doctor</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Status</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Type</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-neutral-50">
            {appointments.map((appt, index) => {
              const id = appt._id || appt.id;
              const statusStyle = STATUS_STYLES[appt.status] || { bg: 'bg-neutral-100', text: 'text-neutral-500' };
              const patientName = appt.patientName || appt.patient?.name || 'Unknown';
              const doctorName = appt.doctorName || appt.doctor?.name || 'Unassigned';
              const type = appt.type || appt.appointmentType || 'General';

              return (
                <div
                  key={id || index}
                  className="sm:grid sm:grid-cols-[100px_1fr_1fr_120px_120px] gap-4 px-5 py-4 hover:bg-neutral-50 transition-colors animate-[fadeUp_0.4s_ease-out_both]"
                  style={{ animationDelay: `${120 + index * 20}ms` }}
                >
                  {/* Time */}
                  <div className="flex items-center gap-2 mb-2 sm:mb-0">
                    <Clock className="h-3.5 w-3.5 text-neutral-400 sm:hidden" />
                    <div>
                      <p className="text-sm font-medium text-neutral-800 tabular-nums">{formatTime(appt.scheduledAt)}</p>
                      <p className="text-[11px] text-neutral-400 sm:block hidden">{formatDate(appt.scheduledAt)}</p>
                    </div>
                  </div>

                  {/* Patient */}
                  <div className="flex items-center min-w-0 mb-1 sm:mb-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{patientName}</p>
                  </div>

                  {/* Doctor */}
                  <div className="flex items-center min-w-0 mb-1 sm:mb-0">
                    <p className="text-sm text-neutral-600 truncate">{doctorName}</p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center mb-1 sm:mb-0">
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${statusStyle.bg} ${statusStyle.text}`}>
                      {(appt.status || 'unknown').replace(/[-_]/g, ' ')}
                    </span>
                  </div>

                  {/* Type */}
                  <div className="flex items-center">
                    <span className="text-xs text-neutral-500 capitalize">{type.replace(/[-_]/g, ' ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────── */}
      {(meta.total || 0) > 20 && (
        <div className="bg-white rounded-2xl border border-neutral-200 px-5 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
          <Pagination page={page} limit={meta.limit || 20} total={meta.total || 0} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
