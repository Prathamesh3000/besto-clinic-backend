/**
 * Prescriptions — Admin prescription management.
 *
 * Redesign: Uniform PageHeader, stat cards, FilterPill toolbar card,
 * prescription cards grid, configurable pagination, no framer-motion.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';
import {
  Modal, EmptyState, Pagination, Spinner,
  ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import { listPrescriptions, updatePrescription, listDoctors } from '../api';
import { stripDrPrefix } from '../../utils/doctorName';
import {
  ClipboardList, Search, Pill,
  Calendar, User, Stethoscope, FileText,
  CheckCircle2, XCircle, Activity,
  ChevronRight,
} from 'lucide-react';

/* ── Design tokens ────────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';

/* ── Status styles ────────────────────────────────── */
const STATUS_STYLES = {
  active:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
  completed: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Completed' },
  cancelled: { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     label: 'Cancelled' },
};

const FILTER_TABS = [
  { key: '',          label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

/* ── Stat card config ─────────────────────────────── */
const STAT_CONFIG = [
  { key: 'total',     title: 'Total',     icon: ClipboardList, color: 'primary' },
  { key: 'active',    title: 'Active',    icon: Activity,      color: 'green' },
  { key: 'completed', title: 'Completed', icon: CheckCircle2,  color: 'blue' },
  { key: 'cancelled', title: 'Cancelled', icon: XCircle,       color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  green:   { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  blue:    { iconBg: 'bg-blue-50',      iconText: 'text-blue-600' },
  red:     { iconBg: 'bg-red-50',       iconText: 'text-red-600' },
};

/* ── Helpers ──────────────────────────────────────── */
function calculateAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const AVATAR_COLORS = [
  'from-primary-400 to-primary-600', 'from-emerald-400 to-emerald-600',
  'from-purple-400 to-purple-600',   'from-amber-400 to-amber-600',
  'from-blue-400 to-blue-600',       'from-rose-400 to-rose-600',
];

function getAvatarGradient(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Prescription Card ────────────────────────────── */
function PrescriptionCard({ prescription, onView, onCancel, index, highlighted }) {
  const hlRef = useRef(null);
  useEffect(() => {
    if (highlighted && hlRef.current) {
      requestAnimationFrame(() => hlRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }, [highlighted]);
  const patient = prescription.patient;
  const doctor = prescription.doctor;
  const patientName = patient?.name || 'Unknown Patient';
  const doctorName = doctor?.name || 'Unknown Doctor';
  const age = calculateAge(patient?.dateOfBirth);
  const medicationCount = prescription.medications?.length || 0;
  const s = STATUS_STYLES[prescription.status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400', label: prescription.status };

  return (
    <div
      ref={highlighted ? hlRef : undefined}
      className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
      style={highlighted
        ? { animationDelay: `${index * 40}ms`, animation: `fadeUp 0.4s ease-out both, highlightPulse 0.8s ease-in-out 3 0.4s, highlightFadeOut 0.6s ease-out 2.8s forwards` }
        : { animationDelay: `${index * 40}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(patientName)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {getInitials(patientName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-neutral-900 truncate">{patientName}</h3>
              {age && <span className="text-[10px] text-neutral-400 shrink-0">{age} yrs</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-0.5">
              <User className="w-3 h-3" />
              <span className="truncate">{patient?.email || patient?.phone || 'No contact'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Stethoscope className="w-3 h-3 text-blue-500" />
              <span className="truncate font-medium">Dr. {stripDrPrefix(doctorName)}</span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        {prescription.diagnosis && (
          <div className="flex items-start gap-2">
            <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-500 line-clamp-2">{prescription.diagnosis}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Pill className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <p className="text-xs text-neutral-600 font-medium">
            {medicationCount} medication{medicationCount !== 1 ? 's' : ''} prescribed
          </p>
        </div>
        {prescription.validUntil && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <p className="text-xs text-neutral-400">Valid until {formatDate(prescription.validUntil)}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
        <span className="text-[10px] text-neutral-400">{formatDate(prescription.createdAt)}</span>
        <div className="flex items-center gap-2">
          {prescription.status === 'active' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(prescription); }}
              className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onView(prescription); }}
            className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            View <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
export default function Prescriptions() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(12);
  const [search, setSearch] = useState(highlightSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) { setSearch(highlightSearch); setDebouncedSearch(highlightSearch); } }, [highlightSearch]);
  const [statusFilter, setStatusFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [viewPrescription, setViewPrescription] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    listDoctors({ limit: 200 }).then((r) => setDoctors(r.data || [])).catch(() => {});
  }, []);

  const fetchPrescriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (doctorFilter) params.doctor = doctorFilter;
      const res = await listPrescriptions(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setPrescriptions(data);
      setTotal(res.meta?.total ?? res.total ?? data.length);
    } catch (err) {
      setError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, doctorFilter]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const handleSearchChange = (e) => setSearch(e.target.value);

  const handleFilterChange = (key) => { setStatusFilter(key); setPage(1); };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    try {
      await updatePrescription(cancelTarget._id, { status: 'cancelled' });
      setCancelTarget(null);
      fetchPrescriptions();
    } catch (err) {
      setError(err.message || 'Failed to cancel prescription');
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Compute stats from current page data (approximation for display)
  const statCounts = {
    total,
    active: prescriptions.filter(p => p.status === 'active').length,
    completed: prescriptions.filter(p => p.status === 'completed').length,
    cancelled: prescriptions.filter(p => p.status === 'cancelled').length,
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Prescriptions</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage prescriptions across all doctors and patients</p>
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
                {loading ? '—' : statCounts[s.key]}
              </p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ──────────────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {FILTER_TABS.map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleFilterChange(tab.key)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {doctors.length > 0 && (
              <select
                value={doctorFilter}
                onChange={(e) => { setDoctorFilter(e.target.value); setPage(1); }}
                className={selectCls}
              >
                <option value="">All Doctors</option>
                {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            )}

            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search prescriptions..."
              className={`${inputCls} pl-10`}
            />
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────── */}
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {/* ── Content ──────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : prescriptions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No prescriptions found"
          description={search || statusFilter || doctorFilter ? 'Try adjusting your filters' : 'Prescription records will appear here'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
            {prescriptions.map((prescription, idx) => (
              <PrescriptionCard
                key={prescription._id}
                prescription={prescription}
                onView={setViewPrescription}
                onCancel={setCancelTarget}
                index={idx}
                highlighted={highlightId === prescription._id}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center pt-2">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* ── Cancel Confirmation ──────────────────────── */}
      {cancelTarget && (
        <ConfirmDialog
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
          title="Cancel Prescription"
          message={`Are you sure you want to cancel this prescription for ${cancelTarget.patient?.name}?`}
          confirmText="Cancel Prescription"
          variant="danger"
        />
      )}
    </div>
  );
}
