import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Edit3, Unlink, Heart, Archive,
  Loader2, CheckCircle2, SkipForward, AlertCircle,
  ArrowRight, ShieldCheck, Clock, ToggleLeft, ToggleRight,
  Pill, X, Save, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';
import {
  listDependents, createDependent, updateDependentApi,
  detachDependentApi, listDependentArchives, getDependentArchive,
  getDependentCompliance, getDependentDailySchedule,
  respondToReminderAsGuardian, toggleDependentTaskReminder,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Modal } from '../../platform/components/shared';

/* ─── Design tokens ──────────────────────────────── */

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDateInput = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const todayStr = () => fmtDateInput(new Date());

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

function avatarGradient(id) {
  if (!id) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientDependents() {
  const { isGuardian } = useSafePatientAuth();

  const [dependents, setDependents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDep, setEditingDep] = useState(null);
  const [detachingDep, setDetachingDep] = useState(null);
  const [careDep, setCareDep] = useState(null);
  const [careData, setCareData] = useState(null);
  const [careLoading, setCareLoading] = useState(false);
  const [guardianResponding, setGuardianResponding] = useState(null);
  const [guardianToggling, setGuardianToggling] = useState(null);

  // Archives
  const [archives, setArchives] = useState([]);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [archiveDetail, setArchiveDetail] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Form state
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', bloodGroup: '' });
  const [detachForm, setDetachForm] = useState({ email: '', phone: '', password: '' });

  /* ── Toast ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch ── */
  const fetchDependents = useCallback(async () => {
    setLoading(true);
    try {
      const [depRes, archRes] = await Promise.all([
        listDependents(),
        listDependentArchives().catch(() => ({ data: [] })),
      ]);
      setDependents(depRes.data || []);
      setArchives(archRes.data || []);
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to load dependents' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDependents(); }, [fetchDependents]);

  /* ── Form helpers ── */
  const resetForm = () => setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', bloodGroup: '' });

  const openEdit = (dep) => {
    const parts = (dep.name || '').split(' ');
    setForm({
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      dateOfBirth: fmtDateInput(dep.dateOfBirth),
      gender: dep.gender || '',
      phone: dep.phone || '',
      bloodGroup: dep.bloodGroup || '',
    });
    setEditingDep(dep);
  };

  /* ── Handlers ── */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!consentAccepted) {
      setToast({ type: 'error', msg: 'You must accept the guardian consent agreement' });
      return;
    }
    setSubmitting(true);
    try {
      await createDependent({
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        consentAccepted: true,
        ...(form.phone && { phone: form.phone }),
        ...(form.bloodGroup && { bloodGroup: form.bloodGroup }),
      });
      setToast({ type: 'success', msg: 'Dependent added successfully' });
      setShowAddModal(false);
      resetForm();
      setConsentAccepted(false);
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to add dependent' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {};
      if (form.firstName) data.firstName = form.firstName;
      if (form.lastName) data.lastName = form.lastName;
      if (form.dateOfBirth) data.dateOfBirth = form.dateOfBirth;
      if (form.gender) data.gender = form.gender;
      if (form.phone) data.phone = form.phone;
      if (form.bloodGroup) data.bloodGroup = form.bloodGroup;
      await updateDependentApi(editingDep._id, data);
      setToast({ type: 'success', msg: 'Dependent updated' });
      setEditingDep(null);
      resetForm();
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to update' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await detachDependentApi(detachingDep._id, detachForm);
      setToast({ type: 'success', msg: 'Dependent now has their own independent account' });
      setDetachingDep(null);
      setDetachForm({ email: '', phone: '', password: '' });
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to detach' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Archive detail ── */
  const openArchiveDetail = async (archiveId) => {
    setArchiveLoading(true);
    try {
      const res = await getDependentArchive(archiveId);
      setArchiveDetail(res.data);
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to load archive' });
    } finally {
      setArchiveLoading(false);
    }
  };

  /* ── Care overview ── */
  const openCare = async (dep) => {
    setCareDep(dep);
    setCareLoading(true);
    setCareData(null);
    try {
      const [compRes, schedRes] = await Promise.all([
        getDependentCompliance(dep._id),
        getDependentDailySchedule(dep._id),
      ]);
      setCareData({ compliance: compRes.data, daily: schedRes.data });
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to load care data' });
      setCareDep(null);
    } finally {
      setCareLoading(false);
    }
  };

  const handleGuardianRespond = async (dependentId, taskId, reminderId, status) => {
    setGuardianResponding(reminderId);
    try {
      await respondToReminderAsGuardian(dependentId, taskId, reminderId, { status });
      setCareData((prev) => {
        if (!prev) return prev;
        const reminders = (prev.daily?.reminders || []).map((r) =>
          r._id === reminderId ? { ...r, status, respondedAt: new Date().toISOString() } : r,
        );
        const stats = { ...(prev.daily?.stats || {}) };
        if (status === 'done') stats.completed = (stats.completed || 0) + 1;
        if (status === 'skipped') stats.skipped = (stats.skipped || 0) + 1;
        stats.pending = Math.max(0, (stats.pending || 0) - 1);
        return { ...prev, daily: { ...prev.daily, reminders, stats } };
      });
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to respond' });
    } finally {
      setGuardianResponding(null);
    }
  };

  const handleGuardianToggle = async (dependentId, taskId) => {
    setGuardianToggling(taskId);
    try {
      const res = await toggleDependentTaskReminder(dependentId, taskId);
      const updated = res.data || {};
      setCareData((prev) => {
        if (!prev) return prev;
        const prescriptions = (prev.compliance?.prescriptions || []).map((rx) => ({
          ...rx,
          tasks: (rx.tasks || []).map((t) =>
            t._id === taskId ? { ...t, isActive: updated.isActive } : t,
          ),
        }));
        return { ...prev, compliance: { ...prev.compliance, prescriptions } };
      });
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to toggle' });
    } finally {
      setGuardianToggling(null);
    }
  };

  /* ═══ RENDER ══��� */

  // Non-guardian: access denied
  if (!isGuardian) {
    return (
      <div className="max-w-[1280px] mx-auto w-full">
        <div className={`${CARD} p-10 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center mx-auto mb-3">
            <Users className="h-6 w-6 text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-600">Dependents management is available for guardian accounts only</p>
          <p className="text-xs text-neutral-400 mt-1">If you manage family members, contact your clinic to set up guardian access</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-44 w-full" />
        <Shimmer className="h-32 w-full" />
        <Shimmer className="h-32 w-full" />
      </div>
    );
  }

  // Zero-data welcome
  if (dependents.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        {/* Toast */}
        {toast && <Toast toast={toast} />}

        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Manage Your Family
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            As a guardian, you can add your children and family members to manage their appointments,
            prescriptions, and healthcare — all from one account.
          </p>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <UserPlus className="h-5 w-5" /> Add Your First Dependent
          </button>
        </div>

        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">How it works</h2>
              <p className="text-xs text-neutral-500">Simple and secure family management</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: UserPlus, iconBg: 'bg-primary-50', iconClr: 'text-primary-600', title: 'Add family members', desc: 'Enter their basic details — name, date of birth, and gender.' },
              { icon: Heart, iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600', title: 'Manage their care', desc: 'Book appointments, track medications, and view care compliance.' },
              { icon: Unlink, iconBg: 'bg-amber-50', iconClr: 'text-amber-600', title: 'Detach when ready', desc: 'When they grow up, create an independent account with their own login.' },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className={`w-10 h-10 rounded-xl ${feat.iconBg} flex items-center justify-center shrink-0`}>
                  <feat.icon className={`h-5 w-5 ${feat.iconClr}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{feat.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Modal */}
        <DependentFormModal
          open={showAddModal}
          onClose={() => { setShowAddModal(false); resetForm(); setConsentAccepted(false); }}
          title="Add Dependent"
          form={form}
          setForm={setForm}
          onSubmit={handleAdd}
          submitting={submitting}
          submitLabel="Add Dependent"
          isAdd
          consentAccepted={consentAccepted}
          setConsentAccepted={setConsentAccepted}
        />
      </div>
    );
  }

  /* ── Main data view ── */
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Toast */}
      {toast && <Toast toast={toast} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Dependents</h1>
          <p className="text-sm text-neutral-600 mt-1">{dependents.length} family member{dependents.length !== 1 ? 's' : ''} under your care</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" /> Add Dependent
        </button>
      </div>

      {/* Dependent Cards */}
      <div className="space-y-3 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {dependents.map((dep) => (
          <DependentCard
            key={dep._id}
            dep={dep}
            onEdit={() => openEdit(dep)}
            onCare={() => openCare(dep)}
            onDetach={() => { setDetachForm({ email: '', phone: '', password: '' }); setDetachingDep(dep); }}
          />
        ))}
      </div>

      {/* Add Modal */}
      <DependentFormModal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); resetForm(); }}
        title="Add Dependent"
        form={form}
        setForm={setForm}
        onSubmit={handleAdd}
        submitting={submitting}
        submitLabel="Add Dependent"
      />

      {/* Edit Modal */}
      <DependentFormModal
        open={!!editingDep}
        onClose={() => { setEditingDep(null); resetForm(); }}
        title={`Edit ${editingDep?.name || 'Dependent'}`}
        form={form}
        setForm={setForm}
        onSubmit={handleEdit}
        submitting={submitting}
        submitLabel="Update"
      />

      {/* Detach Modal */}
      <Modal open={!!detachingDep} onClose={() => setDetachingDep(null)} title={`Detach ${detachingDep?.name || 'Dependent'}`}>
        <div className="mb-4 p-3 bg-amber-50 rounded-xl text-sm text-amber-800">
          <p className="font-medium mb-1">This will create an independent patient account</p>
          <p className="text-xs leading-relaxed">
            The dependent will have their own login credentials and will no longer appear in your
            dependents list. Their medical history will be preserved.
          </p>
        </div>
        <form onSubmit={handleDetach} className="space-y-4">
          <FormField label="Email" required>
            <input
              type="email"
              className={INPUT_CLS}
              value={detachForm.email}
              onChange={(e) => setDetachForm({ ...detachForm, email: e.target.value })}
              required
              placeholder="Their new login email"
            />
          </FormField>
          <FormField label="Phone" required>
            <input
              className={INPUT_CLS}
              value={detachForm.phone}
              onChange={(e) => setDetachForm({ ...detachForm, phone: e.target.value })}
              required
              placeholder="Their phone number"
            />
          </FormField>
          <FormField label="Password" required>
            <input
              type="password"
              className={INPUT_CLS}
              value={detachForm.password}
              onChange={(e) => setDetachForm({ ...detachForm, password: e.target.value })}
              required
              minLength={8}
              placeholder="Min 8 characters"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDetachingDep(null)} className="h-9 px-4 text-xs font-semibold text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="h-9 px-5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Detach & Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Archived Dependents */}
      {archives.length > 0 && (
        <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
          <button
            onClick={() => setArchivesOpen(!archivesOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
          >
            <Archive className="h-4 w-4" />
            Archived Dependents ({archives.length})
            {archivesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {archivesOpen && (
            <div className="space-y-2">
              {archives.map((arch) => (
                <div key={arch._id} className={`${CARD} p-4 opacity-70`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(arch._id)} flex items-center justify-center text-white text-sm font-bold opacity-50`}>
                        {(arch.dependentName || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-700">{arch.dependentName}</p>
                        <p className="text-xs text-neutral-400">Detached {fmtDate(arch.detachedAt)} &middot; {arch.appointmentCount} appointments &middot; {arch.prescriptionCount} prescriptions</p>
                      </div>
                    </div>
                    <button
                      onClick={() => openArchiveDetail(arch._id)}
                      className="h-8 px-3 text-xs font-semibold text-neutral-500 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-all flex items-center gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Archive Detail Modal */}
      <Modal open={!!archiveDetail} onClose={() => setArchiveDetail(null)} title={`Archive — ${archiveDetail?.snapshotData?.name || ''}`} wide>
        {archiveLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
        ) : archiveDetail ? (
          <div className="space-y-5">
            {/* Profile Snapshot */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Profile at time of detach</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-neutral-400 text-xs">Name:</span> <span className="font-medium text-neutral-800">{archiveDetail.snapshotData?.name}</span></div>
                <div><span className="text-neutral-400 text-xs">DOB:</span> <span className="font-medium text-neutral-800">{fmtDate(archiveDetail.snapshotData?.dateOfBirth)}</span></div>
                <div><span className="text-neutral-400 text-xs">Gender:</span> <span className="font-medium text-neutral-800 capitalize">{archiveDetail.snapshotData?.gender}</span></div>
                <div><span className="text-neutral-400 text-xs">Blood Group:</span> <span className="font-medium text-neutral-800">{archiveDetail.snapshotData?.bloodGroup || '—'}</span></div>
              </div>
            </div>

            {/* Appointments */}
            {archiveDetail.appointments?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Appointment History ({archiveDetail.appointments.length})</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {archiveDetail.appointments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-sm">
                      <div>
                        <p className="font-medium text-neutral-700">{a.doctor}</p>
                        <p className="text-xs text-neutral-400">{fmtDate(a.scheduledAt)} {a.notes && `— ${a.notes}`}</p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        a.status === 'completed' ? 'bg-secondary-50 text-secondary-700' : 'bg-neutral-100 text-neutral-500'
                      }`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prescriptions */}
            {archiveDetail.prescriptions?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Prescriptions ({archiveDetail.prescriptions.length})</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {archiveDetail.prescriptions.map((p, i) => (
                    <div key={i} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-neutral-700">{p.diagnosis || 'Prescription'}</p>
                        <p className="text-xs text-neutral-400">{fmtDate(p.prescribedAt)}</p>
                      </div>
                      {p.medications?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {p.medications.map((m, j) => (
                            <span key={j} className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
                              {m.name} {m.dosage}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Consent History */}
            {archiveDetail.consentHistory?.length > 0 && (
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Consent History</p>
                {archiveDetail.consentHistory.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600 capitalize">{c.consentType}</span>
                    <span className="text-xs text-neutral-400">
                      Accepted {fmtDate(c.acceptedAt)}
                      {c.revokedAt && ` — Revoked ${fmtDate(c.revokedAt)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Care Compliance Modal */}
      <Modal open={!!careDep} onClose={() => { setCareDep(null); setCareData(null); }} title={`Care Overview — ${careDep?.name || ''}`} wide>
        {careLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        ) : careData ? (
          <CareOverview
            careData={careData}
            careDep={careDep}
            guardianResponding={guardianResponding}
            guardianToggling={guardianToggling}
            onRespond={handleGuardianRespond}
            onToggle={handleGuardianToggle}
          />
        ) : (
          <p className="text-sm text-neutral-400 text-center py-8">No care data available</p>
        )}
      </Modal>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────── */

const INPUT_CLS = 'w-full h-10 px-3 text-sm text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-all';

function Toast({ toast }) {
  return (
    <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
      toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {toast.msg}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5 block">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}

function DependentCard({ dep, onEdit, onCare, onDetach }) {
  const grad = avatarGradient(dep._id);

  return (
    <div className={`${CARD} p-5 hover:shadow-[var(--shadow-md)] transition-shadow`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-lg font-bold shrink-0`}>
            {(dep.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate">{dep.name}</p>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
              {dep.age != null && <span>{dep.age} years</span>}
              {dep.gender && <><span className="text-neutral-300">&middot;</span><span className="capitalize">{dep.gender}</span></>}
              {dep.bloodGroup && <><span className="text-neutral-300">&middot;</span><span>{dep.bloodGroup}</span></>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {dep.isMinor === true && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Minor</span>
          )}
          {dep.isMinor === false && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Adult</span>
          )}

          <button onClick={onCare} title="Care overview"
            className="w-8 h-8 rounded-lg bg-secondary-50 text-secondary-600 hover:bg-secondary-100 flex items-center justify-center transition-colors">
            <Heart className="h-4 w-4" />
          </button>
          <button onClick={onEdit} title="Edit"
            className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 flex items-center justify-center transition-colors">
            <Edit3 className="h-4 w-4" />
          </button>
          {dep.canDetach && (
            <button onClick={onDetach} title="Detach"
              className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition-colors">
              <Unlink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DependentFormModal({ open, onClose, title, form, setForm, onSubmit, submitting, submitLabel, isAdd, consentAccepted, setConsentAccepted }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input className={INPUT_CLS} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          </FormField>
          <FormField label="Last Name" required>
            <input className={INPUT_CLS} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date of Birth" required>
            <input type="date" className={INPUT_CLS} value={form.dateOfBirth} max={todayStr()} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required />
          </FormField>
          <FormField label="Gender" required>
            <select className={`${INPUT_CLS} appearance-none`} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} required>
              <option value="">Select</option>
              {GENDER_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone">
            <input className={INPUT_CLS} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="Blood Group">
            <select className={`${INPUT_CLS} appearance-none`} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </FormField>
        </div>

        {/* Consent checkbox — only for adding new dependents */}
        {isAdd && (
          <label className="flex items-start gap-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-blue-300 text-primary-600 focus:ring-primary-300"
            />
            <span className="text-xs text-neutral-600 leading-relaxed">
              I confirm that I am the legal guardian of this minor and accept full responsibility for managing
              their medical care, appointments, prescriptions, and health records through this platform.
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 text-xs font-semibold text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-all flex items-center gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button type="submit" disabled={submitting || (isAdd && !consentAccepted)} className="h-9 px-5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CareOverview({ careData, careDep, guardianResponding, guardianToggling, onRespond, onToggle }) {
  const compliance = careData.compliance;
  const daily = careData.daily;
  const pct = compliance?.averageCompliance ?? 0;
  const actionable = (daily?.reminders || []).filter((r) => r.status === 'pending' || r.status === 'sent');
  const responded = (daily?.reminders || []).filter((r) => r.status === 'done' || r.status === 'skipped' || r.status === 'missed');

  return (
    <div className="space-y-6">
      {/* Overall Compliance */}
      <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-neutral-800">Overall Compliance</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            pct >= 80 ? 'bg-secondary-50 text-secondary-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
          }`}>{pct}%</span>
        </div>
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${
            pct >= 80 ? 'bg-secondary-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
          }`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Per-Prescription */}
      {compliance?.prescriptions?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-3">Per-Prescription</p>
          <div className="space-y-3">
            {compliance.prescriptions.map((rx) => (
              <div key={rx._id} className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-neutral-800">{rx.diagnosis || 'Prescription'}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    rx.overallComplianceRate >= 80 ? 'bg-secondary-50 text-secondary-700' : rx.overallComplianceRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                  }`}>{rx.overallComplianceRate}%</span>
                </div>
                <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full ${
                    rx.overallComplianceRate >= 80 ? 'bg-secondary-500' : rx.overallComplianceRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`} style={{ width: `${rx.overallComplianceRate}%` }} />
                </div>
                <div className="flex gap-4 text-[10px] text-neutral-400">
                  <span className="flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />{rx.totalCompleted}</span>
                  <span className="flex items-center gap-0.5"><SkipForward className="h-3 w-3" />{rx.totalSkipped}</span>
                  <span className="flex items-center gap-0.5"><X className="h-3 w-3" />{rx.totalMissed}</span>
                </div>

                {rx.tasks?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-neutral-200 space-y-2">
                    {rx.tasks.map((task) => (
                      <div key={task._id} className="flex items-center justify-between py-1">
                        <p className="text-xs font-medium text-neutral-600 truncate flex-1 min-w-0 mr-3">{task.title}</p>
                        <button
                          onClick={() => onToggle(careDep._id, task._id)}
                          disabled={guardianToggling === task._id}
                          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                            task.isActive ? 'bg-secondary-500' : 'bg-neutral-300'
                          } ${guardianToggling === task._id ? 'opacity-50' : ''}`}
                          title={task.isActive ? 'Disable reminders' : 'Enable reminders'}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            task.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Schedule */}
      {(daily?.reminders?.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-3">Today's Schedule</p>
          <div className="space-y-2">
            {actionable.map((rem) => (
              <div key={rem._id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{rem.task?.title || 'Medication'}</p>
                  <p className="text-xs text-neutral-400">{fmtTime(rem.scheduledAt)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onRespond(careDep._id, rem.task?._id || rem.taskId, rem._id, 'done')}
                    disabled={guardianResponding !== null}
                    className="h-8 px-3 text-xs font-semibold bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-all disabled:opacity-50"
                  >{guardianResponding === rem._id ? '...' : 'Done'}</button>
                  <button
                    onClick={() => onRespond(careDep._id, rem.task?._id || rem.taskId, rem._id, 'skipped')}
                    disabled={guardianResponding !== null}
                    className="h-8 px-3 text-xs font-semibold bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-all disabled:opacity-50"
                  >Skip</button>
                </div>
              </div>
            ))}
            {responded.map((rem) => (
              <div key={rem._id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100 opacity-60">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{rem.task?.title || 'Medication'}</p>
                  <p className="text-xs text-neutral-400">{fmtTime(rem.scheduledAt)}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  rem.status === 'done' ? 'bg-secondary-50 text-secondary-700' : rem.status === 'skipped' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                }`}>{rem.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {daily?.reminders?.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-4">No reminders scheduled for today</p>
      )}
    </div>
  );
}
