import { useState, useEffect, useCallback } from 'react';
import {
  FileText, IndianRupee, Search, Eye, Download, Pencil, Plus, Trash2,
  CheckCircle2, Clock, AlertTriangle, CreditCard,
} from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import {
  listInvoices, getInvoice, createEnhancedInvoice, updateInvoice,
  downloadInvoicePdf, listServiceItems, listPatients, getPatientLedger,
} from '../api';
import { useToast } from '../ToastContext';

/* ─── Shared style classes ────────────────────────── */
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200';
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/* ─── Status styles ──────────────────────────────── */
const STATUS_STYLES = {
  draft:          { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  sent:           { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  paid:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  overdue:        { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled:      { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' },
  partially_paid: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ─── Stat card ──────────────────────────────────── */
function MetricCard({ icon: Icon, label, value, iconBg, iconText, index = 0 }) {
  return (
    <div
      className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both]"
      style={{ animationDelay: `${50 + index * 50}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconText}`} />
        </div>
      </div>
      <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────── */
const EMPTY_LINE = { serviceItem: '', description: '', quantity: 1, unitPrice: 0 };
const patientName = (p) => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
const invBalance = (inv) => inv.balanceDue ?? ((inv.totalAmount ?? inv.amount ?? 0) - (inv.paidAmount ?? 0));

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'partially_paid', label: 'Partially Paid' },
];


/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function AccountantInvoices() {
  const { showToast } = useToast();

  // ─── Invoice list state ────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // ─── Filters ──────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [patientFilter, setPatientFilter] = useState('');

  // ─── Stats ────────────────────────────────────
  const [stats, setStats] = useState({ totalAmount: 0, paidCount: 0, overdueCount: 0, draftCount: 0 });

  // ─── Create/Edit modal ────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ patient: '', lineItems: [{ ...EMPTY_LINE }], notes: '', discount: 0, tax: 0 });
  const [creating, setCreating] = useState(false);

  // ─── Patient + Service items for form ─────────
  const [patients, setPatients] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');

  // ─── View detail modal ────────────────────────
  const [viewTarget, setViewTarget] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [ledger, setLedger] = useState(null);

  // ─── Fetch invoices ───────────────────────────
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (patientFilter.trim()) params.patient = patientFilter.trim();

      const res = await listInvoices(params);
      const items = res.data?.items || res.data || [];
      setInvoices(items);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);

      // Compute stats
      if (items.length > 0) {
        const paidItems = items.filter((i) => i.status === 'paid');
        const overdueItems = items.filter((i) => i.status === 'overdue');
        const draftItems = items.filter((i) => i.status === 'draft');
        setStats({
          totalAmount: items.reduce((sum, i) => sum + (i.totalAmount ?? i.amount ?? 0), 0),
          paidCount: paidItems.length,
          overdueCount: overdueItems.length,
          draftCount: draftItems.length,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, patientFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ─── Load patients + service items on mount ───
  useEffect(() => {
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
    listServiceItems({ limit: 200 }).then((r) => setServiceItems(r.data || [])).catch(() => {});
  }, []);

  // ─── Filter patients for search ───────────────
  const filteredPatients = patientSearch.trim()
    ? patients.filter((p) =>
        patientName(p).toLowerCase().includes(patientSearch.toLowerCase()) ||
        (p.patientId || '').toLowerCase().includes(patientSearch.toLowerCase())
      )
    : patients;

  // ─── Line items helpers ───────────────────────
  const addLine = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, j) => j !== i) }));
  const updateLine = (i, k, v) => setForm((f) => ({
    ...f,
    lineItems: f.lineItems.map((li, j) => j === i ? { ...li, [k]: v } : li),
  }));
  const selectService = (i, id) => {
    const item = serviceItems.find((s) => (s._id || s.id) === id);
    if (item) {
      updateLine(i, 'serviceItem', id);
      updateLine(i, 'description', item.name || item.description || '');
      updateLine(i, 'unitPrice', item.price ?? item.unitPrice ?? 0);
    } else {
      updateLine(i, 'serviceItem', id);
    }
  };

  const subtotal = form.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = subtotal * (Number(form.tax) || 0) / 100;
  const discountAmount = Number(form.discount) || 0;
  const invoiceTotal = subtotal + taxAmount - discountAmount;

  // ─── Open create modal ────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm({ patient: '', lineItems: [{ ...EMPTY_LINE }], notes: '', discount: 0, tax: 0 });
    setPatientSearch('');
    setShowCreateModal(true);
  };

  // ─── Open edit modal (draft/sent only) ────────
  const openEdit = (inv) => {
    setEditTarget(inv);
    setForm({
      patient: inv.patient?._id || inv.patient?.id || inv.patientId || '',
      lineItems: (inv.items || inv.lineItems || []).map((it) => ({
        serviceItem: it.serviceItem || '',
        description: it.description || it.name || '',
        quantity: it.quantity ?? 1,
        unitPrice: it.unitPrice ?? it.price ?? 0,
      })),
      notes: inv.notes || '',
      discount: inv.discount ?? 0,
      tax: inv.tax ?? 0,
    });
    setPatientSearch(inv.patient?.name || inv.patientName || '');
    setShowCreateModal(true);
  };

  // ─── Handle create / update ───────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient) { showToast({ type: 'error', message: 'Please select a patient' }); return; }
    if (form.lineItems.some((li) => !li.description || li.unitPrice <= 0)) {
      showToast({ type: 'error', message: 'All items need a description and price' });
      return;
    }

    setCreating(true);
    try {
      const payload = {
        patient: form.patient,
        items: form.lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          ...(li.serviceItem ? { serviceItem: li.serviceItem } : {}),
        })),
        notes: form.notes || undefined,
        discount: Number(form.discount) || 0,
        tax: Number(form.tax) || 0,
      };

      if (editTarget) {
        await updateInvoice(editTarget._id || editTarget.id, payload);
        showToast({ type: 'success', message: 'Invoice updated successfully' });
      } else {
        await createEnhancedInvoice(payload);
        showToast({ type: 'success', message: 'Invoice created successfully' });
      }

      setShowCreateModal(false);
      setEditTarget(null);
      setForm({ patient: '', lineItems: [{ ...EMPTY_LINE }], notes: '', discount: 0, tax: 0 });
      setPatientSearch('');
      fetchInvoices();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to save invoice' });
    } finally {
      setCreating(false);
    }
  };

  // ─── View detail ──────────────────────────────
  const openView = async (inv) => {
    setViewLoading(true);
    setViewTarget(inv);
    setLedger(null);
    try {
      const fullInv = await getInvoice(inv._id || inv.id);
      setViewTarget(fullInv.data || fullInv);

      // Try to load patient ledger
      const patientId = inv.patient?._id || inv.patient?.id || inv.patientId;
      if (patientId) {
        try {
          const ledgerRes = await getPatientLedger(patientId);
          setLedger(ledgerRes.data || ledgerRes);
        } catch {
          // silently ignore
        }
      }
    } catch {
      // keep the original inv data
    } finally {
      setViewLoading(false);
    }
  };

  // ─── Download PDF ─────────────────────────────
  const handleDownload = async (inv) => {
    try {
      await downloadInvoicePdf(inv._id || inv.id);
      showToast({ type: 'success', message: 'PDF download started' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to download PDF' });
    }
  };

  // ─── Table columns ───────────────────────────
  const columns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (r) => (
        <span className="font-semibold text-neutral-900 font-display">
          {r.invoiceNumber || '—'}
        </span>
      ),
    },
    {
      key: 'patient',
      label: 'Patient',
      render: (r) => <span className="text-neutral-900/80">{r.patient?.name || r.patientName || 'N/A'}</span>,
    },
    {
      key: 'date',
      label: 'Date',
      render: (r) => (
        <span className="text-neutral-900/50 text-xs">
          {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (r) => <span className="font-semibold text-neutral-900">{INR.format(r.totalAmount ?? r.amount ?? 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'paid',
      label: 'Paid',
      render: (r) => <span className="text-emerald-700 font-medium text-sm">{INR.format(r.paidAmount ?? 0)}</span>,
    },
    {
      key: 'balance',
      label: 'Balance',
      render: (r) => {
        const bal = invBalance(r);
        return <span className={`font-medium text-sm ${bal > 0 ? 'text-amber-700' : 'text-neutral-500'}`}>{INR.format(bal)}</span>;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); openView(r); }}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(r); }}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-blue-600 transition"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </button>
          {['draft', 'sent'].includes(r.status) && (
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(r); }}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-amber-600 transition"
              title="Edit Invoice"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Invoices</h1>
          <p className="text-sm text-neutral-600 mt-1">Create, manage, and track invoices</p>
        </div>
        <button onClick={openCreate} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> Create Invoice
        </button>
      </div>

      {/* ── Stat Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard icon={IndianRupee} label="Total Amount" value={INR.format(stats.totalAmount)} iconBg="bg-primary-50" iconText="text-primary-600" index={0} />
        <MetricCard icon={CheckCircle2} label="Paid" value={stats.paidCount} iconBg="bg-emerald-50" iconText="text-emerald-600" index={1} />
        <MetricCard icon={AlertTriangle} label="Overdue" value={stats.overdueCount} iconBg="bg-red-50" iconText="text-red-600" index={2} />
        <MetricCard icon={Clock} label="Drafts" value={stats.draftCount} iconBg="bg-neutral-100" iconText="text-neutral-600" index={3} />
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '150ms' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className={labelCls}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className={labelCls}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className={inputCls}
            />
          </div>
          <div className="w-40">
            <label className={labelCls}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className={inputCls}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className={labelCls}>Patient Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by patient name..."
                value={patientFilter}
                onChange={(e) => { setPatientFilter(e.target.value); setPage(1); }}
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>
          {(statusFilter || dateFrom || dateTo || patientFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); setPatientFilter(''); setPage(1); }}
              className="h-11 px-4 text-sm font-medium text-neutral-500 hover:text-neutral-700 transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ── Invoice Table ───────────────────────── */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        {loading ? (
          <Spinner />
        ) : invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices found" message="Create your first invoice or adjust your filters." />
        ) : (
          <>
            <DataTable columns={columns} data={invoices} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Invoice Modal ──────────── */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditTarget(null); }}
        title={editTarget ? 'Edit Invoice' : 'Create Invoice'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient search */}
          <div>
            <label className={labelCls}>Patient</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search patient by name or ID..."
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setForm((f) => ({ ...f, patient: '' })); }}
                className={`${inputCls} pl-9`}
              />
            </div>
            {form.patient && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">
                Selected: {patients.find((p) => (p._id || p.id) === form.patient)?.name || 'Patient'}
              </p>
            )}
            {patientSearch.trim() && !form.patient && (
              <div className="mt-2 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
                {filteredPatients.length === 0 ? (
                  <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
                ) : (
                  filteredPatients.slice(0, 10).map((p) => (
                    <button
                      key={p._id || p.id}
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, patient: p._id || p.id })); setPatientSearch(patientName(p)); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition flex items-center justify-between"
                    >
                      <span className="text-neutral-900">{patientName(p)}</span>
                      {p.phone && <span className="text-xs text-neutral-400">{p.phone}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Line Items</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>
            <div className="space-y-3">
              {form.lineItems.map((li, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                  <div className="flex-1 min-w-0 space-y-2">
                    {serviceItems.length > 0 && (
                      <select
                        value={li.serviceItem}
                        onChange={(e) => selectService(idx, e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select a service (or type below)</option>
                        {serviceItems.map((s) => (
                          <option key={s._id || s.id} value={s._id || s.id}>
                            {s.name || s.description} — {INR.format(s.price ?? s.unitPrice ?? 0)}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={li.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Rate"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))}
                      required
                      className={inputCls}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right pt-2.5">
                    <p className="text-sm font-semibold text-neutral-900">{INR.format(li.quantity * li.unitPrice)}</p>
                  </div>
                  {form.lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition mt-0.5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-medium text-neutral-900">{INR.format(subtotal)}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-neutral-500 w-28">Tax (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.tax}
                  onChange={(e) => setForm({ ...form, tax: e.target.value })}
                  className={`${inputCls} w-24`}
                />
                <span className="text-sm text-neutral-700 ml-auto">{INR.format(taxAmount)}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-neutral-500 w-28">Discount</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value })}
                  className={`${inputCls} w-24`}
                />
                <span className="text-sm text-neutral-700 ml-auto">-{INR.format(discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                <span className="text-base font-bold font-display text-neutral-900">Total</span>
                <span className="text-base font-bold font-display text-neutral-900">{INR.format(invoiceTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <input
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => { setShowCreateModal(false); setEditTarget(null); }}
              className={btnSecondary}
            >
              Cancel
            </button>
            <button type="submit" disabled={creating} className={`${btnPrimary} flex items-center gap-2`}>
              {creating ? 'Saving...' : editTarget ? (
                <><Pencil className="h-4 w-4" /> Update Invoice</>
              ) : (
                <><CreditCard className="h-4 w-4" /> Create Invoice</>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── View Detail Modal ────────────────────── */}
      <Modal
        open={!!viewTarget}
        onClose={() => { setViewTarget(null); setLedger(null); }}
        title={`Invoice ${viewTarget?.invoiceNumber || ''}`}
        size="lg"
      >
        {viewTarget && (
          <div className="space-y-5">
            {viewLoading && <Spinner />}

            {/* Invoice header info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Patient</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.patient?.name || viewTarget.patientName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Status</span>
                <div className="mt-0.5"><StatusBadge status={viewTarget.status} /></div>
              </div>
              <div>
                <span className="text-neutral-500">Date</span>
                <p className="text-neutral-900 mt-0.5">
                  {viewTarget.createdAt ? new Date(viewTarget.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">Total</span>
                <p className="font-semibold text-neutral-900 mt-0.5">{INR.format(viewTarget.totalAmount ?? viewTarget.amount ?? 0)}</p>
              </div>
              <div>
                <span className="text-neutral-500">Paid</span>
                <p className="font-medium text-emerald-600 mt-0.5">{INR.format(viewTarget.paidAmount ?? 0)}</p>
              </div>
              <div>
                <span className="text-neutral-500">Balance</span>
                <p className="font-medium text-amber-600 mt-0.5">{INR.format(invBalance(viewTarget))}</p>
              </div>
            </div>

            {/* Line items */}
            {(viewTarget.items || viewTarget.lineItems || []).length > 0 && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Rate</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewTarget.items || viewTarget.lineItems || []).map((it, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="px-3 py-2 text-neutral-900">{it.description || it.name || 'Item'}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{it.quantity ?? 1}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{INR.format(it.unitPrice ?? it.price ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-medium text-neutral-900">
                          {INR.format((it.quantity ?? 1) * (it.unitPrice ?? it.price ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payment history */}
            {(viewTarget.payments || []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 font-display mb-2">Payment History</h4>
                <div className="space-y-2">
                  {viewTarget.payments.map((pay, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div>
                        <p className="text-sm font-medium text-emerald-800">{INR.format(pay.amount ?? 0)}</p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          {pay.mode || 'N/A'} {pay.reference ? `- ${pay.reference}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-emerald-600">
                        {pay.createdAt ? new Date(pay.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Patient ledger summary */}
            {ledger && (
              <div className="border-t border-neutral-200 pt-4">
                <h4 className="text-sm font-semibold text-neutral-900 font-display mb-2">Patient Ledger</h4>
                <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                  <span className="text-sm text-neutral-600">Current Balance</span>
                  <span className={`text-sm font-semibold ${(ledger.balance ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {INR.format(ledger.balance ?? 0)}
                  </span>
                </div>
                {(ledger.entries || []).length > 0 && (
                  <p className="text-xs text-neutral-500 mt-2">{ledger.entries.length} ledger entries on file</p>
                )}
              </div>
            )}

            {viewTarget.notes && (
              <p className="text-xs text-neutral-500 italic">{viewTarget.notes}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
