/**
 * DoctorPrescriptions — Prescription Management Hub
 *
 * Complete creative redesign:
 * - Gradient hero banner with decorative blobs
 * - Stat cards row with staggered fadeUp
 * - Table-style prescription list with medication pill tags
 * - Rich detail modal
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenantAuth } from '../TenantAuthContext';
import { Modal } from '../../platform/components/shared';
import {
  listPrescriptions, createPrescription, updatePrescription,
  listDoctorPatients, getClinicSettings,
} from '../api';
import {
  ClipboardList, Plus, Search, Pill, Calendar, User, FileText,
  Printer, Eye, ChevronRight, ChevronLeft, CheckCircle2, XCircle,
  Clock, Download, AlertTriangle, Hash,
} from 'lucide-react';

/* ─── Status config ──────────────────────────────── */
const STATUS = {
  active:    { label: 'Active',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  completed: { label: 'Completed', dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  cancelled: { label: 'Cancelled', dot: 'bg-red-500',     badge: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
};

const FILTERS = [
  { key: '',          label: 'All Prescriptions', icon: ClipboardList },
  { key: 'active',    label: 'Active',            icon: Clock },
  { key: 'completed', label: 'Completed',         icon: CheckCircle2 },
];

/* ─── Helpers ────────────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function calculateAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const AVATAR_GRADIENTS = [
  'from-violet-400 to-purple-600', 'from-blue-400 to-indigo-600',
  'from-emerald-400 to-teal-600',  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',     'from-cyan-400 to-sky-600',
];

function avatarGradient(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

/* ═════════════════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════════════════ */
export default function DoctorPrescriptions() {
  const { user } = useTenantAuth();

  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewPrescription, setViewPrescription] = useState(null);
  const searchTimerRef = useRef(null);

  const stats = useMemo(() => {
    const active = prescriptions.filter(p => p.status === 'active').length;
    const completed = prescriptions.filter(p => p.status === 'completed').length;
    const totalMeds = prescriptions.reduce((sum, p) => sum + (p.medications?.length || 0), 0);
    return { active, completed, totalMeds };
  }, [prescriptions]);

  const fetchPrescriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await listPrescriptions(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setPrescriptions(data);
      setTotal(res.meta?.total ?? res.total ?? data.length);
    } catch (err) {
      setError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setPage(1), 400);
  };

  const handleFilter = (key) => { setStatusFilter(key); setPage(1); };
  const totalPages = Math.ceil(total / limit);

  const STAT_CARDS = [
    { key: 'total', label: 'Total Prescriptions', value: total, icon: ClipboardList, iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
    { key: 'active', label: 'Active', value: stats.active, icon: Clock, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
    { key: 'completed', label: 'Completed', value: stats.completed, icon: CheckCircle2, iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
    { key: 'meds', label: 'Medications Listed', value: stats.totalMeds, icon: Pill, iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
  ];

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ══ HERO BANNER ════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-white to-primary-50/40 border border-purple-100/60 p-6 sm:p-8 animate-[fadeUp_0.4s_ease-out_both]">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-primary-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold font-display text-neutral-900">Prescriptions</h1>
              <p className="text-sm text-neutral-600">
                Manage and track patient prescriptions
                {total > 0 && ` · ${total} record${total !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <button
            className="h-11 px-6 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 shadow-[var(--shadow-sm)] shadow-purple-600/20 hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Prescription
          </button>
        </div>
      </div>

      {/* ══ STAT CARDS ═════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card, i) => (
          <div
            key={card.key}
            className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${100 + i * 60}ms` }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                <card.icon className={`h-5 w-5 ${card.iconText}`} />
              </div>
            </div>
            <p className="text-[26px] font-bold font-display text-neutral-900 leading-tight">
              {loading ? '—' : card.value}
            </p>
            <p className="text-xs font-medium text-neutral-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ══ TOOLBAR ════════════════════════════════════ */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-4 flex flex-col sm:flex-row sm:items-center gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '350ms' }}
      >
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const isActive = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => handleFilter(f.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search patient, diagnosis..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-purple-300 focus:ring-2 focus:ring-purple-400/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* ══ ERROR ══════════════════════════════════════ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button onClick={fetchPrescriptions} className="text-sm font-semibold text-red-700 hover:text-red-800 underline">Retry</button>
        </div>
      )}

      {/* ══ LOADING SKELETON ═══════════════════════════ */}
      {loading && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-pulse">
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50/60">
            <div className="col-span-4 h-3 bg-neutral-100 rounded w-24" />
            <div className="col-span-3 h-3 bg-neutral-100 rounded w-32" />
            <div className="col-span-2 h-3 bg-neutral-100 rounded w-16" />
            <div className="col-span-1 h-3 bg-neutral-100 rounded w-14" />
            <div className="col-span-2 h-3 bg-neutral-100 rounded w-20 ml-auto" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-neutral-50">
              <div className="w-10 h-10 rounded-full bg-neutral-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-neutral-100 rounded w-40" />
                <div className="h-3 bg-neutral-100 rounded w-64" />
              </div>
              <div className="h-6 bg-neutral-100 rounded-full w-16" />
            </div>
          ))}
        </div>
      )}

      {/* ══ EMPTY STATE ════════════════════════════════ */}
      {!loading && !error && prescriptions.length === 0 && (
        <div
          className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] flex flex-col items-center justify-center py-20 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '400ms' }}
        >
          <div className="w-20 h-20 rounded-3xl bg-purple-50 flex items-center justify-center mb-5">
            <ClipboardList className="h-10 w-10 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold font-display text-neutral-900 mb-1">
            {search || statusFilter ? 'No matching prescriptions' : 'No prescriptions yet'}
          </h3>
          <p className="text-sm text-neutral-500 mb-6">
            {search || statusFilter ? 'Try adjusting your search or filters' : 'Create your first prescription to get started'}
          </p>
          {!search && !statusFilter && (
            <button className="h-10 px-5 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 shadow-sm shadow-purple-600/20 transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Prescription
            </button>
          )}
        </div>
      )}

      {/* ══ PRESCRIPTION LIST (Table-style) ════════════ */}
      {!loading && !error && prescriptions.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '400ms' }}
        >
          {/* Table header (desktop) */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50/60 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            <div className="col-span-4">Patient</div>
            <div className="col-span-3">Diagnosis & Medications</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-neutral-100">
            {prescriptions.map((rx, idx) => {
              const patient = rx.patient || {};
              const name = patient.name || 'Unknown Patient';
              const age = calculateAge(patient.dateOfBirth);
              const statusCfg = STATUS[rx.status] || STATUS.active;
              const meds = rx.medications || [];

              return (
                <motion.div
                  key={rx._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  className="group lg:grid lg:grid-cols-12 gap-4 px-5 py-4 hover:bg-neutral-50/60 transition-colors cursor-pointer items-center"
                  onClick={() => setViewPrescription(rx)}
                >
                  {/* Patient */}
                  <div className="col-span-4 flex items-center gap-3 mb-3 lg:mb-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {getInitials(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate font-display">{name}</p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {patient.email || patient.phone || 'No contact'}
                        {age && ` · ${age} yrs`}
                      </p>
                    </div>
                  </div>

                  {/* Diagnosis & Meds */}
                  <div className="col-span-3 mb-3 lg:mb-0">
                    {rx.diagnosis && (
                      <p className="text-xs text-neutral-700 line-clamp-1 mb-1.5">{rx.diagnosis}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {meds.slice(0, 3).map((med, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                          <Pill className="w-2.5 h-2.5" />
                          {med.name || med.medication || `Med ${i + 1}`}
                        </span>
                      ))}
                      {meds.length > 3 && (
                        <span className="text-[10px] text-neutral-400 px-1.5 py-0.5">+{meds.length - 3} more</span>
                      )}
                      {meds.length === 0 && (
                        <span className="text-[10px] text-neutral-400">No medications listed</span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="col-span-2 mb-3 lg:mb-0">
                    <p className="text-xs text-neutral-600">{formatDate(rx.createdAt)}</p>
                    {rx.validUntil && (
                      <p className="text-[10px] text-neutral-400 mt-0.5">Valid till {formatDate(rx.validUntil)}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-1 mb-3 lg:mb-0">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusCfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewPrescription(rx); }}
                      className="p-2 rounded-lg text-neutral-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); window.print(); }}
                      className="p-2 rounded-lg text-neutral-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      title="Print"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg text-neutral-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50/30 flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-neutral-600" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pn;
                  if (totalPages <= 5) pn = i + 1;
                  else if (page <= 3) pn = i + 1;
                  else if (page >= totalPages - 2) pn = totalPages - 4 + i;
                  else pn = page - 2 + i;
                  return (
                    <button
                      key={i}
                      onClick={() => setPage(pn)}
                      className={`min-w-[2rem] h-8 px-2.5 rounded-lg text-xs font-medium transition-all ${
                        page === pn ? 'bg-purple-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {pn}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-neutral-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ VIEW PRESCRIPTION MODAL ════════════════════ */}
      {viewPrescription && (
        <Modal open onClose={() => setViewPrescription(null)} title="Prescription Details" size="lg">
          <div className="space-y-6 p-2">
            {/* Patient header */}
            <div className="flex items-center gap-4 pb-4 border-b border-neutral-200">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarGradient(viewPrescription.patient?.name)} flex items-center justify-center text-white text-lg font-bold`}>
                {getInitials(viewPrescription.patient?.name)}
              </div>
              <div>
                <h3 className="text-lg font-semibold font-display text-neutral-900">
                  {viewPrescription.patient?.name || 'Unknown Patient'}
                </h3>
                <p className="text-sm text-neutral-500">
                  Prescribed on {formatDate(viewPrescription.createdAt)}
                  {viewPrescription.validUntil && ` · Valid until ${formatDate(viewPrescription.validUntil)}`}
                </p>
              </div>
              <div className="ml-auto">
                {(() => {
                  const cfg = STATUS[viewPrescription.status] || STATUS.active;
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${cfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Diagnosis */}
            {viewPrescription.diagnosis && (
              <div>
                <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Diagnosis</h4>
                <p className="text-sm text-neutral-800">{viewPrescription.diagnosis}</p>
              </div>
            )}

            {/* Medications */}
            <div>
              <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Medications ({(viewPrescription.medications || []).length})
              </h4>
              <div className="space-y-2">
                {(viewPrescription.medications || []).map((med, i) => (
                  <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                      <Pill className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{med.name || med.medication}</p>
                      <p className="text-xs text-neutral-500">
                        {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ') || 'No dosage details'}
                      </p>
                    </div>
                    {med.instructions && (
                      <p className="text-[11px] text-neutral-400 max-w-[140px] truncate shrink-0" title={med.instructions}>
                        {med.instructions}
                      </p>
                    )}
                  </div>
                ))}
                {(viewPrescription.medications || []).length === 0 && (
                  <p className="text-sm text-neutral-400 text-center py-4">No medications listed</p>
                )}
              </div>
            </div>

            {/* Notes */}
            {viewPrescription.notes && (
              <div>
                <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Notes</h4>
                <p className="text-sm text-neutral-700 bg-amber-50 rounded-xl p-4 border border-amber-100">
                  {viewPrescription.notes}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-colors"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-colors"
              >
                <Download className="h-4 w-4" /> Download PDF
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setViewPrescription(null)}
                className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
