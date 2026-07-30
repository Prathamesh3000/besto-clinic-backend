import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, Search, Eye, Edit3, CheckCircle2, Clock,
  FileText, IndianRupee, AlertTriangle, X,
} from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import {
  listInsuranceProviders, listInsuranceClaims,
  createInsuranceClaim, updateInsuranceClaim,
  recordPreAuth, calculateCoPay, reconcileInsuranceClaim,
  listPatients,
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
const CLAIM_STATUS_STYLES = {
  submitted:    { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  under_review: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected:     { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  settled:      { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
};

function ClaimStatusBadge({ status }) {
  const s = CLAIM_STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ---- Constants ------------------------------------------------ */
const CLAIM_STATUS_FILTER = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'settled', label: 'Settled' },
];

const UPDATE_STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'settled', label: 'Settled' },
];

const patientName = (p) => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'N/A';

const INITIAL_CLAIM = {
  patient: '',
  provider: '',
  policyNumber: '',
  claimAmount: '',
  preAuth: false,
  preAuthAmount: '',
  notes: '',
};

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BillingOfficerInsurance() {
  const { showToast } = useToast();

  // ---- List state ---------------------------------------------
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Reference data
  const [providers, setProviders] = useState([]);
  const [patients, setPatients] = useState([]);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [updateTarget, setUpdateTarget] = useState(null);
  const [reconcileTarget, setReconcileTarget] = useState(null);

  // Create form
  const [claimForm, setClaimForm] = useState({ ...INITIAL_CLAIM });
  const [patientSearchText, setPatientSearchText] = useState('');
  const [creating, setCreating] = useState(false);

  // Update form
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // Reconcile form
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [reconciling, setReconciling] = useState(false);

  // Detail modal co-pay
  const [coPay, setCoPay] = useState(null);
  const [coPayLoading, setCoPayLoading] = useState(false);

  // ---- Fetch claims -------------------------------------------
  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (providerFilter) params.provider = providerFilter;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) params.to = new Date(dateTo + 'T23:59:59').toISOString();

      const res = await listInsuranceClaims(params);
      const items = res.data?.items || res.data || [];
      setClaims(Array.isArray(items) ? items : []);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load insurance claims');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, providerFilter, dateFrom, dateTo]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  useEffect(() => {
    listInsuranceProviders().then((r) => setProviders(r.data || [])).catch(() => {});
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
  }, []);

  // ---- Patient search for create form -------------------------
  const filteredPatients = patientSearchText.trim()
    ? patients.filter((p) =>
        patientName(p).toLowerCase().includes(patientSearchText.toLowerCase()) ||
        (p.patientId || '').toLowerCase().includes(patientSearchText.toLowerCase())
      )
    : [];

  // ---- Create claim -------------------------------------------
  const handleCreateClaim = async (e) => {
    e.preventDefault();
    if (!claimForm.patient) { showToast({ type: 'error', message: 'Please select a patient' }); return; }
    if (!claimForm.provider) { showToast({ type: 'error', message: 'Please select an insurance provider' }); return; }
    if (!claimForm.claimAmount || Number(claimForm.claimAmount) <= 0) { showToast({ type: 'error', message: 'Please enter a valid claim amount' }); return; }

    setCreating(true);
    try {
      const data = {
        patient: claimForm.patient,
        provider: claimForm.provider,
        policyNumber: claimForm.policyNumber,
        claimAmount: Number(claimForm.claimAmount),
        notes: claimForm.notes || undefined,
      };

      const createRes = await createInsuranceClaim(data);
      const createdClaim = createRes.data || createRes;

      // If pre-auth, also record pre-auth using the new claim's ID
      if (claimForm.preAuth && claimForm.preAuthAmount && (createdClaim._id || createdClaim.id)) {
        try {
          await recordPreAuth(createdClaim._id || createdClaim.id, {
            amount: Number(claimForm.preAuthAmount),
          });
        } catch {
          // Pre-auth is optional, don't block the claim creation
        }
      }

      showToast({ type: 'success', message: 'Insurance claim created' });
      setShowCreate(false);
      setClaimForm({ ...INITIAL_CLAIM });
      setPatientSearchText('');
      fetchClaims();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to create claim' });
    } finally {
      setCreating(false);
    }
  };

  // ---- Update status ------------------------------------------
  const openUpdate = (claim) => {
    setUpdateTarget(claim);
    setUpdateStatus(claim.status || '');
    setUpdateNotes('');
  };

  const handleUpdate = async () => {
    if (!updateTarget || !updateStatus) return;
    setUpdating(true);
    try {
      await updateInsuranceClaim(updateTarget._id || updateTarget.id, {
        status: updateStatus,
        notes: updateNotes || undefined,
      });
      showToast({ type: 'success', message: 'Claim status updated' });
      setUpdateTarget(null);
      fetchClaims();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to update claim' });
    } finally {
      setUpdating(false);
    }
  };

  // ---- Reconcile ----------------------------------------------
  const openReconcile = (claim) => {
    setReconcileTarget(claim);
    setReconcileAmount(String(claim.approvedAmount ?? claim.claimAmount ?? ''));
    setReconcileNotes('');
  };

  const handleReconcile = async () => {
    if (!reconcileTarget || !reconcileAmount) return;
    setReconciling(true);
    try {
      await reconcileInsuranceClaim(reconcileTarget._id || reconcileTarget.id, {
        settledAmount: Number(reconcileAmount),
        notes: reconcileNotes || undefined,
      });
      showToast({ type: 'success', message: 'Claim reconciled successfully' });
      setReconcileTarget(null);
      fetchClaims();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to reconcile claim' });
    } finally {
      setReconciling(false);
    }
  };

  // ---- View detail + co-pay -----------------------------------
  const openView = async (claim) => {
    setViewTarget(claim);
    setCoPay(null);
    setCoPayLoading(true);
    try {
      const claimId = claim._id || claim.id;
      const res = await calculateCoPay(claimId);
      setCoPay(res.data || null);
    } catch {
      setCoPay(null);
    } finally {
      setCoPayLoading(false);
    }
  };

  // ---- Table columns ------------------------------------------
  const columns = [
    {
      key: 'claimNumber', label: 'Claim #',
      render: (r) => (
        <span className="font-semibold text-neutral-900 font-display">
          {r.claimNumber || '—'}
        </span>
      ),
    },
    {
      key: 'patient', label: 'Patient',
      render: (r) => <span className="text-neutral-700">{r.patient?.name || r.patientName || 'N/A'}</span>,
    },
    {
      key: 'provider', label: 'Provider',
      render: (r) => <span className="text-neutral-700">{r.provider?.name || r.providerName || 'N/A'}</span>,
    },
    {
      key: 'amount', label: 'Amount',
      render: (r) => <span className="font-semibold text-neutral-900">{formatCurrency(r.claimAmount ?? r.amount ?? 0)}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <ClaimStatusBadge status={r.status} />,
    },
    {
      key: 'submitted', label: 'Submitted',
      render: (r) => <span className="text-neutral-500 text-xs">{formatDate(r.submittedAt || r.createdAt)}</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openView(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openUpdate(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-amber-600 transition" title="Update Status">
            <Edit3 className="h-4 w-4" />
          </button>
          {r.status === 'approved' && (
            <button onClick={(e) => { e.stopPropagation(); openReconcile(r); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Reconcile">
              <CheckCircle2 className="h-4 w-4" />
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
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Insurance Claims</h1>
          <p className="text-sm text-neutral-600 mt-1">Manage insurance claims, pre-authorizations, and reconciliation</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="h-4 w-4" /> New Claim
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
          {CLAIM_STATUS_FILTER.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        />
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <Spinner />
        ) : claims.length === 0 ? (
          <EmptyState icon={Shield} title="No insurance claims found" message="Adjust your filters or create a new claim." />
        ) : (
          <>
            <DataTable columns={columns} data={claims} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Create Claim Modal ---- */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Insurance Claim" size="lg">
        <form onSubmit={handleCreateClaim} className="space-y-5">
          {/* Patient search */}
          <div>
            <label className={labelCls}>Patient</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search patient by name or ID..."
                value={patientSearchText}
                onChange={(e) => { setPatientSearchText(e.target.value); setClaimForm((f) => ({ ...f, patient: '' })); }}
                className={`${inputCls} pl-9`}
              />
            </div>
            {claimForm.patient && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">
                Selected: {patients.find((p) => (p._id || p.id) === claimForm.patient)?.name || 'Patient'}
              </p>
            )}
            {patientSearchText.trim() && !claimForm.patient && (
              <div className="mt-2 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
                {filteredPatients.length === 0 ? (
                  <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
                ) : (
                  filteredPatients.slice(0, 10).map((p) => (
                    <button
                      key={p._id || p.id}
                      type="button"
                      onClick={() => { setClaimForm((f) => ({ ...f, patient: p._id || p.id })); setPatientSearchText(patientName(p)); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition flex items-center justify-between"
                    >
                      <span className="text-neutral-900">{patientName(p)}</span>
                      {p.patientId && <span className="text-xs text-neutral-400">{p.patientId}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className={labelCls}>Insurance Provider</label>
            <select
              value={claimForm.provider}
              onChange={(e) => setClaimForm({ ...claimForm, provider: e.target.value })}
              required
              className={inputCls}
            >
              <option value="">Select provider</option>
              {providers.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Policy number */}
          <div>
            <label className={labelCls}>Policy Number</label>
            <input
              type="text"
              placeholder="Enter policy number"
              value={claimForm.policyNumber}
              onChange={(e) => setClaimForm({ ...claimForm, policyNumber: e.target.value })}
              required
              className={inputCls}
            />
          </div>

          {/* Claim amount */}
          <div>
            <label className={labelCls}>Claim Amount</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Enter claim amount"
              value={claimForm.claimAmount}
              onChange={(e) => setClaimForm({ ...claimForm, claimAmount: e.target.value })}
              required
              className={inputCls}
            />
          </div>

          {/* Pre-auth checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="preAuth"
              checked={claimForm.preAuth}
              onChange={(e) => setClaimForm({ ...claimForm, preAuth: e.target.checked })}
              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-400"
            />
            <label htmlFor="preAuth" className="text-sm text-neutral-700 font-medium">Requires Pre-Authorization</label>
          </div>

          {claimForm.preAuth && (
            <div>
              <label className={labelCls}>Pre-Auth Amount</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Pre-authorization amount"
                value={claimForm.preAuthAmount}
                onChange={(e) => setClaimForm({ ...claimForm, preAuthAmount: e.target.value })}
                className={inputCls}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              placeholder="Additional notes about this claim..."
              value={claimForm.notes}
              onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
              rows={3}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={creating} className={`${btnPrimary} flex items-center gap-2`}>
              {creating ? 'Submitting...' : <><Shield className="h-4 w-4" /> Submit Claim</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- View Claim Detail Modal ---- */}
      <Modal open={!!viewTarget} onClose={() => { setViewTarget(null); setCoPay(null); }} title={`Claim ${viewTarget?.claimNumber || ''}`} size="lg">
        {viewTarget && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-neutral-500">Patient</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.patient?.name || viewTarget.patientName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Provider</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.provider?.name || viewTarget.providerName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Status</span>
                <div className="mt-0.5"><ClaimStatusBadge status={viewTarget.status} /></div>
              </div>
              <div>
                <span className="text-neutral-500">Policy Number</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.policyNumber || 'N/A'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Claim Amount</span>
                <p className="font-semibold text-neutral-900 mt-0.5">{formatCurrency(viewTarget.claimAmount ?? viewTarget.amount ?? 0)}</p>
              </div>
              <div>
                <span className="text-neutral-500">Submitted</span>
                <p className="text-neutral-900 mt-0.5">{formatDate(viewTarget.submittedAt || viewTarget.createdAt)}</p>
              </div>
              {viewTarget.approvedAmount != null && (
                <div>
                  <span className="text-neutral-500">Approved Amount</span>
                  <p className="font-semibold text-emerald-600 mt-0.5">{formatCurrency(viewTarget.approvedAmount)}</p>
                </div>
              )}
              {viewTarget.settledAmount != null && (
                <div>
                  <span className="text-neutral-500">Settled Amount</span>
                  <p className="font-semibold text-emerald-600 mt-0.5">{formatCurrency(viewTarget.settledAmount)}</p>
                </div>
              )}
            </div>

            {viewTarget.notes && (
              <div>
                <span className="text-xs text-neutral-500">Notes</span>
                <p className="text-sm text-neutral-700 mt-0.5">{viewTarget.notes}</p>
              </div>
            )}

            {/* History */}
            {viewTarget.history?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-neutral-900/50 mb-2">Claim History</h4>
                <div className="space-y-2">
                  {viewTarget.history.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
                      <Clock className="h-4 w-4 text-neutral-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-700">{h.description || h.action || `Status changed to ${h.status}`}</p>
                        <p className="text-[10px] text-neutral-400">{formatDate(h.date || h.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Co-pay calculation */}
            <div className="border-t border-neutral-200 pt-4">
              <h4 className="text-xs font-semibold text-neutral-900/50 mb-2">Co-Pay Calculation</h4>
              {coPayLoading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-400"><Clock className="h-4 w-4 animate-spin" /> Calculating...</div>
              ) : coPay ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-600 font-medium">Insurance Covers</p>
                    <p className="text-lg font-bold font-display text-blue-700 mt-1">{formatCurrency(coPay.insuranceAmount ?? coPay.covered ?? 0)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-amber-600 font-medium">Patient Co-Pay</p>
                    <p className="text-lg font-bold font-display text-amber-700 mt-1">{formatCurrency(coPay.patientAmount ?? coPay.coPay ?? 0)}</p>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-neutral-600 font-medium">Co-Pay %</p>
                    <p className="text-lg font-bold font-display text-neutral-700 mt-1">{coPay.coPayPercent ?? coPay.percentage ?? 0}%</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">Co-pay data unavailable</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Update Status Modal ---- */}
      <Modal open={!!updateTarget} onClose={() => setUpdateTarget(null)} title={`Update Claim ${updateTarget?.claimNumber || ''}`}>
        {updateTarget && (
          <div className="space-y-5">
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Current Status</span>
                <ClaimStatusBadge status={updateTarget.status} />
              </div>
            </div>
            <div>
              <label className={labelCls}>New Status</label>
              <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value)} className={inputCls}>
                {UPDATE_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea value={updateNotes} onChange={(e) => setUpdateNotes(e.target.value)} rows={3} placeholder="Add a note about this status change..." className={inputCls} />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setUpdateTarget(null)} disabled={updating} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleUpdate} disabled={updating || !updateStatus} className={`${btnPrimary} flex items-center gap-2`}>
                {updating ? 'Updating...' : <><Edit3 className="h-4 w-4" /> Update Status</>}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Reconcile Modal ---- */}
      <Modal open={!!reconcileTarget} onClose={() => setReconcileTarget(null)} title={`Reconcile Claim ${reconcileTarget?.claimNumber || ''}`}>
        {reconcileTarget && (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Reconcile approved claim</p>
                  <p className="text-sm text-emerald-700 mt-1">
                    Original claim amount: <span className="font-semibold">{formatCurrency(reconcileTarget.claimAmount ?? 0)}</span>
                    {reconcileTarget.approvedAmount != null && (
                      <> | Approved: <span className="font-semibold">{formatCurrency(reconcileTarget.approvedAmount)}</span></>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Settled Amount</label>
              <input
                type="number"
                min="0"
                step="1"
                value={reconcileAmount}
                onChange={(e) => setReconcileAmount(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea value={reconcileNotes} onChange={(e) => setReconcileNotes(e.target.value)} rows={2} placeholder="Settlement reference or notes..." className={inputCls} />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setReconcileTarget(null)} disabled={reconciling} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleReconcile} disabled={reconciling || !reconcileAmount} className={`${btnPrimary} flex items-center gap-2`}>
                {reconciling ? 'Reconciling...' : <><CheckCircle2 className="h-4 w-4" /> Reconcile</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
