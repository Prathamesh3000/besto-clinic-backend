import { useState, useEffect, useCallback } from 'react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner,
  ErrorAlert, TabBar,
} from '../../platform/components/shared';
import {
  listInsuranceProviders, listInsuranceClaims,
  createInsuranceClaim, updateInsuranceClaim,
} from '../api';
import {
  Shield, Plus, Search, Building2, Phone, Mail,
  FileText, DollarSign, Calendar, User, Eye,
  CheckCircle2, XCircle, Clock, AlertTriangle, Hash,
} from 'lucide-react';

/* ─── Design tokens ─────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ─── Constants ─────────────────────────────────── */
const TABS = [
  { key: 'providers', label: 'Providers' },
  { key: 'claims', label: 'Claims' },
];

const CLAIM_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_approved', label: 'Partially Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'paid', label: 'Paid' },
];

const CLAIM_STATUS_COLORS = {
  pending:            { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  submitted:          { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  under_review:       { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  approved:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  partially_approved: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  rejected:           { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  paid:               { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const PROVIDER_STATUS_COLORS = {
  active:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' },
};

const INITIAL_CLAIM = { patient: '', provider: '', policyNumber: '', claimAmount: '', diagnosis: '', notes: '' };

/* ─── Helpers ───────────────────────────────────── */
function ClaimStatusBadge({ status }) {
  const s = CLAIM_STATUS_COLORS[status] || { bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {(status || 'N/A').replace(/_/g, ' ')}
    </span>
  );
}

function ProviderStatusBadge({ status }) {
  const s = PROVIDER_STATUS_COLORS[status] || PROVIDER_STATUS_COLORS.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {(status || 'N/A').replace(/_/g, ' ')}
    </span>
  );
}

const formatCurrency = (n) => {
  const val = Number(n) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
};

const formatDate = (d) => {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
};

function PageSizeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={selectCls}>
      {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
    </select>
  );
}

/* ═══ Main Component ═══════════════════════════════ */
export default function InsuranceManagement() {
  const [tab, setTab] = useState('providers');

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 font-display">Insurance Management</h1>
        <p className="text-sm text-neutral-500 mt-1">Manage insurance providers and process claims</p>
      </div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'claims' && <ClaimsTab />}
    </div>
  );
}

/**
 * InsuranceProvider.address is a nested object ({street, city, state, zipCode,
 * country}), not a string. Rendering it directly threw "Objects are not valid
 * as a React child", and with no error boundary that blanked the entire app —
 * which is what the "view icon opens a white page" report was.
 */
function formatAddress(address) {
  if (!address) return '--';
  if (typeof address === 'string') return address || '--';
  const parts = [address.street, address.city, address.state, address.zipCode, address.country]
    .filter(Boolean);
  return parts.length ? parts.join(', ') : '--';
}

/* ═══ Providers Tab ════════════════════════════════ */
function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { sort: sortKey, order: sortDir };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await listInsuranceProviders(params);
      setProviders(res.data || res.providers || []);
    } catch (err) { setError(err.message || 'Failed to load insurance providers'); }
    finally { setLoading(false); }
  }, [debouncedSearch, sortKey, sortDir]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0"><Shield className="h-4 w-4 text-primary-600" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{row.name}</p>
            {row.code && <p className="text-[11px] text-neutral-400">{row.code}</p>}
          </div>
        </div>
      ),
    },
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="text-xs font-mono text-neutral-500 bg-neutral-50 px-2 py-1 rounded-lg">{row.code || '--'}</span> },
    {
      key: 'contact', label: 'Contact',
      render: (row) => {
        const email = row.contactEmail || row.email;
        return email ? <span className="text-xs text-neutral-600 flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" /> {email}</span> : <span className="text-xs text-neutral-400">--</span>;
      },
    },
    { key: 'phone', label: 'Phone', render: (row) => <span className="text-xs text-neutral-600 flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> {row.phone || row.contactPhone || '--'}</span> },
    {
      key: 'plans', label: 'Plans',
      render: (row) => {
        const count = row.plans?.length || row.plansCount || 0;
        return <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700"><FileText className="h-3 w-3" /> {count} {count === 1 ? 'plan' : 'plans'}</span>;
      },
    },
    { key: 'status', label: 'Status', sortable: true, render: (row) => <ProviderStatusBadge status={row.status || (row.isActive !== false ? 'active' : 'inactive')} /> },
    {
      key: 'actions', label: '',
      render: (row) => <button onClick={(e) => { e.stopPropagation(); setViewItem(row); setViewOpen(true); }} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View details"><Eye className="h-4 w-4" /></button>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className={`${cardCls} p-4`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '50ms' }}>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search providers..." className={`${inputCls} pl-9`} />
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '100ms' }}>
        {loading ? <Spinner /> : providers.length === 0 ? (
          <EmptyState icon={Shield} title="No insurance providers found" message={search ? 'Try adjusting your search' : 'No insurance providers have been configured yet'} />
        ) : (
          <DataTable columns={columns} data={providers} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        )}
      </div>

      {/* Provider Detail Modal */}
      <Modal open={viewOpen} onClose={() => { setViewOpen(false); setViewItem(null); }} title="Provider Details" wide>
        {viewItem && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center"><Shield className="h-6 w-6 text-primary-600" /></div>
              <div>
                <p className="text-lg font-semibold text-neutral-900 font-display">{viewItem.name}</p>
                {viewItem.code && <p className="text-xs font-mono text-neutral-400 mt-0.5">{viewItem.code}</p>}
              </div>
              <div className="ml-auto"><ProviderStatusBadge status={viewItem.status || (viewItem.isActive !== false ? 'active' : 'inactive')} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-sm text-neutral-600 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {viewItem.contactEmail || viewItem.email || '--'}</p>
              </div>
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-sm text-neutral-600 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {viewItem.phone || viewItem.contactPhone || '--'}</p>
              </div>
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Address</p>
                <p className="text-sm text-neutral-600">{formatAddress(viewItem.address)}</p>
              </div>
              <div className="bg-neutral-50 rounded-xl p-4">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Plans</p>
                <p className="text-sm text-neutral-600">{viewItem.plans?.length || viewItem.plansCount || 0} plan(s)</p>
              </div>
            </div>

            {viewItem.plans && viewItem.plans.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 font-display mb-3">Insurance Plans</h4>
                <div className="space-y-2">
                  {viewItem.plans.map((plan, i) => (
                    <div key={i} className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{plan.name || plan}</p>
                        {plan.description && <p className="text-xs text-neutral-400 mt-0.5">{plan.description}</p>}
                      </div>
                      {plan.coveragePercentage && <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg">{plan.coveragePercentage}% coverage</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button onClick={() => { setViewOpen(false); setViewItem(null); }} className={btnGhost}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══ Claims Tab ═══════════════════════════════════ */
function ClaimsTab() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [providers, setProviders] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_CLAIM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit, sort: sortKey, order: sortDir };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      const res = await listInsuranceClaims(params);
      setClaims(res.data || res.claims || []);
      setTotal(res.meta?.total ?? res.total ?? 0);
    } catch (err) { setError(err.message || 'Failed to load insurance claims'); }
    finally { setLoading(false); }
  }, [page, limit, debouncedSearch, statusFilter, sortKey, sortDir]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  useEffect(() => {
    (async () => {
      try { const res = await listInsuranceProviders({ limit: 100 }); setProviders(res.data || res.providers || []); }
      catch { /* non-critical */ }
    })();
  }, []);

  /* Stats derived from current page data */
  const pendingCount = claims.filter((c) => ['pending', 'submitted', 'under_review'].includes(c.status)).length;
  const approvedCount = claims.filter((c) => ['approved', 'partially_approved', 'paid'].includes(c.status)).length;
  const rejectedCount = claims.filter((c) => c.status === 'rejected').length;
  const totalClaimAmt = claims.reduce((s, c) => s + (c.claimAmount || 0), 0);

  const STAT_CFG = [
    { title: 'Total Claims', value: total, icon: FileText },
    { title: 'Pending', value: pendingCount, icon: Clock },
    { title: 'Approved / Paid', value: approvedCount, icon: CheckCircle2 },
    { title: 'Rejected', value: rejectedCount, icon: XCircle },
  ];
  const PAL = [
    { icon: 'bg-primary-100 text-primary-600', value: 'text-primary-700' },
    { icon: 'bg-amber-100 text-amber-600', value: 'text-amber-700' },
    { icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
    { icon: 'bg-red-100 text-red-600', value: 'text-red-700' },
  ];

  const openCreate = () => { setForm(INITIAL_CLAIM); setFormError(''); setCreateOpen(true); };
  const closeCreate = () => { setCreateOpen(false); setForm(INITIAL_CLAIM); setFormError(''); };
  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.patient.trim()) { setFormError('Patient is required.'); return; }
    if (!form.provider) { setFormError('Insurance provider is required.'); return; }
    if (!form.policyNumber.trim()) { setFormError('Policy number is required.'); return; }
    if (!form.claimAmount || Number(form.claimAmount) <= 0) { setFormError('A valid claim amount is required.'); return; }

    try {
      setSaving(true);
      await createInsuranceClaim({ patient: form.patient, provider: form.provider, policyNumber: form.policyNumber, claimAmount: Number(form.claimAmount), diagnosis: form.diagnosis || undefined, notes: form.notes || undefined });
      closeCreate();
      fetchClaims();
    } catch (err) { setFormError(err.message || 'Failed to create claim'); }
    finally { setSaving(false); }
  };

  const columns = [
    {
      key: 'patient', label: 'Patient', sortable: true,
      render: (row) => <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-neutral-400 shrink-0" /><span className="text-sm font-medium text-neutral-900 truncate">{row.patient?.name || row.patientName || row.patient || '--'}</span></div>,
    },
    { key: 'provider', label: 'Provider', render: (row) => <span className="text-xs text-neutral-600 flex items-center gap-1.5"><Shield className="h-3 w-3 shrink-0" />{row.provider?.name || row.providerName || '--'}</span> },
    { key: 'policyNumber', label: 'Policy #', render: (row) => <span className="text-xs font-mono text-neutral-500 bg-neutral-50 px-2 py-1 rounded-lg flex items-center gap-1 w-fit"><Hash className="h-3 w-3" /> {row.policyNumber || '--'}</span> },
    { key: 'claimAmount', label: 'Claim Amount', sortable: true, render: (row) => <span className="text-sm font-semibold text-neutral-900">{formatCurrency(row.claimAmount)}</span> },
    { key: 'approvedAmount', label: 'Approved', sortable: true, render: (row) => <span className="text-sm text-neutral-600">{row.approvedAmount != null ? formatCurrency(row.approvedAmount) : '--'}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: 'createdAt', label: 'Date', sortable: true, render: (row) => <span className="text-xs text-neutral-500 flex items-center gap-1.5"><Calendar className="h-3 w-3 shrink-0" /> {formatDate(row.createdAt || row.date)}</span> },
    {
      key: 'actions', label: '',
      render: (row) => <button onClick={(e) => { e.stopPropagation(); setViewItem(row); setViewOpen(true); }} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View details"><Eye className="h-4 w-4" /></button>,
    },
  ];

  /* Claim lifecycle visual */
  const ClaimLifecycle = ({ currentStatus }) => {
    const steps = ['pending', 'submitted', 'under_review', 'approved', 'paid'];
    const currentIdx = steps.indexOf(currentStatus);
    const isRejected = currentStatus === 'rejected';
    const isPartial = currentStatus === 'partially_approved';

    return (
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {steps.map((step, i) => {
          let state = 'upcoming';
          if (isRejected && i >= 3) state = 'rejected';
          else if (isPartial && i === 3) state = 'partial';
          else if (i < currentIdx || (i === currentIdx && !isRejected)) state = 'done';
          else if (i === currentIdx) state = 'current';

          const colors = { done: 'bg-emerald-500 text-white', current: 'bg-primary-500 text-white ring-2 ring-primary-200', partial: 'bg-teal-500 text-white', rejected: 'bg-red-500 text-white', upcoming: 'bg-neutral-200 text-neutral-400' };
          const lineColor = state === 'done' ? 'bg-emerald-400' : 'bg-neutral-200';

          return (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${colors[state]}`}>{i + 1}</div>
                <span className="text-[10px] text-neutral-400 capitalize whitespace-nowrap">{step.replace(/_/g, ' ')}</span>
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-0.5 mx-1 mt-[-16px] ${lineColor}`} />}
            </div>
          );
        })}
        {isRejected && (
          <div className="flex flex-col items-center gap-1 ml-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-500 text-white"><XCircle className="h-3.5 w-3.5" /></div>
            <span className="text-[10px] text-red-600 font-medium">Rejected</span>
          </div>
        )}
      </div>
    );
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search claims..." className={`${inputCls} pl-9`} />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
            {CLAIM_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <PageSizeSelect value={limit} onChange={(v) => { setLimit(v); setPage(1); }} />
          <button onClick={openCreate} className={`${btnPrimary} flex items-center gap-2 whitespace-nowrap`}><Plus className="h-4 w-4" /> New Claim</button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className={`${cardCls} overflow-hidden`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: '300ms' }}>
        {loading ? <Spinner /> : claims.length === 0 ? (
          <EmptyState icon={FileText} title="No insurance claims found" message={search || statusFilter ? 'Try adjusting your filters' : 'Submit your first insurance claim to get started'} />
        ) : (
          <>
            <DataTable columns={columns} data={claims} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
          </>
        )}
      </div>

      {/* New Claim Modal */}
      <Modal open={createOpen} onClose={closeCreate} title="New Insurance Claim">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{formError}</div>}
          <div><label className={labelCls}>Patient *</label><input type="text" value={form.patient} onChange={handleChange('patient')} className={inputCls} placeholder="Patient name or ID" required /></div>
          <div><label className={labelCls}>Insurance Provider *</label><select value={form.provider} onChange={handleChange('provider')} className={inputCls} required><option value="">Select provider...</option>{providers.map((p) => <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>)}</select></div>
          <div><label className={labelCls}>Policy Number *</label><input type="text" value={form.policyNumber} onChange={handleChange('policyNumber')} className={inputCls} placeholder="e.g. POL-2024-12345" required /></div>
          <div><label className={labelCls}>Claim Amount (INR) *</label><input type="number" min="0" step="0.01" value={form.claimAmount} onChange={handleChange('claimAmount')} className={inputCls} placeholder="0.00" required /></div>
          <div><label className={labelCls}>Diagnosis</label><input type="text" value={form.diagnosis} onChange={handleChange('diagnosis')} className={inputCls} placeholder="Primary diagnosis" /></div>
          <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={handleChange('notes')} rows={3} className={`${inputCls} resize-none`} placeholder="Additional notes..." /></div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200"><button type="button" onClick={closeCreate} className={btnGhost}>Cancel</button><button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Submitting...' : 'Submit Claim'}</button></div>
        </form>
      </Modal>

      {/* Claim Detail Modal */}
      <Modal open={viewOpen} onClose={() => { setViewOpen(false); setViewItem(null); }} title="Claim Details" wide>
        {viewItem && (
          <div className="space-y-5">
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">Claim Progress</p>
              <ClaimLifecycle currentStatus={viewItem.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Patient</p><p className="text-sm font-medium text-neutral-900 flex items-center gap-2"><User className="h-4 w-4 text-neutral-400" />{viewItem.patient?.name || viewItem.patientName || viewItem.patient || '--'}</p></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Provider</p><p className="text-sm font-medium text-neutral-900 flex items-center gap-2"><Shield className="h-4 w-4 text-neutral-400" />{viewItem.provider?.name || viewItem.providerName || '--'}</p></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Policy Number</p><p className="text-sm font-mono text-neutral-600">{viewItem.policyNumber || '--'}</p></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Status</p><ClaimStatusBadge status={viewItem.status} /></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Claim Amount</p><p className="text-lg font-bold text-neutral-900 font-display">{formatCurrency(viewItem.claimAmount)}</p></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Approved Amount</p><p className={`text-lg font-bold font-display ${viewItem.approvedAmount != null ? 'text-emerald-700' : 'text-neutral-400'}`}>{viewItem.approvedAmount != null ? formatCurrency(viewItem.approvedAmount) : 'Pending'}</p></div>
              <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Submitted</p><p className="text-sm text-neutral-600 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDate(viewItem.createdAt || viewItem.date)}</p></div>
              {viewItem.diagnosis && <div className="bg-neutral-50 rounded-xl p-4"><p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Diagnosis</p><p className="text-sm text-neutral-600">{viewItem.diagnosis}</p></div>}
            </div>

            {viewItem.notes && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 font-display mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-neutral-400" /> Notes</h4>
                <p className="text-sm text-neutral-600 bg-neutral-50 rounded-xl p-4 border border-neutral-200">{viewItem.notes}</p>
              </div>
            )}

            {viewItem.status === 'rejected' && viewItem.rejectionReason && (
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-red-600" /><p className="text-sm font-semibold text-red-700">Rejection Reason</p></div>
                <p className="text-sm text-red-600">{viewItem.rejectionReason}</p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button onClick={() => { setViewOpen(false); setViewItem(null); }} className={btnGhost}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
