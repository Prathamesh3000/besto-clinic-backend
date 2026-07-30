import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet, Plus, Edit2, Check, Banknote, FileText,
  CircleDollarSign, Search, Trash2,
} from 'lucide-react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, TabBar,
} from '../../platform/components/shared';
import {
  listSalaryStructures, createSalaryStructure, updateSalaryStructure,
  listPayslips, generatePayslips, approvePayslip, markPayslipPaid,
  listStaff,
} from '../api';
import { initSocket, getSocket } from '../../lib/socket';

/* ─── Shared styles ──────────────────────────────── */
const inputCls = 'w-full px-3 py-2 border border-neutral-300/60 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-900/30 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition';
const labelCls = 'block text-xs font-medium text-neutral-900/60 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'px-4 py-2 text-sm font-medium text-neutral-900/60 bg-neutral-200/80 rounded-xl hover:bg-neutral-200 transition';

/* ─── Constants ──────────────────────────────────── */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash', 'upi', 'other'];

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

/* ─── Status helpers ─────────────────────────────── */
const PAYSLIP_STATUS_STYLES = {
  draft:    { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  approved: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
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

const EMPTY_COMPONENT = { name: '', amount: 0 };

/* ─── Allowance / Deduction rows (must be outside parent to keep stable identity) ── */
function ComponentRows({ field, label, items, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={labelCls}>{label}</label>
        <button type="button" onClick={() => onAdd(field)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {items.map((comp, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-neutral-50/50 rounded-xl p-2.5 border border-neutral-300/40">
            <div className="flex-1 min-w-0">
              <input
                placeholder="Name (e.g. HRA, PF)"
                value={comp.name}
                onChange={(e) => onUpdate(field, idx, 'name', e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="w-28 shrink-0">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={comp.amount}
                onChange={(e) => onUpdate(field, idx, 'amount', e.target.value)}
                className={inputCls}
              />
            </div>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(field, idx)}
                className="p-1 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-600 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ─── SALARY STRUCTURES TAB ────────────────────────
   ═══════════════════════════════════════════════════ */
function SalaryStructuresTab() {
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const limit = 15;

  const emptyForm = {
    user: '',
    baseSalary: '',
    effectiveFrom: '',
    allowances: [{ ...EMPTY_COMPONENT }],
    deductions: [{ ...EMPTY_COMPONENT }],
  };

  const [form, setForm] = useState({ ...emptyForm });

  const fetchStructures = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (searchTerm) params.search = searchTerm;
      const res = await listSalaryStructures(params);
      setStructures(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  useEffect(() => {
    listStaff({ limit: 200 }).then((res) => {
      setEmployees(res.data || []);
    }).catch(() => {});
  }, []);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const refresh = () => fetchStructures();
    sock.on('payroll:update', refresh);
    return () => { sock.off('payroll:update', refresh); };
  }, [fetchStructures]);

  // Dynamic array helpers
  const addComponent = (field) =>
    setForm((f) => ({ ...f, [field]: [...f[field], { ...EMPTY_COMPONENT }] }));
  const removeComponent = (field, idx) =>
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  const updateComponent = (field, idx, key, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
    }));

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm, allowances: [{ ...EMPTY_COMPONENT }], deductions: [{ ...EMPTY_COMPONENT }] });
    setEmployeeSearch('');
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditTarget(row);
    setForm({
      user: row.user?._id || row.user || '',
      baseSalary: row.baseSalary ?? '',
      effectiveFrom: row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : '',
      allowances: row.allowances?.length
        ? row.allowances.map((a) => ({ name: a.name, amount: a.amount }))
        : [{ ...EMPTY_COMPONENT }],
      deductions: row.deductions?.length
        ? row.deductions.map((d) => ({ name: d.name, amount: d.amount }))
        : [{ ...EMPTY_COMPONENT }],
    });
    setEmployeeSearch('');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        user: form.user,
        baseSalary: Number(form.baseSalary),
        currency: 'INR',
        effectiveFrom: form.effectiveFrom,
        allowances: form.allowances.filter((a) => a.name.trim()).map((a) => ({ name: a.name, amount: Number(a.amount) })),
        deductions: form.deductions.filter((d) => d.name.trim()).map((d) => ({ name: d.name, amount: Number(d.amount) })),
      };
      if (editTarget) {
        await updateSalaryStructure(editTarget._id || editTarget.id, payload);
      } else {
        await createSalaryStructure(payload);
      }
      setShowForm(false);
      fetchStructures();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const calcTotal = (items) => (items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // Filter employees by search
  const filteredEmployees = employeeSearch
    ? employees.filter((emp) =>
        (emp.name || '').toLowerCase().includes(employeeSearch.toLowerCase())
      )
    : employees;

  const columns = [
    {
      key: 'employee',
      label: 'Employee',
      render: (row) => {
        const u = row.user || {};
        return (
          <div>
            <p className="font-semibold text-neutral-900 font-display">{u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A'}</p>
            {u.role && <p className="text-[11px] text-neutral-900/40 capitalize">{u.role.replace(/_/g, ' ')}</p>}
          </div>
        );
      },
    },
    {
      key: 'baseSalary',
      label: 'Base Salary',
      render: (row) => (
        <span className="font-semibold text-neutral-900">
          {formatCurrency(row.baseSalary)}
        </span>
      ),
    },
    {
      key: 'allowancesTotal',
      label: 'Allowances',
      render: (row) => (
        <span className="text-emerald-700 font-medium">
          +{formatCurrency(calcTotal(row.allowances))}
        </span>
      ),
    },
    {
      key: 'deductionsTotal',
      label: 'Deductions',
      render: (row) => (
        <span className="text-red-600 font-medium">
          -{formatCurrency(calcTotal(row.deductions))}
        </span>
      ),
    },
    {
      key: 'net',
      label: 'Net',
      render: (row) => {
        const net = (row.baseSalary || 0) + calcTotal(row.allowances) - calcTotal(row.deductions);
        return (
          <span className="font-bold text-neutral-900 font-display">
            {formatCurrency(net)}
          </span>
        );
      },
    },
    {
      key: 'effectiveFrom',
      label: 'Effective From',
      render: (row) => (
        <span className="text-neutral-900/50 text-xs">
          {row.effectiveFrom
            ? new Date(row.effectiveFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'N/A'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(row); }}
          className="p-1.5 rounded-lg hover:bg-primary-50 text-neutral-900/40 hover:text-primary-600 transition"
          title="Edit"
        >
          <Edit2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search structures..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-900/30 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 transition"
          />
        </div>
        <button onClick={openCreate} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> New Structure
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Table */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '150ms' }}
      >
        {loading ? (
          <Spinner />
        ) : structures.length === 0 ? (
          <EmptyState icon={Wallet} title="No salary structures" message="Create your first salary structure to get started." />
        ) : (
          <>
            <DataTable columns={columns} data={structures} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Edit Salary Structure' : 'New Salary Structure'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Employee selection */}
          <div>
            <label className={labelCls}>Employee</label>
            <input
              type="text"
              placeholder="Search staff by name..."
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className={`${inputCls} mb-2`}
              disabled={!!editTarget}
            />
            <select
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              required
              disabled={!!editTarget}
              className={`${inputCls} ${editTarget ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
            >
              <option value="">Select an employee</option>
              {filteredEmployees.map((emp) => (
                <option key={emp._id || emp.id} value={emp._id || emp.id}>
                  {emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()} {emp.role ? `(${emp.role.replace(/_/g, ' ')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Base salary + Effective From */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Base Salary (INR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.baseSalary}
                onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Effective From</label>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                required
                className={inputCls}
              />
            </div>
          </div>

          {/* Allowances */}
          <ComponentRows field="allowances" label="Allowances" items={form.allowances} onAdd={addComponent} onUpdate={updateComponent} onRemove={removeComponent} />

          {/* Deductions */}
          <ComponentRows field="deductions" label="Deductions" items={form.deductions} onAdd={addComponent} onUpdate={updateComponent} onRemove={removeComponent} />

          {/* Summary */}
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-300/40">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-900/50">Estimated Net Salary</span>
              <span className="font-bold text-neutral-900 font-display text-lg">
                {formatCurrency(
                  (Number(form.baseSalary) || 0) +
                  form.allowances.reduce((s, a) => s + (Number(a.amount) || 0), 0) -
                  form.deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
                )}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-300/40">
            <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editTarget ? 'Update Structure' : 'Create Structure'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── PAYSLIPS TAB ─────────────────────────────────
   ═══════════════════════════════════════════════════ */
function PayslipsTab() {
  const currentDate = new Date();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()));
  const [filterStatus, setFilterStatus] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genMonth, setGenMonth] = useState(String(currentDate.getMonth() + 1));
  const [genYear, setGenYear] = useState(String(currentDate.getFullYear()));
  const [generating, setGenerating] = useState(false);

  // Pay modal
  const [payTarget, setPayTarget] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paying, setPaying] = useState(false);

  // Approve action
  const [approving, setApproving] = useState(null);

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (filterMonth) params.month = filterMonth;
      if (filterYear) params.year = filterYear;
      if (filterStatus) params.status = filterStatus;
      if (employeeSearch) params.user = employeeSearch;
      const res = await listPayslips(params);
      setPayslips(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterMonth, filterYear, filterStatus, employeeSearch]);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  // ─── WebSocket ────────────────────────────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const refresh = () => fetchPayslips();
    sock.on('payroll:update', refresh);
    return () => { sock.off('payroll:update', refresh); };
  }, [fetchPayslips]);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (slip) => {
    setApproving(slip._id || slip.id);
    try {
      await approvePayslip(slip._id || slip.id);
      fetchPayslips();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!payTarget) return;
    setPaying(true);
    try {
      await markPayslipPaid(payTarget._id || payTarget.id, { paymentMethod });
      setPayTarget(null);
      setPaymentMethod('bank_transfer');
      fetchPayslips();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const yearOptions = [];
  for (let y = currentDate.getFullYear(); y >= currentDate.getFullYear() - 5; y--) {
    yearOptions.push(y);
  }

  const columns = [
    {
      key: 'employee',
      label: 'Employee',
      render: (row) => {
        const u = row.user || row.employee || {};
        return (
          <div>
            <p className="font-semibold text-neutral-900 font-display">{u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A'}</p>
            {u.role && <p className="text-[11px] text-neutral-900/40 capitalize">{u.role.replace(/_/g, ' ')}</p>}
          </div>
        );
      },
    },
    {
      key: 'period',
      label: 'Month / Year',
      render: (row) => (
        <span className="text-neutral-900/70 text-sm">
          {MONTHS[(row.month || 1) - 1]} {row.year}
        </span>
      ),
    },
    {
      key: 'gross',
      label: 'Gross',
      render: (row) => (
        <span className="font-medium text-neutral-900">
          {formatCurrency(row.grossSalary ?? row.gross ?? 0)}
        </span>
      ),
    },
    {
      key: 'deductions',
      label: 'Deductions',
      render: (row) => (
        <span className="text-red-600 font-medium">
          -{formatCurrency(row.totalDeductions ?? 0)}
        </span>
      ),
    },
    {
      key: 'netPay',
      label: 'Net Pay',
      render: (row) => (
        <span className="font-bold text-neutral-900 font-display">
          {formatCurrency(row.netSalary ?? row.netPay ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <PayslipStatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'draft' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleApprove(row); }}
              disabled={approving === (row._id || row.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60 transition disabled:opacity-50"
              title="Approve"
            >
              <Check className="h-3.5 w-3.5" />
              {approving === (row._id || row.id) ? 'Approving...' : 'Approve'}
            </button>
          )}
          {row.status === 'approved' && (
            <button
              onClick={(e) => { e.stopPropagation(); setPayTarget(row); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 transition"
              title="Mark Paid"
            >
              <Banknote className="h-3.5 w-3.5" />
              Mark Paid
            </button>
          )}
          {row.status === 'paid' && (
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
              <Check className="h-3 w-3" />
              Paid{row.paymentMethod ? ` (${row.paymentMethod.replace(/_/g, ' ')})` : ''}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Filters toolbar */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterMonth}
            onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }}
            className={`${inputCls} w-36`}
          >
            <option value="">All Months</option>
            {MONTHS.map((m, i) => (
              <option key={i} value={String(i + 1)}>{m}</option>
            ))}
          </select>

          <select
            value={filterYear}
            onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
            className={`${inputCls} w-28`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className={`${inputCls} w-36`}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30" />
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => { setEmployeeSearch(e.target.value); setPage(1); }}
              placeholder="Employee..."
              className="pl-9 pr-3 py-2 border border-neutral-300/60 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-900/30 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition w-40"
            />
          </div>
        </div>

        <button onClick={() => setShowGenerate(true)} className={`${btnPrimary} flex items-center gap-2`}>
          <FileText className="h-4 w-4" /> Generate Payslips
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Table */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '150ms' }}
      >
        {loading ? (
          <Spinner />
        ) : payslips.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No payslips found" message="Generate payslips for a month to get started." />
        ) : (
          <>
            <DataTable columns={columns} data={payslips} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Generate Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Payslips">
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-sm text-neutral-900/50">
            Generate payslips for all staff with active salary structures for the selected month and year.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Month</label>
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(e.target.value)}
                required
                className={inputCls}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={String(i + 1)}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <select
                value={genYear}
                onChange={(e) => setGenYear(e.target.value)}
                required
                className={inputCls}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/40">
            <button type="button" onClick={() => setShowGenerate(false)} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={generating} className={btnPrimary}>
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Mark Payslip as Paid">
        <div className="space-y-4">
          {payTarget && (
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-300/40">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-900/50">Employee</span>
                <span className="font-semibold text-neutral-900 font-display">
                  {payTarget.user?.name || payTarget.employee?.name || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-neutral-900/50">Net Pay</span>
                <span className="font-bold text-neutral-900 font-display">
                  {formatCurrency(payTarget.netSalary ?? payTarget.netPay ?? 0)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={inputCls}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/40">
            <button onClick={() => setPayTarget(null)} className={btnSecondary}>Cancel</button>
            <button onClick={handleMarkPaid} disabled={paying} className={btnPrimary}>
              {paying ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ─── MAIN PAYROLL PAGE ───────────────────────────
   ═══════════════════════════════════════════════════ */
const TABS = [
  { key: 'structures', label: 'Salary Structures' },
  { key: 'payslips',   label: 'Payslips' },
];

export default function HRPayroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'structures');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Payroll Management</h1>
          <p className="text-sm text-neutral-600 mt-1">Manage salary structures and process payslips</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <TabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />
      </div>

      {/* Tab content */}
      {activeTab === 'structures' && <SalaryStructuresTab />}
      {activeTab === 'payslips' && <PayslipsTab />}
    </div>
  );
}
