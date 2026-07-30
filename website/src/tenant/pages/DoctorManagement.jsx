import { useState, useEffect, useCallback } from 'react';
import {
  listDoctors, createDoctor, updateDoctor, deleteDoctor,
  listBranches, listDepartments, featureDoctor, bulkImportDoctors,
} from '../api';
import BulkUploadModal from '../components/BulkUploadModal';
import Can from '../components/Can';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, StatusBadge,
} from '../../platform/components/shared';
import {
  Search, Stethoscope, Users, Plus, Pencil, UserX,
  CheckCircle2, XCircle, Building2, Globe, Star, Eye, CalendarClock, Upload,
} from 'lucide-react';
import DoctorScheduleModal from '../components/DoctorScheduleModal';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';
import DoctorDetailDrawer from '../components/DoctorDetailDrawer';

// ─── Design tokens ──────────────────────────────────
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

const PAGE_SIZES = [10, 20, 50];

const STAT_CONFIG = [
  { key: 'total', title: 'Total Doctors', icon: Stethoscope, color: 'primary' },
  { key: 'active', title: 'Active', icon: CheckCircle2, color: 'green' },
  { key: 'inactive', title: 'Inactive', icon: XCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
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
  name: '', email: '', phone: '', password: '',
  specialization: '', licenseNumber: '', consultationFee: '',
  branch: '', department: '',
};

// ═══════════════════════════════════════════════════════
export default function DoctorManagement() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  // ─── List state ──────────────────────────────
  const [doctors, setDoctors] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) setSearch(highlightSearch); }, [highlightSearch]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Counts ───────────────────────────────────
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Lookup data ─────────────────────────────
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);

  // ─── Modal state ─────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // ─── Confirm dialog state ────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // ─── Feature toggle ─────────────────────────
  const [featureLoading, setFeatureLoading] = useState(null);
  const [featureConfirmOpen, setFeatureConfirmOpen] = useState(false);
  const [featureTarget, setFeatureTarget] = useState(null);

  // ─── Detail drawer ──────────────────────────
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailDoctor, setDetailDoctor] = useState(null);

  // ─── Schedule modal ──────────────────────────
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDoctor, setScheduleDoctor] = useState(null);

  // ─── Bulk upload ─────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);

  // ─── Fetch lookup data ───────────────────────
  useEffect(() => {
    listBranches({ limit: 200 }).then((res) => {
      setBranches(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
    listDepartments({ limit: 200 }).then((res) => {
      setDepartments(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
  }, []);

  // ─── Fetch doctors ───────────────────────────
  const fetchDoctors = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = { page, limit, sort: sortKey, order: sortDir };
    if (search) params.search = search;
    if (branchFilter !== 'all') params.branch = branchFilter;

    listDoctors(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setDoctors(data);
        setTotal(res.meta?.total || res.data?.total || data.length);

        if (res.meta?.counts) {
          setCounts(res.meta.counts);
        } else {
          setCounts({
            total: res.meta?.total || data.length,
            active: data.filter((d) => d.status === 'active' || d.isActive).length,
            inactive: data.filter((d) => d.status === 'inactive' || d.isActive === false).length,
          });
        }
        setStatsLoading(false);
      })
      .catch((err) => setError(err.message || 'Failed to load doctors'))
      .finally(() => setLoading(false));
  }, [page, limit, search, branchFilter, sortKey, sortDir]);

  useEffect(() => { fetchDoctors(); }, [fetchDoctors]);

  // ─── Handlers ────────────────────────────────
  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchDoctors(); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCreateModal = () => { setEditing(null); setForm(INITIAL_FORM); setFormError(null); setModalOpen(true); };

  const openEditModal = (doctor) => {
    setEditing(doctor);
    let deptId = doctor.department?._id || doctor.department || '';
    if (!deptId && doctor.specialization) {
      const match = departments.find((d) => d.name === doctor.specialization);
      if (match) deptId = match._id || match.id;
    }
    setForm({
      name: doctor.name || '', email: doctor.email || '', phone: doctor.phone || '', password: '',
      specialization: doctor.specialization || '', licenseNumber: doctor.licenseNumber || '',
      consultationFee: doctor.consultationFee ?? '', branch: doctor.branch?._id || doctor.branch || '',
      department: deptId,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(INITIAL_FORM); setFormError(null); };

  const handleFormChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form };
      if (payload.consultationFee !== '') payload.consultationFee = Number(payload.consultationFee);
      else delete payload.consultationFee;
      if (!payload.department || payload.department === '') delete payload.department;
      if (!payload.branch || payload.branch === '') delete payload.branch;

      if (editing) { delete payload.password; await updateDoctor(editing._id || editing.id, payload); }
      else await createDoctor(payload);
      closeModal();
      fetchDoctors();
    } catch (err) {
      setFormError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const openDeactivateConfirm = (doctor) => { setDeactivating(doctor); setConfirmOpen(true); };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    setDeactivateLoading(true);
    try {
      await deleteDoctor(deactivating._id || deactivating.id);
      setConfirmOpen(false);
      setDeactivating(null);
      fetchDoctors();
    } catch (err) {
      setError(err.message || 'Failed to deactivate doctor');
    } finally {
      setDeactivateLoading(false);
    }
  };

  // ─── Feature toggle ──────────────────────────
  const openFeatureConfirm = (doctor) => {
    setFeatureTarget({ doctor, willFeature: !doctor.isFeaturedOnPlatform });
    setFeatureConfirmOpen(true);
  };

  const handleFeatureConfirm = async () => {
    if (!featureTarget) return;
    const { doctor, willFeature } = featureTarget;
    setFeatureLoading(doctor._id || doctor.id);
    try {
      await featureDoctor(doctor._id || doctor.id, willFeature);
      setFeatureConfirmOpen(false);
      setFeatureTarget(null);
      fetchDoctors();
    } catch (err) {
      setError(err.message || 'Failed to update featured status');
    } finally {
      setFeatureLoading(null);
    }
  };

  const cancelFeatureConfirm = () => { setFeatureConfirmOpen(false); setFeatureTarget(null); };

  // ─── Detail drawer ──────────────────────────
  const openDetailDrawer = (doctor) => { setDetailDoctor(doctor); setDetailDrawerOpen(true); };

  // ─── Helpers ─────────────────────────────────
  const getBranchName = (doctor) => {
    if (typeof doctor.branch === 'object' && doctor.branch?.name) return doctor.branch.name;
    const found = branches.find((b) => b._id === doctor.branch || b.id === doctor.branch);
    return found?.name || '--';
  };

  // ─── Column definitions ──────────────────────
  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(r.name)} flex items-center justify-center text-xs font-bold shrink-0`}>
            {(r.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{r.name}</p>
            <p className="text-[11px] text-neutral-400 truncate">{r.licenseNumber || ''}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email', label: 'Email', sortable: true,
      render: (r) => <span className="text-sm text-neutral-600 truncate">{r.email || '--'}</span>,
    },
    {
      key: 'specialization', label: 'Specialization', sortable: true,
      render: (r) => <span className="text-sm font-medium text-neutral-600 capitalize">{r.specialization || '--'}</span>,
    },
    {
      key: 'branch', label: 'Branch',
      render: (r) => (
        <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded-md">{getBranchName(r)}</span>
      ),
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={r.status || (r.isActive ? 'active' : 'inactive')} />
          {r.isFeaturedOnPlatform && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Featured
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={(e) => { e.stopPropagation(); openFeatureConfirm(r); }}
            disabled={featureLoading === (r._id || r.id)}
            className={`p-2 rounded-lg transition ${r.isFeaturedOnPlatform
              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              : 'hover:bg-neutral-100 text-neutral-400 hover:text-amber-600'}`}
            title={r.isFeaturedOnPlatform ? 'Remove from platform' : 'Feature on platform'}>
            {featureLoading === (r._id || r.id)
              ? <span className="block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              : <Globe className="h-4 w-4" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); openDetailDrawer(r); }}
            className="p-2 rounded-lg hover:bg-primary-50 text-neutral-400 hover:text-primary-600 transition" title="View details">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setScheduleDoctor(r); setScheduleModalOpen(true); }}
            className="p-2 rounded-lg hover:bg-primary-50 text-neutral-400 hover:text-primary-600 transition" title="Schedule">
            <CalendarClock className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openEditModal(r); }}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <Can permission="user:delete">
            <button onClick={(e) => { e.stopPropagation(); openDeactivateConfirm(r); }}
              className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Deactivate">
              <UserX className="h-4 w-4" />
            </button>
          </Can>
        </div>
      ),
    },
  ];

  // ═══════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Doctor Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage doctors across all branches</p>
        </div>
        <Can permission="user:create">
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkOpen(true)} className={`${btnGhost} flex items-center gap-2`}>
              <Upload className="h-4 w-4" /> Bulk Import
            </button>
            <button onClick={openCreateModal} className={`${btnPrimary} flex items-center gap-2`}>
              <Plus className="h-4 w-4" /> Add Doctor
            </button>
          </div>
        </Can>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3"><div className="w-12 h-12 rounded-2xl bg-neutral-100 animate-pulse" /></div>
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
              </div>
            );
          })
        )}
      </div>

      {/* ── Toolbar Card ──────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or specialization..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
          </form>

          <div className="flex items-center gap-3 flex-wrap">
            <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="all">All Branches</option>
              {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
            </select>
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────── */}
      <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '200ms' }}>
        {loading ? (
          <Spinner />
        ) : doctors.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No doctors found" message="Try adjusting your filters or add a new doctor" />
        ) : (
          <>
            <DataTable columns={columns} data={doctors} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Create / Edit Modal ────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Doctor' : 'Add Doctor'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          {/* Personal Information */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Personal Information</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input type="text" required value={form.name} onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Dr. John Doe" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" required value={form.email} onChange={(e) => handleFormChange('email', e.target.value)}
                  placeholder="doctor@clinic.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)}
                  placeholder="+91 98765 43210" className={inputCls} />
              </div>
              {!editing && (
                <div>
                  <label className={labelCls}>Password *</label>
                  <input type="password" required={!editing} value={form.password} onChange={(e) => handleFormChange('password', e.target.value)}
                    placeholder="Min 8 characters" className={inputCls} />
                </div>
              )}
            </div>
          </div>

          {/* Professional Details */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope className="h-4 w-4 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Professional Details</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Specialization *</label>
                <select required value={form.department}
                  onChange={(e) => {
                    const deptId = e.target.value;
                    const dept = departments.find((d) => (d._id || d.id) === deptId);
                    handleFormChange('department', deptId);
                    handleFormChange('specialization', dept?.name || '');
                  }}
                  className={`${inputCls} cursor-pointer`}>
                  <option value="">Select specialization</option>
                  {departments.map((d) => <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>License Number</label>
                <input type="text" value={form.licenseNumber} onChange={(e) => handleFormChange('licenseNumber', e.target.value)}
                  placeholder="e.g. MCI-12345" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Consultation Fee</label>
                <input type="number" min="0" step="0.01" value={form.consultationFee}
                  onChange={(e) => handleFormChange('consultationFee', e.target.value)}
                  placeholder="500" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Assignment</span>
            </div>
            <div>
              <label className={labelCls}>Branch *</label>
              <select required value={form.branch} onChange={(e) => handleFormChange('branch', e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editing ? 'Update Doctor' : 'Create Doctor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Feature Toggle Confirmation ─────────────── */}
      <Modal open={featureConfirmOpen} onClose={cancelFeatureConfirm}
        title={featureTarget?.willFeature ? 'Feature Doctor on Platform' : 'Remove from Platform'}>
        {featureTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(featureTarget.doctor.name)} flex items-center justify-center text-sm font-bold shrink-0`}>
                {(featureTarget.doctor.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">{featureTarget.doctor.name}</p>
                <p className="text-xs text-neutral-400">{featureTarget.doctor.specialization || 'No specialization'}</p>
              </div>
            </div>

            {featureTarget.willFeature ? (
              <div className="space-y-2">
                <p className="text-sm text-neutral-700">This will publish this doctor&apos;s profile on the <span className="font-semibold text-primary-600">public platform directory</span>. Patients will be able to:</p>
                <ul className="text-sm text-neutral-600 space-y-1 ml-4 list-disc">
                  <li>Find this doctor in search results</li>
                  <li>View their profile, specialization, and qualifications</li>
                  <li>Book appointments directly from the platform</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-neutral-700">This will <span className="font-semibold text-red-600">remove</span> this doctor from the public platform directory.</p>
                <ul className="text-sm text-neutral-600 space-y-1 ml-4 list-disc">
                  <li>Patients will no longer see them in search results</li>
                  <li>Their public profile page will be deactivated</li>
                  <li>Existing appointments will not be affected</li>
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={cancelFeatureConfirm} className={btnGhost}>Cancel</button>
              <button onClick={handleFeatureConfirm} disabled={featureLoading}
                className={featureTarget.willFeature ? btnPrimary : 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50'}>
                {featureLoading ? 'Processing...' : featureTarget.willFeature ? 'Feature Doctor' : 'Remove from Platform'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Deactivate Confirm ──────────────────────── */}
      <Modal open={confirmOpen} onClose={() => { setConfirmOpen(false); setDeactivating(null); }} title="Deactivate Doctor">
        {deactivating && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200/60">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(deactivating.name)} flex items-center justify-center text-sm font-bold shrink-0`}>
                {(deactivating.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-neutral-900 text-sm">{deactivating.name}</p>
                <p className="text-xs text-neutral-400">{deactivating.specialization || 'No specialization'} &middot; {getBranchName(deactivating)}</p>
              </div>
            </div>

            <p className="text-sm text-neutral-700">This will <span className="font-semibold text-red-600">deactivate</span> this doctor:</p>
            <ul className="text-sm text-neutral-600 space-y-1 ml-4 list-disc">
              <li>They will no longer be able to log in or access the system</li>
              <li>They will be removed from the active doctor roster</li>
              {deactivating.isFeaturedOnPlatform && (
                <li className="text-red-600 font-medium">Their featured public profile will also be removed</li>
              )}
              <li>Existing patient records and past appointments are preserved</li>
            </ul>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setConfirmOpen(false); setDeactivating(null); }} className={btnGhost}>Cancel</button>
              <button onClick={handleDeactivate} disabled={deactivateLoading}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {deactivateLoading ? 'Deactivating...' : 'Deactivate Doctor'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Doctor Schedule Modal ───────────────────── */}
      <DoctorScheduleModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setScheduleDoctor(null); }}
        doctor={scheduleDoctor}
      />

      {/* ── Doctor Detail Drawer ───────────────────── */}
      <DoctorDetailDrawer
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); setDetailDoctor(null); }}
        doctor={detailDoctor}
        onOpenSchedule={(d) => { setScheduleDoctor(d); setScheduleModalOpen(true); }}
        onOpenFeature={(d) => openFeatureConfirm(d)}
        onRefresh={fetchDoctors}
      />

      {/* ── Bulk Upload ────────────────────────────── */}
      <BulkUploadModal
        open={bulkOpen} onClose={() => setBulkOpen(false)} entityName="Doctors"
        columns={[
          { key: 'name', label: 'Name', required: true, example: 'Dr. Priya Sharma' },
          { key: 'email', label: 'Email', required: true, example: 'priya@clinic.com' },
          { key: 'phone', label: 'Phone', example: '+91 9876543210' },
          { key: 'password', label: 'Password', required: true, example: 'Doctor@123' },
          { key: 'specialization', label: 'Specialization', example: 'Cardiology' },
          { key: 'licenseNumber', label: 'License Number', example: 'MH-12345' },
          { key: 'consultationFee', label: 'Consultation Fee', example: '500' },
          { key: 'branchCode', label: 'Branch Code', example: 'MAIN' },
        ]}
        onImport={bulkImportDoctors} onRefresh={fetchDoctors}
      />
    </div>
  );
}
