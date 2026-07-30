/**
 * DoctorConsultations — Consultation management with DataTable.
 *
 * Redesign: DataTable with sortable columns, comprehensive filter bar
 * (search, status, doctor, date range), scope toggle, shared Pagination.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { displayDate, displayTime } from '../../utils/fakeUtcTime';
import {
  Search, X, Calendar as CalendarIcon, Stethoscope,
  ClipboardList, Activity, CheckCircle2, User, FileText,
  AlertCircle,
} from 'lucide-react';
import { listDoctorConsultations, listDoctors } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { DataTable, Pagination, Spinner, EmptyState } from '../../platform/components/shared';
import { getSocket } from '../../lib/socket';

/* ── Design tokens ────────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';

/* ── Status config ────────────────────────────────── */
const STATUS_CONFIG = {
  in_progress: { label: 'In Progress', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  completed:   { label: 'Completed',   dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  cancelled:   { label: 'Cancelled',   dot: 'bg-red-500',     badge: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
};

const STATUS_OPTIONS = [
  { value: '',            label: 'All Statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
];

/* ── Stat card config ─────────────────────────────── */
const STAT_CONFIG = [
  { key: 'total',      title: 'Total',       icon: ClipboardList, color: 'primary' },
  { key: 'inProgress', title: 'In Progress', icon: Activity,      color: 'green' },
  { key: 'completed',  title: 'Completed',   icon: CheckCircle2,  color: 'blue' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  green:   { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  blue:    { iconBg: 'bg-blue-50',      iconText: 'text-blue-600' },
};

/* ── Helpers ──────────────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function calculateAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

const AVATAR_GRADIENTS = [
  'from-primary-400 to-primary-600', 'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',   'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',       'from-cyan-400 to-sky-600',
];

function avatarGradient(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function stripDrPrefix(name) {
  return (name || '').replace(/^Dr\.?\s*/i, '');
}

/* ═══════════════════════════════════════════════════ */
export default function DoctorConsultations() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const isAdmin = user?.role !== 'doctor';

  // Data
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Stats
  const [serverStats, setServerStats] = useState({ inProgressCount: 0, completedCount: 0 });

  // Filters
  const [filters, setFilters] = useState({ search: '', status: '', doctor: '', from: '', to: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  // Admin-only
  const [doctors, setDoctors] = useState([]);
  const [doctorScope, setDoctorScope] = useState('mine');

  // Fetch doctor list for admin dropdown
  useEffect(() => {
    if (!isAdmin) return;
    listDoctors({ limit: 200 }).then((res) => setDoctors(res.data || [])).catch(() => {});
  }, [isAdmin]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(filters.search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Main data fetch
  const fetchData = useCallback(async (pg = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = { page: pg, limit, sort: `${sortDir === 'desc' ? '-' : ''}${sortKey}` };

      // Doctor scoping
      if (!isAdmin) {
        params.doctor = user._id;
      } else if (doctorScope === 'mine') {
        params.doctor = user._id;
      } else if (filters.doctor) {
        params.doctor = filters.doctor;
      }

      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status) params.status = filters.status;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const res = await listDoctorConsultations(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setConsultations(data);
      const metaTotal = res.meta?.total || res.total || data.length;
      setTotal(metaTotal);
      if (res.meta?.inProgressCount !== undefined) {
        setServerStats({ inProgressCount: res.meta.inProgressCount, completedCount: res.meta.completedCount });
      }
    } catch (err) {
      setError(err.message || 'Failed to load consultations');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [debouncedSearch, filters.status, filters.doctor, filters.from, filters.to, sortKey, sortDir, doctorScope, isAdmin, user?._id, limit]);

  useEffect(() => { fetchData(page); }, [fetchData, page]);

  // Real-time socket listeners for consultation lifecycle events
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;

    const refresh = () => fetchData(page);
    sock.on('consultation:started', refresh);
    sock.on('consultation:completed', refresh);

    return () => {
      sock.off('consultation:started', refresh);
      sock.off('consultation:completed', refresh);
    };
  }, [fetchData, page]);

  // Handlers
  const updateFilter = (key, val) => { setFilters(prev => ({ ...prev, [key]: val })); setPage(1); };
  const clearFilters = () => { setFilters({ search: '', status: '', doctor: '', from: '', to: '' }); setPage(1); };
  const hasActiveFilters = filters.search || filters.status || filters.doctor || filters.from || filters.to;

  const handleScopeChange = (scope) => { setDoctorScope(scope); setFilters(prev => ({ ...prev, doctor: '' })); setPage(1); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleRowClick = (row) => {
    const appointmentId = row.appointment?._id || row.appointmentId;
    if (!appointmentId) return;
    const status = row.status || row.appointment?.status;
    if (status === 'completed' || status === 'cancelled' || status === 'no_show') {
      navigate(`/clinic/consultation-detail/${appointmentId}`);
    } else if (!isAdmin) {
      // Doctors get the editable consultation editor
      navigate(`/clinic/doctor-consultation/${appointmentId}`);
    } else {
      // Admin/owner/manager gets the read-only detail view for in-progress consultations
      navigate(`/clinic/consultation-detail/${appointmentId}`);
    }
  };

  const stats = useMemo(() => ({
    total: serverStats.inProgressCount + serverStats.completedCount,
    inProgress: serverStats.inProgressCount,
    completed: serverStats.completedCount,
  }), [serverStats]);

  const subtitle = useMemo(() => {
    if (!isAdmin) return 'Your consultations';
    if (doctorScope === 'mine') return 'Your consultations';
    if (filters.doctor) {
      const doc = doctors.find(d => d._id === filters.doctor);
      return doc ? `Dr. ${stripDrPrefix(doc.name)}'s consultations` : 'All doctor consultations';
    }
    return 'All doctor consultations';
  }, [isAdmin, doctorScope, filters.doctor, doctors]);

  // ─── Column Definitions ────────────────────────────
  const columns = useMemo(() => {
    const cols = [
      {
        key: 'patient',
        label: 'Patient',
        sortable: false,
        render: (row) => {
          const p = row.patient || {};
          const age = calculateAge(p.dateOfBirth);
          return (
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(p.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {getInitials(p.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{p.name || 'Unknown'}</p>
                {age && <p className="text-[11px] text-neutral-400">{age} yrs{p.gender ? ` · ${p.gender}` : ''}</p>}
              </div>
            </div>
          );
        },
      },
    ];

    // Doctor column (admin only)
    if (isAdmin) {
      cols.push({
        key: 'doctor',
        label: 'Doctor',
        sortable: false,
        render: (row) => {
          const doc = row.doctor;
          if (!doc?.name) return <span className="text-neutral-400">—</span>;
          return (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary-50 flex items-center justify-center shrink-0">
                <User className="h-3 w-3 text-secondary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-neutral-700 truncate">Dr. {stripDrPrefix(doc.name)}</p>
                {doc.specialization && <p className="text-[11px] text-neutral-400">{doc.specialization}</p>}
              </div>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        key: 'createdAt',
        label: 'Date & Time',
        sortable: true,
        render: (row) => {
          // Two conventions meet here: appointment.scheduledAt is fake-UTC (clinic
          // wall clock + Z) while createdAt is a real UTC timestamp, so they cannot
          // share a formatter — one needs getUTC*, the other needs local time.
          const scheduled = row.appointment?.scheduledAt;
          const dateStr = scheduled || row.createdAt;
          if (!dateStr) return <span className="text-neutral-400">—</span>;
          const duration = row.appointment?.duration ? ` · ${row.appointment.duration}min` : '';
          const dateLabel = scheduled ? displayDate(scheduled) : format(new Date(dateStr), 'MMM d, yyyy');
          const timeLabel = scheduled ? displayTime(scheduled) : format(new Date(dateStr), 'h:mm a');
          return (
            <div>
              <p className="text-sm text-neutral-700">{dateLabel}</p>
              <p className="text-[11px] text-neutral-400">{timeLabel}{duration}</p>
            </div>
          );
        },
      },
      {
        key: 'diagnosis',
        label: 'Diagnosis',
        sortable: false,
        render: (row) => {
          const text = (row.diagnosis && row.diagnosis !== 'In progress')
            ? row.diagnosis
            : row.chiefComplaint || '';
          const hasPrescription = row.prescription && row.prescription.length > 0;
          return (
            <div className="min-w-0">
              <p className="text-sm text-neutral-700 line-clamp-1">{text || <span className="text-neutral-400">—</span>}</p>
              {hasPrescription && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded mt-1">
                  <FileText className="w-2.5 h-2.5" /> Rx
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'type',
        label: 'Type',
        sortable: false,
        render: (row) => {
          const type = row.appointment?.type || row.type;
          if (!type) return <span className="text-neutral-400">—</span>;
          return (
            <span className="text-xs px-2 py-1 rounded-lg font-medium bg-neutral-50 border border-neutral-200 text-neutral-600 capitalize">
              {type.replace(/_/g, ' ')}
            </span>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        sortable: false,
        render: (row) => {
          const status = row.appointment?.status || row.status || 'completed';
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
          return (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${config.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
              {config.label}
            </span>
          );
        },
      },
    );

    return cols;
  }, [isAdmin]);

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Consultations</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {subtitle}
            {total > 0 && ` · ${total} record${total !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
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
              <p className={`text-[28px] font-bold font-display text-neutral-900 leading-tight transition-opacity duration-200 ${loading && !initialLoad ? 'opacity-50' : ''}`}>
                {loading && initialLoad ? '—' : stats[s.key]}
              </p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Filter Bar ───────────────────────────────── */}
      <div className={`${cardCls} p-4 space-y-3 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search patient, diagnosis..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
            />
          </div>

          {/* Status */}
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className={selectCls}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Doctor dropdown (admin + "All Doctors" scope) */}
          {isAdmin && doctorScope === 'all' && doctors.length > 0 && (
            <select value={filters.doctor} onChange={(e) => updateFilter('doctor', e.target.value)} className={selectCls}>
              <option value="">All Doctors</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>Dr. {stripDrPrefix(d.name)}</option>
              ))}
            </select>
          )}

          {/* Date From */}
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className={`${selectCls} pl-8`}
              title="From date"
            />
          </div>

          {/* Date To */}
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className={`${selectCls} pl-8`}
              title="To date"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-red-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        {/* ── Scope Toggle (admin only) ── */}
        {isAdmin && (
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
            <User className="h-4 w-4 text-neutral-400 shrink-0" />
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
              {[{ key: 'mine', label: 'My Consultations' }, { key: 'all', label: 'All Doctors' }].map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleScopeChange(s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    doctorScope === s.key
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Error ────────────────────────────────────── */}
      {error && (
        <div className={`${cardCls} border-red-200 bg-red-50 p-4 flex items-start gap-3`}>
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-900">Error Loading Consultations</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button onClick={() => fetchData(page)} className="mt-3 px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Initial Loading ──────────────────────────── */}
      {loading && initialLoad && <Spinner />}

      {/* ── Empty State ──────────────────────────────── */}
      {!loading && !error && consultations.length === 0 && (
        <EmptyState
          icon={Stethoscope}
          title="No consultations found"
          message={hasActiveFilters ? 'Try adjusting your filters or date range' : 'Consultations will appear here as you see patients'}
        />
      )}

      {/* ── Data Table ────────────────────────────────── */}
      {!initialLoad && !error && consultations.length > 0 && (
        <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <DataTable
            columns={columns}
            data={consultations}
            onRowClick={handleRowClick}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onChange={(p) => setPage(p)}
          />
        </div>
      )}
    </div>
  );
}
