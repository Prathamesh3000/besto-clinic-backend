import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Search, Edit3, Trash2, Phone, Mail, Droplets,
  MapPin, ClipboardList, Clock, Pill, HeartPulse, CheckCircle2, XCircle,
  AlertTriangle, Bell, BellOff, Eye, Upload, UserCheck, UserPlus,
} from 'lucide-react';
import {
  Modal, DataTable, EmptyState, Pagination, Spinner, ErrorAlert, ConfirmDialog, TabBar,
} from '../../platform/components/shared';
import {
  listPatients, createPatient, updatePatient, deletePatient,
  getPatient, listPrescriptions, getPatientCompliance,
  togglePatientTaskReminder, enablePatientReminders, disablePatientReminders,
  bulkImportPatients,
} from '../api';
import Can from '../components/Can';
import BulkUploadModal from '../components/BulkUploadModal';
import { useToast } from '../ToastContext';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';
const pillBase = 'px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer select-none';
const pillActive = `${pillBase} bg-primary-600 text-white shadow-[var(--shadow-sm)]`;
const pillInactive = `${pillBase} bg-neutral-100 text-neutral-600 hover:bg-neutral-200`;

/* ─── Constants ────────────────────────────────── */
const GENDER_OPTIONS = ['male', 'female', 'other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const EMPTY_FORM = {
  name: '', email: '', phone: '', gender: 'male',
  dateOfBirth: '', bloodGroup: '', address: { street: '', city: '', state: '', zipCode: '' },
};

const GENDER_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];

/* ─── Stat Card Config ─────────────────────────── */
const STAT_CFG = [
  { key: 'total',  title: 'Total Patients',   icon: Users },
  { key: 'male',   title: 'Male Patients',    icon: UserCheck },
  { key: 'female', title: 'Female Patients',  icon: UserCheck },
  { key: 'recent', title: 'New This Month',   icon: UserPlus },
];
const PALETTE = [
  { bg: 'bg-primary-50', text: 'text-primary-600' },
  { bg: 'bg-blue-50',    text: 'text-blue-600' },
  { bg: 'bg-pink-50',    text: 'text-pink-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
];

/* ─── Gender badge ─────────────────────────────── */
const GENDER_STYLES = {
  male:   { bg: 'bg-blue-50', text: 'text-blue-700' },
  female: { bg: 'bg-pink-50', text: 'text-pink-700' },
  other:  { bg: 'bg-purple-50', text: 'text-purple-700' },
};

function GenderBadge({ gender }) {
  const s = GENDER_STYLES[gender] || GENDER_STYLES.other;
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      {gender || 'N/A'}
    </span>
  );
}

/* ─── Avatar color ─────────────────────────────── */
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

const DETAIL_TABS = [
  { key: 'info', label: 'Info' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'compliance', label: 'Compliance' },
];

/* ─── Format helpers ───────────────────────────── */
function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ─── Main Component ───────────────────────────── */
export default function PatientManagement() {
  const { showToast } = useToast();
  const { highlightId, highlightSearch } = useHighlightFromUrl();

  // ─── List state ───────────────────────────────
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState(highlightSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) { setSearch(highlightSearch); setDebouncedSearch(highlightSearch); } }, [highlightSearch]);
  const [genderFilter, setGenderFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ─── Modal state ──────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ─── Delete state ─────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Detail modal state ───────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPatient, setDetailPatient] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('info');
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);
  const [patientCompliance, setPatientCompliance] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reminderActionId, setReminderActionId] = useState(null);
  const [doctorToggling, setDoctorToggling] = useState(null);

  // ─── Debounced search ────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ─── Fetch ────────────────────────────────────
  const fetchPatients = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { page, limit, sort: sortKey, order: sortDir };
    if (debouncedSearch) params.search = debouncedSearch;
    if (genderFilter !== 'all') params.gender = genderFilter;

    listPatients(params)
      .then((res) => {
        const d = res.data || res;
        const list = Array.isArray(d) ? d : d.patients || d.items || [];
        setPatients(list);
        setTotal(res.meta?.total || d.pagination?.total || d.total || list.length);
      })
      .catch((err) => setError(err.message || 'Failed to load patients'))
      .finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, genderFilter, sortKey, sortDir]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // Reset page when filter or limit changes
  useEffect(() => { setPage(1); }, [genderFilter, limit]);

  // ─── Stat computations ────────────────────────
  const maleCount = patients.filter((p) => p.gender === 'male').length;
  const femaleCount = patients.filter((p) => p.gender === 'female').length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const recentCount = patients.filter((p) => p.createdAt && new Date(p.createdAt) >= monthStart).length;
  const statValues = {
    total: total.toLocaleString('en-IN'),
    male: maleCount.toLocaleString('en-IN'),
    female: femaleCount.toLocaleString('en-IN'),
    recent: recentCount.toLocaleString('en-IN'),
  };

  // ─── Handlers ─────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault();
    // Immediately apply the current search value
    setDebouncedSearch(search);
    setPage(1);
  };

  const openCreateModal = () => {
    setEditTarget(null);
    setFormData(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (patient) => {
    setEditTarget(patient);
    setFormData({
      name: patient.name || '',
      email: patient.email || '',
      phone: patient.phone || '',
      gender: patient.gender || 'male',
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.substring(0, 10) : '',
      bloodGroup: patient.bloodGroup || '',
      address: {
        street: patient.address?.street || '',
        city: patient.address?.city || '',
        state: patient.address?.state || '',
        zipCode: patient.address?.zipCode || '',
      },
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim(),
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth || undefined,
        bloodGroup: formData.bloodGroup || undefined,
        address: (formData.address.street || formData.address.city || formData.address.state || formData.address.zipCode)
          ? formData.address
          : undefined,
      };

      if (editTarget) {
        await updatePatient(editTarget._id || editTarget.id, payload);
        showToast({ type: 'success', message: 'Patient updated successfully' });
      } else {
        const result = await createPatient(payload);
        if (result.data?.patientId) {
          showToast({ type: 'success', message: `Patient created! ID: ${result.data.patientId}` });
        } else {
          showToast({ type: 'success', message: 'Patient created successfully' });
        }
      }

      setShowModal(false);
      setEditTarget(null);
      setFormData(EMPTY_FORM);
      fetchPatients();
    } catch (err) {
      setFormError(err.message || 'Failed to save patient');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePatient(deleteTarget._id || deleteTarget.id);
      setDeleteTarget(null);
      showToast({ type: 'success', message: 'Patient deleted' });
      fetchPatients();
    } catch {
      showToast({ type: 'error', message: 'Failed to delete patient' });
    } finally {
      setDeleting(false);
    }
  };

  // ─── Helper to update nested address ──────────
  const setAddress = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      address: { ...prev.address, [field]: value },
    }));
  };

  // ─── Detail modal handlers ────────────────────
  const openDetail = async (patient) => {
    const id = patient._id || patient.id;
    setDetailTab('info');
    setDetailOpen(true);
    setDetailLoading(true);
    setPatientPrescriptions([]);
    setPatientCompliance(null);

    try {
      const res = await getPatient(id);
      setDetailPatient(res.data || res);
    } catch {
      setDetailPatient(patient);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailPatient(null);
    setPatientPrescriptions([]);
    setPatientCompliance(null);
  };

  useEffect(() => {
    if (!detailOpen || !detailPatient) return;
    const patientId = detailPatient._id || detailPatient.id;

    if (detailTab === 'prescriptions' && patientPrescriptions.length === 0) {
      setSubLoading(true);
      listPrescriptions({ patient: patientId, limit: 50 })
        .then((res) => setPatientPrescriptions(res.data || []))
        .catch(() => {})
        .finally(() => setSubLoading(false));
    }

    if (detailTab === 'compliance' && !patientCompliance) {
      setSubLoading(true);
      getPatientCompliance(patientId)
        .then((res) => setPatientCompliance(res.data || res))
        .catch(() => setPatientCompliance({ prescriptions: [] }))
        .finally(() => setSubLoading(false));
    }
  }, [detailTab, detailOpen, detailPatient]);

  const handleToggleReminders = async (patientId, prescriptionId, currentlyEnabled) => {
    setReminderActionId(prescriptionId);
    try {
      if (currentlyEnabled) {
        await disablePatientReminders(patientId, prescriptionId);
        showToast({ type: 'success', message: 'Care reminders disabled' });
      } else {
        const res = await enablePatientReminders(patientId, prescriptionId);
        const data = res.data || res;
        showToast({ type: 'success', message: `Care reminders enabled — ${data.tasksCreated || 0} tasks created` });
      }
      const rxRes = await listPrescriptions({ patient: patientId, limit: 50 });
      setPatientPrescriptions(rxRes.data || []);
      setPatientCompliance(null);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to toggle reminders' });
    } finally {
      setReminderActionId(null);
    }
  };

  const handleDoctorToggle = async (patientId, taskId) => {
    setDoctorToggling(taskId);
    try {
      const res = await togglePatientTaskReminder(patientId, taskId);
      const updated = res.data || {};
      setPatientCompliance(prev => {
        if (!prev) return prev;
        const prescriptions = (prev.prescriptions || []).map(rx => ({
          ...rx,
          tasks: (rx.tasks || []).map(t =>
            (t._id || t.taskId) === taskId ? { ...t, isActive: updated.isActive } : t,
          ),
        }));
        return { ...prev, prescriptions };
      });
    } catch {
      // silently ignore
    } finally {
      setDoctorToggling(null);
    }
  };

  // ─── Table columns ────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (r) => {
        const fullName = r.name || 'Unknown';
        return (
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(fullName)} flex items-center justify-center text-xs font-bold shrink-0`}>
              {fullName[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{fullName}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-neutral-400 shrink-0" />
          <span className="text-sm text-neutral-600">{r.phone || 'N/A'}</span>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <Mail className="h-3 w-3 text-neutral-400 shrink-0" />
          <span className="text-sm text-neutral-500 truncate">{r.email || 'N/A'}</span>
        </div>
      ),
    },
    {
      key: 'gender',
      label: 'Gender',
      sortable: true,
      render: (r) => <GenderBadge gender={r.gender} />,
    },
    {
      key: 'bloodGroup',
      label: 'Blood Group',
      render: (r) => r.bloodGroup ? (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold">
          <Droplets className="h-3 w-3" /> {r.bloodGroup}
        </span>
      ) : (
        <span className="text-xs text-neutral-400">N/A</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openDetail(r)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition"
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => openEditModal(r)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition"
            title="Edit patient"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <Can permission="patient:delete">
            <button
              onClick={() => setDeleteTarget(r)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Delete patient"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Can>
        </div>
      ),
    },
  ];

  // ───────────────────────────────────────────────
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* ── Page Header ─────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Patient Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage patient records and care reminders</p>
        </div>
        <Can permission="patient:create">
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button onClick={() => setBulkOpen(true)} className={btnGhost + ' flex items-center gap-1.5'}>
              <Upload className="h-4 w-4" /> Bulk Import
            </button>
            <button onClick={openCreateModal} className={btnPrimary + ' flex items-center gap-1.5'}>
              <Plus className="h-4 w-4" /> Add Patient
            </button>
          </div>
        </Can>
      </div>

      {/* ── Stat Cards ──────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        {STAT_CFG.map((cfg, i) => {
          const Icon = cfg.icon;
          const pal = PALETTE[i];
          return (
            <div
              key={cfg.key}
              className={`${cardCls} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
              style={{ animationDelay: `${100 + i * 50}ms` }}
            >
              <div className={`w-12 h-12 rounded-2xl ${pal.bg} flex items-center justify-center mb-3`}>
                <Icon className={`h-6 w-6 ${pal.text}`} />
              </div>
              <p className="text-[28px] font-bold text-neutral-900 leading-none">{statValues[cfg.key]}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ─────────────────────────────────── */}
      <div
        className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '150ms' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Gender filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {GENDER_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setGenderFilter(f.key)}
                className={genderFilter === f.key ? pillActive : pillInactive}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="sm:ml-auto flex items-center gap-3">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectCls}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>

            {/* Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patients..."
                className="w-56 pl-10 pr-4 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              />
            </form>
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────── */}
      <div
        className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '200ms' }}
      >
        {error ? (
          <div className="p-4"><ErrorAlert message={error} /></div>
        ) : loading ? (
          <Spinner />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            message={search ? 'Try a different search term' : 'Add your first patient to get started'}
          />
        ) : (
          <>
            <DataTable columns={columns} data={patients} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightId={highlightId} />
            <div className="px-4 border-t border-neutral-200">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ─── Add / Edit Modal ─────────────────────── */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditTarget(null); }}
        title={editTarget ? 'Edit Patient' : 'Add Patient'}
        wide
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          {/* Name */}
          <div>
            <label className={labelCls}>Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              className={inputCls}
              required
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="patient@email.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className={inputCls}
                required
              />
            </div>
          </div>

          {/* Demographics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Gender</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className={selectCls + ' w-full'}
                required
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Blood Group</label>
              <select
                value={formData.bloodGroup}
                onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                className={selectCls + ' w-full'}
              >
                <option value="">Select</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Address */}
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Address
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Street</label>
                <input
                  type="text"
                  value={formData.address.street}
                  onChange={(e) => setAddress('street', e.target.value)}
                  placeholder="Street address"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input
                  type="text"
                  value={formData.address.city}
                  onChange={(e) => setAddress('city', e.target.value)}
                  placeholder="City"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input
                  type="text"
                  value={formData.address.state}
                  onChange={(e) => setAddress('state', e.target.value)}
                  placeholder="State"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ZIP Code</label>
                <input
                  type="text"
                  value={formData.address.zipCode}
                  onChange={(e) => setAddress('zipCode', e.target.value)}
                  placeholder="ZIP / PIN code"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditTarget(null); }}
              className={btnGhost}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editTarget ? 'Update Patient' : 'Add Patient'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Delete Confirmation ──────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Patient"
        message={`Are you sure you want to delete ${deleteTarget?.name || 'this patient'}? This action is permanent and cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
        loading={deleting}
      />

      {/* ─── Patient Detail Modal ──────────────────── */}
      <Modal open={detailOpen} onClose={closeDetail} title="Patient Details" wide>
        {detailLoading ? (
          <div className="py-12"><Spinner /></div>
        ) : detailPatient ? (
          <div className="space-y-5">
            {/* Patient header */}
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-200">
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(detailPatient.name)} flex items-center justify-center text-lg font-bold`}>
                {(detailPatient.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{detailPatient.name}</h3>
              </div>
            </div>

            <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />

            {/* Info tab */}
            {detailTab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Email', value: detailPatient.email },
                  { label: 'Phone', value: detailPatient.phone },
                  { label: 'Gender', value: detailPatient.gender },
                  { label: 'Date of Birth', value: formatDate(detailPatient.dateOfBirth) },
                  { label: 'Blood Group', value: detailPatient.bloodGroup },
                  { label: 'Address', value: detailPatient.address ? `${detailPatient.address.street || ''} ${detailPatient.address.city || ''} ${detailPatient.address.state || ''} ${detailPatient.address.zipCode || ''}`.trim() : null },
                ].map((item, i) => (
                  <div key={i} className="bg-neutral-50 rounded-xl p-4">
                    <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-sm text-neutral-700 capitalize">{item.value || '--'}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Prescriptions tab */}
            {detailTab === 'prescriptions' && (
              subLoading ? <Spinner /> : patientPrescriptions.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No prescriptions" message="No prescriptions found for this patient" />
              ) : (
                <div className="space-y-3">
                  {patientPrescriptions.map((rx) => {
                    const rxId = rx._id || rx.id;
                    const isActive = rx.status === 'active';
                    const remindersOn = !!rx.followUpRemindersEnabled;
                    const isToggling = reminderActionId === rxId;
                    return (
                      <div key={rxId} className={`${cardCls} p-4`}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-sm font-medium text-neutral-900 truncate">{rx.diagnosis || 'No diagnosis'}</p>
                          <span className="text-xs text-neutral-500 shrink-0">{formatDate(rx.createdAt || rx.date)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                              <Pill className="h-3 w-3" /> {rx.medications?.length || 0} meds
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${rx.status === 'active' ? 'bg-emerald-50 text-emerald-700' : rx.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                              {rx.status || 'unknown'}
                            </span>
                            {remindersOn && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                <Bell className="h-3 w-3" /> Reminders on
                              </span>
                            )}
                          </div>
                          {isActive && (
                            <button
                              onClick={() => handleToggleReminders(detailPatient._id || detailPatient.id, rxId, remindersOn)}
                              disabled={isToggling}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition shrink-0 ${
                                remindersOn
                                  ? 'text-neutral-600 bg-neutral-100 hover:bg-neutral-200'
                                  : 'text-white bg-emerald-600 hover:bg-emerald-700 shadow-[var(--shadow-sm)]'
                              } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {isToggling ? (
                                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : remindersOn ? (
                                <BellOff className="h-3.5 w-3.5" />
                              ) : (
                                <Bell className="h-3.5 w-3.5" />
                              )}
                              {remindersOn ? 'Disable Reminders' : 'Enable Reminders'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Compliance tab */}
            {detailTab === 'compliance' && (
              subLoading ? <Spinner /> : !patientCompliance || !patientCompliance.prescriptions?.length ? (
                <EmptyState icon={HeartPulse} title="No care reminders" message="No active care reminder tasks for this patient" />
              ) : (
                <div className="space-y-4">
                  {/* Overall compliance badge */}
                  {patientCompliance.overallCompliance != null && (
                    <div className={`flex items-center gap-3 p-4 rounded-xl ${
                      patientCompliance.overallCompliance >= 75 ? 'bg-emerald-50 border border-emerald-100' :
                      patientCompliance.overallCompliance >= 50 ? 'bg-amber-50 border border-amber-100' :
                      'bg-red-50 border border-red-100'
                    }`}>
                      <HeartPulse className={`h-5 w-5 ${
                        patientCompliance.overallCompliance >= 75 ? 'text-emerald-600' :
                        patientCompliance.overallCompliance >= 50 ? 'text-amber-600' : 'text-red-600'
                      }`} />
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          Overall Compliance: {(patientCompliance.overallCompliance || 0).toFixed(1)}%
                        </p>
                        <p className="text-xs text-neutral-500">
                          {patientCompliance.overallCompliance >= 75 ? 'Good adherence' :
                           patientCompliance.overallCompliance >= 50 ? 'Needs improvement' : 'Low adherence — action needed'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Per-prescription breakdown */}
                  {patientCompliance.prescriptions.map((rx) => (
                    <div key={rx.prescriptionId || rx._id} className={`${cardCls} p-4`}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-sm font-medium text-neutral-900 truncate">{rx.diagnosis || 'Prescription'}</p>
                        <span className="text-xs text-neutral-500">{formatDate(rx.createdAt)}</span>
                      </div>

                      {/* Tasks */}
                      {(rx.tasks || []).map((task) => (
                        <div key={task._id || task.taskId} className="ml-2 mb-3 last:mb-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-xs font-medium text-neutral-600">{task.title || task.medication || 'Task'}</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDoctorToggle(detailPatient._id, task._id || task.taskId)}
                                disabled={doctorToggling === (task._id || task.taskId)}
                                className={`relative w-9 h-[18px] rounded-full transition-colors ${task.isActive !== false ? 'bg-emerald-500' : 'bg-neutral-300'} ${doctorToggling === (task._id || task.taskId) ? 'opacity-50' : ''}`}
                                title={task.isActive !== false ? 'Disable reminders' : 'Enable reminders'}
                              >
                                <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${task.isActive !== false ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                              </button>
                              <span className={`text-xs font-semibold ${
                                (task.completionRate || 0) >= 75 ? 'text-emerald-600' :
                                (task.completionRate || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {(task.completionRate || 0).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                (task.completionRate || 0) >= 75 ? 'bg-emerald-500' :
                                (task.completionRate || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, task.completionRate || 0)}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-400">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {task.completed ?? 0} done
                            </span>
                            <span className="flex items-center gap-1">
                              <XCircle className="h-3 w-3 text-red-400" /> {task.missed ?? 0} missed
                            </span>
                            {task.total != null && (
                              <span>Total: {task.total}</span>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Recent activity */}
                      {rx.recentReminders?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-100">
                          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Recent Activity</p>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {rx.recentReminders.slice(0, 10).map((r, ri) => (
                              <div key={ri} className="flex items-center gap-2 text-xs">
                                {r.status === 'completed' ? (
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                ) : r.status === 'missed' ? (
                                  <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                ) : r.status === 'skipped' ? (
                                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                ) : (
                                  <Clock className="h-3 w-3 text-neutral-400 shrink-0" />
                                )}
                                <span className="text-neutral-500 truncate">{r.taskTitle || 'Reminder'}</span>
                                <span className="text-neutral-400 shrink-0 ml-auto">{formatDate(r.scheduledAt || r.createdAt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button onClick={closeDetail} className={btnGhost}>Close</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Bulk Upload */}
      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        entityName="Patients"
        columns={[
          { key: 'name', label: 'Name', required: true, example: 'Anita Desai' },
          { key: 'phone', label: 'Phone', required: true, example: '+91 9876543210' },
          { key: 'email', label: 'Email', example: 'anita@example.com' },
          { key: 'gender', label: 'Gender', example: 'female' },
          { key: 'dateOfBirth', label: 'Date of Birth', example: '1990-05-15' },
          { key: 'bloodGroup', label: 'Blood Group', example: 'B+' },
          { key: 'address.street', label: 'Street', example: '123 MG Road' },
          { key: 'address.city', label: 'City', example: 'Mumbai' },
          { key: 'address.state', label: 'State', example: 'Maharashtra' },
          { key: 'address.zipCode', label: 'Zip Code', example: '400001' },
        ]}
        onImport={bulkImportPatients}
        onRefresh={fetchPatients}
      />
    </div>
  );
}
