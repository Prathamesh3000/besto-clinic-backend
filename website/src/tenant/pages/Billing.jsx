import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard, DollarSign, Clock, AlertTriangle, Plus, Ban, Eye,
  FileText, Shield, Send, Receipt, RefreshCw,
  Wallet, Package, BookOpen, Undo2, Download, IndianRupee,
  ArrowUpRight, ArrowDownRight, CheckCircle, XCircle, Search,
} from 'lucide-react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert,
  TabBar, ConfirmDialog, Drawer,
} from '../../platform/components/shared';
import Can from '../components/Can';
import {
  listInvoices, createInvoice, voidInvoice,
  listInsuranceClaims, createInsuranceClaim, listInsuranceProviders,
  listPatients,
  listPayments, refundPayment, getInvoicePayments,
  listServiceItems, createServiceItem, updateServiceItem,
  openCashRegister, closeCashRegister, getCurrentCashRegister, listCashRegisters, getCashRegisterTransactions,
  reconcileCashRegister, getFinancialAuditTrail,
  listCreditNotes, createCreditNote, issueCreditNote, applyCreditNote,
  recordPaymentForInvoice, downloadInvoicePdf,
  recordPreAuth, calculateCoPay, reconcileInsuranceClaim,
  listBranches,
} from '../api';
import PaymentModal from '../components/PaymentModal';
import InvoiceDetailModal from '../components/InvoiceDetailModal';

/* ─── Design tokens ─────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ─── Status helpers ────────────────────────────── */
const INVOICE_STATUS_STYLES = {
  draft:     { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  sent:      { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  paid:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  overdue:   { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' },
  refunded:  { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  partially_paid: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const CLAIM_STATUS_STYLES = {
  submitted:   { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  under_review:{ bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:    { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  paid:        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  appealed:    { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
};

const PAYMENT_STATUS_STYLES = {
  pending:    { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  processing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed:     { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  refunded:   { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
};

const CASH_REGISTER_STATUS_STYLES = {
  open:        { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  closed:      { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  reconciled:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const CREDIT_NOTE_STATUS_STYLES = {
  draft:   { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  issued:  { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  applied: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  expired: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

function StatusBadge({ status, styles }) {
  const s = styles[status] || { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

const EMPTY_LINE_ITEM = { description: '', quantity: 1, unitPrice: 0 };

/* Page-size selector helper */
function PageSizeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={selectCls}>
      {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
    </select>
  );
}

/* ═══ Invoices Tab ══════════════════════════════════ */
function InvoicesTab({ highlightId, highlightSearch }) {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({ totalRevenue: 0, pending: 0, overdue: 0, paidThisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState(highlightSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) { setSearch(highlightSearch); setDebouncedSearch(highlightSearch); } }, [highlightSearch]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [patients, setPatients] = useState([]);
  const [payTarget, setPayTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const [form, setForm] = useState({
    patient: '', lineItems: [{ ...EMPTY_LINE_ITEM }], notes: '', dueDate: '',
  });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listInvoices({ page, limit, status: statusFilter || undefined, search: debouncedSearch || undefined });
      setInvoices(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
      if (res.stats) setStats(res.stats);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, statusFilter, debouncedSearch]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {}); }, []);

  const addLineItem = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE_ITEM }] }));
  const removeLineItem = (idx) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));
  const updateLineItem = (idx, field, value) =>
    setForm((f) => ({ ...f, lineItems: f.lineItems.map((li, i) => (i === idx ? { ...li, [field]: value } : li)) }));

  const invoiceTotal = form.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createInvoice({
        patient: form.patient,
        items: form.lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) })),
        notes: form.notes || undefined, dueDate: form.dueDate || undefined,
      });
      setShowCreate(false);
      setForm({ patient: '', lineItems: [{ ...EMPTY_LINE_ITEM }], notes: '', dueDate: '' });
      fetchInvoices();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try { await voidInvoice(voidTarget._id || voidTarget.id); setVoidTarget(null); fetchInvoices(); }
    catch (err) { setError(err.message); }
    finally { setVoiding(false); }
  };

  const handleDownloadPdf = async (invoice) => {
    try { await downloadInvoicePdf(invoice._id || invoice.id); }
    catch (err) { setError(err.message); }
  };

  const STAT_CFG = [
    { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, fmt: 'currency' },
    { key: 'pending', title: 'Pending', icon: Clock },
    { key: 'overdue', title: 'Overdue', icon: AlertTriangle },
    { key: 'paidThisMonth', title: 'Paid This Month', icon: CreditCard },
  ];
  const PAL = [
    { icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
    { icon: 'bg-amber-100 text-amber-600', value: 'text-amber-700' },
    { icon: 'bg-red-100 text-red-600', value: 'text-red-700' },
    { icon: 'bg-primary-100 text-primary-600', value: 'text-primary-700' },
  ];

  const columns = [
    {
      key: 'invoiceNumber', label: 'Invoice #',
      render: (row) => <span className="font-semibold text-neutral-900 font-display">{row.invoiceNumber || '—'}</span>,
    },
    { key: 'patient', label: 'Patient', render: (row) => <span className="text-neutral-700">{row.patient?.name || row.patientName || 'N/A'}</span> },
    {
      key: 'amount', label: 'Total', sortable: true,
      render: (row) => <span className="font-semibold text-neutral-900">{(row.currency || 'INR')} {(row.totalAmount ?? row.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
    },
    {
      key: 'paidAmount', label: 'Paid',
      render: (row) => {
        const paid = row.paidAmount ?? 0;
        return <span className="text-emerald-600 font-medium text-sm">{paid > 0 ? `INR ${paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>;
      },
    },
    {
      key: 'balanceDue', label: 'Balance',
      render: (row) => {
        const total = row.totalAmount ?? row.amount ?? 0;
        const paid = row.paidAmount ?? 0;
        const balance = row.balanceDue ?? (total - paid);
        return <span className={`font-medium text-sm ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{balance > 0 ? `INR ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Paid'}</span>;
      },
    },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} styles={INVOICE_STATUS_STYLES} /> },
    {
      key: 'date', label: 'Date', sortable: true,
      render: (row) => <span className="text-neutral-500 text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setViewTarget(row); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View"><Eye className="h-4 w-4" /></button>
          {['draft', 'sent', 'overdue', 'partially_paid'].includes(row.status) && (
            <button onClick={(e) => { e.stopPropagation(); setPayTarget(row); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Record Payment"><IndianRupee className="h-4 w-4" /></button>
          )}
          <button onClick={(e) => { e.stopPropagation(); handleDownloadPdf(row); }} className="p-1.5 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition" title="Download PDF"><Download className="h-4 w-4" /></button>
          <Can permission="invoice:void">
            {(row.status === 'draft' || row.status === 'sent') && (
              <button onClick={(e) => { e.stopPropagation(); setVoidTarget(row); }} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Void"><Ban className="h-4 w-4" /></button>
            )}
          </Can>
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
          const val = stats[cfg.key] ?? 0;
          const display = cfg.fmt === 'currency' ? `₹${val.toLocaleString('en-IN')}` : val;
          return (
            <div key={cfg.key} className={`${cardCls} p-5`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${50 + i * 50}ms` }}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.icon}`}><Icon className="h-6 w-6" /></div>
                <div>
                  <p className={`text-[28px] font-bold leading-none ${p.value}`}>{display}</p>
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
              <input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9 w-full sm:w-56`} />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Statuses</option>
              {['draft', 'sent', 'paid', 'overdue', 'partially_paid', 'cancelled', 'refunded'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
          </div>
          <Can permission="invoice:create">
            <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}><Plus className="h-4 w-4" /> Create Invoice</button>
          </Can>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Table */}
      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '300ms' }}>
        {loading ? <Spinner /> : invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices found" message="Create your first invoice to get started" />
        ) : (
          <>
            <DataTable columns={columns} data={invoices} highlightId={highlightId} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice" wide>
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className={labelCls}>Patient</label>
            <select value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} required className={inputCls}>
              <option value="">Select a patient</option>
              {patients.map((p) => <option key={p._id || p.id} value={p._id || p.id}>{p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Line Items</label>
              <button type="button" onClick={addLineItem} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Add Item</button>
            </div>
            <div className="space-y-3">
              {form.lineItems.map((li, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                  <div className="flex-1 min-w-0"><input placeholder="Description" value={li.description} onChange={(e) => updateLineItem(idx, 'description', e.target.value)} required className={inputCls} /></div>
                  <div className="w-20 shrink-0"><input type="number" min="1" placeholder="Qty" value={li.quantity} onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value))} required className={inputCls} /></div>
                  <div className="w-28 shrink-0"><input type="number" min="0" step="0.01" placeholder="Unit Price" value={li.unitPrice} onChange={(e) => updateLineItem(idx, 'unitPrice', Number(e.target.value))} required className={inputCls} /></div>
                  <div className="w-24 shrink-0 text-right"><p className="text-sm font-semibold text-neutral-900 pt-2">{(li.quantity * li.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                  {form.lineItems.length > 1 && (
                    <button type="button" onClick={() => removeLineItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition mt-0.5"><Ban className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2"><p className="text-sm font-semibold text-neutral-900 font-display">Total: INR {invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Due Date</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Notes</label><input placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200">
            <button type="button" onClick={() => setShowCreate(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={creating} className={btnPrimary}>{creating ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!voidTarget} title="Void Invoice" message={`Are you sure you want to void invoice ${voidTarget?.invoiceNumber || ''}? This action cannot be undone.`} onConfirm={handleVoid} onCancel={() => setVoidTarget(null)} danger loading={voiding} />
      <PaymentModal open={!!payTarget} onClose={() => setPayTarget(null)} invoice={payTarget} onSuccess={() => { setPayTarget(null); fetchInvoices(); }} />
      <InvoiceDetailModal open={!!viewTarget} onClose={() => setViewTarget(null)} invoice={viewTarget} />
    </div>
  );
}

/* ═══ Payments Tab ══════════════════════════════════ */
function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listPayments({ page, limit, status: statusFilter || undefined, mode: modeFilter || undefined, search: debouncedSearch || undefined });
      setPayments(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, statusFilter, modeFilter, debouncedSearch]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    try { await refundPayment(refundTarget._id || refundTarget.id); setRefundTarget(null); fetchPayments(); }
    catch (err) { setError(err.message); }
    finally { setRefunding(false); }
  };

  const modeBadge = (mode) => {
    const colors = {
      cash: 'bg-emerald-50 text-emerald-700', upi: 'bg-violet-50 text-violet-700',
      card: 'bg-blue-50 text-blue-700', insurance: 'bg-amber-50 text-amber-700',
      credit_balance: 'bg-pink-50 text-pink-700', split: 'bg-cyan-50 text-cyan-700',
    };
    return <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium capitalize ${colors[mode] || 'bg-neutral-100 text-neutral-600'}`}>{(mode || 'N/A').replace(/_/g, ' ')}</span>;
  };

  const columns = [
    {
      key: 'transactionId', label: 'Transaction ID',
      render: (row) => <span className="font-semibold text-neutral-900 font-display text-xs">{row.gatewayPaymentId || (row._id || row.id || '').slice(-8).toUpperCase()}</span>,
    },
    { key: 'invoice', label: 'Invoice #', render: (row) => <span className="text-neutral-700 text-sm">{row.invoice?.invoiceNumber || row.invoiceNumber || 'N/A'}</span> },
    { key: 'patient', label: 'Patient', render: (row) => <span className="text-neutral-700">{row.patient?.name || row.patientName || 'N/A'}</span> },
    {
      key: 'amount', label: 'Amount', sortable: true,
      render: (row) => <span className="font-semibold text-neutral-900">INR {(row.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
    },
    { key: 'mode', label: 'Mode', render: (row) => modeBadge(row.mode) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} styles={PAYMENT_STATUS_STYLES} /> },
    {
      key: 'date', label: 'Date', sortable: true,
      render: (row) => <span className="text-neutral-500 text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (row) => row.status === 'completed' ? (
        <button onClick={(e) => { e.stopPropagation(); setRefundTarget(row); }} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Refund"><Undo2 className="h-4 w-4" /></button>
      ) : null,
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
              <input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9 w-full sm:w-52`} />
            </div>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Statuses</option>
              {['pending', 'processing', 'completed', 'failed', 'refunded'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={modeFilter} onChange={(e) => { setModeFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Modes</option>
              {['cash', 'upi', 'card', 'insurance', 'credit_balance', 'split'].map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
            </select>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
          </div>
          <p className="text-sm text-neutral-500">{total} payment{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : payments.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" message="Payments will appear here once recorded against invoices" />
        ) : (
          <>
            <DataTable columns={columns} data={payments} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      <ConfirmDialog open={!!refundTarget} title="Refund Payment" message={`Are you sure you want to refund this payment? This action cannot be undone.`} onConfirm={handleRefund} onCancel={() => setRefundTarget(null)} danger loading={refunding} />
    </div>
  );
}

/* ═══ Service Catalog Tab ══════════════════════════ */
function ServiceCatalogTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const CATEGORIES = ['treatment', 'medicine', 'equipment', 'lab', 'consultation', 'other'];
  const emptyForm = { name: '', code: '', category: 'consultation', defaultPrice: '', taxRate: '', taxType: 'inclusive', hsnCode: '', unit: 'each', description: '' };
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listServiceItems({ page, limit, category: categoryFilter || undefined, search: debouncedSearch || undefined });
      setItems(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, categoryFilter, debouncedSearch]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code?.trim()) { setError('Service code is required'); return; }
    setCreating(true);
    try {
      await createServiceItem({ name: form.name, code: form.code.trim(), category: form.category, defaultPrice: Number(form.defaultPrice), taxRate: form.taxRate ? Number(form.taxRate) : undefined, taxType: form.taxType, hsnCode: form.hsnCode || undefined, unit: form.unit || undefined, description: form.description || undefined });
      setShowCreate(false);
      setForm({ ...emptyForm });
      fetchItems();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name || '', code: item.code || '', category: item.category || 'consultation', defaultPrice: item.defaultPrice ?? '', taxRate: item.taxRate ?? '', taxType: item.taxType || 'inclusive', hsnCode: item.hsnCode || '', unit: item.unit || 'each', description: item.description || '' });
    setShowEdit(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateServiceItem(editItem._id || editItem.id, { name: form.name, code: form.code || undefined, category: form.category, defaultPrice: Number(form.defaultPrice), taxRate: form.taxRate ? Number(form.taxRate) : undefined, taxType: form.taxType, hsnCode: form.hsnCode || undefined, unit: form.unit || undefined, description: form.description || undefined });
      setShowEdit(false);
      setEditItem(null);
      setForm({ ...emptyForm });
      fetchItems();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const categoryBadge = (cat) => {
    const colors = { treatment: 'bg-blue-50 text-blue-700', medicine: 'bg-emerald-50 text-emerald-700', equipment: 'bg-amber-50 text-amber-700', lab: 'bg-purple-50 text-purple-700', consultation: 'bg-primary-50 text-primary-700', other: 'bg-neutral-100 text-neutral-600' };
    return <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium capitalize ${colors[cat] || colors.other}`}>{cat || 'N/A'}</span>;
  };

  const columns = [
    { key: 'code', label: 'Code', render: (row) => <span className="font-mono text-xs text-neutral-500">{row.code || '-'}</span> },
    { key: 'name', label: 'Name', render: (row) => <span className="font-semibold text-neutral-900">{row.name}</span> },
    { key: 'category', label: 'Category', render: (row) => categoryBadge(row.category) },
    { key: 'defaultPrice', label: 'Default Price', sortable: true, render: (row) => <span className="font-semibold text-neutral-900">INR {(row.defaultPrice ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> },
    { key: 'taxRate', label: 'Tax Rate', render: (row) => <span className="text-neutral-500 text-sm">{row.taxRate != null ? `${row.taxRate}%` : '-'}</span> },
    { key: 'hsnCode', label: 'HSN Code', render: (row) => <span className="font-mono text-xs text-neutral-500">{row.hsnCode || '-'}</span> },
    {
      key: 'status', label: 'Status',
      render: (row) => {
        const active = row.isActive !== false && row.status !== 'inactive';
        return <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-neutral-400'}`} />{active ? 'Active' : 'Inactive'}</span>;
      },
    },
    {
      key: 'actions', label: 'Actions',
      render: (row) => <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="Edit"><Eye className="h-4 w-4" /></button>,
    },
  ];

  const formFields = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls}>Name</label><input placeholder="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputCls} /></div>
        <div><label className={labelCls}>Code</label><input placeholder="e.g. CONS-001" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls}>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}</select></div>
        <div><label className={labelCls}>Default Price (INR)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.defaultPrice} onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })} required className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div><label className={labelCls}>Tax Rate (%)</label><input type="number" min="0" step="0.01" placeholder="e.g. 18" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls}>Tax Type</label><select value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })} className={inputCls}><option value="inclusive">Inclusive</option><option value="exclusive">Exclusive</option></select></div>
        <div><label className={labelCls}>HSN Code</label><input placeholder="e.g. 9993" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} className={inputCls} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className={labelCls}>Unit</label><input placeholder="e.g. each, session, pack" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} /></div>
        <div><label className={labelCls}>Description</label><input placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} /></div>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input placeholder="Search services..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`${inputCls} pl-9 w-full sm:w-56`} />
            </div>
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
          </div>
          <button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }} className={`${btnPrimary} flex items-center gap-2`}><Plus className="h-4 w-4" /> Add Service</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : items.length === 0 ? (
          <EmptyState icon={Package} title="No service items found" message="Add your first service item to the catalog" />
        ) : (
          <>
            <DataTable columns={columns} data={items} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Service Item" wide>
        <form onSubmit={handleCreate} className="space-y-4">{formFields}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={() => setShowCreate(false)} className={btnGhost}>Cancel</button><button type="submit" disabled={creating} className={btnPrimary}>{creating ? 'Adding...' : 'Add Service'}</button></div>
        </form>
      </Modal>

      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditItem(null); }} title="Edit Service Item" wide>
        <form onSubmit={handleEdit} className="space-y-4">{formFields}
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={() => { setShowEdit(false); setEditItem(null); }} className={btnGhost}>Cancel</button><button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : 'Save Changes'}</button></div>
        </form>
      </Modal>
    </div>
  );
}

/* ═══ Cash Register Tab ════════════════════════════ */
function CashRegisterTab() {
  /* ── Core state ─────────────────────────────────────────────── */
  const [registers, setRegisters] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);

  /* ── Branch ─────────────────────────────────────────────────── */
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  useEffect(() => {
    listBranches({ limit: 100 }).then((res) => {
      const list = res.data || [];
      setBranches(list);
      if (list.length === 1) setSelectedBranch(list[0]._id);
    }).catch(() => {});
  }, []);

  /* ── Open register ──────────────────────────────────────────── */
  const [showOpen, setShowOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  /* ── Close register ─────────────────────────────────────────── */
  const [showClose, setShowClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  /* ── Denomination tracking ──────────────────────────────────── */
  const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const emptyDenoms = () => Object.fromEntries(DENOMINATIONS.map((d) => [d, '']));
  const [openDenoms, setOpenDenoms] = useState(emptyDenoms());
  const [closeDenoms, setCloseDenoms] = useState(emptyDenoms());
  const denomSum = (denoms) => DENOMINATIONS.reduce((sum, d) => sum + (Number(denoms[d]) || 0) * d, 0);

  /* ── Transaction drill-down ─────────────────────────────────── */
  const [txnTarget, setTxnTarget] = useState(null);
  const [txns, setTxns] = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);

  /* ── Reconciliation ─────────────────────────────────────────── */
  const [reconTarget, setReconTarget] = useState(null);
  const [reconNotes, setReconNotes] = useState('');
  const [reconciling, setReconciling] = useState(false);

  /* ── Audit log drawer ───────────────────────────────────────── */
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  /* ── Fetch data (branch-scoped) ─────────────────────────────── */
  const fetchData = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const [currentRes, listRes] = await Promise.all([
        getCurrentCashRegister({ branch: selectedBranch }).catch(() => null),
        listCashRegisters({ page, limit, branch: selectedBranch }),
      ]);
      setCurrent(currentRes?.data || currentRes || null);
      setRegisters(listRes.data || []);
      setTotal(listRes.meta?.total || listRes.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Helpers ────────────────────────────────────────────────── */
  const fmtCurrency = (n) => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const expectedBal = current ? (current.openingBalance ?? 0) + (current.cashIn ?? current.totalCashIn ?? 0) - (current.cashOut ?? current.totalCashOut ?? 0) : 0;

  /* ── Handlers ───────────────────────────────────────────────── */
  const handleOpen = async (e) => {
    e.preventDefault();
    const total = denomSum(openDenoms);
    if (!selectedBranch || total <= 0) return;
    setOpening(true);
    try {
      await openCashRegister({ branch: selectedBranch, openingBalance: total, denominations: openDenoms });
      setShowOpen(false);
      setOpenDenoms(emptyDenoms());
      fetchData();
    } catch (err) { setError(err.message); }
    finally { setOpening(false); }
  };

  const handleCloseSubmit = (e) => {
    e.preventDefault();
    setShowCloseConfirm(true);
  };

  const handleCloseConfirmed = async () => {
    setClosing(true);
    setShowCloseConfirm(false);
    try {
      const closingBalance = denomSum(closeDenoms);
      await closeCashRegister(current._id || current.id, { closingBalance, denominations: closeDenoms });
      setShowClose(false);
      setCloseDenoms(emptyDenoms());
      fetchData();
    } catch (err) { setError(err.message); }
    finally { setClosing(false); }
  };

  const handleViewTransactions = async (register) => {
    setTxnTarget(register);
    setTxnLoading(true);
    try {
      const res = await getCashRegisterTransactions(register._id || register.id);
      setTxns(res.data?.transactions || res.transactions || []);
    } catch (err) { setError(err.message); }
    finally { setTxnLoading(false); }
  };

  const handleReconcile = async () => {
    if (!reconTarget) return;
    setReconciling(true);
    try {
      await reconcileCashRegister(reconTarget._id || reconTarget.id, { notes: reconNotes });
      setReconTarget(null);
      setReconNotes('');
      fetchData();
    } catch (err) { setError(err.message); }
    finally { setReconciling(false); }
  };

  const handleViewAuditLog = async (register) => {
    setAuditTarget(register);
    setAuditLoading(true);
    try {
      const res = await getFinancialAuditTrail({ entity: 'CashRegister', entityId: register._id || register.id });
      setAuditLogs(res.data || []);
    } catch (err) { setError(err.message); }
    finally { setAuditLoading(false); }
  };

  /* ── CSV export ─────────────────────────────────────────────── */
  const exportCSV = (data, filename) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => {
      const val = row[h];
      const str = val == null ? '' : typeof val === 'object' ? (val.name || JSON.stringify(val)) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleExportRegisters = () => {
    exportCSV(registers.map((r) => ({
      'Date Opened': r.openedAt ? new Date(r.openedAt).toLocaleString('en-IN') : '',
      'Opened By': r.openedBy?.name || '',
      'Opening Balance': r.openingBalance ?? 0,
      'Closing Balance': r.closingBalance ?? '',
      'Expected Balance': r.expectedBalance ?? '',
      Variance: r.variance ?? '',
      Status: r.status || '',
      'Closed At': r.closedAt ? new Date(r.closedAt).toLocaleString('en-IN') : '',
    })), 'cash-registers');
  };

  const handleExportTransactions = () => {
    exportCSV(txns.map((t) => ({
      Patient: t.patient?.name || '',
      Invoice: t.invoice?.invoiceNumber || '',
      Amount: t.amount ?? 0,
      Mode: t.mode || '',
      Status: t.status || '',
      Time: t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN') : '',
    })), `register-${(txnTarget?._id || '').slice(-6)}-transactions`);
  };

  /* ── Denomination grid component ────────────────────────────── */
  const DenomGrid = ({ denoms, setDenoms }) => (
    <div className="grid grid-cols-2 gap-3">
      {DENOMINATIONS.map((d) => (
        <div key={d} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-600 w-12 text-right">₹{d}</span>
          <span className="text-neutral-400 text-xs">×</span>
          <input type="number" min="0" step="1" value={denoms[d]} onChange={(e) => setDenoms((prev) => ({ ...prev, [d]: e.target.value }))} placeholder="0"
            className="flex-1 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all w-16" />
          <span className="text-xs text-neutral-500 w-16 text-right">₹{((Number(denoms[d]) || 0) * d).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );

  /* ── Close variance calculation ─────────────────────────────── */
  const closeTotal = denomSum(closeDenoms);
  const closeVariance = closeTotal - expectedBal;

  /* ── Transaction columns ────────────────────────────────────── */
  const txnColumns = [
    { key: 'patient', label: 'Patient', render: (row) => <span className="text-neutral-700 text-sm">{row.patient?.name || 'N/A'}</span> },
    { key: 'invoice', label: 'Invoice', render: (row) => <span className="font-mono text-xs text-neutral-500">{row.invoice?.invoiceNumber || 'N/A'}</span> },
    { key: 'amount', label: 'Amount', render: (row) => <span className="font-semibold text-neutral-900">₹{fmtCurrency(row.amount)}</span> },
    { key: 'mode', label: 'Mode', render: (row) => <span className="capitalize text-sm">{(row.mode || 'N/A').replace(/_/g, ' ')}</span> },
    { key: 'status', label: 'Status', render: (row) => <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : row.status === 'refunded' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>{row.status || 'N/A'}</span> },
    { key: 'time', label: 'Time', render: (row) => <span className="text-xs text-neutral-500">{row.createdAt ? new Date(row.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span> },
  ];

  /* ── Register history columns ───────────────────────────────── */
  const columns = [
    { key: 'dateOpened', label: 'Date Opened', render: (row) => <span className="text-neutral-600 text-sm">{row.openedAt || row.createdAt ? new Date(row.openedAt || row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span> },
    { key: 'openedBy', label: 'Opened By', render: (row) => <span className="text-neutral-700">{row.openedBy?.name || row.openedByName || 'N/A'}</span> },
    { key: 'openingBalance', label: 'Opening', render: (row) => <span className="text-neutral-900 font-medium">₹{fmtCurrency(row.openingBalance)}</span> },
    { key: 'closingBalance', label: 'Closing', render: (row) => <span className="text-neutral-900 font-medium">{row.closingBalance != null ? `₹${fmtCurrency(row.closingBalance)}` : '-'}</span> },
    { key: 'expectedBalance', label: 'Expected', render: (row) => <span className="text-neutral-600">{row.expectedBalance != null ? `₹${fmtCurrency(row.expectedBalance)}` : '-'}</span> },
    {
      key: 'variance', label: 'Variance',
      render: (row) => {
        if (row.closingBalance == null) return <span className="text-neutral-400">-</span>;
        const v = row.variance ?? 0;
        const needsApproval = row.status === 'closed' && row.managerApproval?.required && !row.managerApproval?.approvedBy;
        return (
          <div className="flex items-center gap-2">
            <span className={`font-semibold flex items-center gap-1 ${Math.abs(v) > 100 ? 'text-red-600' : v !== 0 ? 'text-amber-600' : 'text-neutral-500'}`}>
              {v !== 0 && (v > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />)}
              ₹{fmtCurrency(Math.abs(v))}
            </span>
            {needsApproval && <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Needs Approval</span>}
          </div>
        );
      },
    },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} styles={CASH_REGISTER_STATUS_STYLES} /> },
    {
      key: 'actions', label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleViewTransactions(row); }}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View Transactions">
            <Eye className="h-4 w-4" />
          </button>
          {row.status === 'closed' && (
            <Can permission="cashRegister:reconcile">
              <button onClick={(e) => { e.stopPropagation(); setReconTarget(row); }}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Reconcile">
                <CheckCircle className="h-4 w-4" />
              </button>
            </Can>
          )}
          <Can permission="financialAudit:read">
            <button onClick={(e) => { e.stopPropagation(); handleViewAuditLog(row); }}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition" title="View Audit Log">
              <FileText className="h-4 w-4" />
            </button>
          </Can>
        </div>
      ),
    },
  ];

  /* ── Variance history data ──────────────────────────────────── */
  const varianceRecords = registers.filter((r) => r.variance != null && r.variance !== 0);

  return (
    <div className="space-y-6">
      {/* Branch filter */}
      {branches.length > 1 && (
        <div className="flex items-center gap-3" style={{ animation: 'fadeUp 0.4s ease-out both' }}>
          <label className="text-xs font-semibold text-neutral-500">Branch</label>
          <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">Select branch</option>
            {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {!selectedBranch && branches.length > 1 && (
        <div className={`${cardCls} p-6 text-center`}><p className="text-sm text-neutral-500">Select a branch to view the cash register</p></div>
      )}

      {/* Current Register Card */}
      {selectedBranch && !loading && (
        current && current._id ? (
          <div className={`${cardCls} p-5`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-900 font-display flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary-600" /> Current Register
                <StatusBadge status="open" styles={CASH_REGISTER_STATUS_STYLES} />
              </h3>
              <Can permission="cashRegister:close">
                <button onClick={() => { setCloseDenoms(emptyDenoms()); setShowClose(true); }} className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition flex items-center gap-2">
                  <XCircle className="h-4 w-4" /> Close Register
                </button>
              </Can>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                <p className="text-xs text-neutral-500 mb-1">Opening Balance</p>
                <p className="text-sm font-bold text-neutral-900">₹{fmtCurrency(current.openingBalance)}</p>
              </div>
              <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-200/50">
                <p className="text-xs text-emerald-600 mb-1">Cash In</p>
                <p className="text-sm font-bold text-emerald-700 flex items-center gap-1"><ArrowDownRight className="h-3.5 w-3.5" /> ₹{fmtCurrency(current.cashIn ?? current.totalCashIn)}</p>
              </div>
              <div className="bg-red-50/50 rounded-xl p-3 border border-red-200/50">
                <p className="text-xs text-red-600 mb-1">Cash Out</p>
                <p className="text-sm font-bold text-red-700 flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> ₹{fmtCurrency(current.cashOut ?? current.totalCashOut)}</p>
              </div>
              <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-200/50">
                <p className="text-xs text-blue-600 mb-1">Expected Balance</p>
                <p className="text-sm font-bold text-blue-700">₹{fmtCurrency(current.expectedBalance ?? expectedBal)}</p>
              </div>
            </div>
            {current.transactionCount != null && <p className="text-xs text-neutral-500 mt-3">{current.transactionCount} transaction{current.transactionCount !== 1 ? 's' : ''} today</p>}
          </div>
        ) : (
          <div className={`${cardCls} p-6 text-center`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
            <Receipt className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500 mb-4">No register is currently open</p>
            <Can permission="cashRegister:open">
              <button onClick={() => { setOpenDenoms(emptyDenoms()); setShowOpen(true); }} className={`${btnPrimary} inline-flex items-center gap-2`}><Plus className="h-4 w-4" /> Open Register</button>
            </Can>
          </div>
        )
      )}

      {error && <ErrorAlert message={error} />}

      {/* Register History */}
      {selectedBranch && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">Register History</h3>
            <div className="flex items-center gap-3">
              <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
              <button onClick={handleExportRegisters} disabled={registers.length === 0} className={`${btnGhost} flex items-center gap-1.5`}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
          <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
            {loading ? <Spinner /> : registers.length === 0 ? (
              <EmptyState icon={Receipt} title="No register history" message="Open your first cash register to get started" />
            ) : (
              <>
                <DataTable columns={columns} data={registers} />
                {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Variance Trends */}
      {varianceRecords.length > 0 && (
        <div style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '150ms' }}>
          <h3 className="text-sm font-semibold text-neutral-900 font-display mb-3">Variance Trends</h3>
          <div className={`${cardCls} p-5`}>
            <div className="space-y-3">
              {varianceRecords.slice(0, 10).map((r) => {
                const absVar = Math.abs(r.variance);
                const maxVar = Math.max(...varianceRecords.map((vr) => Math.abs(vr.variance)), 1);
                const pct = Math.min((absVar / maxVar) * 100, 100);
                const isNeg = r.variance < 0;
                return (
                  <div key={r._id} className="flex items-center gap-4">
                    <div className="w-28 shrink-0">
                      <p className="text-xs text-neutral-600">{new Date(r.openedAt || r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <div className="flex-1"><div className="h-2 bg-neutral-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${isNeg ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} /></div></div>
                    <span className={`text-xs font-semibold w-24 text-right ${isNeg ? 'text-red-600' : 'text-amber-600'}`}>{isNeg ? '-' : '+'}₹{fmtCurrency(absVar)}</span>
                    <StatusBadge status={r.status} styles={CASH_REGISTER_STATUS_STYLES} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Open Register Modal ──────────────────────────────── */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} title="Open Cash Register" wide>
        <form onSubmit={handleOpen} className="space-y-4">
          {branches.length > 1 && (
            <div>
              <label className={labelCls}>Branch</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} required className={selectCls + ' w-full'}>
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Count Denominations</label>
            <DenomGrid denoms={openDenoms} setDenoms={setOpenDenoms} />
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-700">Total Opening Balance</span>
            <span className="text-lg font-bold font-display text-emerald-800">₹{fmtCurrency(denomSum(openDenoms))}</span>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setShowOpen(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={opening || !selectedBranch || denomSum(openDenoms) <= 0} className={btnPrimary}>{opening ? 'Opening...' : 'Open Register'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Close Register Modal ─────────────────────────────── */}
      <Modal open={showClose} onClose={() => setShowClose(false)} title="Close Cash Register" wide>
        <form onSubmit={handleCloseSubmit} className="space-y-4">
          <p className="text-sm text-neutral-600">Count the cash denominations in the drawer.</p>
          <DenomGrid denoms={closeDenoms} setDenoms={setCloseDenoms} />
          <div className="space-y-2">
            <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-700">Counted Cash</span>
              <span className="text-lg font-bold font-display text-blue-800">₹{fmtCurrency(closeTotal)}</span>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-600">Expected Cash</span>
              <span className="text-sm font-semibold text-neutral-700">₹{fmtCurrency(expectedBal)}</span>
            </div>
            {closeTotal > 0 && (
              <div className={`rounded-xl p-3 flex items-center justify-between ${closeVariance === 0 ? 'bg-emerald-50' : Math.abs(closeVariance) > 100 ? 'bg-red-50' : 'bg-amber-50'}`}>
                <span className={`text-sm font-medium ${closeVariance === 0 ? 'text-emerald-700' : Math.abs(closeVariance) > 100 ? 'text-red-700' : 'text-amber-700'}`}>
                  {closeVariance === 0 ? 'Balanced' : closeVariance > 0 ? 'Overage' : 'Shortage'}
                </span>
                <span className={`text-sm font-bold ${closeVariance === 0 ? 'text-emerald-800' : Math.abs(closeVariance) > 100 ? 'text-red-800' : 'text-amber-800'}`}>
                  {closeVariance >= 0 ? '+' : ''}₹{fmtCurrency(closeVariance)}
                </span>
              </div>
            )}
            {Math.abs(closeVariance) > 100 && closeTotal > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <p className="text-xs text-red-700">Variance exceeds ₹100 threshold. Manager approval will be required after closing.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setShowClose(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={closing || closeTotal <= 0} className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50">{closing ? 'Closing...' : 'Close Register'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Close Confirmation ────────────────────────────────── */}
      <ConfirmDialog
        open={showCloseConfirm}
        title="Confirm Close Register"
        message={`Closing balance: ₹${fmtCurrency(closeTotal)}. Expected: ₹${fmtCurrency(expectedBal)}. Variance: ₹${fmtCurrency(closeVariance)}.${Math.abs(closeVariance) > 100 ? ' WARNING: Variance exceeds ₹100 threshold — manager approval will be required.' : ''}`}
        onConfirm={handleCloseConfirmed}
        onCancel={() => setShowCloseConfirm(false)}
        danger={Math.abs(closeVariance) > 100}
        loading={closing}
      />

      {/* ── Transaction Detail Modal ─────────────────────────── */}
      <Modal open={!!txnTarget} onClose={() => { setTxnTarget(null); setTxns([]); }} title="Register Transactions" wide>
        <div className="space-y-4">
          {txnTarget && (
            <div className="bg-neutral-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><p className="text-xs text-neutral-500">Opened</p><p className="text-sm font-semibold">{txnTarget.openedAt ? new Date(txnTarget.openedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p></div>
              <div><p className="text-xs text-neutral-500">Opened By</p><p className="text-sm font-semibold">{txnTarget.openedBy?.name || 'N/A'}</p></div>
              <div><p className="text-xs text-neutral-500">Opening Balance</p><p className="text-sm font-semibold">₹{fmtCurrency(txnTarget.openingBalance)}</p></div>
              <div><p className="text-xs text-neutral-500">Status</p><StatusBadge status={txnTarget.status} styles={CASH_REGISTER_STATUS_STYLES} /></div>
            </div>
          )}
          {txnLoading ? <Spinner /> : txns.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions" message="No payments were recorded against this register" />
          ) : (
            <>
              <DataTable columns={txnColumns} data={txns} />
              <div className="flex justify-end pt-2">
                <button onClick={handleExportTransactions} className={`${btnGhost} flex items-center gap-1.5 text-xs`}><Download className="h-3.5 w-3.5" /> Export CSV</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Reconciliation Modal ─────────────────────────────── */}
      <Modal open={!!reconTarget} onClose={() => { setReconTarget(null); setReconNotes(''); }} title="Reconcile Register">
        <div className="space-y-4">
          {reconTarget && (
            <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-neutral-600">Expected Balance</span><span className="font-semibold">₹{fmtCurrency(reconTarget.expectedBalance)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-neutral-600">Closing Balance</span><span className="font-semibold">₹{fmtCurrency(reconTarget.closingBalance)}</span></div>
              <div className={`flex justify-between text-sm pt-2 border-t border-neutral-200 font-bold ${Math.abs(reconTarget.variance ?? 0) > 100 ? 'text-red-700' : 'text-neutral-900'}`}>
                <span>Variance</span><span>₹{fmtCurrency(reconTarget.variance)}</span>
              </div>
            </div>
          )}
          {reconTarget && Math.abs(reconTarget.variance ?? 0) > 100 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-xs text-red-700">Variance exceeds ₹100 threshold. Approval notes are recommended.</p>
            </div>
          )}
          <div>
            <label className={labelCls}>Approval Notes</label>
            <textarea value={reconNotes} onChange={(e) => setReconNotes(e.target.value)} rows={3} placeholder="Notes about the variance resolution..." className={inputCls} />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button onClick={() => { setReconTarget(null); setReconNotes(''); }} className={btnGhost}>Cancel</button>
            <button onClick={handleReconcile} disabled={reconciling} className={btnPrimary}>{reconciling ? 'Reconciling...' : 'Approve & Reconcile'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Audit Log Drawer ─────────────────────────────────── */}
      <Drawer open={!!auditTarget} onClose={() => { setAuditTarget(null); setAuditLogs([]); }} title="Register Audit Log" wide>
        <div className="p-6 space-y-4">
          {auditLoading ? <Spinner /> : auditLogs.length === 0 ? (
            <EmptyState icon={FileText} title="No audit entries" message="No audit log entries found for this register" />
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log, idx) => {
                const actionColors = {
                  cash_register_opened: 'bg-blue-50 text-blue-700',
                  cash_register_closed: 'bg-amber-50 text-amber-700',
                  cash_register_reconciled: 'bg-emerald-50 text-emerald-700',
                };
                return (
                  <div key={log._id || idx} className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionColors[log.action] || 'bg-neutral-100 text-neutral-600'}`}>
                        {(log.action || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="text-xs text-neutral-500">{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-sm text-neutral-700">By: {log.actor?.name || log.actorRole || 'Unknown'}</p>
                    {log.before && Object.keys(log.before).length > 0 && (
                      <div className="mt-2 text-xs"><p className="text-neutral-500 font-medium mb-1">Before:</p><pre className="bg-white rounded-lg p-2 border text-neutral-600 overflow-x-auto text-[11px]">{JSON.stringify(log.before, null, 2)}</pre></div>
                    )}
                    {log.after && Object.keys(log.after).length > 0 && (
                      <div className="mt-2 text-xs"><p className="text-neutral-500 font-medium mb-1">After:</p><pre className="bg-white rounded-lg p-2 border text-neutral-600 overflow-x-auto text-[11px]">{JSON.stringify(log.after, null, 2)}</pre></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

/* ═══ Credit Notes Tab ═════════════════════════════ */
function CreditNotesTab() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [patients, setPatients] = useState([]);
  const [issuing, setIssuing] = useState(null);
  const [applyTarget, setApplyTarget] = useState(null);
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applying, setApplying] = useState(false);

  const REASONS = ['overpayment', 'service_issue', 'billing_error', 'goodwill', 'cancellation', 'other'];
  const emptyForm = { patient: '', invoice: '', reason: 'billing_error', items: [{ description: '', quantity: 1, unitPrice: 0 }], notes: '' };
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listCreditNotes({ page, limit, search: debouncedSearch || undefined });
      setNotes(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit, debouncedSearch]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => { listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {}); }, []);

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0 }] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, field, value) =>
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)) }));

  const creditTotal = form.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createCreditNote({ patient: form.patient, invoice: form.invoice || undefined, reason: form.reason, items: form.items.map((item) => ({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })), notes: form.notes || undefined });
      setShowCreate(false);
      setForm({ ...emptyForm });
      fetchNotes();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const handleIssue = async (note) => {
    setIssuing(note._id || note.id);
    try { await issueCreditNote(note._id || note.id); fetchNotes(); }
    catch (err) { setError(err.message); }
    finally { setIssuing(null); }
  };

  const handleApply = async () => {
    if (!applyTarget || !applyInvoiceId.trim()) return;
    setApplying(true);
    try { await applyCreditNote(applyTarget._id || applyTarget.id, { invoiceId: applyInvoiceId.trim() }); setApplyTarget(null); setApplyInvoiceId(''); fetchNotes(); }
    catch (err) { setError(err.message); }
    finally { setApplying(false); }
  };

  const columns = [
    { key: 'creditNoteNumber', label: 'CN Number', render: (row) => <span className="font-semibold text-neutral-900 font-display">{row.creditNoteNumber || '—'}</span> },
    { key: 'patient', label: 'Patient', render: (row) => <span className="text-neutral-700">{row.patient?.name || row.patientName || 'N/A'}</span> },
    { key: 'invoice', label: 'Invoice', render: (row) => <span className="text-neutral-500 text-sm">{row.invoice?.invoiceNumber || row.invoiceNumber || '-'}</span> },
    { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="font-semibold text-neutral-900">INR {(row.totalAmount ?? row.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} styles={CREDIT_NOTE_STATUS_STYLES} /> },
    { key: 'appliedAmount', label: 'Applied', render: (row) => <span className="text-neutral-500 text-sm">{row.appliedAmount != null ? `INR ${row.appliedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span> },
    { key: 'date', label: 'Date', render: (row) => <span className="text-neutral-500 text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span> },
    {
      key: 'actions', label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.status === 'draft' && <button onClick={(e) => { e.stopPropagation(); handleIssue(row); }} disabled={issuing === (row._id || row.id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition" title="Issue"><Send className="h-4 w-4" /></button>}
          {row.status === 'issued' && <button onClick={(e) => { e.stopPropagation(); setApplyTarget(row); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Apply"><CheckCircle className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <input placeholder="Search credit notes..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9 w-full sm:w-56`} />
            </div>
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
            <span className="text-sm text-neutral-500">{total} credit note{total !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }} className={`${btnPrimary} flex items-center gap-2`}><Plus className="h-4 w-4" /> New Credit Note</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : notes.length === 0 ? (
          <EmptyState icon={BookOpen} title="No credit notes" message="Create a credit note to issue credits to patients" />
        ) : (
          <>
            <DataTable columns={columns} data={notes} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      {/* Create Credit Note Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Credit Note" wide>
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Patient</label>
              <select value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} required className={inputCls}>
                <option value="">Select a patient</option>
                {patients.map((p) => <option key={p._id || p.id} value={p._id || p.id}>{p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reason</label>
              <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required className={inputCls}>
                {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div><label className={labelCls}>Linked Invoice (optional)</label><input placeholder="Invoice ID or number" value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} className={inputCls} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Items</label>
              <button type="button" onClick={addItem} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Add Item</button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                  <div className="flex-1 min-w-0"><input placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required className={inputCls} /></div>
                  <div className="w-20 shrink-0"><input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} required className={inputCls} /></div>
                  <div className="w-28 shrink-0"><input type="number" min="0" step="0.01" placeholder="Unit Price" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))} required className={inputCls} /></div>
                  <div className="w-24 shrink-0 text-right"><p className="text-sm font-semibold text-neutral-900 pt-2">{(item.quantity * item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
                  {form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition mt-0.5"><Ban className="h-4 w-4" /></button>}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2"><p className="text-sm font-semibold text-neutral-900 font-display">Total: INR {creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
          </div>
          <div><label className={labelCls}>Notes</label><input placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200"><button type="button" onClick={() => setShowCreate(false)} className={btnGhost}>Cancel</button><button type="submit" disabled={creating} className={btnPrimary}>{creating ? 'Creating...' : 'Create Credit Note'}</button></div>
        </form>
      </Modal>

      {/* Apply Credit Note Modal */}
      <Modal open={!!applyTarget} onClose={() => { setApplyTarget(null); setApplyInvoiceId(''); }} title="Apply Credit Note">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">Apply credit note <span className="font-semibold">{applyTarget?.creditNoteNumber || ''}</span> (INR {(applyTarget?.totalAmount ?? applyTarget?.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) to an invoice.</p>
          <div><label className={labelCls}>Target Invoice ID</label><input placeholder="Enter the invoice ID to apply credit to" value={applyInvoiceId} onChange={(e) => setApplyInvoiceId(e.target.value)} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={() => { setApplyTarget(null); setApplyInvoiceId(''); }} className={btnGhost}>Cancel</button><button onClick={handleApply} disabled={applying || !applyInvoiceId.trim()} className={btnPrimary}>{applying ? 'Applying...' : 'Apply Credit'}</button></div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══ Insurance Claims Tab ═════════════════════════ */
function InsuranceClaimsTab() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [patients, setPatients] = useState([]);
  const [providers, setProviders] = useState([]);

  const [form, setForm] = useState({ patient: '', provider: '', policyNumber: '', claimAmount: '', invoice: '' });

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listInsuranceClaims({ page, limit });
      setClaims(res.data || []);
      setTotal(res.meta?.total || res.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, limit]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);
  useEffect(() => {
    Promise.all([
      listPatients({ limit: 200 }).catch(() => ({ data: [] })),
      listInsuranceProviders({ limit: 100 }).catch(() => ({ data: [] })),
    ]).then(([pRes, prRes]) => { setPatients(pRes.data || []); setProviders(prRes.data || []); });
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createInsuranceClaim({ patient: form.patient, provider: form.provider, policyNumber: form.policyNumber, claimAmount: Number(form.claimAmount), invoice: form.invoice || undefined });
      setShowCreate(false);
      setForm({ patient: '', provider: '', policyNumber: '', claimAmount: '', invoice: '' });
      fetchClaims();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const CLAIM_LIFECYCLE = ['submitted', 'under_review', 'approved', 'paid'];

  const columns = [
    { key: 'claimNumber', label: 'Claim #', render: (row) => <span className="font-semibold text-neutral-900 font-display">{row.claimNumber || '—'}</span> },
    { key: 'patient', label: 'Patient', render: (row) => <span className="text-neutral-700">{row.patient?.name || row.patientName || 'N/A'}</span> },
    { key: 'provider', label: 'Provider', render: (row) => <span className="text-neutral-700">{row.provider?.name || row.providerName || 'N/A'}</span> },
    { key: 'claimAmount', label: 'Amount', render: (row) => <span className="font-semibold text-neutral-900">INR {(row.claimAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> },
    {
      key: 'status', label: 'Status',
      render: (row) => {
        const currentIdx = CLAIM_LIFECYCLE.indexOf(row.status);
        return (
          <div className="flex items-center gap-1">
            <StatusBadge status={row.status} styles={CLAIM_STATUS_STYLES} />
            {currentIdx >= 0 && currentIdx < CLAIM_LIFECYCLE.length - 1 && row.status !== 'rejected' && (
              <div className="hidden lg:flex items-center gap-0.5 ml-2">
                {CLAIM_LIFECYCLE.map((step, i) => <div key={step} className={`w-1.5 h-1.5 rounded-full transition ${i <= currentIdx ? 'bg-primary-600' : 'bg-neutral-300'}`} title={step.replace(/_/g, ' ')} />)}
              </div>
            )}
          </div>
        );
      },
    },
    { key: 'date', label: 'Date', render: (row) => <span className="text-neutral-500 text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
            <span className="text-sm text-neutral-500">{total} claim{total !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}><Plus className="h-4 w-4" /> New Claim</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : claims.length === 0 ? (
          <EmptyState icon={Shield} title="No insurance claims" message="File a new insurance claim to get started" />
        ) : (
          <>
            <DataTable columns={columns} data={claims} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Insurance Claim">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className={labelCls}>Patient</label>
            <select value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} required className={inputCls}>
              <option value="">Select a patient</option>
              {patients.map((p) => <option key={p._id || p.id} value={p._id || p.id}>{p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Insurance Provider</label>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} required className={inputCls}>
              <option value="">Select a provider</option>
              {providers.map((pr) => <option key={pr._id || pr.id} value={pr._id || pr.id}>{pr.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Policy Number</label><input placeholder="e.g. POL-12345" value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} required className={inputCls} /></div>
            <div><label className={labelCls}>Claim Amount (INR)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.claimAmount} onChange={(e) => setForm({ ...form, claimAmount: e.target.value })} required className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Linked Invoice (optional)</label><input placeholder="Invoice ID or number" value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={() => setShowCreate(false)} className={btnGhost}>Cancel</button><button type="submit" disabled={creating} className={btnPrimary}>{creating ? 'Submitting...' : 'Submit Claim'}</button></div>
        </form>
      </Modal>
    </div>
  );
}

/* ═══ Main Billing Page ════════════════════════════ */
const TABS = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'catalog', label: 'Service Catalog' },
  { key: 'register', label: 'Cash Register' },
  { key: 'credits', label: 'Credit Notes' },
  { key: 'claims', label: 'Insurance Claims' },
];

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'invoices');

  // Global-search highlight: read & clean params once
  const [highlightId] = useState(() => searchParams.get('highlight'));
  const [highlightSearch] = useState(() => searchParams.get('hsearch'));
  useEffect(() => {
    if (searchParams.get('highlight') || searchParams.get('hsearch')) {
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      next.delete('hsearch');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Billing & Finance</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage invoices, payments, and financial operations</p>
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />

      {activeTab === 'invoices' && <InvoicesTab highlightId={highlightId} highlightSearch={highlightSearch} />}
      {activeTab === 'payments' && <PaymentsTab />}
      {activeTab === 'catalog' && <ServiceCatalogTab />}
      {activeTab === 'register' && <CashRegisterTab />}
      {activeTab === 'credits' && <CreditNotesTab />}
      {activeTab === 'claims' && <InsuranceClaimsTab />}
    </div>
  );
}
