/**
 * InventoryManagement — Clinic inventory management.
 *
 * Redesign: Uniform PageHeader, stat cards, FilterPill tabs,
 * toolbar card with search + category + page size, DataTable,
 * CRUD modal, restock modal, delete confirm.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner,
  ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import {
  listInventory, createInventoryItem, updateInventoryItem,
  deleteInventoryItem, restockInventoryItem, listBranches,
} from '../api';
import {
  Package, Plus, Search, Edit3, Trash2, AlertTriangle,
  ArrowDownCircle, Calendar, Box, ShieldAlert, ShoppingCart,
} from 'lucide-react';
import Can from '../components/Can';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';
import QuickOrderModal from '../components/QuickOrderModal';

/* ── Design tokens ────────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ── Constants ────────────────────────────────────── */
const CATEGORIES = [
  { value: 'braces', label: 'Braces' }, { value: 'implants', label: 'Implants' },
  { value: 'prosthetics', label: 'Prosthetics' }, { value: 'surgical_kits', label: 'Surgical Kits' },
  { value: 'consumables', label: 'Consumables' }, { value: 'instruments', label: 'Instruments' },
  { value: 'orthodontic', label: 'Orthodontic' }, { value: 'endodontic', label: 'Endodontic' },
  { value: 'periodontal', label: 'Periodontal' }, { value: 'imaging', label: 'Imaging' },
  { value: 'sterilization', label: 'Sterilization' }, { value: 'other', label: 'Other' },
];

const TAB_FILTERS = [
  { key: 'all',      label: 'All Items' },
  { key: 'lowStock', label: 'Low Stock' },
  { key: 'expiring', label: 'Expiring Soon' },
];

const STAT_CONFIG = [
  { key: 'total',    title: 'Total Items', icon: Package,      color: 'primary' },
  { key: 'lowStock', title: 'Low Stock',   icon: AlertTriangle, color: 'yellow' },
  { key: 'expiring', title: 'Expiring',    icon: ShieldAlert,   color: 'red' },
  { key: 'value',    title: 'Total Value',  icon: Box,           color: 'blue' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  yellow:  { iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  red:     { iconBg: 'bg-red-50',       iconText: 'text-red-600' },
  blue:    { iconBg: 'bg-blue-50',      iconText: 'text-blue-600' },
};

const INITIAL_FORM = {
  name: '', code: '', category: '', description: '', unit: 'piece',
  currentStock: 0, minimumThreshold: 5, costPerUnit: '', currency: 'INR',
  branch: '', expiryDate: '', supplierName: '', supplierPhone: '',
  supplierEmail: '', supplierLeadTime: '',
};

/* ════════════════════════════════════════════════════
   INVENTORY FORM MODAL (isolated state — no parent re-renders)
   ════════════════════════════════════════════════════ */
function InventoryFormModal({ open, onClose, onSaved, editing, branches }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open && editing) {
      setForm({
        name: editing.name || '', code: editing.code || '', category: editing.category || '',
        description: editing.description || '', unit: editing.unit || 'piece',
        currentStock: editing.currentStock ?? 0, minimumThreshold: editing.minimumThreshold ?? 5,
        costPerUnit: editing.costPerUnit ?? '', currency: editing.currency || 'INR',
        branch: editing.branch?._id || editing.branch || '',
        expiryDate: editing.expiryDate ? editing.expiryDate.slice(0, 10) : '',
        supplierName: editing.supplier?.name || '', supplierPhone: editing.supplier?.contactPhone || '',
        supplierEmail: editing.supplier?.contactEmail || '', supplierLeadTime: editing.supplier?.leadTimeDays ?? '',
      });
    } else if (open) {
      setForm(INITIAL_FORM);
    }
    setFormError('');
  }, [open, editing]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.code.trim() || !form.category) { setFormError('Name, code, and category are required.'); return; }
    if (!form.branch) { setFormError('Branch is required.'); return; }

    const payload = {
      name: form.name.trim(), category: form.category,
      description: form.description.trim() || undefined, unit: form.unit || 'piece',
      minimumThreshold: parseInt(form.minimumThreshold, 10) || 5,
      costPerUnit: form.costPerUnit ? parseFloat(form.costPerUnit) : undefined,
      currency: form.currency || 'INR', branch: form.branch,
      expiryDate: form.expiryDate || undefined,
    };
    if (form.supplierName || form.supplierPhone || form.supplierEmail) {
      payload.supplier = {
        name: form.supplierName || undefined, contactPhone: form.supplierPhone || undefined,
        contactEmail: form.supplierEmail || undefined,
        leadTimeDays: form.supplierLeadTime ? parseInt(form.supplierLeadTime, 10) : undefined,
      };
    }

    try {
      setSaving(true);
      if (editing) {
        await updateInventoryItem(editing._id || editing.id, payload);
      } else {
        payload.code = form.code.trim();
        payload.currentStock = parseInt(form.currentStock, 10) || 0;
        await createInventoryItem(payload);
      }
      onSaved();
    } catch (err) {
      setFormError(err.message || 'Failed to save item');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Item' : 'Add Inventory Item'} wide>
      <form onSubmit={handleSave} className="space-y-4">
        {formError && <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{formError}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Item Name *</label><input type="text" value={form.name} onChange={handleChange('name')} className={inputCls} placeholder="Dental Composite" required /></div>
          <div><label className={labelCls}>Item Code *{editing && <span className="text-neutral-400 ml-1">(read-only)</span>}</label><input type="text" value={form.code} onChange={handleChange('code')} className={inputCls} placeholder="DC-001" required disabled={!!editing} /></div>
          <div><label className={labelCls}>Category *</label><select value={form.category} onChange={handleChange('category')} className={inputCls} required><option value="">Select category...</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div><label className={labelCls}>Branch *</label><select value={form.branch} onChange={handleChange('branch')} className={inputCls} required><option value="">Select branch...</option>{branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}</select></div>
          <div><label className={labelCls}>Unit</label><input type="text" value={form.unit} onChange={handleChange('unit')} className={inputCls} placeholder="piece" /></div>
          {!editing && <div><label className={labelCls}>Initial Stock</label><input type="number" min="0" value={form.currentStock} onChange={handleChange('currentStock')} className={inputCls} /></div>}
          <div><label className={labelCls}>Min Threshold</label><input type="number" min="0" value={form.minimumThreshold} onChange={handleChange('minimumThreshold')} className={inputCls} /></div>
          <div><label className={labelCls}>Cost per Unit</label><input type="number" min="0" step="0.01" value={form.costPerUnit} onChange={handleChange('costPerUnit')} className={inputCls} placeholder="0.00" /></div>
          <div><label className={labelCls}>Currency</label><input type="text" value={form.currency} onChange={handleChange('currency')} className={inputCls} placeholder="INR" /></div>
          <div><label className={labelCls}>Expiry Date</label><input type="date" value={form.expiryDate} onChange={handleChange('expiryDate')} className={inputCls} /></div>
        </div>
        <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={handleChange('description')} className={`${inputCls} resize-none`} rows={2} placeholder="Optional description..." /></div>
        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Supplier Info (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Supplier Name</label><input type="text" value={form.supplierName} onChange={handleChange('supplierName')} className={inputCls} placeholder="Supplier Co." /></div>
            <div><label className={labelCls}>Contact Phone</label><input type="tel" value={form.supplierPhone} onChange={handleChange('supplierPhone')} className={inputCls} placeholder="+91 98765 43210" /></div>
            <div><label className={labelCls}>Contact Email</label><input type="email" value={form.supplierEmail} onChange={handleChange('supplierEmail')} className={inputCls} placeholder="supplier@example.com" /></div>
            <div><label className={labelCls}>Lead Time (days)</label><input type="number" min="0" value={form.supplierLeadTime} onChange={handleChange('supplierLeadTime')} className={inputCls} placeholder="7" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════
   RESTOCK MODAL (isolated state — no parent re-renders)
   ════════════════════════════════════════════════════ */
function RestockModal({ open, onClose, onRestocked, item }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [restocking, setRestocking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setQty(''); setReason(''); setError(''); }
  }, [open]);

  const handleRestock = async (e) => {
    e.preventDefault();
    const quantity = parseInt(qty, 10);
    if (!quantity || quantity < 1) return;
    try {
      setRestocking(true);
      setError('');
      await restockInventoryItem(item._id || item.id, { quantity, reason: reason || undefined });
      onRestocked();
    } catch (err) {
      setError(err.message || 'Failed to restock');
    } finally { setRestocking(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Restock — ${item?.name || ''}`}>
      <form onSubmit={handleRestock} className="space-y-4">
        {error && <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{error}</div>}
        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
          <Package className="h-5 w-5 text-primary-500" />
          <div>
            <p className="text-sm font-medium text-neutral-900">Current Stock: {item?.currentStock ?? 0} {item?.unit}</p>
            <p className="text-xs text-neutral-400">Reserved: {item?.reservedStock ?? 0}</p>
          </div>
        </div>
        <div><label className={labelCls}>Quantity to Add *</label><input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="Enter quantity" required /></div>
        <div><label className={labelCls}>Reason (optional)</label><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Supplier delivery" /></div>
        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={restocking} className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50">
            {restocking ? 'Restocking...' : 'Confirm Restock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════ */
export default function InventoryManagement() {
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState(highlightSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) { setSearch(highlightSearch); setDebouncedSearch(highlightSearch); } }, [highlightSearch]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [tab, setTab] = useState('all');
  const [branches, setBranches] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockItem, setRestockItem] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Quick order modal
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const [quickOrderItem, setQuickOrderItem] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit, sort: sortKey, order: sortDir };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.category = categoryFilter;
      if (tab === 'lowStock') params.lowStock = true;
      if (tab === 'expiring') params.expiring = true;
      const res = await listInventory(params);
      setItems(res.data || []);
      setTotal(res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, categoryFilter, tab, sortKey, sortDir]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => setBranches(res.data || res.branches || [])).catch(() => {});
  }, []);

  // Compute stats from items
  const statValues = {
    total,
    lowStock: items.filter(i => (i.availableStock ?? (i.currentStock - (i.reservedStock || 0))) <= i.minimumThreshold).length,
    expiring: items.filter(i => i.expiryDate && new Date(i.expiryDate) <= new Date(Date.now() + 30 * 86400000)).length,
    value: `₹${items.reduce((sum, i) => sum + ((i.costPerUnit || 0) * (i.currentStock || 0)), 0).toLocaleString('en-IN')}`,
  };

  // Handlers
  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const openRestock = (item) => { setRestockItem(item); setRestockOpen(true); };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      setDeleteLoading(true);
      await deleteInventoryItem(deleting._id || deleting.id);
      setConfirmOpen(false); setDeleting(null); fetchItems();
    } catch (err) { setError(err.message || 'Failed to delete item'); setConfirmOpen(false); }
    finally { setDeleteLoading(false); }
  };

  const columns = [
    {
      key: 'name', label: 'Item', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
            <p className="text-[11px] text-neutral-400">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category', label: 'Category', sortable: true,
      render: (row) => (
        <span className="inline-flex text-xs px-2.5 py-1 rounded-full font-medium capitalize bg-neutral-100 text-neutral-600">
          {(row.category || '').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'stock', label: 'Stock',
      render: (row) => {
        const available = row.availableStock ?? (row.currentStock - (row.reservedStock || 0));
        const isLow = available <= row.minimumThreshold;
        return (
          <div>
            <span className={`text-sm font-semibold ${isLow ? 'text-red-600' : 'text-neutral-900'}`}>{available}</span>
            <span className="text-xs text-neutral-400 ml-1">/ {row.currentStock} {row.unit}</span>
            {isLow && (
              <div className="flex items-center gap-1 mt-0.5">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] text-amber-600 font-medium">Low stock</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'costPerUnit', label: 'Cost/Unit', sortable: true,
      render: (row) => <span className="text-sm text-neutral-600">{row.costPerUnit != null ? `${row.currency || 'INR'} ${row.costPerUnit}` : '--'}</span>,
    },
    {
      key: 'branch', label: 'Branch',
      render: (row) => <span className="text-xs text-neutral-500">{row.branch?.name || '--'}</span>,
    },
    {
      key: 'expiryDate', label: 'Expiry', sortable: true,
      render: (row) => {
        if (!row.expiryDate) return <span className="text-xs text-neutral-400">--</span>;
        const d = new Date(row.expiryDate);
        const isExpiring = d <= new Date(Date.now() + 30 * 86400000);
        return <span className={`text-xs ${isExpiring ? 'text-red-600 font-medium' : 'text-neutral-500'}`}>{d.toLocaleDateString()}</span>;
      },
    },
    {
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <Can permission="inventory:restock">
            <button onClick={(e) => { e.stopPropagation(); openRestock(row); }} className="p-2 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Restock">
              <ArrowDownCircle className="h-4 w-4" />
            </button>
          </Can>
          <Can permission="purchaseOrder:create">
            <button onClick={(e) => { e.stopPropagation(); setQuickOrderItem(row); setQuickOrderOpen(true); }} className="p-2 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition" title="Order from Vendor">
              <ShoppingCart className="h-4 w-4" />
            </button>
          </Can>
          <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit">
            <Edit3 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleting(row); setConfirmOpen(true); }} className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Inventory</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage clinic supplies, instruments & materials</p>
        </div>
        <Can permission="inventory:create">
          <button onClick={openAdd} className={`${btnPrimary} flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </Can>
      </div>

      {/* ── Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {STAT_CONFIG.map((s, i) => {
          const p = PALETTE[s.color] || PALETTE.primary;
          return (
            <div key={s.key} className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: `${50 + i * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                  <s.icon className={`h-6 w-6 ${p.iconText}`} />
                </div>
              </div>
              <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{loading ? '—' : statValues[s.key]}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ──────────────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Tab filters as pills */}
            <div className="flex items-center gap-1.5">
              {TAB_FILTERS.map((t) => {
                const isActive = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setPage(1); }}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." className={`${inputCls} pl-10`} />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory items found"
          message={search || categoryFilter || tab !== 'all' ? 'Try adjusting your filters' : 'Add your first inventory item to get started'}
        />
      ) : (
        <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
          <DataTable columns={columns} data={items} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
          {totalPages > 1 && (
            <div className="px-4 border-t border-neutral-100">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Modal ───────────────────────────── */}
      <InventoryFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={() => { closeModal(); fetchItems(); }}
        editing={editing}
        branches={branches}
      />

      {/* ── Restock Modal ────────────────────────────── */}
      <RestockModal
        open={restockOpen}
        onClose={() => { setRestockOpen(false); setRestockItem(null); }}
        onRestocked={() => { setRestockOpen(false); setRestockItem(null); fetchItems(); }}
        item={restockItem}
      />

      {/* ── Delete Confirm ───────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Inventory Item"
        message={`Are you sure you want to delete "${deleting?.name || 'this item'}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => { setConfirmOpen(false); setDeleting(null); }}
        danger
        loading={deleteLoading}
      />

      {/* ── Quick Order Modal ───────────────────────── */}
      <QuickOrderModal
        open={quickOrderOpen}
        onClose={() => { setQuickOrderOpen(false); setQuickOrderItem(null); }}
        onCreated={() => { setQuickOrderOpen(false); setQuickOrderItem(null); }}
        prefilledItems={quickOrderItem ? [{ inventoryItemId: quickOrderItem._id, itemName: quickOrderItem.name, quantity: Math.max(1, (quickOrderItem.minimumThreshold || 10) - (quickOrderItem.currentStock - (quickOrderItem.reservedStock || 0))) }] : []}
        branchId={quickOrderItem?.branch?._id || quickOrderItem?.branch || ''}
      />
    </div>
  );
}
