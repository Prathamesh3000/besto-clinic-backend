import { useState, useEffect, useCallback } from 'react';
import {
  Drawer, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import {
  listStaff, createStaffMember, updateStaffMember, deleteStaffMember,
  listBranches, listDepartments, bulkImportStaff, changeStaffRole, listRoles,
} from '../api';
import {
  UserCog, Plus, Search, Mail, Shield, Edit3, UserX, Users,
  Upload, CheckCircle2, XCircle, Eye,
  Phone, Building2, Layers,
} from 'lucide-react';
import BulkUploadModal from '../components/BulkUploadModal';
import Can from '../components/Can';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';

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
  { key: 'total', title: 'Total Staff', icon: Users, color: 'primary' },
  { key: 'active', title: 'Active', icon: CheckCircle2, color: 'green' },
  { key: 'inactive', title: 'Inactive', icon: XCircle, color: 'red' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
};

const INITIAL_FORM = { name: '', email: '', phone: '', password: '', role: '', branch: '', department: '' };

// ═══════════════════════════════════════════════════════
export default function StaffManagement() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  // ─── State ───────────────────────────────────
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);

  const [search, setSearch] = useState(highlightSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) { setSearch(highlightSearch); setDebouncedSearch(highlightSearch); } }, [highlightSearch]);
  const [roleFilter, setRoleFilter] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);

  // ─── Counts ──────────────────────────────────
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Modal state ─────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // ─── View detail state ─────────────────────
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  // ─── Role change state ───────────────────────
  const [roleChangeConfirm, setRoleChangeConfirm] = useState(null);
  const [roleChangeLoading, setRoleChangeLoading] = useState(false);
  const [rolePermMap, setRolePermMap] = useState({});
  const [roles, setRoles] = useState([]);

  // ─── Debounce search ─────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── Fetch staff ─────────────────────────────
  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit, sort: sortKey, order: sortDir };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.role = roleFilter;
      const res = await listStaff(params);
      const data = res.data || res.staff || [];
      setStaff(data);
      setTotal(res.meta?.total ?? res.total ?? 0);

      // Compute counts
      const activeCount = data.filter((s) => s.status === 'active' || s.isActive !== false).length;
      setCounts({
        total: res.meta?.total ?? res.total ?? data.length,
        active: activeCount,
        inactive: data.length - activeCount,
      });
      setStatsLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, roleFilter, sortKey, sortDir]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  // ─── Fetch lookup data ───────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [br, dp] = await Promise.all([
          listBranches({ limit: 100 }),
          listDepartments({ limit: 100 }),
        ]);
        setBranches(br.data || br.branches || []);
        setDepartments(dp.data || dp.departments || []);
      } catch { /* non-critical */ }
    })();
    (async () => {
      try {
        const res = await listRoles({ excludeGroup: 'clinical', isActive: true, limit: 100 });
        const items = Array.isArray(res.data) ? res.data : res.data?.items || res.items || [];
        if (items.length > 0) {
          setRoles(items.map((r) => ({ value: r.slug, label: r.name })));
          const map = {};
          for (const r of items) {
            map[r.slug] = { permissions: r.permissions || [], count: (r.permissions || []).length };
          }
          setRolePermMap(map);
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  // ─── Handlers ────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const openAdd = () => { setEditing(null); setForm(INITIAL_FORM); setFormError(''); setModalOpen(true); };

  const openEdit = (member) => {
    setEditing(member);
    setForm({
      name: member.name || '', email: member.email || '', phone: member.phone || '',
      password: '', role: member.role || '',
      branch: member.branch?._id || member.branch || '',
      department: member.department?._id || member.department || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(INITIAL_FORM); setFormError(''); };

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.email.trim()) { setFormError('Name and email are required.'); return; }
    if (!editing && !form.password) { setFormError('Password is required for new staff members.'); return; }
    if (!editing && !form.role) { setFormError('Role is required.'); return; }

    try {
      setSaving(true);
      if (editing) {
        await updateStaffMember(editing._id || editing.id, {
          name: form.name, email: form.email, phone: form.phone,
          branch: form.branch || undefined, department: form.department || undefined,
        });
      } else {
        await createStaffMember({
          name: form.name, email: form.email, phone: form.phone, password: form.password,
          role: form.role, branch: form.branch || undefined, department: form.department || undefined,
        });
      }
      closeModal();
      fetchStaff();
    } catch (err) {
      setFormError(err.message || 'Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try {
      setDeactivateLoading(true);
      await deleteStaffMember(deactivating._id || deactivating.id);
      setConfirmOpen(false);
      setDeactivating(null);
      fetchStaff();
    } catch (err) {
      setError(err.message || 'Failed to deactivate staff member');
      setConfirmOpen(false);
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleChangeConfirm) return;
    try {
      setRoleChangeLoading(true);
      await changeStaffRole(roleChangeConfirm.member._id || roleChangeConfirm.member.id, roleChangeConfirm.newRole);
      setRoleChangeConfirm(null);
      fetchStaff();
    } catch (err) {
      setError(err.message || 'Failed to change role');
      setRoleChangeConfirm(null);
    } finally {
      setRoleChangeLoading(false);
    }
  };

  const groupPermissions = (permissions) => {
    const groups = {};
    for (const p of permissions) {
      const [mod] = p.split(':');
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(p);
    }
    return groups;
  };

  // ─── Table columns ──────────────────────────
  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
            {(row.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email', label: 'Email', sortable: true,
      render: (row) => (
        <span className="text-xs text-neutral-600 flex items-center gap-1.5">
          <Mail className="h-3 w-3 shrink-0" /> {row.email}
        </span>
      ),
    },
    {
      key: 'role', label: 'Role', sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize bg-primary-50 text-primary-600">
          <Shield className="h-3 w-3" /> {(row.role || 'N/A').replace(/_/g, ' ')}
          {rolePermMap[row.role]?.count != null && (
            <span className="text-[10px] text-primary-400 ml-0.5">({rolePermMap[row.role].count})</span>
          )}
        </span>
      ),
    },
    {
      key: 'branch', label: 'Branch',
      render: (row) => <span className="text-xs text-neutral-600">{row.branch?.name || row.branchName || '--'}</span>,
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (row) => {
        const active = row.status === 'active' || row.isActive !== false;
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
            active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={(e) => { e.stopPropagation(); setViewItem(row); setViewOpen(true); }}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View details">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit">
            <Edit3 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeactivating(row); setConfirmOpen(true); }}
            className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Deactivate">
            <UserX className="h-4 w-4" />
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Staff Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage non-doctor staff members across your clinic</p>
        </div>
        <Can permission="user:create">
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkOpen(true)} className={`${btnGhost} flex items-center gap-2`}>
              <Upload className="h-4 w-4" /> Bulk Import
            </button>
            <button onClick={openAdd} className={`${btnPrimary} flex items-center gap-2`}>
              <Plus className="h-4 w-4" /> Add Staff
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
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Roles</option>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
        ) : staff.length === 0 ? (
          <EmptyState icon={Users} title="No staff members found"
            message={search || roleFilter ? 'Try adjusting your filters' : 'Add your first staff member to get started'} />
        ) : (
          <>
            <DataTable columns={columns} data={staff} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Add / Edit Drawer ───────────────────────── */}
      <Drawer open={modalOpen} onClose={closeModal} title={editing ? 'Edit Staff Member' : 'Add Staff Member'}>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-100">{formError}</div>
          )}

          <div>
            <label className={labelCls}>Full Name *</label>
            <input type="text" value={form.name} onChange={handleChange('name')} className={inputCls} placeholder="John Doe" required />
          </div>
          <div>
            <label className={labelCls}>Email *</label>
            <input type="email" value={form.email} onChange={handleChange('email')} className={inputCls} placeholder="john@clinic.com" required />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.phone} onChange={handleChange('phone')} className={inputCls} placeholder="+91 98765 43210" />
          </div>
          {!editing && (
            <div>
              <label className={labelCls}>Password *</label>
              <input type="password" value={form.password} onChange={handleChange('password')} className={inputCls} placeholder="Min. 8 characters" required />
            </div>
          )}
          <div>
            <label className={labelCls}>Role {!editing ? '*' : ''}</label>
            <select value={form.role}
              onChange={(e) => {
                const newRole = e.target.value;
                if (editing && newRole !== editing.role && newRole) {
                  setRoleChangeConfirm({ member: editing, newRole });
                } else {
                  setForm((f) => ({ ...f, role: newRole }));
                }
              }}
              className={inputCls} required={!editing}>
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}{rolePermMap[r.value] ? ` (${rolePermMap[r.value].count} permissions)` : ''}
                </option>
              ))}
            </select>
            {editing && <p className="text-[11px] text-neutral-400 mt-1">Changing role will log the user out.</p>}
          </div>
          <div>
            <label className={labelCls}>Branch</label>
            <select value={form.branch} onChange={handleChange('branch')} className={inputCls}>
              <option value="">Select branch...</option>
              {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Department</label>
            <select value={form.department} onChange={handleChange('department')} className={inputCls}>
              <option value="">Select department...</option>
              {departments.map((d) => <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>)}
            </select>
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
      <Drawer open={viewOpen} onClose={() => { setViewOpen(false); setViewItem(null); }} title="Staff Member Details" wide>
        {viewItem && (() => {
          const active = viewItem.status === 'active' || viewItem.isActive !== false;
          const perms = rolePermMap[viewItem.role]?.permissions || [];
          return (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-lg font-bold">
                  {(viewItem.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-neutral-900 font-display">{viewItem.name}</p>
                  <p className="text-xs text-neutral-400 mt-0.5 capitalize">{(viewItem.role || '').replace(/_/g, ' ')}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                  active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {viewItem.email || '--'}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Phone</p>
                  <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {viewItem.phone || '--'}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Branch</p>
                  <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {viewItem.branch?.name || viewItem.branchName || '--'}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Department</p>
                  <p className="text-sm text-neutral-600 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> {viewItem.department?.name || viewItem.departmentName || '--'}
                  </p>
                </div>
              </div>

              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Role</p>
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize bg-primary-50 text-primary-600">
                  <Shield className="h-3 w-3" /> {(viewItem.role || 'N/A').replace(/_/g, ' ')}
                </span>
              </div>

              {perms.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Permissions ({perms.length})</p>
                  <div className="space-y-2">
                    {Object.entries(groupPermissions(perms)).map(([mod, modPerms]) => (
                      <div key={mod} className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">{mod}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {modPerms.map((p) => (
                            <span key={p} className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-600">{p.split(':')[1]}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
                <button onClick={() => { setViewOpen(false); openEdit(viewItem); }} className={btnGhost}>Edit</button>
                <button onClick={() => { setViewOpen(false); setViewItem(null); }} className={btnGhost}>Close</button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Deactivate Confirm ──────────────────────── */}
      <ConfirmDialog
        open={confirmOpen} title="Deactivate Staff Member"
        message={`Are you sure you want to deactivate ${deactivating?.name || 'this staff member'}? They will lose access to the clinic portal.`}
        onConfirm={handleDeactivate}
        onCancel={() => { setConfirmOpen(false); setDeactivating(null); }}
        danger loading={deactivateLoading}
      />

      {/* ── Role Change Confirm ─────────────────────── */}
      <ConfirmDialog
        open={!!roleChangeConfirm} title="Change Staff Role"
        message={roleChangeConfirm ? `Change ${roleChangeConfirm.member.name}'s role from "${(roleChangeConfirm.member.role || '').replace(/_/g, ' ')}" to "${(roleChangeConfirm.newRole || '').replace(/_/g, ' ')}"? They will be logged out and must sign in again.` : ''}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleChangeConfirm(null)}
        danger loading={roleChangeLoading}
      />

      {/* ── Bulk Upload ────────────────────────────── */}
      <BulkUploadModal
        open={bulkOpen} onClose={() => setBulkOpen(false)} entityName="Staff"
        columns={[
          { key: 'name', label: 'Name', required: true, example: 'Ravi Kumar' },
          { key: 'email', label: 'Email', required: true, example: 'ravi@clinic.com' },
          { key: 'phone', label: 'Phone', example: '+91 9876543210' },
          { key: 'password', label: 'Password', required: true, example: 'Staff@123' },
          { key: 'role', label: 'Role', required: true, example: 'receptionist' },
          { key: 'branchCode', label: 'Branch Code', example: 'MAIN' },
        ]}
        onImport={bulkImportStaff} onRefresh={fetchStaff}
      />
    </div>
  );
}
