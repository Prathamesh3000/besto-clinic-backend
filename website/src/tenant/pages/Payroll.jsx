import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet, Users, Plus, Edit2, Trash2, Check, CreditCard, Calendar,
  DollarSign, FileText, CircleDollarSign, Banknote, Search,
} from 'lucide-react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert,
  TabBar, ConfirmDialog,
} from '../../platform/components/shared';
import {
  listSalaryStructures, createSalaryStructure, updateSalaryStructure,
  listPayslips, generatePayslips, approvePayslip, markPayslipPaid,
  listStaff, listDoctors,
} from '../api';
import Can from '../components/Can';

/* ─── Design tokens ─────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ─── Status helpers ────────────────────────────── */
const PAYSLIP_STATUS_STYLES = {
  draft:    { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  approved: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  paid:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

function PayslipStatusBadge({ status }) {
  const s = PAYSLIP_STATUS_STYLES[status] || PAYSLIP_STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status || 'N/A'}
    </span>
  );
}

const EMPTY_COMPONENT = { name: '', amount: 0, isFixed: true };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash', 'upi', 'other'];

/* ─── Page-size selector ────────────────────────── */
function PageSizeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={selectCls}>
      {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
    </select>
  );
}

/* ─── Allowance / Deduction rows (must be outside parent to keep stable identity) ── */
function ComponentRows({ field, label, items, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={labelCls}>{label}</label>
        <button type="button" onClick={() => onAdd(field)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
      </div>
      <div className="space-y-2">
        {items.map((comp, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-neutral-50 rounded-xl p-2.5 border border-neutral-200">
            <div className="flex-1 min-w-0"><input placeholder="Name (e.g. HRA, PF)" value={comp.name} onChange={(e) => onUpdate(field, idx, 'name', e.target.value)} className={inputCls} /></div>
            <div className="w-28 shrink-0"><input type="number" min="0" step="0.01" placeholder="Amount" value={comp.amount} onChange={(e) => onUpdate(field, idx, 'amount', e.target.value)} className={inputCls} /></div>
            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
              <input type="checkbox" checked={comp.isFixed} onChange={(e) => onUpdate(field, idx, 'isFixed', e.target.checked)} className="rounded border-neutral-300 text-primary-600 focus:ring-primary-100" />
              <span className="text-[11px] text-neutral-500">Fixed</span>
            </label>
            {items.length > 1 && <button type="button" onClick={() => onRemove(field, idx)} className="p-1 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ Salary Structures Tab ════════════════════════ */
function SalaryStructuresTab() {
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [employees, setEmployees] = useState([]);

  const emptyForm = { user: '', baseSalary: '', currency: 'INR', effectiveFrom: '', allowances: [{ ...EMPTY_COMPONENT }], deductions: [{ ...EMPTY_COMPONENT }] };
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchStructures = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listSalaryStructures({ page, limit, search: debouncedSearch || undefined });
      setStructures(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, debouncedSearch]);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  useEffect(() => {
    Promise.all([
      listStaff({ limit: 200 }).catch(() => ({ data: [] })),
      listDoctors({ limit: 200 }).catch(() => ({ data: [] })),
    ]).then(([staffRes, docRes]) => {
      const staff = (staffRes.data || []).map((s) => ({ ...s, _type: 'Staff' }));
      const docs = (docRes.data || []).map((d) => ({ ...d, _type: 'Doctor' }));
      setEmployees([...staff, ...docs]);
    });
  }, []);

  const addComponent = (field) => setForm((f) => ({ ...f, [field]: [...f[field], { ...EMPTY_COMPONENT }] }));
  const removeComponent = (field, idx) => setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  const updateComponent = (field, idx, key, value) => setForm((f) => ({ ...f, [field]: f[field].map((c, i) => (i === idx ? { ...c, [key]: value } : c)) }));

  const openCreate = () => { setEditTarget(null); setForm({ ...emptyForm, allowances: [{ ...EMPTY_COMPONENT }], deductions: [{ ...EMPTY_COMPONENT }] }); setShowForm(true); };

  const openEdit = (row) => {
    setEditTarget(row);
    setForm({
      user: row.user?._id || row.user || '', baseSalary: row.baseSalary ?? '', currency: row.currency || 'INR',
      effectiveFrom: row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : '',
      allowances: row.allowances?.length ? row.allowances.map((a) => ({ name: a.name, amount: a.amount, isFixed: a.isFixed ?? true })) : [{ ...EMPTY_COMPONENT }],
      deductions: row.deductions?.length ? row.deductions.map((d) => ({ name: d.name, amount: d.amount, isFixed: d.isFixed ?? true })) : [{ ...EMPTY_COMPONENT }],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        user: form.user, baseSalary: Number(form.baseSalary), currency: form.currency, effectiveFrom: form.effectiveFrom,
        allowances: form.allowances.filter((a) => a.name.trim()).map((a) => ({ name: a.name, amount: Number(a.amount), isFixed: a.isFixed })),
        deductions: form.deductions.filter((d) => d.name.trim()).map((d) => ({ name: d.name, amount: Number(d.amount), isFixed: d.isFixed })),
      };
      if (editTarget) await updateSalaryStructure(editTarget._id || editTarget.id, payload);
      else await createSalaryStructure(payload);
      setShowForm(false);
      fetchStructures();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await updateSalaryStructure(deleteTarget._id || deleteTarget.id, { isActive: false }); setDeleteTarget(null); fetchStructures(); }
    catch (err) { setError(err.message); }
    finally { setDeleting(false); }
  };

  const calcTotal = (items) => (items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const columns = [
    {
      key: 'employee', label: 'Employee',
      render: (row) => {
        const u = row.user || {};
        return (<div><p className="font-semibold text-neutral-900 font-display">{u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A'}</p>{u.role && <p className="text-[11px] text-neutral-400 capitalize">{u.role.replace(/_/g, ' ')}</p>}</div>);
      },
    },
    { key: 'baseSalary', label: 'Base Salary', render: (row) => <span className="font-semibold text-neutral-900">{row.currency || 'INR'} {(row.baseSalary ?? 0).toLocaleString('en-IN')}</span> },
    { key: 'allowancesTotal', label: 'Allowances', render: (row) => <span className="text-emerald-700 font-medium">+{calcTotal(row.allowances).toLocaleString('en-IN')}</span> },
    { key: 'deductionsTotal', label: 'Deductions', render: (row) => <span className="text-red-600 font-medium">-{calcTotal(row.deductions).toLocaleString('en-IN')}</span> },
    {
      key: 'net', label: 'Net',
      render: (row) => {
        const net = (row.baseSalary || 0) + calcTotal(row.allowances) - calcTotal(row.deductions);
        return <span className="font-bold text-neutral-900 font-display">{(row.currency || 'INR')} {net.toLocaleString('en-IN')}</span>;
      },
    },
    { key: 'effectiveFrom', label: 'Effective From', render: (row) => <span className="text-neutral-500 text-xs">{row.effectiveFrom ? new Date(row.effectiveFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span> },
    {
      key: 'actions', label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="p-1.5 rounded-lg hover:bg-primary-50 text-neutral-400 hover:text-primary-600 transition" title="Edit"><Edit2 className="h-4 w-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input placeholder="Search structures..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${inputCls} pl-9 w-full sm:w-56`} />
            </div>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
            <span className="text-sm text-neutral-500">{total} structure{total !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={openCreate} className={`${btnPrimary} flex items-center gap-2`}><Plus className="h-4 w-4" /> Add Structure</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : structures.length === 0 ? (
          <EmptyState icon={Wallet} title="No salary structures" message="Add your first salary structure to get started" />
        ) : (
          <>
            <DataTable columns={columns} data={structures} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Edit Salary Structure' : 'Add Salary Structure'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className={labelCls}>Employee</label>
            <select value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} required disabled={!!editTarget} className={`${inputCls} ${editTarget ? 'bg-neutral-50 cursor-not-allowed' : ''}`}>
              <option value="">Select an employee</option>
              {employees.map((emp) => <option key={emp._id || emp.id} value={emp._id || emp.id}>{emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()} ({emp._type})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className={labelCls}>Base Salary</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} required className={inputCls} /></div>
            <div><label className={labelCls}>Currency</label><select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className={inputCls}><option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
            <div><label className={labelCls}>Effective From</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required className={inputCls} /></div>
          </div>
          <ComponentRows field="allowances" label="Allowances" items={form.allowances} onAdd={addComponent} onUpdate={updateComponent} onRemove={removeComponent} />
          <ComponentRows field="deductions" label="Deductions" items={form.deductions} onAdd={addComponent} onUpdate={updateComponent} onRemove={removeComponent} />
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Estimated Net Salary</span>
              <span className="font-bold text-neutral-900 font-display text-lg">{form.currency} {((Number(form.baseSalary) || 0) + form.allowances.reduce((s, a) => s + (Number(a.amount) || 0), 0) - form.deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)).toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200"><button type="button" onClick={() => setShowForm(false)} className={btnGhost}>Cancel</button><button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : editTarget ? 'Update Structure' : 'Add Structure'}</button></div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete Salary Structure" message={`Are you sure you want to deactivate the salary structure for ${deleteTarget?.user?.name || 'this employee'}?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} danger loading={deleting} />
    </div>
  );
}

/* ═══ Payslips Tab ═════════════════════════════════ */
function PayslipsTab() {
  const currentDate = new Date();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);

  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()));
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [showGenerate, setShowGenerate] = useState(false);
  const [genMonth, setGenMonth] = useState(String(currentDate.getMonth() + 1));
  const [genYear, setGenYear] = useState(String(currentDate.getFullYear()));
  const [generating, setGenerating] = useState(false);

  const [payTarget, setPayTarget] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paying, setPaying] = useState(false);
  const [approving, setApproving] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listPayslips({ page, limit, month: filterMonth || undefined, year: filterYear || undefined, status: filterStatus || undefined, search: debouncedSearch || undefined });
      setPayslips(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, filterMonth, filterYear, filterStatus, debouncedSearch]);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      await generatePayslips({ month: Number(genMonth), year: Number(genYear) });
      setShowGenerate(false);
      setFilterMonth(genMonth);
      setFilterYear(genYear);
      setFilterStatus('');
      setPage(1);
      fetchPayslips();
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  const handleApprove = async (slip) => {
    setApproving(slip._id || slip.id);
    try { await approvePayslip(slip._id || slip.id); fetchPayslips(); }
    catch (err) { setError(err.message); }
    finally { setApproving(null); }
  };

  const handleMarkPaid = async () => {
    if (!payTarget) return;
    setPaying(true);
    try { await markPayslipPaid(payTarget._id || payTarget.id, { paymentMethod }); setPayTarget(null); setPaymentMethod('bank_transfer'); fetchPayslips(); }
    catch (err) { setError(err.message); }
    finally { setPaying(false); }
  };

  const yearOptions = [];
  for (let y = currentDate.getFullYear(); y >= currentDate.getFullYear() - 5; y--) yearOptions.push(y);

  /* Stats derived from data */
  const draftCount = payslips.filter((p) => p.status === 'draft').length;
  const approvedCount = payslips.filter((p) => p.status === 'approved').length;
  const paidCount = payslips.filter((p) => p.status === 'paid').length;
  const totalNet = payslips.reduce((s, p) => s + (p.netSalary ?? p.netPay ?? 0), 0);

  const STAT_CFG = [
    { title: 'Total Payslips', value: total, icon: FileText },
    { title: 'Draft', value: draftCount, icon: CircleDollarSign },
    { title: 'Approved', value: approvedCount, icon: Check },
    { title: 'Paid', value: paidCount, icon: Banknote },
  ];
  const PAL = [
    { icon: 'bg-primary-100 text-primary-600', value: 'text-primary-700' },
    { icon: 'bg-neutral-200 text-neutral-600', value: 'text-neutral-700' },
    { icon: 'bg-amber-100 text-amber-600', value: 'text-amber-700' },
    { icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
  ];

  const columns = [
    {
      key: 'employee', label: 'Employee',
      render: (row) => {
        const u = row.user || row.employee || {};
        return (<div><p className="font-semibold text-neutral-900 font-display">{u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A'}</p>{u.role && <p className="text-[11px] text-neutral-400 capitalize">{u.role.replace(/_/g, ' ')}</p>}</div>);
      },
    },
    { key: 'period', label: 'Month / Year', render: (row) => <span className="text-neutral-600 text-sm">{MONTHS[(row.month || 1) - 1]} {row.year}</span> },
    { key: 'gross', label: 'Gross', render: (row) => <span className="font-medium text-neutral-900">{(row.grossSalary ?? row.gross ?? 0).toLocaleString('en-IN')}</span> },
    { key: 'deductions', label: 'Deductions', render: (row) => <span className="text-red-600 font-medium">-{(row.totalDeductions ?? 0).toLocaleString('en-IN')}</span> },
    { key: 'netPay', label: 'Net Pay', render: (row) => <span className="font-bold text-neutral-900 font-display">{(row.currency || 'INR')} {(row.netSalary ?? row.netPay ?? 0).toLocaleString('en-IN')}</span> },
    { key: 'status', label: 'Status', render: (row) => <PayslipStatusBadge status={row.status} /> },
    {
      key: 'actions', label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'draft' && (
            <button onClick={(e) => { e.stopPropagation(); handleApprove(row); }} disabled={approving === (row._id || row.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60 transition disabled:opacity-50" title="Approve">
              <Check className="h-3.5 w-3.5" />{approving === (row._id || row.id) ? 'Approving...' : 'Approve'}
            </button>
          )}
          {row.status === 'approved' && (
            <button onClick={(e) => { e.stopPropagation(); setPayTarget(row); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 transition" title="Mark Paid">
              <Banknote className="h-3.5 w-3.5" /> Mark Paid
            </button>
          )}
          {row.status === 'paid' && <span className="text-[11px] text-neutral-400 italic">Completed</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CFG.map((cfg, i) => {
          const p = PAL[i];
          const Icon = cfg.icon;
          return (
            <div key={cfg.title} className={`${cardCls} p-5`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${50 + i * 50}ms` }}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.icon}`}><Icon className="h-6 w-6" /></div>
                <div>
                  <p className={`text-[28px] font-bold leading-none ${p.value}`}>{cfg.value}</p>
                  <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '250ms' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input placeholder="Search payslips..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${inputCls} pl-9 w-full sm:w-48`} />
            </div>
            <select value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Months</option>
              {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </select>
            <select value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setPage(1); }} className={selectCls}>
              {yearOptions.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
          </div>
          <Can permission="payroll:manage">
            <button onClick={() => setShowGenerate(true)} className={`${btnPrimary} flex items-center gap-2`}><FileText className="h-4 w-4" /> Generate Payslips</button>
          </Can>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '300ms' }}>
        {loading ? <Spinner /> : payslips.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No payslips found" message="Generate payslips for a month to get started" />
        ) : (
          <>
            <DataTable columns={columns} data={payslips} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      {/* Generate Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Payslips">
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-sm text-neutral-500">Generate payslips for all active salary structures for the selected month and year.</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Month</label><select value={genMonth} onChange={(e) => setGenMonth(e.target.value)} required className={inputCls}>{MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}</select></div>
            <div><label className={labelCls}>Year</label><select value={genYear} onChange={(e) => setGenYear(e.target.value)} required className={inputCls}>{yearOptions.map((y) => <option key={y} value={String(y)}>{y}</option>)}</select></div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={() => setShowGenerate(false)} className={btnGhost}>Cancel</button><button type="submit" disabled={generating} className={btnPrimary}>{generating ? 'Generating...' : 'Generate'}</button></div>
        </form>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Mark Payslip as Paid">
        <div className="space-y-4">
          {payTarget && (
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
              <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Employee</span><span className="font-semibold text-neutral-900 font-display">{payTarget.user?.name || payTarget.employee?.name || 'N/A'}</span></div>
              <div className="flex items-center justify-between text-sm mt-2"><span className="text-neutral-500">Net Pay</span><span className="font-bold text-neutral-900 font-display">{payTarget.currency || 'INR'} {(payTarget.netSalary ?? payTarget.netPay ?? 0).toLocaleString('en-IN')}</span></div>
            </div>
          )}
          <div><label className={labelCls}>Payment Method</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select></div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button onClick={() => setPayTarget(null)} className={btnGhost}>Cancel</button><button onClick={handleMarkPaid} disabled={paying} className={btnPrimary}>{paying ? 'Processing...' : 'Confirm Payment'}</button></div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══ Main Payroll Page ════════════════════════════ */
const TABS = [
  { key: 'structures', label: 'Salary Structures' },
  { key: 'payslips', label: 'Payslips' },
];

export default function Payroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'structures');

  const handleTabChange = (tab) => { setActiveTab(tab); setSearchParams({ tab }); };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Payroll</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage salary structures and payslips</p>
      </div>
      <TabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />
      {activeTab === 'structures' && <SalaryStructuresTab />}
      {activeTab === 'payslips' && <PayslipsTab />}
    </div>
  );
}
