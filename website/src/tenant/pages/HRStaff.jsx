import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Filter, Mail, Phone, Building2,
  Edit3, X,
} from 'lucide-react';
import {
  EmptyState, Pagination, Spinner, ErrorAlert, Drawer,
} from '../../platform/components/shared';
import { listStaff, updateStaffMember, listRoles } from '../api';
import { initSocket, getSocket } from '../../lib/socket';

/* ─── Shared styles ──────────────────────────────── */
const inputCls = 'w-full px-3 py-2 border border-neutral-300/60 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-900/30 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition';
const labelCls = 'block text-xs font-medium text-neutral-900/60 mb-1.5';

/* ─── Role config ────────────────────────────────── */

const ROLE_BADGE_COLORS = {
  admin:              'bg-purple-50 text-purple-700',
  doctor:             'bg-blue-50 text-blue-700',
  receptionist:       'bg-emerald-50 text-emerald-700',
  billing_officer:    'bg-amber-50 text-amber-700',
  accountant:         'bg-teal-50 text-teal-700',
  hr_payroll_manager: 'bg-pink-50 text-pink-700',
  it_support:         'bg-indigo-50 text-indigo-700',
  support_staff:      'bg-neutral-100 text-neutral-700',
};

function getRoleBadge(role) {
  return ROLE_BADGE_COLORS[role] || 'bg-neutral-100 text-neutral-700';
}

/* ─── Initials helper ────────────────────────────── */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Skeleton ───────────────────────────────────── */
function StaffGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)]">
          <div className="animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-neutral-100 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-neutral-100 rounded w-28 mb-1.5" />
                <div className="h-3 bg-neutral-100 rounded w-40" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-neutral-100 rounded w-24" />
              <div className="h-3 bg-neutral-100 rounded w-32" />
            </div>
            <div className="h-9 bg-neutral-100 rounded-lg mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function HRStaff() {
  // ─── State ──────────────────────────────────────
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Collect unique branches from staff data
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);

  // ─── Fetch staff ────────────────────────────────
  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await listStaff(params);
      const data = res.data || [];
      setStaff(data);
      setTotal(res.meta?.total ?? res.total ?? 0);

      // Extract unique branches
      const branchSet = new Map();
      data.forEach((s) => {
        const bName = s.branch?.name || s.branchName;
        const bId = s.branch?._id || s.branch;
        if (bName && bId) branchSet.set(bId, bName);
      });
      setBranches(Array.from(branchSet, ([id, name]) => ({ id, name })));
    } catch (err) {
      setError(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  // ─── Fetch roles from Role Master ─────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await listRoles({ excludeGroup: 'clinical', isActive: true, limit: 100 });
        const items = Array.isArray(res.data) ? res.data : res.data?.items || res.items || [];
        if (items.length > 0) {
          setRoles(items.map((r) => ({ value: r.slug, label: r.name })));
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;

    const refresh = () => fetchStaff();
    sock.on('staff:update', refresh);
    return () => { sock.off('staff:update', refresh); };
  }, [fetchStaff]);

  // ─── Edit handlers ──────────────────────────────
  const openEdit = (member) => {
    setEditTarget(member);
    setEditForm({
      name: member.name || '',
      email: member.email || '',
      phone: member.phone || '',
    });
    setFormError('');
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditForm({ name: '', email: '', phone: '' });
    setFormError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }

    try {
      setSaving(true);
      await updateStaffMember(editTarget._id || editTarget.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
      });
      closeEdit();
      fetchStaff();
    } catch (err) {
      setFormError(err.message || 'Failed to update staff member');
    } finally {
      setSaving(false);
    }
  };

  // ─── Filter staff by branch client-side ─────────
  const filteredStaff = branchFilter
    ? staff.filter((s) => {
        const bId = s.branch?._id || s.branch;
        return bId === branchFilter;
      })
    : staff;

  // ─── Render ─────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Staff Directory</h1>
          <span className="inline-flex items-center justify-center min-w-[28px] h-[24px] px-2 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
            {total}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div
        className="flex flex-col sm:flex-row gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-900/30 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30 pointer-events-none" />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="pl-10 pr-8 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 appearance-none cursor-pointer transition min-w-[180px]"
          >
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {branches.length > 0 && (
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30 pointer-events-none" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 appearance-none cursor-pointer transition min-w-[160px]"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Staff Grid */}
      {loading ? (
        <StaffGridSkeleton />
      ) : filteredStaff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff members found"
          message={search || roleFilter || branchFilter ? 'Try adjusting your filters' : 'Staff directory is empty.'}
        />
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '100ms' }}
        >
          {filteredStaff.map((member, index) => {
            const id = member._id || member.id;
            const name = member.name || 'N/A';
            const roleBadge = getRoleBadge(member.role);
            const branchName = member.branch?.name || member.branchName || null;

            return (
              <div
                key={id}
                className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both]"
                style={{ animationDelay: `${120 + index * 30}ms` }}
              >
                {/* Top: Avatar + Name + Email */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {getInitials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{name}</p>
                    <p className="text-xs text-neutral-500 truncate flex items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" /> {member.email || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Role badge */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${roleBadge}`}>
                    {(member.role || 'unknown').replace(/_/g, ' ')}
                  </span>
                  {branchName && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
                      <Building2 className="h-3 w-3" /> {branchName}
                    </span>
                  )}
                </div>

                {/* Phone */}
                {member.phone && (
                  <p className="text-xs text-neutral-500 flex items-center gap-1 mb-4">
                    <Phone className="h-3 w-3 shrink-0" /> {member.phone}
                  </p>
                )}

                {/* Edit button */}
                <button
                  onClick={() => openEdit(member)}
                  className="w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-all duration-200"
                >
                  <Edit3 className="h-4 w-4" /> Edit Profile
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div
          className="bg-white rounded-2xl border border-neutral-200 px-5 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '150ms' }}
        >
          <Pagination page={page} limit={limit} total={total} onChange={setPage} />
        </div>
      )}

      {/* Edit Modal */}
      <Drawer open={!!editTarget} onClose={closeEdit} title="Edit Staff Profile">
        {editTarget && (
          <form onSubmit={handleSave} className="p-6 space-y-4">
            {formError && (
              <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                {formError}
              </div>
            )}

            {/* Name */}
            <div>
              <label className={labelCls}>Full Name *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="Full name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>Email *</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className={inputCls}
                placeholder="Email address"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputCls}
                placeholder="+91 98765 43210"
              />
            </div>

            {/* Role (read-only) */}
            <div>
              <label className={labelCls}>Role</label>
              <div className="px-3 py-2.5 border border-neutral-200 rounded-xl bg-neutral-50 text-sm text-neutral-500 capitalize cursor-not-allowed">
                {(editTarget.role || 'N/A').replace(/_/g, ' ')}
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">Role cannot be changed from here.</p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={closeEdit}
                className="px-4 py-2 text-sm font-medium text-neutral-900/60 bg-neutral-200/80 rounded-xl hover:bg-neutral-200 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-11 px-5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-[var(--shadow-sm)] transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
