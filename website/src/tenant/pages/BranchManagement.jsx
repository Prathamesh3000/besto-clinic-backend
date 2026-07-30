import { useState, useEffect, useCallback } from 'react';
import { listBranches, createBranch, updateBranch, deleteBranch, bulkImportBranches } from '../api';
import BulkUploadModal from '../components/BulkUploadModal';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, StatusBadge, ConfirmDialog,
} from '../../platform/components/shared';
import {
  Search, Building2, MapPin, Phone, Plus, Pencil, Trash2,
  CheckCircle2, XCircle, Upload, Clock,
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
  { key: 'total', title: 'Total Branches', icon: Building2, color: 'primary' },
  { key: 'active', title: 'Active', icon: CheckCircle2, color: 'green' },
  { key: 'inactive', title: 'Inactive', icon: XCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

const DEFAULT_OPERATING_HOURS = DAYS.map((day) => ({
  day, openTime: '09:00', closeTime: '18:00', isClosed: day === 'sunday',
}));

const INITIAL_FORM = {
  name: '', code: '',
  address: { street: '', locality: '', city: '', state: '', zipCode: '' },
  phone: '', email: '',
  operatingHours: DEFAULT_OPERATING_HOURS,
};

// ═══════════════════════════════════════════════════════
export default function BranchManagement() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  // ─── List state ──────────────────────────────
  const [branches, setBranches] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) setSearch(highlightSearch); }, [highlightSearch]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // ─── Confirm dialog state ────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Fetch branches ──────────────────────────
  const fetchBranches = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = { page, limit, sort: sortKey, order: sortDir };
    if (search) params.search = search;
    if (statusFilter !== 'all') params.status = statusFilter;

    listBranches(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setBranches(data);
        setTotal(res.meta?.total || res.data?.total || data.length);

        if (res.meta?.counts) {
          setCounts(res.meta.counts);
        } else {
          setCounts({
            total: res.meta?.total || data.length,
            active: data.filter((b) => b.status === 'active' || b.isActive).length,
            inactive: data.filter((b) => b.status === 'inactive' || b.isActive === false).length,
          });
        }
        setStatsLoading(false);
      })
      .catch((err) => setError(err.message || 'Failed to load branches'))
      .finally(() => setLoading(false));
  }, [page, limit, search, statusFilter, sortKey, sortDir]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  // ─── Handlers ────────────────────────────────
  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchBranches(); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCreateModal = () => { setEditing(null); setForm(INITIAL_FORM); setFormError(null); setModalOpen(true); };

  const openEditModal = (branch) => {
    setEditing(branch);
    const existingHours = branch.operatingHours || [];
    const hours = DAYS.map((day) => {
      const found = existingHours.find((h) => h.day === day);
      return found
        ? { day, openTime: found.openTime || '09:00', closeTime: found.closeTime || '18:00', isClosed: !!found.isClosed }
        : { day, openTime: '09:00', closeTime: '18:00', isClosed: day === 'sunday' };
    });
    setForm({
      name: branch.name || '', code: branch.code || '',
      address: {
        street: branch.address?.street || '', locality: branch.address?.locality || '',
        city: branch.address?.city || '', state: branch.address?.state || '', zipCode: branch.address?.zipCode || '',
      },
      phone: branch.phone || '', email: branch.email || '', operatingHours: hours,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(INITIAL_FORM); setFormError(null); };

  const handleFormChange = (field, value) => {
    if (field.startsWith('address.')) {
      const addrField = field.split('.')[1];
      setForm((prev) => ({ ...prev, address: { ...prev.address, [addrField]: value } }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleHoursChange = (index, field, value) => {
    setForm((prev) => {
      const hours = [...prev.operatingHours];
      hours[index] = { ...hours[index], [field]: value };
      return { ...prev, operatingHours: hours };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await updateBranch(editing._id || editing.id, form);
      else await createBranch(form);
      closeModal();
      fetchBranches();
    } catch (err) {
      setFormError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (branch) => { setDeleting(branch); setConfirmOpen(true); };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteBranch(deleting._id || deleting.id);
      setConfirmOpen(false);
      setDeleting(null);
      fetchBranches();
    } catch { /* silent */ } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Column definitions ──────────────────────
  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
            {(r.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{r.name}</p>
            {r.email && <p className="text-[11px] text-neutral-400 truncate">{r.email}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'code', label: 'Code',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded-md">{r.code || '--'}</span>
      ),
    },
    {
      key: 'manager', label: 'Manager',
      render: (r) => <span className="text-sm text-neutral-600">{r.manager?.name || r.managerName || '--'}</span>,
    },
    {
      key: 'phone', label: 'Phone',
      render: (r) => <span className="text-sm text-neutral-600">{r.phone || '--'}</span>,
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (r) => <StatusBadge status={r.status || (r.isActive ? 'active' : 'inactive')} />,
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={(e) => { e.stopPropagation(); openEditModal(r); }}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit branch">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(r); }}
            className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Delete branch">
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Branch Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage all clinic branches and locations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className={`${btnGhost} flex items-center gap-2`}>
            <Upload className="h-4 w-4" /> Bulk Import
          </button>
          <button onClick={openCreateModal} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Branch
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
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
              const isActive = (s.value === 'all' && statusFilter === 'all') || statusFilter === s.value;
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

          {/* Search + page size */}
          <div className="flex items-center gap-3 flex-wrap">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search branches..."
                className="pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all w-64" />
            </form>
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
        ) : branches.length === 0 ? (
          <EmptyState icon={Building2} title="No branches found" message="Try adjusting your filters or add a new branch" />
        ) : (
          <>
            <DataTable columns={columns} data={branches} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Create / Edit Modal ────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Branch' : 'Add Branch'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Branch Name *</label>
              <input type="text" required value={form.name} onChange={(e) => handleFormChange('name', e.target.value)}
                placeholder="e.g. Downtown Clinic" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Branch Code *</label>
              <input type="text" required value={form.code} onChange={(e) => handleFormChange('code', e.target.value)}
                placeholder="e.g. DT-001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input type="tel" value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)}
                  placeholder="+91 98765 43210" className={`${inputCls} pl-10`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={(e) => handleFormChange('email', e.target.value)}
                placeholder="branch@clinic.com" className={inputCls} />
            </div>
          </div>

          {/* Address Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Address</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Street</label>
                <input type="text" value={form.address.street} onChange={(e) => handleFormChange('address.street', e.target.value)}
                  placeholder="123 Main St" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Locality / Area</label>
                <input type="text" value={form.address.locality} onChange={(e) => handleFormChange('address.locality', e.target.value)}
                  placeholder="e.g. Viman Nagar, Andheri West" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input type="text" value={form.address.city} onChange={(e) => handleFormChange('address.city', e.target.value)}
                  placeholder="Mumbai" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input type="text" value={form.address.state} onChange={(e) => handleFormChange('address.state', e.target.value)}
                  placeholder="Maharashtra" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Zip Code</label>
                <input type="text" value={form.address.zipCode} onChange={(e) => handleFormChange('address.zipCode', e.target.value)}
                  placeholder="400001" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Operating Hours Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Operating Hours</span>
            </div>
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-xs">
                    <th className="py-2 px-3 text-left font-semibold">Day</th>
                    <th className="py-2 px-3 text-center font-semibold">Closed</th>
                    <th className="py-2 px-3 text-left font-semibold">Open</th>
                    <th className="py-2 px-3 text-left font-semibold">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {form.operatingHours.map((h, i) => (
                    <tr key={h.day} className="border-t border-neutral-100">
                      <td className="py-2 px-3 font-medium text-neutral-700">{DAY_LABELS[h.day]}</td>
                      <td className="py-2 px-3 text-center">
                        <input type="checkbox" checked={h.isClosed} onChange={(e) => handleHoursChange(i, 'isClosed', e.target.checked)}
                          className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="time" value={h.openTime} onChange={(e) => handleHoursChange(i, 'openTime', e.target.value)}
                          disabled={h.isClosed} className={`${inputCls} ${h.isClosed ? 'opacity-40' : ''}`} />
                      </td>
                      <td className="py-2 px-3">
                        <input type="time" value={h.closeTime} onChange={(e) => handleHoursChange(i, 'closeTime', e.target.value)}
                          disabled={h.isClosed} className={`${inputCls} ${h.isClosed ? 'opacity-40' : ''}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editing ? 'Update Branch' : 'Create Branch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm ─────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Branch"
        message={`Are you sure you want to delete "${deleting?.name || ''}"? This action cannot be undone.`}
        danger loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => { setConfirmOpen(false); setDeleting(null); }}
      />

      {/* ── Bulk Upload Modal ──────────────────────── */}
      <BulkUploadModal
        open={bulkOpen} onClose={() => setBulkOpen(false)}
        entityName="Branches"
        columns={[
          { key: 'name', label: 'Name', required: true, example: 'Main Branch' },
          { key: 'code', label: 'Code', required: true, example: 'MAIN' },
          { key: 'phone', label: 'Phone', example: '+91 9876543210' },
          { key: 'email', label: 'Email', example: 'branch@clinic.com' },
          { key: 'address.street', label: 'Street', example: '123 MG Road' },
          { key: 'address.city', label: 'City', example: 'Mumbai' },
          { key: 'address.state', label: 'State', example: 'Maharashtra' },
          { key: 'address.zipCode', label: 'ZIP Code', example: '400001' },
        ]}
        onImport={bulkImportBranches}
        onRefresh={fetchBranches}
      />
    </div>
  );
}
