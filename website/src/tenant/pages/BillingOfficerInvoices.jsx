import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, Eye, Download, Edit3, IndianRupee,
  Ban, Trash2, CheckCircle2, Clock, X,
} from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import {
  listInvoices, createEnhancedInvoice, updateInvoice, voidInvoice,
  downloadInvoicePdf, recordPaymentForInvoice, getInvoice,
  listServiceItems, listPatients, calculateCoPay, downloadPaymentReceipt,
} from '../api';
import { useToast } from '../ToastContext';

/* ---- Reusable class strings ----------------------------------- */
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200';
const btnDanger = 'h-11 px-5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-[var(--shadow-sm)] transition-all duration-200 disabled:opacity-50';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

/* ---- Status helpers ------------------------------------------- */
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

/* ---- Constants ------------------------------------------------ */
const INVOICE_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'partially_paid', label: 'Partially Paid' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'credit_balance', label: 'Credit Balance' },
  { value: 'other', label: 'Other' },
];

const EMPTY_LINE = { serviceItem: '', description: '', quantity: 1, unitPrice: 0 };
const patientName = (p) => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'N/A';
const invBalance = (inv) => inv.balanceDue ?? ((inv.totalAmount ?? inv.amount ?? 0) - (inv.paidAmount ?? 0));

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BillingOfficerInvoices() {
  const { showToast } = useToast();

  // ---- List state ---------------------------------------------
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [patientSearch, setPatientSearch] = useState('');

  // Reference data
  const [patients, setPatients] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  // Create form
  const [createPatientSearch, setCreatePatientSearch] = useState('');
  const [form, setForm] = useState({
    patient: '', lineItems: [{ ...EMPTY_LINE }], taxPercent: 0, discount: 0, notes: '',
  });
  const [creating, setCreating] = useState(false);

  // Pay form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState(null);

  // Insurance co-pay
  const [coPay, setCoPay] = useState(null);
  const [coPayLoading, setCoPayLoading] = useState(false);

  // Void
  const [voiding, setVoiding] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ notes: '', dueDate: '' });
  const [editing, setEditing] = useState(false);

  // ---- Fetch invoices -----------------------------------------
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) params.to = new Date(dateTo + 'T23:59:59').toISOString();
      if (patientSearch.trim()) params.patient = patientSearch.trim();

      const res = await listInvoices(params);
      const items = res.data?.items || res.data || [];
      setInvoices(Array.isArray(items) ? items : []);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, patientSearch]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
    listServiceItems().then((r) => setServiceItems(r.data || [])).catch(() => {});
  }, []);

  // ---- Line items helpers -------------------------------------
  const addLine = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, j) => j !== i) }));
  const updateLine = (i, k, v) => setForm((f) => ({
    ...f, lineItems: f.lineItems.map((li, j) => j === i ? { ...li, [k]: v } : li),
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
  const taxAmount = subtotal * (form.taxPercent / 100);
  const invoiceTotal = subtotal + taxAmount - (Number(form.discount) || 0);

  // Patient filter for create modal
  const filteredPatients = createPatientSearch.trim()
    ? patients.filter((p) =>
        patientName(p).toLowerCase().includes(createPatientSearch.toLowerCase()) ||
        (p.patientId || '').toLowerCase().includes(createPatientSearch.toLowerCase())
      )
    : patients;

  // ---- Create -------------------------------------------------
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.patient) { showToast({ type: 'error', message: 'Please select a patient' }); return; }
    if (form.lineItems.some((li) => !li.description || li.unitPrice <= 0)) {
      showToast({ type: 'error', message: 'All items need a description and price' }); return;
    }
    const discountPerItem = Number(form.discount) || 0;
    if (discountPerItem > 0) {
      for (const li of form.lineItems) {
        const lineSubtotal = Number(li.quantity) * Number(li.unitPrice);
        if (discountPerItem > lineSubtotal) {
          showToast({ type: 'error', message: `Discount cannot exceed item subtotal for "${li.description}"` });
          return;
        }
      }
    }
    setCreating(true);
    try {
      await createEnhancedInvoice({
        patient: form.patient,
        items: form.lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          discount: Number(form.discount) || 0,
          ...(li.serviceItem && { serviceItem: li.serviceItem }),
        })),
        notes: form.notes || undefined,
      });
      showToast({ type: 'success', message: 'Invoice created successfully' });
      setShowCreate(false);
      setForm({ patient: '', lineItems: [{ ...EMPTY_LINE }], taxPercent: 0, discount: 0, notes: '' });
      setCreatePatientSearch('');
      fetchInvoices();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to create invoice' });
    } finally {
      setCreating(false);
    }
  };

  // ---- Record Payment -----------------------------------------
  const openPay = (inv) => {
    setPayTarget(inv);
    setPayAmount(String(invBalance(inv)));
    setPayMethod('cash');
    setPayReference('');
    setCoPay(null);
    setLastPaymentId(null);
  };

  // When insurance mode is selected, try to fetch co-pay info
  const handlePayMethodChange = async (method) => {
    setPayMethod(method);
    setCoPay(null);
    if (method === 'insurance' && payTarget) {
      // Try to find associated insurance claim
      const claimId = payTarget.insuranceClaim || payTarget.insuranceClaimId;
      if (claimId) {
        setCoPayLoading(true);
        try {
          const res = await calculateCoPay(claimId);
          const data = res?.data || res;
          setCoPay(data);
          if (data?.patientResponsibility != null) {
            setPayAmount(String(data.patientResponsibility));
          }
        } catch {
          // Co-pay calculation not available — use full balance
        } finally {
          setCoPayLoading(false);
        }
      }
    }
  };

  const handlePay = async () => {
    if (!payTarget || Number(payAmount) <= 0) return;
    setPayLoading(true);
    try {
      const res = await recordPaymentForInvoice(payTarget._id || payTarget.id, {
        amount: Number(payAmount),
        mode: payMethod,
        ...(payReference.trim() && { reference: payReference.trim() }),
      });
      showToast({ type: 'success', message: 'Payment recorded' });
      const paymentId = res?.data?.payment?._id || res?.data?.payment?.id;
      setLastPaymentId(paymentId || null);
      if (!paymentId) {
        setPayTarget(null);
      }
      fetchInvoices();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to record payment' });
    } finally {
      setPayLoading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!lastPaymentId) return;
    try {
      await downloadPaymentReceipt(lastPaymentId);
      showToast({ type: 'success', message: 'Receipt downloaded' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to download receipt' });
    }
  };

  // ---- Void ---------------------------------------------------
  const handleVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidInvoice(voidTarget._id || voidTarget.id);
      showToast({ type: 'success', message: 'Invoice voided' });
      setVoidTarget(null);
      fetchInvoices();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to void invoice' });
    } finally {
      setVoiding(false);
    }
  };

  // ---- Download PDF -------------------------------------------
  const handleDownload = async (inv) => {
    try {
      await downloadInvoicePdf(inv._id || inv.id);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to download PDF' });
    }
  };

  // ---- Edit ---------------------------------------------------
  const openEdit = (inv) => {
    setEditTarget(inv);
    setEditForm({ notes: inv.notes || '', dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '' });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setEditing(true);
    try {
      await updateInvoice(editTarget._id || editTarget.id, {
        notes: editForm.notes || undefined,
        dueDate: editForm.dueDate || undefined,
      });
      showToast({ type: 'success', message: 'Invoice updated' });
      setEditTarget(null);
      fetchInvoices();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to update invoice' });
    } finally {
      setEditing(false);
    }
  };

  // ---- View Detail --------------------------------------------
  const openView = async (inv) => {
    try {
      const res = await getInvoice(inv._id || inv.id);
      setViewTarget(res.data || inv);
    } catch {
      setViewTarget(inv);
    }
  };

  // ---- Table columns ------------------------------------------
  const columns = [
    {
      key: 'invoiceNumber', label: 'Invoice #',
      render: (r) => (
        <span className="font-semibold text-neutral-900 font-display">
          {r.invoiceNumber || '—'}
        </span>
      ),
    },
    {
      key: 'patient', label: 'Patient',
      render: (r) => <span className="text-neutral-700">{r.patient?.name || r.patientName || 'N/A'}</span>,
    },
    {
      key: 'date', label: 'Date',
      render: (r) => <span className="text-neutral-500 text-xs">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'amount', label: 'Amount',
      render: (r) => <span className="font-semibold text-neutral-900">{formatCurrency(r.totalAmount ?? r.amount ?? 0)}</span>,
    },
    {
      key: 'paid', label: 'Paid',
      render: (r) => {
        const paid = r.paidAmount ?? 0;
        return <span className="text-emerald-600 font-medium text-sm">{paid > 0 ? formatCurrency(paid) : '-'}</span>;
      },
    },
    {
      key: 'balance', label: 'Balance',
      render: (r) => {
        const bal = invBalance(r);
        return <span className={`font-medium text-sm ${bal > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{bal > 0 ? formatCurrency(bal) : 'Paid'}</span>;
      },
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openView(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDownload(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-blue-600 transition" title="Download PDF">
            <Download className="h-4 w-4" />
          </button>
          {['draft', 'sent'].includes(r.status) && (
            <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-amber-600 transition" title="Edit">
              <Edit3 className="h-4 w-4" />
            </button>
          )}
          {['draft', 'sent', 'overdue', 'partially_paid'].includes(r.status) && (
            <button onClick={(e) => { e.stopPropagation(); openPay(r); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Record Payment">
              <IndianRupee className="h-4 w-4" />
            </button>
          )}
          {['draft', 'sent', 'overdue'].includes(r.status) && (
            <button onClick={(e) => { e.stopPropagation(); setVoidTarget(r); }} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Void">
              <Ban className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* ---- Render ------------------------------------------------- */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Invoices</h1>
          <p className="text-sm text-neutral-600 mt-1">Create, manage, and track all invoices</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> Create Invoice
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        >
          {INVOICE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          placeholder="To"
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => { setPatientSearch(e.target.value); setPage(1); }}
            placeholder="Search by patient..."
            className="h-11 w-full pl-9 pr-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <Spinner />
        ) : invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices found" message="Adjust your filters or create a new invoice." />
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

      {/* ---- Create Invoice Modal ---- */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice" size="lg">
        <form onSubmit={handleCreate} className="space-y-6">
          {/* Patient search */}
          <div>
            <label className={labelCls}>Patient</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search patient by name or ID..."
                value={createPatientSearch}
                onChange={(e) => { setCreatePatientSearch(e.target.value); setForm((f) => ({ ...f, patient: '' })); }}
                className={`${inputCls} pl-9`}
              />
            </div>
            {form.patient && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">
                Selected: {patients.find((p) => (p._id || p.id) === form.patient)?.name || 'Patient'}
              </p>
            )}
            {createPatientSearch.trim() && !form.patient && (
              <div className="mt-2 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
                {filteredPatients.length === 0 ? (
                  <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
                ) : (
                  filteredPatients.slice(0, 10).map((p) => (
                    <button
                      key={p._id || p.id}
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, patient: p._id || p.id })); setCreatePatientSearch(patientName(p)); }}
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
              <button type="button" onClick={addLine} className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>
            <div className="space-y-3">
              {form.lineItems.map((li, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                  <div className="flex-1 min-w-0 space-y-2">
                    {serviceItems.length > 0 && (
                      <select value={li.serviceItem} onChange={(e) => selectService(idx, e.target.value)} className={inputCls}>
                        <option value="">Select a service (or type below)</option>
                        {serviceItems.map((s) => (
                          <option key={s._id || s.id} value={s._id || s.id}>
                            {s.name || s.description} — {formatCurrency(s.price ?? s.unitPrice ?? 0)}
                          </option>
                        ))}
                      </select>
                    )}
                    <input placeholder="Description" value={li.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} required className={inputCls} />
                  </div>
                  <div className="w-20 shrink-0">
                    <input type="number" min="1" placeholder="Qty" value={li.quantity} onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))} required className={inputCls} />
                  </div>
                  <div className="w-28 shrink-0">
                    <input type="number" min="0" step="0.01" placeholder="Rate" value={li.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))} required className={inputCls} />
                  </div>
                  <div className="w-24 shrink-0 text-right pt-2.5">
                    <p className="text-sm font-semibold text-neutral-900">{formatCurrency(li.quantity * li.unitPrice)}</p>
                  </div>
                  {form.lineItems.length > 1 && (
                    <button type="button" onClick={() => removeLine(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition mt-0.5">
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
                <span className="font-semibold text-neutral-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-neutral-500 w-20">Tax %</label>
                <input type="number" min="0" max="100" step="0.5" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} className={`${inputCls} w-24`} />
                <span className="text-sm font-medium text-neutral-700 ml-auto">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-neutral-500 w-20">Discount</label>
                <input type="number" min="0" step="1" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} className={`${inputCls} w-24`} />
                <span className="text-sm font-medium text-neutral-700 ml-auto">-{formatCurrency(form.discount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-200">
                <span className="text-base font-bold font-display text-neutral-900">Total</span>
                <span className="text-base font-bold font-display text-neutral-900">{formatCurrency(invoiceTotal)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea placeholder="Any additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={creating} className={`${btnPrimary} flex items-center gap-2`}>
              {creating ? 'Creating...' : <><FileText className="h-4 w-4" /> Create Invoice</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- View Invoice Modal ---- */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Invoice ${viewTarget?.invoiceNumber || ''}`}>
        {viewTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-neutral-500">Patient</span><p className="font-medium text-neutral-900 mt-0.5">{viewTarget.patient?.name || viewTarget.patientName || 'N/A'}</p></div>
              <div><span className="text-neutral-500">Status</span><div className="mt-0.5"><StatusBadge status={viewTarget.status} /></div></div>
              <div><span className="text-neutral-500">Total</span><p className="font-semibold text-neutral-900 mt-0.5">{formatCurrency(viewTarget.totalAmount ?? viewTarget.amount ?? 0)}</p></div>
              <div><span className="text-neutral-500">Paid</span><p className="font-medium text-emerald-600 mt-0.5">{formatCurrency(viewTarget.paidAmount ?? 0)}</p></div>
              <div><span className="text-neutral-500">Balance</span><p className="font-medium text-amber-600 mt-0.5">{formatCurrency(invBalance(viewTarget))}</p></div>
              <div><span className="text-neutral-500">Date</span><p className="text-neutral-900 mt-0.5">{formatDate(viewTarget.createdAt)}</p></div>
            </div>
            {viewTarget.items?.length > 0 && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Price</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewTarget.items.map((it, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="px-3 py-2 text-neutral-900">{it.description || it.name || 'Item'}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{it.quantity ?? 1}</td>
                        <td className="px-3 py-2 text-right text-neutral-600">{formatCurrency(it.unitPrice ?? it.price ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-medium text-neutral-900">{formatCurrency((it.quantity ?? 1) * (it.unitPrice ?? it.price ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {viewTarget.notes && <p className="text-xs text-neutral-500 italic">{viewTarget.notes}</p>}
          </div>
        )}
      </Modal>

      {/* ---- Record Payment Modal ---- */}
      <Modal open={!!payTarget} onClose={() => { setPayTarget(null); setLastPaymentId(null); }} title={lastPaymentId ? 'Payment Recorded' : 'Record Payment'}>
        {payTarget && !lastPaymentId && (
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <div>
                <p className="text-xs text-neutral-500">Invoice {payTarget.invoiceNumber || ''}</p>
                <p className="text-sm font-semibold text-neutral-900 mt-0.5">Balance: {formatCurrency(invBalance(payTarget))}</p>
              </div>
              <p className="text-sm text-neutral-600">{payTarget.patient?.name || payTarget.patientName || 'N/A'}</p>
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={payMethod} onChange={(e) => handlePayMethodChange(e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Insurance co-pay info */}
            {payMethod === 'insurance' && coPayLoading && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 text-sm text-blue-700">Calculating co-pay...</div>
            )}
            {payMethod === 'insurance' && coPay && !coPayLoading && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Insurance Covers</span>
                  <span className="font-semibold text-blue-800">{formatCurrency(coPay.insurancePortion ?? coPay.insuranceAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Patient Co-Pay</span>
                  <span className="font-bold text-blue-900">{formatCurrency(coPay.patientResponsibility ?? coPay.coPay ?? 0)}</span>
                </div>
                {coPay.coveragePercent != null && (
                  <p className="text-xs text-blue-600 mt-1">Coverage: {coPay.coveragePercent}%</p>
                )}
              </div>
            )}

            <div>
              <label className={labelCls}>Amount</label>
              <input type="number" min="1" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reference Number (optional)</label>
              <input placeholder="Transaction ID / Reference" value={payReference} onChange={(e) => setPayReference(e.target.value)} className={inputCls} />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => { setPayTarget(null); setLastPaymentId(null); }} disabled={payLoading} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handlePay} disabled={payLoading || Number(payAmount) <= 0} className={`${btnPrimary} flex items-center gap-2`}>
                {payLoading ? 'Processing...' : <><CheckCircle2 className="h-4 w-4" /> Record Payment</>}
              </button>
            </div>
          </div>
        )}
        {/* Post-payment: show receipt option */}
        {lastPaymentId && (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-800">Payment recorded successfully</p>
            </div>
            <div className="flex justify-center gap-3">
              <button onClick={handlePrintReceipt} className="h-11 px-5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2">
                <Download className="h-4 w-4" /> Print Receipt
              </button>
              <button onClick={() => { setPayTarget(null); setLastPaymentId(null); }} className={btnSecondary}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Void Confirmation Modal ---- */}
      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void Invoice">
        {voidTarget && (
          <div className="space-y-5">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Ban className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Are you sure you want to void this invoice?</p>
                  <p className="text-sm text-red-700 mt-1">
                    Invoice <span className="font-semibold">{voidTarget.invoiceNumber || '—'}</span> for {formatCurrency(voidTarget.totalAmount ?? voidTarget.amount ?? 0)} will be permanently voided. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setVoidTarget(null)} disabled={voiding} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleVoid} disabled={voiding} className={`${btnDanger} flex items-center gap-2`}>
                {voiding ? 'Voiding...' : <><Ban className="h-4 w-4" /> Void Invoice</>}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Edit Invoice Modal ---- */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Invoice ${editTarget?.invoiceNumber || ''}`}>
        {editTarget && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} className={inputCls} />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setEditTarget(null)} disabled={editing} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleEdit} disabled={editing} className={`${btnPrimary} flex items-center gap-2`}>
                {editing ? 'Saving...' : <><Edit3 className="h-4 w-4" /> Save Changes</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
