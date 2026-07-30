import { useState, useEffect, useCallback } from 'react';
import { listRoles, createRole, updateRole, deleteRole } from '../api';
import {
  Drawer, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import {
  Search, Shield, Plus, Pencil, Trash2, Eye,
  CheckCircle2, XCircle, Lock, Users, ChevronDown, ChevronUp,
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

const GROUP_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'finance', label: 'Finance' },
];

const GROUP_STYLES = {
  admin:      { bg: 'bg-purple-50', text: 'text-purple-700' },
  clinical:   { bg: 'bg-blue-50', text: 'text-blue-700' },
  front_desk: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  finance:    { bg: 'bg-amber-50', text: 'text-amber-700' },
};

const STAT_CONFIG = [
  { key: 'total', title: 'Total Roles', icon: Shield, color: 'primary' },
  { key: 'active', title: 'Active', icon: CheckCircle2, color: 'green' },
  { key: 'inactive', title: 'Inactive', icon: XCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
};

// ─── Permission groups for the checklist ────────────
const PERMISSION_GROUPS = [
  {
    label: 'Patients',
    perms: ['patient:create', 'patient:read', 'patient:readOwn', 'patient:update', 'patient:updateOwn', 'patient:delete'],
  },
  {
    label: 'Appointments',
    perms: ['appointment:create', 'appointment:read', 'appointment:readOwn', 'appointment:update', 'appointment:cancel', 'appointment:cancelOwn'],
  },
  {
    label: 'Treatment Records',
    perms: ['record:create', 'record:read', 'record:readOwn', 'record:update'],
  },
  {
    label: 'Invoices',
    perms: ['invoice:create', 'invoice:read', 'invoice:readOwn', 'invoice:update', 'invoice:void'],
  },
  {
    label: 'Users / Staff',
    perms: ['user:create', 'user:read', 'user:update', 'user:delete'],
  },
  {
    label: 'Clinic',
    perms: ['clinic:read', 'clinic:update'],
  },
  {
    label: 'Dashboard',
    perms: ['dashboard:read', 'dashboard:readOwn'],
  },
  {
    label: 'Departments',
    perms: ['department:create', 'department:read', 'department:update', 'department:delete'],
  },
  {
    label: 'Branches',
    perms: ['branch:create', 'branch:read', 'branch:update', 'branch:delete'],
  },
  {
    label: 'Notifications',
    perms: ['notification:create', 'notification:read'],
  },

  {
    label: 'Billing & Payments',
    perms: ['payment:create', 'payment:read', 'payment:readOwn', 'payment:update', 'payment:refund', 'billing:read', 'billing:manage', 'cashRegister:open', 'cashRegister:close', 'cashRegister:read', 'creditNote:create', 'creditNote:read', 'creditNote:readOwn', 'creditNote:void'],
  },
  {
    label: 'Insurance',
    perms: ['insurance:create', 'insurance:read', 'insurance:update', 'insurance:delete', 'insuranceClaim:create', 'insuranceClaim:read', 'insuranceClaim:update'],
  },
  {
    label: 'Queue',
    perms: ['queue:manage', 'queue:read'],
  },
  {
    label: 'Prescriptions',
    perms: ['prescription:create', 'prescription:read', 'prescription:readOwn', 'prescription:update'],
  },
  {
    label: 'Telemedicine',
    perms: ['telemedicine:create', 'telemedicine:read', 'telemedicine:readOwn', 'telemedicine:join'],
  },
  {
    label: 'Emergency',
    perms: ['emergency:create', 'emergency:read', 'emergency:manage'],
  },
  {
    label: 'Scheduling',
    perms: ['schedule:read', 'schedule:manage'],
  },
  {
    label: 'Analytics',
    perms: ['analytics:read'],
  },
  {
    label: 'Inventory',
    perms: ['inventory:create', 'inventory:read', 'inventory:update', 'inventory:delete'],
  },
  {
    label: 'Consent',
    perms: ['consent:create', 'consent:read', 'consent:readOwn', 'consent:revoke'],
  },
];

const INITIAL_FORM = {
  name: '', slug: '', description: '', group: 'clinical', permissions: [], displayOrder: 0,
};

// ─── Permission Checklist Sub-Component ──────────────
function PermissionChecklist({ selected = [], onChange }) {
  const [expanded, setExpanded] = useState({});

  const toggle = (group) => setExpanded((p) => ({ ...p, [group]: !p[group] }));

  const isGroupAllSelected = (perms) => perms.every((p) => selected.includes(p));
  const isGroupPartial = (perms) => perms.some((p) => selected.includes(p)) && !isGroupAllSelected(perms);

  const toggleGroup = (perms) => {
    if (isGroupAllSelected(perms)) {
      onChange(selected.filter((p) => !perms.includes(p)));
    } else {
      onChange([...new Set([...selected, ...perms])]);
    }
  };

  const togglePerm = (perm) => {
    if (selected.includes(perm)) {
      onChange(selected.filter((p) => p !== perm));
    } else {
      onChange([...selected, perm]);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-xl max-h-[400px] overflow-y-auto divide-y divide-neutral-100">
      {PERMISSION_GROUPS.map((g) => (
        <div key={g.label}>
          <button
            type="button"
            onClick={() => toggle(g.label)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-neutral-50 transition"
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={isGroupAllSelected(g.perms)}
                ref={(el) => { if (el) el.indeterminate = isGroupPartial(g.perms); }}
                onChange={() => toggleGroup(g.perms)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-neutral-700">{g.label}</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {g.perms.filter((p) => selected.includes(p)).length}/{g.perms.length}
              </span>
            </div>
            {expanded[g.label]
              ? <ChevronUp className="h-3.5 w-3.5 text-neutral-400" />
              : <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />}
          </button>
          {expanded[g.label] && (
            <div className="px-4 pb-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {g.perms.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(p)}
                    onChange={() => togglePerm(p)}
                    className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-neutral-600 font-mono">{p}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
export default function RoleMaster() {
  // ─── List state ──────────────────────────────
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortKey, setSortKey] = useState('displayOrder');
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

  // ─── View detail state ─────────────────────
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  // ─── Confirm dialog state ────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Fetch roles ───────────────────────────
  const fetchRoles = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = { page, limit, sort: sortKey, order: sortDir };
    if (search) params.search = search;
    if (statusFilter !== 'all') params.isActive = statusFilter === 'active';
    if (groupFilter !== 'all') params.group = groupFilter;

    listRoles(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setRoles(data);
        setTotal(res.meta?.total || res.data?.total || data.length);

        if (res.meta?.counts) {
          setCounts(res.meta.counts);
        } else {
          setCounts({
            total: res.meta?.total || data.length,
            active: data.filter((r) => r.isActive).length,
            inactive: data.filter((r) => !r.isActive).length,
          });
        }
        setStatsLoading(false);
      })
      .catch((err) => setError(err.message || 'Failed to load roles'))
      .finally(() => setLoading(false));
  }, [page, limit, search, statusFilter, groupFilter, sortKey, sortDir]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ─── Handlers ────────────────────────────────
  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchRoles(); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openCreateModal = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setEditing(role);
    setForm({
      name: role.name || '',
      slug: role.slug || '',
      description: role.description || '',
      group: role.group || 'clinical',
      permissions: role.permissions || [],
      displayOrder: role.displayOrder || 0,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormError(null);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Role name is required'); return; }
    if (!editing && !form.slug.trim()) { setFormError('Role slug is required'); return; }
    if (!form.group) { setFormError('Group is required'); return; }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const payload = {
          name: form.name,
          description: form.description,
          group: form.group,
          permissions: form.permissions,
          displayOrder: form.displayOrder,
        };
        await updateRole(editing.slug, payload);
      } else {
        await createRole(form);
      }
      fetchRoles();
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (role) => {
    setDeleting(role);
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteRole(deleting.slug);
      fetchRoles();
      setConfirmOpen(false);
      setDeleting(null);
    } catch (err) {
      alert(err.message || 'Failed to delete role');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Table columns ───────────────────────────
  const columns = [
    {
      key: 'name', label: 'Role', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-neutral-900">{row.name}</p>
              {row.isSystem && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 font-medium">
                  <Lock className="h-2.5 w-2.5" /> System
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 font-mono">{row.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'group', label: 'Group', sortable: true,
      render: (row) => {
        const s = GROUP_STYLES[row.group] || GROUP_STYLES.clinical;
        return (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
            {(row.group || '').replace(/_/g, ' ')}
          </span>
        );
      },
    },
    {
      key: 'permissions', label: 'Permissions',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm text-neutral-600">{row.permissions?.length || 0} permissions</span>
        </div>
      ),
    },
    {
      key: 'isActive', label: 'Status',
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
          {!row.isSystem && (
            <button onClick={() => openDeleteDialog(row)}
              className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Role Master</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage roles and their permissions for your clinic</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreateModal} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Role
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
                placeholder="Search roles..."
                className="pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all w-56" />
            </form>
            <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="all">All Groups</option>
              {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
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
        ) : roles.length === 0 ? (
          <EmptyState icon={Shield} title="No roles found"
            message={search ? 'Try adjusting your search' : 'Get started by adding your first role'} />
        ) : (
          <>
            <DataTable columns={columns} data={roles} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Create/Edit Drawer ──────────────────────── */}
      <Drawer open={modalOpen} onClose={closeModal} title={editing ? 'Edit Role' : 'Add Role'} wide>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-100">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Role Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={(e) => handleFormChange('name', e.target.value)}
                placeholder="e.g., Receptionist" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>
                Slug <span className="text-red-500">*</span>
                {editing?.isSystem && <span className="text-neutral-400 ml-1">(readonly)</span>}
              </label>
              <input type="text" value={form.slug}
                onChange={(e) => handleFormChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g., receptionist" className={inputCls}
                required disabled={!!editing} maxLength={50} />
              {!editing && <p className="text-xs text-neutral-400 mt-1">Lowercase, no spaces. Used as the role identifier.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Group <span className="text-red-500">*</span></label>
              <select value={form.group} onChange={(e) => handleFormChange('group', e.target.value)} className={inputCls} required>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Display Order</label>
              <input type="number" value={form.displayOrder} onChange={(e) => handleFormChange('displayOrder', Number(e.target.value))}
                className={inputCls} min={0} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Brief description of this role..." className={inputCls} rows={2} maxLength={500} />
          </div>

          <div>
            <label className={labelCls}>
              Permissions
              <span className="text-neutral-400 font-normal ml-1">({form.permissions.length} selected)</span>
            </label>
            <PermissionChecklist
              selected={form.permissions}
              onChange={(perms) => handleFormChange('permissions', perms)}
            />
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
      <Drawer open={viewOpen} onClose={() => { setViewOpen(false); setViewItem(null); }} title="Role Details" wide>
        {viewItem && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-neutral-900 font-display">{viewItem.name}</p>
                  {viewItem.isSystem && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 font-medium">
                      <Lock className="h-2.5 w-2.5" /> System
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">{viewItem.slug}</p>
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
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Group</p>
                <p className="text-sm text-neutral-600 capitalize">{(viewItem.group || '').replace(/_/g, ' ')}</p>
              </div>
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Permissions Count</p>
                <p className="text-sm text-neutral-600">{viewItem.permissions?.length || 0} permissions assigned</p>
              </div>
            </div>

            {viewItem.description && (
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-neutral-600 whitespace-pre-line">{viewItem.description}</p>
              </div>
            )}

            {/* Permission list — grouped by module */}
            {viewItem.permissions?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Permissions ({viewItem.permissions.length})
                </p>
                <div className="space-y-2">
                  {PERMISSION_GROUPS
                    .filter((g) => g.perms.some((p) => viewItem.permissions.includes(p)))
                    .map((g) => (
                      <div key={g.label} className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">{g.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.perms.filter((p) => viewItem.permissions.includes(p)).map((p) => (
                            <span key={p} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-600">
                              {p.split(':')[1]}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
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
        title="Delete Role" message={`Are you sure you want to delete "${deleting?.name}"? This action cannot be undone.`}
        loading={deleteLoading} danger />
    </div>
  );
}
