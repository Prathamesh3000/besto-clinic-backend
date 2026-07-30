/**
 * DoctorPatientRecords — Patient Records Hub
 *
 * Complete creative redesign:
 * - Gradient hero banner with search-first design
 * - Stat row (total patients count)
 * - Table-style patient list inside a card with column headers
 * - Rich detail modal with tabbed sections
 * - Compliance progress bars and care reminder toggles
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTenantAuth } from '../TenantAuthContext';
import { Modal, TabBar } from '../../platform/components/shared';
import {
  listDoctorPatients, getPatient, listAppointments, listPrescriptions,
  getPatientCompliance, togglePatientTaskReminder,
  enablePatientReminders, disablePatientReminders,
} from '../api';
import { useToast } from '../ToastContext';
import {
  Users, Search, User, Phone, Calendar, ClipboardList, Clock,
  Pill, HeartPulse, CheckCircle2, XCircle, AlertTriangle,
  Bell, BellOff, ChevronLeft, ChevronRight, Mail, MapPin,
} from 'lucide-react';

/* ── Helpers ────────���─────────────────────────────── */
const AVATAR_GRADIENTS = [
  'from-primary-400 to-primary-600', 'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600', 'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600', 'from-cyan-400 to-sky-600',
];

function avatarGradient(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const APPT_STATUS = {
  requested:   { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' },
  confirmed:   { badge: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200', dot: 'bg-yellow-500' },
  checked_in:  { badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', dot: 'bg-blue-500' },
  in_progress: { badge: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', dot: 'bg-purple-500' },
  completed:   { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  cancelled:   { badge: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  no_show:     { badge: 'bg-red-50/60 text-red-600 ring-1 ring-red-200', dot: 'bg-red-400' },
};

const DETAIL_TABS = [
  { key: 'info', label: 'Info' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'compliance', label: 'Compliance' },
];

/* ═════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════���══════════════════════════════════════════ */
export default function DoctorPatientRecords() {
  const { user } = useTenantAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef(null);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPatient, setDetailPatient] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('info');
  const [patientAppointments, setPatientAppointments] = useState([]);
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);
  const [subLoading, setSubLoading] = useState(false);
  const [patientCompliance, setPatientCompliance] = useState(null);
  const [doctorToggling, setDoctorToggling] = useState(null);
  const [reminderActionId, setReminderActionId] = useState(null);

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (search) params.search = search;
      const res = await listDoctorPatients(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setPatients(data);
      setTotal(res.meta?.total ?? res.total ?? data.length);
    } catch (err) {
      setError(err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setPage(1), 400);
  };

  const openDetail = async (patient) => {
    const id = patient._id || patient.id;
    setDetailTab('info');
    setDetailOpen(true);
    setDetailLoading(true);
    setPatientAppointments([]);
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
    setPatientAppointments([]);
    setPatientPrescriptions([]);
    setPatientCompliance(null);
  };

  // Load sub-tab data
  useEffect(() => {
    if (!detailOpen || !detailPatient) return;
    const patientId = detailPatient._id || detailPatient.id;
    const doctorId = user?._id || user?.id;

    if (detailTab === 'appointments' && patientAppointments.length === 0) {
      setSubLoading(true);
      listAppointments({ patient: patientId, doctor: doctorId, limit: 50 })
        .then((res) => setPatientAppointments(res.data || []))
        .catch(() => {}).finally(() => setSubLoading(false));
    }

    if (detailTab === 'prescriptions' && patientPrescriptions.length === 0) {
      setSubLoading(true);
      listPrescriptions({ patient: patientId, limit: 50 })
        .then((res) => setPatientPrescriptions(res.data || []))
        .catch(() => {}).finally(() => setSubLoading(false));
    }

    if (detailTab === 'compliance' && !patientCompliance) {
      setSubLoading(true);
      getPatientCompliance(patientId)
        .then((res) => setPatientCompliance(res.data || res))
        .catch(() => setPatientCompliance({ prescriptions: [] }))
        .finally(() => setSubLoading(false));
    }
  }, [detailTab, detailOpen, detailPatient, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDoctorToggle = async (patientId, taskId) => {
    setDoctorToggling(taskId);
    try {
      const res = await togglePatientTaskReminder(patientId, taskId);
      const updated = res.data || {};
      setPatientCompliance((prev) => {
        if (!prev) return prev;
        const prescriptions = (prev.prescriptions || []).map((rx) => ({
          ...rx,
          tasks: (rx.tasks || []).map((t) =>
            (t._id || t.taskId) === taskId ? { ...t, isActive: updated.isActive } : t,
          ),
        }));
        return { ...prev, prescriptions };
      });
    } catch { /* silently ignore */ } finally { setDoctorToggling(null); }
  };

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
    } finally { setReminderActionId(null); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ══ HERO BANNER ═══════���════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50/30 border border-indigo-100/60 p-6 sm:p-8 animate-[fadeUp_0.4s_ease-out_both]">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold font-display text-neutral-900">My Patients</h1>
              <p className="text-sm text-neutral-600">
                {total > 0 ? `${total} patient${total !== 1 ? 's' : ''} in your care` : 'View patient records and history'}
              </p>
            </div>
          </div>

          {/* Search in hero */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Search by name, phone, or ID..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* ══ ERROR ══════════════════════════════════════ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button onClick={fetchPatients} className="text-sm font-semibold text-red-700 underline">Retry</button>
        </div>
      )}

      {/* ══ LOADING ════════════════════════════════════ */}
      {loading && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-pulse">
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50/60">
            <div className="col-span-4 h-3 bg-neutral-100 rounded w-20" />
            <div className="col-span-2 h-3 bg-neutral-100 rounded w-16" />
            <div className="col-span-3 h-3 bg-neutral-100 rounded w-24" />
            <div className="col-span-2 h-3 bg-neutral-100 rounded w-14" />
            <div className="col-span-1 h-3 bg-neutral-100 rounded w-12" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-neutral-50">
              <div className="w-10 h-10 rounded-full bg-neutral-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-neutral-100 rounded w-32" />
                <div className="h-3 bg-neutral-100 rounded w-48" />
              </div>
              <div className="h-6 bg-neutral-100 rounded-full w-14" />
            </div>
          ))}
        </div>
      )}

      {/* ══ EMPTY STATE ════════════════════════════════ */}
      {!loading && patients.length === 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] flex flex-col items-center justify-center py-20 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
          <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center mb-5">
            <Users className="h-10 w-10 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold font-display text-neutral-900 mb-1">
            {search ? 'No patients found' : 'No patients yet'}
          </h3>
          <p className="text-sm text-neutral-500">
            {search ? 'Try a different search term' : 'Patients you have consulted will appear here'}
          </p>
        </div>
      )}

      {/* ══ PATIENT LIST (Table-style) ═════════════════ */}
      {!loading && patients.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 border-b border-neutral-100 bg-neutral-50/60 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            <div className="col-span-4">Patient</div>
            <div className="col-span-2">Patient ID</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-2">Gender</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          <div className="divide-y divide-neutral-100">
            {patients.map((patient, idx) => {
              const name = patient.name || 'Unknown';
              const genderColors = { male: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', female: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' };

              return (
                <motion.div
                  key={patient._id || patient.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  className="group lg:grid lg:grid-cols-12 gap-4 px-5 py-4 hover:bg-neutral-50/60 transition-colors cursor-pointer items-center"
                  onClick={() => openDetail(patient)}
                >
                  <div className="col-span-4 flex items-center gap-3 mb-3 lg:mb-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {getInitials(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate font-display">{name}</p>
                      <p className="text-[11px] text-neutral-500 truncate">{patient.email || '—'}</p>
                    </div>
                  </div>

                  <div className="col-span-2 mb-2 lg:mb-0">
                    <span className="text-xs text-neutral-500 font-mono">
                      {patient.patientId || (patient._id || '').slice(-8)}
                    </span>
                  </div>

                  <div className="col-span-3 mb-2 lg:mb-0">
                    <span className="text-xs text-neutral-600 flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-neutral-400" /> {patient.phone || '—'}
                    </span>
                  </div>

                  <div className="col-span-2 mb-2 lg:mb-0">
                    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${genderColors[patient.gender] || 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200'}`}>
                      {patient.gender || 'other'}
                    </span>
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50/30 flex items-center justify-between">
              <p className="text-xs text-neutral-500">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-4 w-4 text-neutral-600" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pn; if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i;
                  return <button key={i} onClick={() => setPage(pn)} className={`min-w-[2rem] h-8 px-2.5 rounded-lg text-xs font-medium transition-all ${page === pn ? 'bg-indigo-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'}`}>{pn}</button>;
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-4 w-4 text-neutral-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PATIENT DETAIL MODAL ═══════════════════════ */}
      <Modal open={detailOpen} onClose={closeDetail} title="Patient Details" wide>
        {detailLoading ? (
          <div className="space-y-4 py-4 animate-pulse">
            <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-neutral-100" /><div className="flex-1 space-y-2"><div className="h-5 bg-neutral-100 rounded w-40" /><div className="h-3 bg-neutral-100 rounded w-24" /></div></div>
            <div className="h-10 bg-neutral-100 rounded-xl" />
            <div className="h-40 bg-neutral-100 rounded-xl" />
          </div>
        ) : detailPatient ? (
          <div className="space-y-5">
            {/* Patient header */}
            <div className="flex items-center gap-4 pb-4 border-b border-neutral-200">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarGradient(detailPatient.name)} flex items-center justify-center text-white text-lg font-bold`}>
                {getInitials(detailPatient.name)}
              </div>
              <div>
                <h3 className="text-lg font-semibold font-display text-neutral-900">{detailPatient.name}</h3>
                <p className="text-xs text-neutral-500 font-mono">ID: {detailPatient.patientId || (detailPatient._id || '').slice(-8)}</p>
              </div>
            </div>

            <TabBar tabs={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />

            {/* ── Info Tab ─────────────────────────── */}
            {detailTab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Email', value: detailPatient.email, icon: Mail },
                  { label: 'Phone', value: detailPatient.phone, icon: Phone },
                  { label: 'Gender', value: detailPatient.gender },
                  { label: 'Date of Birth', value: formatDate(detailPatient.dateOfBirth) },
                  { label: 'Blood Group', value: detailPatient.bloodGroup },
                  {
                    label: 'Address', icon: MapPin,
                    value: detailPatient.address
                      ? `${detailPatient.address.street || ''} ${detailPatient.address.city || ''} ${detailPatient.address.state || ''} ${detailPatient.address.zipCode || ''}`.trim()
                      : null,
                  },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl bg-neutral-50 border border-neutral-100 p-4">
                    <div className="flex items-start gap-2">
                      {item.icon && <item.icon className="h-3.5 w-3.5 text-neutral-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">{item.label}</p>
                        <p className="text-sm font-medium text-neutral-900 capitalize">{item.value || '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Appointments Tab ─────────────────── */}
            {detailTab === 'appointments' && (
              subLoading ? (
                <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-neutral-100 rounded-xl animate-pulse" />)}</div>
              ) : patientAppointments.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-neutral-400">
                  <Calendar className="h-8 w-8 mb-3" />
                  <p className="text-sm font-medium">No appointments found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {patientAppointments.map((appt) => {
                    const s = APPT_STATUS[appt.status] || APPT_STATUS.completed;
                    return (
                      <div key={appt._id || appt.id} className="flex items-center justify-between gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100 hover:bg-neutral-100/60 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-blue-50 shrink-0"><Clock className="h-4 w-4 text-blue-600" /></div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {formatDate(appt.scheduledAt || appt.date)}
                              {appt.startTime && ` at ${new Date(appt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </p>
                            <p className="text-xs text-neutral-500 capitalize">{(appt.type || 'consultation').replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${s.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{(appt.status || '').replace(/_/g, ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Prescriptions Tab ────────────────── */}
            {detailTab === 'prescriptions' && (
              subLoading ? (
                <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 bg-neutral-100 rounded-xl animate-pulse" />)}</div>
              ) : patientPrescriptions.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-neutral-400">
                  <ClipboardList className="h-8 w-8 mb-3" />
                  <p className="text-sm font-medium">No prescriptions found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {patientPrescriptions.map((rx) => {
                    const rxId = rx._id || rx.id;
                    const isActive = rx.status === 'active';
                    const remindersOn = !!rx.followUpRemindersEnabled;
                    const isToggling = reminderActionId === rxId;
                    return (
                      <div key={rxId} className="rounded-xl bg-neutral-50 border border-neutral-100 p-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-sm font-medium text-neutral-900 truncate font-display">{rx.diagnosis || 'No diagnosis'}</p>
                          <span className="text-xs text-neutral-400 shrink-0">{formatDate(rx.createdAt || rx.date)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                              <Pill className="h-2.5 h-2.5" /> {rx.medications?.length || 0} meds
                            </span>
                            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              rx.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                              rx.status === 'cancelled' ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                            }`}>{rx.status || 'unknown'}</span>
                            {remindersOn && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                                <Bell className="h-2.5 w-2.5" /> Reminders on
                              </span>
                            )}
                          </div>
                          {isActive && (
                            <button
                              onClick={() => handleToggleReminders(detailPatient._id || detailPatient.id, rxId, remindersOn)}
                              disabled={isToggling}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition shrink-0 ${
                                remindersOn ? 'text-neutral-600 bg-neutral-200 hover:bg-neutral-300' : 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-600/20'
                              } ${isToggling ? 'opacity-50' : ''}`}
                            >
                              {isToggling ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : remindersOn ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                              {remindersOn ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Compliance Tab ───────────────────── */}
            {detailTab === 'compliance' && (
              subLoading ? (
                <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 bg-neutral-100 rounded-xl animate-pulse" />)}</div>
              ) : !patientCompliance || !patientCompliance.prescriptions?.length ? (
                <div className="flex flex-col items-center py-12 text-neutral-400">
                  <HeartPulse className="h-8 w-8 mb-3" />
                  <p className="text-sm font-medium">No care reminders</p>
                  <p className="text-xs mt-1">No active care reminder tasks for this patient</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patientCompliance.overallCompliance != null && (
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                      patientCompliance.overallCompliance >= 75 ? 'bg-emerald-50 border-emerald-100' :
                      patientCompliance.overallCompliance >= 50 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <HeartPulse className={`h-5 w-5 ${
                        patientCompliance.overallCompliance >= 75 ? 'text-emerald-600' : patientCompliance.overallCompliance >= 50 ? 'text-amber-600' : 'text-red-600'
                      }`} />
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Overall Compliance: {(patientCompliance.overallCompliance || 0).toFixed(1)}%</p>
                        <p className="text-xs text-neutral-500">
                          {patientCompliance.overallCompliance >= 75 ? 'Good adherence' : patientCompliance.overallCompliance >= 50 ? 'Needs improvement' : 'Low adherence — action needed'}
                        </p>
                      </div>
                    </div>
                  )}

                  {patientCompliance.prescriptions.map((rx) => (
                    <div key={rx.prescriptionId || rx._id} className="rounded-xl bg-neutral-50 border border-neutral-100 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-sm font-medium text-neutral-900 truncate font-display">{rx.diagnosis || 'Prescription'}</p>
                        <span className="text-xs text-neutral-400">{formatDate(rx.createdAt)}</span>
                      </div>
                      {(rx.tasks || []).map((task) => (
                        <div key={task._id || task.taskId} className="ml-2 mb-3 last:mb-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-xs font-medium text-neutral-700">{task.title || task.medication || 'Task'}</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDoctorToggle(detailPatient._id, task._id || task.taskId)}
                                disabled={doctorToggling === (task._id || task.taskId)}
                                className={`relative w-9 h-[18px] rounded-full transition-colors ${task.isActive !== false ? 'bg-green-500' : 'bg-gray-300'} ${doctorToggling === (task._id || task.taskId) ? 'opacity-50' : ''}`}
                              >
                                <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${task.isActive !== false ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                              </button>
                              <span className={`text-xs font-semibold ${(task.completionRate || 0) >= 75 ? 'text-emerald-600' : (task.completionRate || 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {(task.completionRate || 0).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${(task.completionRate || 0) >= 75 ? 'bg-emerald-500' : (task.completionRate || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, task.completionRate || 0)}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-400">
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {task.completed ?? 0} done</span>
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> {task.missed ?? 0} missed</span>
                            {task.total != null && <span>Total: {task.total}</span>}
                          </div>
                        </div>
                      ))}

                      {rx.recentReminders?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-200">
                          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Recent Activity</p>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {rx.recentReminders.slice(0, 10).map((r, ri) => (
                              <div key={ri} className="flex items-center gap-2 text-xs">
                                {r.status === 'completed' ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> :
                                 r.status === 'missed' ? <XCircle className="h-3 w-3 text-red-400 shrink-0" /> :
                                 r.status === 'skipped' ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /> :
                                 <Clock className="h-3 w-3 text-neutral-400 shrink-0" />}
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
              <button onClick={closeDetail} className="px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition">Close</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
