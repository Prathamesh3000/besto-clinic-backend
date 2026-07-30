import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Plus, Phone, Mail, Calendar, CreditCard,
  UserPlus, MapPin, CheckCircle2, Activity,
} from 'lucide-react';
import {
  Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState,
} from '../../platform/components/shared';
import { listPatients, createPatient, getPatient, listAppointments, listInvoices } from '../api';
import { useToast } from '../ToastContext';

// ─── Design tokens ──────────────────────────────────
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

const PAGE_SIZES = [10, 20, 50];

const GENDER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const STAT_CONFIG = [
  { key: 'total', title: 'Total Patients', icon: Users, color: 'primary' },
  { key: 'male', title: 'Male', icon: Activity, color: 'blue' },
  { key: 'female', title: 'Female', icon: Activity, color: 'purple' },
  { key: 'recent', title: 'Registered This Month', icon: CheckCircle2, color: 'green' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50', iconText: 'text-primary-600' },
  green: { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
  purple: { iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
};

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const GENDER_BADGE = {
  male: 'bg-blue-50 text-blue-700',
  female: 'bg-pink-50 text-pink-700',
  other: 'bg-purple-50 text-purple-700',
};

const STATUS_COLORS = {
  confirmed: 'bg-primary-50 text-primary-700',
  completed: 'bg-secondary-50 text-secondary-700',
  cancelled: 'bg-red-50 text-red-600',
  requested: 'bg-amber-50 text-amber-700',
  checked_in: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-purple-50 text-purple-700',
  no_show: 'bg-neutral-100 text-neutral-500',
  draft: 'bg-neutral-100 text-neutral-600',
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-secondary-50 text-secondary-700',
  overdue: 'bg-red-50 text-red-600',
};

const DETAIL_TABS = [
  { key: 'info', label: 'Info' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'invoices', label: 'Invoices' },
];

const AVATAR_COLORS = [
  'from-primary-100 to-primary-200 text-primary-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-rose-100 to-rose-200 text-rose-700',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', dateOfBirth: '', gender: 'male',
  address: { street: '', city: '', state: '' },
  emergencyContact: { name: '', phone: '' },
};

// ─── StatusBadge (inline) ───────────────────────────
function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-neutral-100 text-neutral-500';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {(status || 'n/a').replace(/_/g, ' ')}
    </span>
  );
}

// ─── Detail: Info Tab ───────────────────────────────
function InfoTab({ patient }) {
  const items = [
    { label: 'Full Name', value: patient.name },
    { label: 'Phone', value: patient.phone },
    { label: 'Email', value: patient.email },
    { label: 'Date of Birth', value: patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null },
    { label: 'Gender', value: patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null },
  ];
  const addr = patient.address;
  const addrStr = addr ? [addr.street, addr.city, addr.state].filter(Boolean).join(', ') : null;
  if (addrStr) items.push({ label: 'Address', value: addrStr });
  const ec = patient.emergencyContact;
  if (ec?.name) items.push({ label: 'Emergency Contact', value: `${ec.name}${ec.phone ? ` — ${ec.phone}` : ''}` });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map((item, i) => (
        <div key={i} className="bg-neutral-50 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">{item.label}</p>
          <p className="text-sm text-neutral-700 capitalize">{item.value || '--'}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Detail: Appointments Tab ───────────────────────
function AppointmentsTab({ appointments, loading }) {
  if (loading) return <Spinner />;
  if (!appointments.length) return <EmptyState icon={Calendar} title="No appointments" message="No recent appointments found" />;
  return (
    <div className="space-y-2">
      {appointments.map((a) => (
        <div key={a._id || a.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-800 truncate">{a.doctorName || a.doctor?.name || 'Doctor'}</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {a.scheduledAt || a.date ? new Date(a.scheduledAt || a.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
              {a.type ? ` · ${a.type.replace(/_/g, ' ')}` : ''}
            </p>
          </div>
          <StatusBadge status={a.status} />
        </div>
      ))}
    </div>
  );
}

// ─── Detail: Invoices Tab ───────────────────────────
function InvoicesTab({ invoices, loading }) {
  if (loading) return <Spinner />;
  if (!invoices.length) return <EmptyState icon={CreditCard} title="No invoices" message="No recent invoices found" />;
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <div key={inv._id || inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-800">{inv.invoiceNumber || '—'}</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold text-neutral-800">{inv.totalAmount != null ? `$${Number(inv.totalAmount).toFixed(2)}` : '--'}</span>
            <StatusBadge status={inv.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
export default function ReceptionistPatients() {
  const { showToast } = useToast();

  // ─── List state ──────────────────────────────
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Stats ───────────────────────────────────
  const [counts, setCounts] = useState({ total: 0, male: 0, female: 0, recent: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Register modal ──────────────────────────
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ─── Detail modal ────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPatient, setDetailPatient] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [patientAppts, setPatientAppts] = useState([]);
  const [patientInvoices, setPatientInvoices] = useState([]);
  const [detailTab, setDetailTab] = useState('info');

  // ─── Debounced search ────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── Fetch patients ──────────────────────────
  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit, sort: sortKey, order: sortDir };
      if (debouncedSearch) params.search = debouncedSearch;
      if (genderFilter !== 'all') params.gender = genderFilter;
      const res = await listPatients(params);
      const data = res.data || res;
      const list = data.patients || data || [];
      setPatients(list);
      setTotal(data.pagination?.total ?? list.length);

      // Compute counts
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      setCounts({
        total: data.pagination?.total ?? list.length,
        male: list.filter((p) => p.gender === 'male').length,
        female: list.filter((p) => p.gender === 'female').length,
        recent: list.filter((p) => p.createdAt && new Date(p.createdAt) >= thisMonth).length,
      });
      setStatsLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, genderFilter, sortKey, sortDir]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // ─── Sort handler ────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ─── Detail modal ────────────────────────────
  const openDetail = async (patient) => {
    setDetailPatient(patient);
    setDetailOpen(true);
    setDetailTab('info');
    setDetailLoading(true);
    try {
      const [apptRes, invRes] = await Promise.all([
        listAppointments({ patient: patient._id || patient.id, limit: 10, sort: '-scheduledAt' }),
        listInvoices({ patient: patient._id || patient.id, limit: 10 }),
      ]);
      setPatientAppts(apptRes.data?.appointments || apptRes.data || []);
      setPatientInvoices(invRes.data?.invoices || invRes.data || []);
    } catch { /* non-critical */ }
    setDetailLoading(false);
  };

  const closeDetail = () => { setDetailOpen(false); setDetailPatient(null); setPatientAppts([]); setPatientInvoices([]); };

  // ─── Register handler ────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) { setFormError('Name and phone are required'); return; }
    setSaving(true);
    setFormError('');
    try {
      await createPatient(form);
      setShowRegister(false);
      setForm(EMPTY_FORM);
      showToast({ type: 'success', message: 'Patient registered' });
      fetchPatients();
    } catch (err) {
      setFormError(err.message || 'Failed to register patient');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateAddress = (field, value) => setForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));
  const updateEmergency = (field, value) => setForm((prev) => ({ ...prev, emergencyContact: { ...prev.emergencyContact, [field]: value } }));

  // ─── Table columns ──────────────────────────
  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => openDetail(r)}>
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(r.name)} flex items-center justify-center text-xs font-bold shrink-0`}>
            {(r.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{r.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone', label: 'Phone',
      render: (r) => (
        <span className="text-sm text-neutral-600 flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-neutral-400 shrink-0" /> {r.phone || '--'}
        </span>
      ),
    },
    {
      key: 'email', label: 'Email',
      render: (r) => (
        <span className="text-sm text-neutral-600 flex items-center gap-1.5 truncate">
          <Mail className="h-3 w-3 text-neutral-400 shrink-0" /> {r.email || '--'}
        </span>
      ),
    },
    {
      key: 'gender', label: 'Gender', sortable: true,
      render: (r) => r.gender ? (
        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${GENDER_BADGE[r.gender] || 'bg-neutral-100 text-neutral-500'}`}>
          {r.gender}
        </span>
      ) : <span className="text-xs text-neutral-400">--</span>,
    },
    {
      key: 'createdAt', label: 'Registered', sortable: true,
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
        </span>
      ),
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <button onClick={() => openDetail(r)}
          className="px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition">
          View
        </button>
      ),
    },
  ];

  // ═══════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Patients</h1>
          <p className="text-sm text-neutral-500 mt-1">Search and manage patient records</p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowRegister(true); }}
          className={`${btnPrimary} flex items-center gap-2`}>
          <UserPlus className="h-4 w-4" /> Register New Patient
        </button>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <ErrorAlert message={error} />}

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3"><div className="w-12 h-12 rounded-2xl bg-neutral-100 animate-pulse" /></div>
              <div className="h-8 w-24 bg-neutral-100 rounded-lg animate-pulse mb-2" />
              <div className="h-3 w-32 bg-neutral-100 rounded animate-pulse" />
            </div>
          ))
        ) : (
          STAT_CONFIG.map((s, i) => {
            const p = PALETTE[s.color];
            return (
              <div key={s.key} className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
                style={{ animationDelay: `${50 + i * 50}ms` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                    <s.icon className={`h-6 w-6 ${p.iconText}`} />
                  </div>
                </div>
                <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{counts[s.key]}</p>
                <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
              </div>
            );
          })
        )}
      </div>

      {/* ── Toolbar Card ──────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Gender filter pills */}
          <div className="flex items-center gap-1.5">
            {GENDER_FILTERS.map((g) => {
              const isActive = genderFilter === g.value;
              return (
                <button key={g.value}
                  onClick={() => { setGenderFilter(g.value); setPage(1); }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}>
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Search + page size */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, email, or ID..."
                className="pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all w-72" />
            </div>
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={selectCls}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────── */}
      <div className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '200ms' }}>
        {loading ? (
          <Spinner />
        ) : patients.length === 0 ? (
          <EmptyState icon={Users}
            title={debouncedSearch ? 'No patients found' : 'No patients yet'}
            message={debouncedSearch ? 'Try a different search term' : 'Register your first patient to get started'} />
        ) : (
          <>
            <DataTable columns={columns} data={patients} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Register Modal ─────────────────────────── */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="Register New Patient" wide>
        <form onSubmit={handleRegister} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="John Doe" required />
            </div>
            <div>
              <label className={labelCls}>Phone *</label>
              <input className={inputCls} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+91 98765 43210" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="patient@example.com" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input className={inputCls} type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Gender</label>
            <div className="flex gap-3">
              {GENDER_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => updateField('gender', opt.value)}
                  className={`px-4 py-2.5 text-sm rounded-xl border transition-all ${
                    form.gender === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 bg-white'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Address
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className={labelCls}>Street</label><input className={inputCls} value={form.address.street} onChange={(e) => updateAddress('street', e.target.value)} placeholder="Street" /></div>
              <div><label className={labelCls}>City</label><input className={inputCls} value={form.address.city} onChange={(e) => updateAddress('city', e.target.value)} placeholder="City" /></div>
              <div><label className={labelCls}>State</label><input className={inputCls} value={form.address.state} onChange={(e) => updateAddress('state', e.target.value)} placeholder="State" /></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Emergency Contact
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Contact Name</label><input className={inputCls} value={form.emergencyContact.name} onChange={(e) => updateEmergency('name', e.target.value)} placeholder="Contact name" /></div>
              <div><label className={labelCls}>Contact Phone</label><input className={inputCls} value={form.emergencyContact.phone} onChange={(e) => updateEmergency('phone', e.target.value)} placeholder="Contact phone" /></div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowRegister(false)} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Detail Modal ───────────────────────────── */}
      <Modal open={detailOpen} onClose={closeDetail} title="Patient Details" wide>
        {detailPatient && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-200">
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(detailPatient.name)} flex items-center justify-center text-lg font-bold`}>
                {(detailPatient.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{detailPatient.name}</h3>
              </div>
            </div>

            <div className="flex gap-1 border-b border-neutral-200">
              {DETAIL_TABS.map((tab) => (
                <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    detailTab === tab.key
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-[180px]">
              {detailTab === 'info' && <InfoTab patient={detailPatient} />}
              {detailTab === 'appointments' && <AppointmentsTab appointments={patientAppts} loading={detailLoading} />}
              {detailTab === 'invoices' && <InvoicesTab invoices={patientInvoices} loading={detailLoading} />}
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button onClick={closeDetail} className={btnGhost}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
