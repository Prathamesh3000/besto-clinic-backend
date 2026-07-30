import { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, Plus, Search, Eye, CheckCircle2, FileText,
  ArrowRight, X,
} from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import {
  listCreditNotes, createCreditNote, issueCreditNote, applyCreditNote,
  getCreditNote, listPatients, listInvoices,
} from '../api';
import { useToast } from '../ToastContext';

/* ---- Reusable class strings ----------------------------------- */
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

/* ---- Status helpers ------------------------------------------- */
const STATUS_STYLES = {
  draft:   { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  issued:  { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  applied: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  expired: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
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

const CREDIT_NOTE_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'applied', label: 'Applied' },
  { value: 'expired', label: 'Expired' },
];

const CREDIT_NOTE_REASONS = [
  { value: 'treatment_cancelled', label: 'Treatment Cancelled' },
  { value: 'equipment_return', label: 'Equipment Return' },
  { value: 'billing_error', label: 'Billing Error' },
  { value: 'overcharge', label: 'Overcharge' },
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'other', label: 'Other' },
];

const patientName = (p) => p?.name || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'N/A';

/* ================================================================
   CREATE CREDIT NOTE MODAL (isolated state — no parent re-renders)
   ================================================================ */
function CreateCreditNoteModal({ open, onClose, onCreated, patients }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ patient: '', originalInvoice: '', amount: '', reason: '', description: '' });
  const [patientSearch, setPatientSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [patientInvoices, setPatientInvoices] = useState([]);

  useEffect(() => {
    if (!open) {
      setForm({ patient: '', originalInvoice: '', amount: '', reason: '', description: '' });
      setPatientSearch('');
      setPatientInvoices([]);
    }
  }, [open]);

  const filteredPatients = patientSearch.trim() && !form.patient
    ? patients.filter((p) =>
        patientName(p).toLowerCase().includes(patientSearch.toLowerCase()) ||
        (p.patientId || '').toLowerCase().includes(patientSearch.toLowerCase())
      )
    : [];

  const handleSelectPatient = async (patient) => {
    setForm((f) => ({ ...f, patient: patient._id || patient.id }));
    setPatientSearch(patientName(patient));
    try {
      const res = await listInvoices({ patient: patient._id || patient.id, limit: 50 });
      setPatientInvoices(res.data?.items || res.data || []);
    } catch {
      setPatientInvoices([]);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.patient) { showToast({ type: 'error', message: 'Please select a patient' }); return; }
    if (Number(form.amount) <= 0) { showToast({ type: 'error', message: 'Please enter a valid amount' }); return; }
    if (!form.reason) { showToast({ type: 'error', message: 'Please select a reason' }); return; }
    setCreating(true);
    try {
      await createCreditNote({
        patient: form.patient,
        originalInvoice: form.originalInvoice || undefined,
        amount: Number(form.amount),
        reason: form.reason,
        description: form.description || undefined,
      });
      showToast({ type: 'success', message: 'Credit note created' });
      onCreated();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to create credit note' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Credit Note">
      <form onSubmit={handleCreate} className="space-y-5">
        {/* Patient search */}
        <div>
          <label className={labelCls}>Patient *</label>
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
                    onClick={() => handleSelectPatient(p)}
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

        {/* Original Invoice (optional) */}
        {patientInvoices.length > 0 && (
          <div>
            <label className={labelCls}>Original Invoice (optional)</label>
            <select
              value={form.originalInvoice}
              onChange={(e) => setForm((f) => ({ ...f, originalInvoice: e.target.value }))}
              className={inputCls}
            >
              <option value="">No specific invoice</option>
              {patientInvoices.map((inv) => (
                <option key={inv._id || inv.id} value={inv._id || inv.id}>
                  {inv.invoiceNumber || inv._id} — {formatCurrency(inv.totalAmount)} ({inv.status})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className={labelCls}>Credit Amount *</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="e.g. 500"
            className={inputCls}
            required
          />
        </div>

        {/* Reason */}
        <div>
          <label className={labelCls}>Reason *</label>
          <select
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className={inputCls}
            required
          >
            <option value="">Select reason...</option>
            {CREDIT_NOTE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Additional details..."
            rows={2}
            className={inputCls}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={creating} className={`${btnPrimary} flex items-center gap-2`}>
            {creating ? 'Creating...' : <><RotateCcw className="h-4 w-4" /> Create Credit Note</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================
   APPLY CREDIT NOTE MODAL (isolated state — no parent re-renders)
   ================================================================ */
function ApplyCreditNoteModal({ creditNote, onClose, onApplied }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ targetInvoice: '', amount: '' });
  const [applying, setApplying] = useState(false);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    if (creditNote) {
      setForm({ targetInvoice: '', amount: String(creditNote.remainingAmount ?? creditNote.amount ?? 0) });
      const patientId = creditNote.patient?._id || creditNote.patient;
      listInvoices({ patient: patientId, limit: 50, status: 'sent,draft,overdue,partially_paid' })
        .then((res) => setInvoices(res.data?.items || res.data || []))
        .catch(() => setInvoices([]));
    }
  }, [creditNote]);

  const handleApply = async () => {
    if (!creditNote || !form.targetInvoice) {
      showToast({ type: 'error', message: 'Please select a target invoice' }); return;
    }
    if (Number(form.amount) <= 0) {
      showToast({ type: 'error', message: 'Please enter a valid amount' }); return;
    }
    setApplying(true);
    try {
      await applyCreditNote(creditNote._id || creditNote.id, {
        targetInvoice: form.targetInvoice,
        amount: Number(form.amount),
      });
      showToast({ type: 'success', message: 'Credit note applied to invoice' });
      onApplied();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to apply credit note' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={!!creditNote} onClose={onClose} title="Apply Credit Note">
      {creditNote && (
        <div className="space-y-5">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-sm text-blue-800">
              Applying credit note <span className="font-semibold">{creditNote.creditNoteNumber || ''}</span>
              {' '}— Available: <span className="font-bold">{formatCurrency(creditNote.remainingAmount ?? creditNote.amount)}</span>
            </p>
          </div>

          <div>
            <label className={labelCls}>Target Invoice *</label>
            <select
              value={form.targetInvoice}
              onChange={(e) => setForm((f) => ({ ...f, targetInvoice: e.target.value }))}
              className={inputCls}
              required
            >
              <option value="">Select an invoice...</option>
              {invoices.map((inv) => (
                <option key={inv._id || inv.id} value={inv._id || inv.id}>
                  {inv.invoiceNumber || inv._id} — Balance: {formatCurrency((inv.totalAmount || 0) - (inv.paidAmount || 0))}
                </option>
              ))}
            </select>
            {invoices.length === 0 && (
              <p className="text-xs text-neutral-400 mt-1">No unpaid invoices found for this patient</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Amount to Apply *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={creditNote.remainingAmount ?? creditNote.amount ?? 0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputCls}
              required
            />
            <p className="text-xs text-neutral-400 mt-1">Max: {formatCurrency(creditNote.remainingAmount ?? creditNote.amount)}</p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={onClose} disabled={applying} className={btnSecondary}>Cancel</button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !form.targetInvoice || Number(form.amount) <= 0}
              className={`${btnPrimary} flex items-center gap-2`}
            >
              {applying ? 'Applying...' : <><ArrowRight className="h-4 w-4" /> Apply Credit Note</>}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BillingOfficerCreditNotes() {
  const { showToast } = useToast();

  // ---- List state ---------------------------------------------
  const [creditNotes, setCreditNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Reference data
  const [patients, setPatients] = useState([]);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [applyTarget, setApplyTarget] = useState(null);

  // Issue
  const [issuing, setIssuing] = useState(false);

  // ---- Debounce search ----------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ---- Fetch credit notes -------------------------------------
  const fetchCreditNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await listCreditNotes(params);
      const items = res.data?.items || res.data || [];
      setCreditNotes(Array.isArray(items) ? items : []);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => { fetchCreditNotes(); }, [fetchCreditNotes]);

  useEffect(() => {
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
  }, []);

  // ---- Issue --------------------------------------------------
  const handleIssue = async (cn) => {
    setIssuing(true);
    try {
      await issueCreditNote(cn._id || cn.id);
      showToast({ type: 'success', message: 'Credit note issued' });
      fetchCreditNotes();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to issue credit note' });
    } finally {
      setIssuing(false);
    }
  };

  // ---- View Detail -------------------------------------------
  const openView = async (cn) => {
    try {
      const res = await getCreditNote(cn._id || cn.id);
      setViewTarget(res.data || cn);
    } catch {
      setViewTarget(cn);
    }
  };

  // ---- Table columns -----------------------------------------
  const columns = [
    {
      key: 'creditNoteNumber', label: 'CN #',
      render: (r) => (
        <span className="font-semibold text-neutral-900 font-display">
          {r.creditNoteNumber || r._id?.slice(-6) || '—'}
        </span>
      ),
    },
    {
      key: 'patient', label: 'Patient',
      render: (r) => <span className="text-neutral-700">{patientName(r.patient)}</span>,
    },
    {
      key: 'amount', label: 'Amount',
      render: (r) => <span className="font-semibold text-neutral-900">{formatCurrency(r.amount ?? 0)}</span>,
    },
    {
      key: 'remaining', label: 'Remaining',
      render: (r) => {
        const rem = r.remainingAmount ?? r.amount ?? 0;
        return <span className={`font-medium text-sm ${rem > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{rem > 0 ? formatCurrency(rem) : 'Used'}</span>;
      },
    },
    {
      key: 'reason', label: 'Reason',
      render: (r) => <span className="text-neutral-600 text-xs capitalize">{(r.reason || 'N/A').replace(/_/g, ' ')}</span>,
    },
    {
      key: 'date', label: 'Date',
      render: (r) => <span className="text-neutral-500 text-xs">{formatDate(r.createdAt)}</span>,
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
          {r.status === 'draft' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleIssue(r); }}
              disabled={issuing}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition"
              title="Issue"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          {r.status === 'issued' && (
            <button onClick={(e) => { e.stopPropagation(); setApplyTarget(r); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Apply to Invoice">
              <ArrowRight className="h-4 w-4" />
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Credit Notes</h1>
          <p className="text-sm text-neutral-600 mt-1">Create, issue, and apply credit notes to invoices</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> Create Credit Note
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
          {CREDIT_NOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient or CN number..."
            className="h-11 w-full pl-9 pr-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* Credit Notes Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <Spinner />
        ) : creditNotes.length === 0 ? (
          <EmptyState icon={RotateCcw} title="No credit notes found" message="Adjust your filters or create a new credit note." />
        ) : (
          <>
            <DataTable columns={columns} data={creditNotes} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Create Credit Note Modal ---- */}
      <CreateCreditNoteModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchCreditNotes(); }}
        patients={patients}
      />

      {/* ---- View Credit Note Modal ---- */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Credit Note ${viewTarget?.creditNoteNumber || ''}`}>
        {viewTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-neutral-500">Patient</span><p className="font-medium text-neutral-900 mt-0.5">{patientName(viewTarget.patient)}</p></div>
              <div><span className="text-neutral-500">Status</span><div className="mt-0.5"><StatusBadge status={viewTarget.status} /></div></div>
              <div><span className="text-neutral-500">Amount</span><p className="font-semibold text-neutral-900 mt-0.5">{formatCurrency(viewTarget.amount)}</p></div>
              <div><span className="text-neutral-500">Remaining</span><p className="font-medium text-amber-600 mt-0.5">{formatCurrency(viewTarget.remainingAmount ?? viewTarget.amount)}</p></div>
              <div><span className="text-neutral-500">Reason</span><p className="font-medium text-neutral-900 mt-0.5 capitalize">{(viewTarget.reason || 'N/A').replace(/_/g, ' ')}</p></div>
              <div><span className="text-neutral-500">Created</span><p className="text-neutral-900 mt-0.5">{formatDate(viewTarget.createdAt)}</p></div>
            </div>
            {viewTarget.description && <p className="text-xs text-neutral-500 italic">{viewTarget.description}</p>}
            {viewTarget.originalInvoice && (
              <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 text-sm">
                <span className="text-neutral-500">Original Invoice: </span>
                <span className="font-medium text-neutral-900">{viewTarget.originalInvoice?.invoiceNumber || viewTarget.originalInvoice}</span>
              </div>
            )}
            {viewTarget.applications?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-600 mb-2">Applications</p>
                <div className="space-y-2">
                  {viewTarget.applications.map((app, i) => (
                    <div key={i} className="flex justify-between items-center bg-emerald-50 rounded-lg p-2 text-sm">
                      <span className="text-emerald-700">Invoice {app.invoice?.invoiceNumber || app.invoice}</span>
                      <span className="font-semibold text-emerald-800">{formatCurrency(app.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Apply Credit Note Modal ---- */}
      <ApplyCreditNoteModal
        creditNote={applyTarget}
        onClose={() => setApplyTarget(null)}
        onApplied={() => { setApplyTarget(null); fetchCreditNotes(); }}
      />
    </div>
  );
}
