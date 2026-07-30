/**
 * ProcedureManagement — Clinic procedure templates.
 *
 * Redesign: Uniform PageHeader, stat cards, toolbar card with
 * search + category FilterPill + page size, DataTable, CRUD modal,
 * availability check modal.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner,
  ErrorAlert, ConfirmDialog,
} from '../../platform/components/shared';
import {
  listProcedures, createProcedure, updateProcedure, checkProcedureAvailability,
  listInventory, listBranches,
} from '../api';
import {
  ClipboardCheck, Plus, Search, Edit3, CheckCircle2, XCircle,
  Clock, Package, Trash2, Layers, IndianRupee,
} from 'lucide-react';

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
  { value: 'surgery', label: 'Surgery' }, { value: 'orthodontic', label: 'Orthodontic' },
  { value: 'prosthetic', label: 'Prosthetic' }, { value: 'endodontic', label: 'Endodontic' },
  { value: 'periodontal', label: 'Periodontal' }, { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'diagnostic', label: 'Diagnostic' }, { value: 'other', label: 'Other' },
];

const STAT_CONFIG = [
  { key: 'total',      title: 'Total Procedures', icon: ClipboardCheck, color: 'primary' },
  { key: 'categories', title: 'Categories',       icon: Layers,         color: 'blue' },
  { key: 'avgCost',    title: 'Avg. Cost',        icon: IndianRupee,    color: 'green' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  blue:    { iconBg: 'bg-blue-50',      iconText: 'text-blue-600' },
  green:   { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
};

const INITIAL_FORM = {
  name: '', code: '', category: '', description: '',
  estimatedDuration: '', estimatedCost: '', requiredMaterials: [],
};

/* ═══════════════════════════════════════════════════ */
export default function ProcedureManagement() {
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [branches, setBranches] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [availOpen, setAvailOpen] = useState(false);
  const [availProc, setAvailProc] = useState(null);
  const [availBranch, setAvailBranch] = useState('');
  const [availResult, setAvailResult] = useState(null);
  const [checking, setChecking] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProcedures = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (categoryFilter) params.category = categoryFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await listProcedures(params);
      setProcedures(res.data || []);
      setTotal(res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load procedures');
    } finally { setLoading(false); }
  }, [page, limit, categoryFilter, debouncedSearch]);

  useEffect(() => { fetchProcedures(); }, [fetchProcedures]);

  useEffect(() => {
    Promise.all([
      listBranches({ limit: 100 }),
      listInventory({ limit: 200 }),
    ]).then(([br, inv]) => {
      setBranches(br.data || br.branches || []);
      setInventoryItems(inv.data || []);
    }).catch(() => {});
  }, []);

  // Stats
  const uniqueCategories = new Set(procedures.map(p => p.category).filter(Boolean));
  const avgCost = procedures.length > 0
    ? `₹${Math.round(procedures.reduce((sum, p) => sum + (p.estimatedCost || 0), 0) / procedures.length).toLocaleString('en-IN')}`
    : '—';
  const statValues = { total, categories: uniqueCategories.size, avgCost };

  // Handlers
  const openAdd = () => { setEditing(null); setForm(INITIAL_FORM); setFormError(''); setModalOpen(true); };
  const openEdit = (proc) => {
    setEditing(proc);
    setForm({
      name: proc.name || '', code: proc.code || '', category: proc.category || '',
      description: proc.description || '', estimatedDuration: proc.estimatedDuration ?? '',
      estimatedCost: proc.estimatedCost ?? '',
      requiredMaterials: (proc.requiredMaterials || []).map((m) => ({
        item: m.item?._id || m.item || '', itemName: m.itemName || '',
        quantity: m.quantity || 1, isOptional: m.isOptional || false,
      })),
    });
    setFormError(''); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(INITIAL_FORM); setFormError(''); };
  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const addMaterial = () => setForm((f) => ({ ...f, requiredMaterials: [...f.requiredMaterials, { item: '', itemName: '', quantity: 1, isOptional: false }] }));
  const removeMaterial = (idx) => setForm((f) => ({ ...f, requiredMaterials: f.requiredMaterials.filter((_, i) => i !== idx) }));
  const updateMaterial = (idx, field, value) => {
    setForm((f) => {
      const mats = [...f.requiredMaterials];
      mats[idx] = { ...mats[idx], [field]: value };
      if (field === 'item') { const found = inventoryItems.find((i) => (i._id || i.id) === value); mats[idx].itemName = found?.name || ''; }
      return { ...f, requiredMaterials: mats };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.code.trim() || !form.category) { setFormError('Name, code, and category are required.'); return; }
    const materials = form.requiredMaterials.filter((m) => m.item).map((m) => ({
      item: m.item, itemName: m.itemName, quantity: parseInt(m.quantity, 10) || 1, isOptional: m.isOptional,
    }));
    if (materials.length === 0) { setFormError('At least one required material must be added.'); return; }
    const payload = {
      name: form.name.trim(), category: form.category,
      description: form.description.trim() || undefined,
      estimatedDuration: form.estimatedDuration ? parseInt(form.estimatedDuration, 10) : undefined,
      estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : undefined,
      requiredMaterials: materials,
    };
    try {
      setSaving(true);
      if (editing) { await updateProcedure(editing._id || editing.id, payload); }
      else { payload.code = form.code.trim(); await createProcedure(payload); }
      closeModal(); fetchProcedures();
    } catch (err) { setFormError(err.message || 'Failed to save procedure'); }
    finally { setSaving(false); }
  };

  const openAvailability = (proc) => { setAvailProc(proc); setAvailBranch(branches[0]?._id || ''); setAvailResult(null); setAvailOpen(true); };
  const handleCheckAvailability = async () => {
    if (!availProc || !availBranch) return;
    try {
      setChecking(true);
      const res = await checkProcedureAvailability(availProc._id || availProc.id, { branch: availBranch });
      setAvailResult(res.data);
    } catch (err) { setError(err.message || 'Failed to check availability'); setAvailOpen(false); }
    finally { setChecking(false); }
  };

  const columns = [
    {
      key: 'name', label: 'Procedure',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-4 w-4 text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
            <p className="text-[11px] text-neutral-400">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category', label: 'Category',
      render: (row) => <span className="inline-flex text-xs px-2.5 py-1 rounded-full font-medium capitalize bg-neutral-100 text-neutral-600">{(row.category || '').replace(/_/g, ' ')}</span>,
    },
    {
      key: 'materials', label: 'Materials',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm text-neutral-600">{row.requiredMaterials?.length || 0}</span>
        </div>
      ),
    },
    {
      key: 'duration', label: 'Duration',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm text-neutral-600">{row.estimatedDuration ? `${row.estimatedDuration} min` : '--'}</span>
        </div>
      ),
    },
    {
      key: 'cost', label: 'Est. Cost',
      render: (row) => <span className="text-sm text-neutral-600">{row.estimatedCost != null ? `₹${row.estimatedCost.toLocaleString('en-IN')}` : '--'}</span>,
    },
    {
      key: 'actions', label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={(e) => { e.stopPropagation(); openAvailability(row); }} className="p-2 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Check Availability">
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit">
            <Edit3 className="h-4 w-4" />
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Procedures</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage procedure templates and check material readiness</p>
        </div>
        <button onClick={openAdd} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> Add Procedure
        </button>
      </div>

      {/* ── Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
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
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setCategoryFilter(''); setPage(1); }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all ${
                  !categoryFilter ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => { setCategoryFilter(c.value); setPage(1); }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                    categoryFilter === c.value ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search procedures..." className={`${inputCls} pl-10`} />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : procedures.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No procedures found" message={categoryFilter || search ? 'Try adjusting your filters' : 'Add your first procedure template'} />
      ) : (
        <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
          <DataTable columns={columns} data={procedures} />
          {totalPages > 1 && (
            <div className="px-4 border-t border-neutral-100">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Modal ───────────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Procedure' : 'Add Procedure'} wide>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Procedure Name *</label><input type="text" value={form.name} onChange={handleChange('name')} className={inputCls} placeholder="Root Canal Treatment" required /></div>
            <div><label className={labelCls}>Code *{editing && <span className="text-neutral-400 ml-1">(read-only)</span>}</label><input type="text" value={form.code} onChange={handleChange('code')} className={inputCls} placeholder="PROC-END-001" required disabled={!!editing} /></div>
            <div><label className={labelCls}>Category *</label><select value={form.category} onChange={handleChange('category')} className={inputCls} required><option value="">Select category...</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label className={labelCls}>Estimated Duration (min)</label><input type="number" min="10" value={form.estimatedDuration} onChange={handleChange('estimatedDuration')} className={inputCls} placeholder="60" /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Estimated Cost (₹)</label><input type="number" min="0" value={form.estimatedCost} onChange={handleChange('estimatedCost')} className={inputCls} placeholder="8000" /></div>
          </div>
          <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={handleChange('description')} className={`${inputCls} resize-none`} rows={2} placeholder="Brief procedure description..." /></div>
          {/* Required Materials */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Required Materials</p>
              <button type="button" onClick={addMaterial} className="text-xs font-medium text-primary-600 hover:text-primary-700 transition">+ Add Material</button>
            </div>
            {form.requiredMaterials.length === 0 && <p className="text-sm text-neutral-400 py-4 text-center">No materials added yet</p>}
            {form.requiredMaterials.map((mat, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <select value={mat.item} onChange={(e) => updateMaterial(idx, 'item', e.target.value)} className={`${inputCls} flex-1`}>
                  <option value="">Select item...</option>
                  {inventoryItems.map((inv) => <option key={inv._id || inv.id} value={inv._id || inv.id}>{inv.name} ({inv.code}) — {inv.currentStock} {inv.unit}</option>)}
                </select>
                <input type="number" min="1" value={mat.quantity} onChange={(e) => updateMaterial(idx, 'quantity', e.target.value)} className={`${inputCls} w-20`} placeholder="Qty" />
                <label className="flex items-center gap-1.5 text-xs text-neutral-500 whitespace-nowrap">
                  <input type="checkbox" checked={mat.isOptional} onChange={(e) => updateMaterial(idx, 'isOptional', e.target.checked)} className="rounded border-neutral-300" /> Optional
                </label>
                <button type="button" onClick={() => removeMaterial(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Availability Check Modal ─────────────────── */}
      <Modal open={availOpen} onClose={() => setAvailOpen(false)} title={`Availability — ${availProc?.name || ''}`}>
        <div className="space-y-4">
          <div><label className={labelCls}>Select Branch</label><select value={availBranch} onChange={(e) => { setAvailBranch(e.target.value); setAvailResult(null); }} className={inputCls}>{branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}</select></div>
          <button onClick={handleCheckAvailability} disabled={checking || !availBranch} className={`w-full ${btnPrimary}`}>
            {checking ? 'Checking...' : 'Check Availability'}
          </button>
          {availResult && (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-4 rounded-xl ${availResult.ready ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                {availResult.ready ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" /> : <XCircle className="h-6 w-6 text-red-600 shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold ${availResult.ready ? 'text-emerald-700' : 'text-red-700'}`}>
                    {availResult.ready ? 'READY — All materials available' : 'NOT READY — Some materials missing'}
                  </p>
                  {!availResult.ready && availResult.missingItems?.length > 0 && <p className="text-xs text-red-600 mt-0.5">{availResult.missingItems.length} item(s) insufficient</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                {availResult.items?.map((m, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl text-sm ${m.sufficient ? 'bg-neutral-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {m.sufficient ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className={`truncate ${m.sufficient ? 'text-neutral-900' : 'text-red-700 font-medium'}`}>
                        {m.itemName}{m.isOptional && <span className="text-neutral-400 ml-1">(optional)</span>}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 shrink-0 ml-3">
                      Need: <strong>{m.required}</strong> | Available: <strong className={m.sufficient ? 'text-emerald-600' : 'text-red-600'}>{m.available}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
