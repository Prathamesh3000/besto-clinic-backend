import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllDoctorLeaves, listDoctors, listBranches,
  approveDoctorLeave, rejectDoctorLeave, createDoctorLeave, deleteDoctorLeave,
} from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import {
  Modal, Pagination, Spinner, ErrorAlert, EmptyState, ConfirmDialog,
} from '../../platform/components/shared';
import {
  CalendarX2, Check, X, Plus, Trash2, Clock, Search,
  CheckCircle2, XCircle, Hourglass, ChevronUp, ChevronDown,
} from 'lucide-react';

// ─── Design tokens ──────────────────────────────────
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

const PAGE_SIZES = [10, 20, 50];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const LEAVE_TYPES = [
  { value: 'planned', label: 'Planned' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal' },
  { value: 'conference', label: 'Conference' },
  { value: 'other', label: 'Other' },
];

const STAT_CONFIG = [
  { key: 'pending', title: 'Pending Requests', subtitle: 'Awaiting review', icon: Hourglass, color: 'yellow' },
  { key: 'approved', title: 'Approved', subtitle: 'This period', icon: CheckCircle2, color: 'green' },
  { key: 'onLeaveToday', title: 'On Leave Today', subtitle: 'Currently away', icon: CalendarX2, color: 'blue' },
  { key: 'total', title: 'Total Records', subtitle: 'All time', icon: Clock, color: 'primary' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  yellow: { iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
  blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
};

const STATUS_BADGE = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
};

const AVATAR_COLORS = [
  'from-primary-100 to-primary-200 text-primary-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-rose-100 to-rose-200 text-rose-700',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const INITIAL_FORM = {
  doctor: '', startDate: '', endDate: '', leaveType: 'planned', reason: '', branch: '',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
}

// Sortable column header
function SortableHeader({ label, sortKey: colKey, currentKey, currentDir, onSort }) {
  const isActive = currentKey === colKey;
  return (
    <th
      className="text-left py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-700 transition-colors"
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-primary-600">
            {currentDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        )}
      </span>
    </th>
  );
}

// ═══════════════════════════════════════════════════════
export default function LeaveManagement() {
  const { hasPermission } = useTenantAuth();
  const canManage = hasPermission('user:update');

  // ─── List state ──────────────────────────────
  const [leaves, setLeaves] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortKey, setSortKey] = useState('startDate');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Counts for stat cards ───────────────────
  const [counts, setCounts] = useState({ pending: 0, approved: 0, onLeaveToday: 0, total: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Filters ─────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  // ─── Lookups ─────────────────────────────────
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);

  // ─── Modal state ─────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // ─── Confirm dialog state ────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ─── Fetch lookups once ──────────────────────
  useEffect(() => {
    listDoctors({ limit: 200 })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setDoctors(data);
      })
      .catch(() => {});
    listBranches({ limit: 50 })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setBranches(data);
      })
      .catch(() => {});
  }, []);

  // ─── Fetch stat counts (unfiltered, full dataset) ──
  const fetchStats = useCallback(() => {
    setStatsLoading(true);
    getAllDoctorLeaves({ limit: 500, sort: 'startDate', order: 'desc' })
      .then((res) => {
        const all = Array.isArray(res.data) ? res.data : res.data?.items || [];
        const totalCount = res.meta?.total || res.data?.meta?.total || all.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setCounts({
          pending: all.filter((l) => l.status === 'pending').length,
          approved: all.filter((l) => l.status === 'approved').length,
          onLeaveToday: all.filter((l) =>
            l.status === 'approved' && new Date(l.startDate) <= today && new Date(l.endDate) >= today
          ).length,
          total: totalCount,
        });
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ─── Fetch leaves (paginated + filtered) ────
  const fetchLeaves = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = { page, limit, sort: sortKey, order: sortDir };
    if (statusFilter !== 'all') params.status = statusFilter;
    if (doctorFilter) params.doctor = doctorFilter;
    if (branchFilter) params.branch = branchFilter;
    if (typeFilter) params.leaveType = typeFilter;

    getAllDoctorLeaves(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setLeaves(data);
        const totalCount = res.meta?.total || res.data?.meta?.total || data.length;
        setTotal(totalCount);
      })
      .catch((err) => setError(err.message || 'Failed to load leave records'))
      .finally(() => setLoading(false));
  }, [page, limit, statusFilter, doctorFilter, branchFilter, typeFilter, sortKey, sortDir]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  // ─── Client-side search ──────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return leaves;
    const q = search.toLowerCase();
    return leaves.filter((l) => (l.doctor?.name || '').toLowerCase().includes(q));
  }, [leaves, search]);

  // ─── Handlers ────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCreateModal = () => { setForm(INITIAL_FORM); setFormError(null); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(INITIAL_FORM); setFormError(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.doctor || !form.startDate || !form.endDate) return;
    setSaving(true);
    setFormError(null);
    try {
      await createDoctorLeave(form.doctor, {
        startDate: form.startDate, endDate: form.endDate,
        leaveType: form.leaveType, reason: form.reason || undefined,
        branch: form.branch || undefined, status: 'approved',
      });
      closeModal();
      fetchLeaves();
      fetchStats();
    } catch (err) {
      setFormError(err.message || 'Failed to create leave');
    } finally {
      setSaving(false);
    }
  };

  const openConfirm = (type, leave) => { setConfirmAction({ type, leave }); setConfirmOpen(true); };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      const { type, leave } = confirmAction;
      const doctorId = (leave.doctor && typeof leave.doctor === 'object') ? leave.doctor._id : leave.doctor;
      if (type === 'approve') await approveDoctorLeave(doctorId, leave._id);
      else if (type === 'reject') await rejectDoctorLeave(doctorId, leave._id);
      else await deleteDoctorLeave(doctorId, leave._id);
      setConfirmOpen(false);
      setConfirmAction(null);
      fetchLeaves();
      fetchStats();
    } catch (err) {
      setError(err.message || `Failed to ${confirmAction.type} leave`);
    } finally {
      setConfirmLoading(false);
    }
  };

  // ═══════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Leave Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Review, approve, and manage doctor leave requests</p>
        </div>
        {canManage && (
          <button onClick={openCreateModal} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Leave
          </button>
        )}
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-neutral-100 rounded-lg animate-pulse mb-2" />
              <div className="h-3 w-32 bg-neutral-100 rounded animate-pulse" />
            </div>
          ))
        ) : (
          STAT_CONFIG.map((s, i) => {
            const p = PALETTE[s.color];
            return (
              <div key={s.key} className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
                style={{ animationDelay: `${50 + i * 50}ms` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                    <s.icon className={`h-6 w-6 ${p.iconText}`} />
                  </div>
                </div>
                <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{counts[s.key]}</p>
                <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{s.subtitle}</p>
              </div>
            );
          })
        )}
      </div>

      {/* ── Combined Toolbar + Table Card ─────────── */}
      <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>

        {/* Toolbar section */}
        <div className="px-5 py-4 border-b border-neutral-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Status filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUS_FILTERS.map((s) => {
                const isActive = statusFilter === s.value;
                return (
                  <button key={s.value}
                    onClick={() => { setStatusFilter(s.value); setPage(1); }}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}>
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Filters + search + page size */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={doctorFilter} onChange={(e) => { setDoctorFilter(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">All Doctors</option>
                {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">All Branches</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">All Types</option>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search doctor..."
                  className="pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all w-48" />
              </div>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Table content */}
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={CalendarX2} title="No leave records found" message="Adjust filters or create a new leave entry" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50/50 border-b border-neutral-100">
                    <SortableHeader label="Doctor" sortKey="doctor" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Period" sortKey="startDate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th className="text-left py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Days</th>
                    <th className="text-left py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Branch</th>
                    <SortableHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th className="text-left py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Reason</th>
                    {canManage && <th className="text-right py-3 px-5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((leave) => {
                    const doctorName = leave.doctor?.name || 'Unknown';
                    const doctorSpec = leave.doctor?.specialization || '';
                    const branchName = leave.branch?.name || 'All branches';
                    const days = daysBetween(leave.startDate, leave.endDate);
                    const isPending = leave.status === 'pending';
                    const sb = STATUS_BADGE[leave.status] || STATUS_BADGE.pending;
                    const leaveLabel = LEAVE_TYPES.find((t) => t.value === leave.leaveType)?.label || leave.leaveType || '—';

                    return (
                      <tr key={leave._id} className="border-b border-neutral-100 last:border-0 hover:bg-primary-50/30 transition-colors group">
                        {/* Doctor */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(doctorName)} flex items-center justify-center text-xs font-bold shrink-0`}>
                              {doctorName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-neutral-900 truncate">{doctorName}</p>
                              {doctorSpec && <p className="text-[11px] text-neutral-400 truncate">{doctorSpec}</p>}
                            </div>
                          </div>
                        </td>
                        {/* Period */}
                        <td className="py-3.5 px-5">
                          <p className="text-sm text-neutral-700">{formatDate(leave.startDate)}</p>
                          <p className="text-[11px] text-neutral-400">to {formatDate(leave.endDate)}</p>
                        </td>
                        {/* Days */}
                        <td className="py-3.5 px-5">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 text-neutral-700 font-semibold text-sm">
                            {days}
                          </span>
                        </td>
                        {/* Type */}
                        <td className="py-3.5 px-5">
                          <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-full bg-neutral-100 text-neutral-600">
                            {leaveLabel}
                          </span>
                        </td>
                        {/* Branch */}
                        <td className="py-3.5 px-5">
                          <span className="text-sm text-neutral-600">{branchName}</span>
                        </td>
                        {/* Status */}
                        <td className="py-3.5 px-5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${sb.bg} ${sb.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sb.dot}`} />
                            {(leave.status || 'N/A').replace(/_/g, ' ')}
                          </span>
                        </td>
                        {/* Reason */}
                        <td className="py-3.5 px-5 max-w-[180px]">
                          <p className="text-xs text-neutral-500 truncate" title={leave.reason}>{leave.reason || '—'}</p>
                        </td>
                        {/* Actions */}
                        {canManage && (
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              {isPending && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openConfirm('approve', leave); }}
                                    className="p-2 rounded-lg hover:bg-green-50 text-neutral-400 hover:text-green-600 transition"
                                    title="Approve"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openConfirm('reject', leave); }}
                                    className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition"
                                    title="Reject"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); openConfirm('delete', leave); }}
                                className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 border-t border-neutral-100">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Create Leave Modal ────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title="Add Leave" wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Doctor *</label>
              <select required value={form.doctor}
                onChange={(e) => setForm((f) => ({ ...f, doctor: e.target.value }))} className={inputCls}>
                <option value="">Select doctor...</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Leave Type</label>
              <select value={form.leaveType}
                onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))} className={inputCls}>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date *</label>
              <input type="date" required value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input type="date" required value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Branch (optional)</label>
              <select value={form.branch}
                onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} className={inputCls}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Reason</label>
            <textarea value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Optional reason for leave..."
              rows={2} className={`${inputCls} resize-none`} maxLength={500} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Creating...' : 'Create Leave'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Dialog ─────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title={
          confirmAction?.type === 'approve' ? 'Approve Leave' :
          confirmAction?.type === 'reject' ? 'Reject Leave' : 'Delete Leave'
        }
        message={
          confirmAction?.type === 'approve'
            ? `Approve ${confirmAction.leave?.doctor?.name || 'doctor'}'s leave from ${formatDate(confirmAction?.leave?.startDate)} to ${formatDate(confirmAction?.leave?.endDate)}?`
            : confirmAction?.type === 'reject'
            ? `Reject ${confirmAction.leave?.doctor?.name || 'doctor'}'s leave request?`
            : 'Delete this leave record? This action cannot be undone.'
        }
        danger={confirmAction?.type !== 'approve'}
        loading={confirmLoading}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmAction(null); }}
      />
    </div>
  );
}
