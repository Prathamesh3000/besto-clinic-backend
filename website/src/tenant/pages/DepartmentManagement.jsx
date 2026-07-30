import { useState, useEffect, useCallback } from 'react';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, listBranches, listDoctors, bulkImportDepartments } from '../api';
import BulkUploadModal from '../components/BulkUploadModal';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';
import {
  Drawer, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import {
  Search, Layers, Building2, UserCog, Plus, Pencil, Trash2,
  CheckCircle2, XCircle, Upload, Eye,
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
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const STAT_CONFIG = [
  { key: 'total', title: 'Total Departments', icon: Layers, color: 'primary' },
  { key: 'active', title: 'Active', icon: CheckCircle2, color: 'green' },
  { key: 'inactive', title: 'Inactive', icon: XCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
};

const INITIAL_FORM = { name: '', code: '', branch: '', headOfDepartment: '', description: '' };

// ═══════════════════════════════════════════════════════
export default function DepartmentManagement() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  // ─── List state ──────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) setSearch(highlightSearch); }, [highlightSearch]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Dropdown data ───────────────────────────
  const [branches, setBranches] = useState([]);
  const [doctors, setDoctors] = useState([]);

  // ─── Counts for stat cards ───────────────────
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Modal state ─────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // ─── Bulk upload state ──────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);

  // ─── View detail state ─────────────────────
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  // ─── Confirm dialog state ────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Fetch departments ───────────────────────
  const fetchDepartments = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = { page, limit, sort: sortKey, order: sortDir };
    if (search) params.search = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (branchFilter !== 'all') params.branch = branchFilter;

    listDepartments(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setDepartments(data);
        setTotal(res.meta?.total || res.data?.total || data.length);

        if (res.meta?.counts) {
          setCounts(res.meta.counts);
        } else {
          setCounts({
            total: res.meta?.total || data.length,
            active: data.filter((d) => d.isActive).length,
            inactive: data.filter((d) => !d.isActive).length,
          });
        }
        setStatsLoading(false);
      })
      .catch((err) => setError(err.message || 'Failed to load departments'))
      .finally(() => setLoading(false));
  }, [page, limit, search, statusFilter, branchFilter, sortKey, sortDir]);

  // ─── Fetch lookup data ─────────────────────
  useEffect(() => {
    listBranches({}).then((res) => {
      setBranches(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
    listDoctors({ role: 'doctor' }).then((res) => {
      setDoctors(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  // ─── Handlers ────────────────────────────────
  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchDepartments(); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCreateModal = () => { setEditing(null); setForm(INITIAL_FORM); setFormError(null); setModalOpen(true); };

  const openEditModal = (department) => {
    setEditing(department);
    setForm({
      name: department.name || '', code: department.code || '',
      branch: department.branch?._id || department.branch || '',
      headOfDepartment: department.headOfDepartment?._id || department.headOfDepartment || '',
      description: department.description || '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(INITIAL_FORM); setFormError(null); };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Department name is required'); return; }
    if (!form.code.trim()) { setFormError('Department code is required'); return; }
    if (!form.branch) { setFormError('Branch is required'); return; }

    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form };
      if (!payload.headOfDepartment || payload.headOfDepartment === '') delete payload.headOfDepartment;

      if (editing) await updateDepartment(editing._id, payload);
      else await createDepartment(payload);
      fetchDepartments();
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (department) => { setDeleting(department); setConfirmOpen(true); };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteDepartment(deleting._id);
      fetchDepartments();
      setConfirmOpen(false);
      setDeleting(null);
    } catch (err) {
      alert(err.message || 'Failed to delete department');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Table columns ───────────────────────────
  const columns = [
    {
      key: 'name', label: 'Department', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-neutral-900">{row.name}</p>
            <p className="text-[11px] text-neutral-400 font-mono">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'branch', label: 'Branch',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm text-neutral-600">{row.branch?.name || 'N/A'}</span>
        </div>
      ),
    },
    {
      key: 'headOfDepartment', label: 'Head of Department',
      render: (row) => (
        <div className="flex items-center gap-2">
          <UserCog className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm text-neutral-600">{row.headOfDepartment?.name || 'Not assigned'}</span>
        </div>
      ),
    },
    {
      key: 'description', label: 'Description',
      render: (row) => <span className="text-sm text-neutral-500 line-clamp-1">{row.description || '—'}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
          row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${row.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => { setViewItem(row); setViewOpen(true); }}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View details">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={() => openEditModal(row)}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => openDeleteDialog(row)}
            className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Department Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage clinical departments across branches</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className={`${btnGhost} flex items-center gap-2`}>
            <Upload className="h-4 w-4" /> Bulk Import
          </button>
          <button onClick={openCreateModal} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Department
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

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
          {/* Status filter pills */}
          <div className="flex items-center gap-1.5">
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

          {/* Search + dropdowns */}
          <div className="flex items-center gap-3 flex-wrap">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments..."
                className="pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all w-64" />
            </form>
            <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="all">All Branches</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
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
        ) : departments.length === 0 ? (
          <EmptyState icon={Layers} title="No departments found"
            message={search ? 'Try adjusting your search' : 'Get started by adding your first department'} />
        ) : (
          <>
            <DataTable columns={columns} data={departments} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Create/Edit Drawer ──────────────────────── */}
      <Drawer open={modalOpen} onClose={closeModal} title={editing ? 'Edit Department' : 'Add Department'}>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-100">{formError}</div>
          )}

          <div>
            <label className={labelCls}>Department Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="e.g., Cardiology" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Department Code <span className="text-red-500">*</span></label>
            <input type="text" value={form.code} onChange={(e) => handleFormChange('code', e.target.value.toUpperCase())}
              placeholder="e.g., CARDIO" className={inputCls} maxLength={20} required />
            <p className="text-xs text-neutral-400 mt-1">Unique code, uppercase letters only</p>
          </div>
          <div>
            <label className={labelCls}>Branch <span className="text-red-500">*</span></label>
            <select value={form.branch} onChange={(e) => handleFormChange('branch', e.target.value)} className={inputCls} required>
              <option value="">Select branch...</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Head of Department</label>
            <select value={form.headOfDepartment} onChange={(e) => handleFormChange('headOfDepartment', e.target.value)} className={inputCls}>
              <option value="">Select doctor...</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{d.name} {d.specialization ? `(${d.specialization})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Brief description of the department..." className={inputCls} rows={3} maxLength={500} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* ── View Detail Drawer ────────────────────────── */}
      <Drawer open={viewOpen} onClose={() => { setViewOpen(false); setViewItem(null); }} title="Department Details">
        {viewItem && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                <Layers className="h-6 w-6 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-neutral-900 font-display">{viewItem.name}</p>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">{viewItem.code}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                viewItem.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${viewItem.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {viewItem.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Branch</p>
                <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {viewItem.branch?.name || 'N/A'}
                </p>
              </div>
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Head of Department</p>
                <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                  <UserCog className="h-3.5 w-3.5" /> {viewItem.headOfDepartment?.name || 'Not assigned'}
                </p>
              </div>
            </div>

            {viewItem.description && (
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-neutral-600 whitespace-pre-line">{viewItem.description}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button onClick={() => { setViewOpen(false); openEditModal(viewItem); }} className={btnGhost}>Edit</button>
              <button onClick={() => { setViewOpen(false); setViewItem(null); }} className={btnGhost}>Close</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Delete Confirmation ─────────────────────── */}
      <ConfirmDialog
        open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={handleDelete}
        title="Delete Department" message={`Are you sure you want to delete "${deleting?.name}"? This action cannot be undone.`}
        loading={deleteLoading} danger />

      {/* ── Bulk Upload Modal ──────────────────────── */}
      <BulkUploadModal
        open={bulkOpen} onClose={() => setBulkOpen(false)} entityName="Departments"
        columns={[
          { key: 'name', label: 'Name', required: true, example: 'Cardiology' },
          { key: 'code', label: 'Code', required: true, example: 'CARDIO' },
          { key: 'branchCode', label: 'Branch Code', required: true, example: 'MAIN' },
          { key: 'description', label: 'Description', example: 'Heart and cardiovascular care' },
        ]}
        onImport={bulkImportDepartments} onRefresh={fetchDepartments}
      />
    </div>
  );
}
