/**
 * PatientDrawer — Slide-in drawer for patient details.
 * 4 tabs: Info, Appointments, Prescriptions, Compliance.
 * Used by DoctorPatients page.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  X, Phone, Mail, MapPin, AlertCircle, CalendarDays,
  ClipboardList, Activity, ChevronRight, Pill, Clock, CheckCircle2,
} from 'lucide-react';
import {
  getPatient, listAppointments, listPrescriptions, getPatientCompliance,
  togglePatientTaskReminder, enablePatientReminders, disablePatientReminders,
} from '../../api';
import {
  cardCls, btnPrimary, btnGhost, formatDate, formatTime, formatCurrency,
  ApptBadge, Badge, SkeletonLoader, EmptyState, TabBar,
} from './shared';

// ─── Main Drawer ────────────────────────────────────
export default function PatientDrawer({ open, patient, userId, onClose, onStartConsultation }) {
  const [tab, setTab] = useState('info');
  const [detail, setDetail] = useState(null);
  const [appts, setAppts] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);

  const pid = patient?._id || patient?.id;

  // Fetch all patient data when drawer opens
  useEffect(() => {
    if (!open || !pid) return;
    setTab('info');
    setLoading(true);

    Promise.allSettled([
      getPatient(pid),
      listAppointments({ patient: pid, doctor: userId, limit: 50, sort: '-scheduledAt' }),
      listPrescriptions({ patient: pid, limit: 50, sort: '-createdAt' }),
      getPatientCompliance(pid),
    ]).then(([detailRes, apptsRes, rxRes, compRes]) => {
      const d = detailRes.status === 'fulfilled' ? (detailRes.value?.data || detailRes.value) : null;
      setDetail(d);

      const aData = apptsRes.status === 'fulfilled' ? (apptsRes.value?.data?.items || apptsRes.value?.data?.appointments || apptsRes.value?.data || []) : [];
      setAppts(Array.isArray(aData) ? aData : []);

      const rData = rxRes.status === 'fulfilled' ? (rxRes.value?.data?.items || rxRes.value?.data?.prescriptions || rxRes.value?.data || []) : [];
      setPrescriptions(Array.isArray(rData) ? rData : []);

      const cData = compRes.status === 'fulfilled' ? (compRes.value?.data || compRes.value) : null;
      setCompliance(cData);

      setLoading(false);
    });
  }, [open, pid, userId]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const p = detail || patient;
  const name = p?.firstName ? `${p.firstName} ${p.lastName || ''}`.trim() : (p?.name || 'Patient');
  const initial = (name[0] || '?').toUpperCase();

  const tabs = [
    { key: 'info', label: 'Info' },
    { key: 'appointments', label: `Appointments${appts.length ? ` (${appts.length})` : ''}` },
    { key: 'prescriptions', label: `Rx${prescriptions.length ? ` (${prescriptions.length})` : ''}` },
    { key: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative bg-white shadow-[var(--shadow-xl)] flex flex-col animate-[slideInRight_0.25s_ease-out] w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-neutral-200 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-lg font-bold text-primary-700 shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold font-display text-neutral-900 truncate">{name}</h3>
            <p className="text-xs text-neutral-400 font-mono">ID: {p?.patientId || pid?.slice(-8) || '--'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="px-6 pt-2 shrink-0">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              <SkeletonLoader className="h-8 w-48" />
              <SkeletonLoader className="h-32 w-full" />
              <SkeletonLoader className="h-24 w-full" />
            </div>
          ) : (
            <>
              {tab === 'info' && <InfoTab patient={detail || patient} />}
              {tab === 'appointments' && <AppointmentsTab appointments={appts} onStartConsultation={onStartConsultation} />}
              {tab === 'prescriptions' && <PrescriptionsTab prescriptions={prescriptions} patientId={pid} />}
              {tab === 'compliance' && <ComplianceTab compliance={compliance} patientId={pid} />}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Info Tab ───────────────────────────────────────
function InfoTab({ patient }) {
  if (!patient) return <EmptyState icon={AlertCircle} title="No patient data" />;
  const p = patient;

  return (
    <div className="space-y-5">
      {/* Demographics grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCell label="Gender" value={p.gender || '--'} capitalize />
        <InfoCell
          label="DOB / Age"
          value={
            p.dateOfBirth
              ? `${new Date(p.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} (${Math.floor((Date.now() - new Date(p.dateOfBirth)) / 31536000000)} yrs)`
              : p.age ? `${p.age} yrs` : '--'
          }
        />
        <InfoCell label="Blood Group" value={p.bloodGroup || '--'} />
        <InfoCell label="Phone" value={p.phone || '--'} icon={Phone} />
        <InfoCell label="Email" value={p.email || '--'} icon={Mail} truncate />
        {p.address && (
          <InfoCell
            label="Address"
            icon={MapPin}
            value={
              typeof p.address === 'string'
                ? p.address
                : [p.address.street, p.address.city, p.address.state, p.address.zip].filter(Boolean).join(', ') || '--'
            }
          />
        )}
      </div>

      {/* Allergies */}
      {p.allergies?.length > 0 && (
        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-xs font-semibold text-red-700">Allergies</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Array.isArray(p.allergies) ? p.allergies : [p.allergies]).map((a, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                {typeof a === 'string' ? a : a.name || a.allergen || 'Unknown'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Medical History */}
      {p.medicalHistory && (
        <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100">
          <p className="text-xs font-semibold text-amber-700 mb-2">Medical History</p>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {typeof p.medicalHistory === 'string'
              ? p.medicalHistory
              : Array.isArray(p.medicalHistory)
                ? p.medicalHistory.join(', ')
                : '--'}
          </p>
        </div>
      )}

      {/* Emergency Contact */}
      {p.emergencyContact && (
        <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2">Emergency Contact</p>
          <p className="text-sm text-neutral-700">
            {p.emergencyContact.name || '--'} ({p.emergencyContact.relationship || '--'})
          </p>
          {p.emergencyContact.phone && (
            <p className="text-xs text-neutral-500 mt-1">{p.emergencyContact.phone}</p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, icon: Icon, capitalize, truncate }) {
  return (
    <div className={`p-3 bg-neutral-50 rounded-xl ${Icon ? 'flex items-start gap-2' : ''}`}>
      {Icon && <Icon className="h-3.5 w-3.5 text-neutral-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-sm font-medium text-neutral-900 ${capitalize ? 'capitalize' : ''} ${truncate ? 'truncate' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Appointments Tab ───────────────────────────────
function AppointmentsTab({ appointments, onStartConsultation }) {
  if (appointments.length === 0) {
    return <EmptyState icon={CalendarDays} title="No appointments" message="No appointment history with this patient" />;
  }

  return (
    <div className="space-y-3">
      {appointments.map((a, i) => {
        const canConsult = ['confirmed', 'checked_in', 'in_progress'].includes(a.status);
        return (
          <div key={a._id || a.id || i} className="p-4 rounded-xl border border-neutral-200 hover:bg-neutral-50/60 transition-colors group">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">
                  {formatDate(a.scheduledAt || a.date || a.appointmentDate)}
                  <span className="text-neutral-400 ml-2 font-normal">{formatTime(a.scheduledAt || a.date || a.startTime)}</span>
                </p>
                <p className="text-xs text-neutral-500 mt-0.5 capitalize">{a.type || a.appointmentType || 'Consultation'}</p>
                {a.reason && <p className="text-xs text-neutral-400 mt-1 truncate">{a.reason}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ApptBadge status={a.status} />
                {canConsult && onStartConsultation && (
                  <button
                    onClick={() => onStartConsultation(a)}
                    className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-all"
                  >
                    Consult
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Prescriptions Tab ──────────────────────────────
function PrescriptionsTab({ prescriptions, patientId }) {
  if (prescriptions.length === 0) {
    return <EmptyState icon={ClipboardList} title="No prescriptions" message="No prescription history for this patient" />;
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((rx, i) => {
        const meds = rx.medications || rx.prescription || [];
        return (
          <div key={rx._id || rx.id || i} className="p-4 rounded-xl border border-neutral-200">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">{rx.diagnosis || 'Prescription'}</p>
                <p className="text-xs text-neutral-400">{formatDate(rx.createdAt || rx.date)}</p>
              </div>
              <Badge color={rx.status === 'active' ? 'green' : rx.status === 'completed' ? 'primary' : 'amber'}>
                {rx.status || 'active'}
              </Badge>
            </div>

            {Array.isArray(meds) && meds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {meds.slice(0, 4).map((m, mi) => (
                  <span key={mi} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium">
                    <Pill className="h-3 w-3" />
                    {m.medication || m.name || 'Med'}
                  </span>
                ))}
                {meds.length > 4 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-500">+{meds.length - 4} more</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Compliance Tab ─────────────────────────────────
function ComplianceTab({ compliance, patientId }) {
  const [toggling, setToggling] = useState(null);

  const handleToggleTask = useCallback(async (taskId) => {
    if (!patientId) return;
    setToggling(taskId);
    try {
      await togglePatientTaskReminder(patientId, taskId);
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  }, [patientId]);

  if (!compliance) {
    return <EmptyState icon={Activity} title="No compliance data" message="Compliance tracking will appear once care tasks are assigned" />;
  }

  const tasks = compliance.tasks || compliance.careTasks || [];
  const adherence = compliance.adherenceRate ?? compliance.adherence ?? null;

  return (
    <div className="space-y-5">
      {/* Adherence overview */}
      {adherence !== null && (
        <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-neutral-700">Overall Adherence</p>
            <span className={`text-sm font-bold ${adherence >= 80 ? 'text-emerald-600' : adherence >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {adherence.toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${adherence >= 80 ? 'bg-emerald-500' : adherence >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(adherence, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No care tasks" message="Assign care tasks from prescriptions" />
      ) : (
        <div className="space-y-2">
          {tasks.map((task, i) => {
            const completed = task.completed || task.done;
            return (
              <div key={task._id || task.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 transition">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${completed ? 'bg-emerald-50' : 'bg-neutral-100'}`}>
                  {completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-neutral-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${completed ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                    {task.title || task.name || task.description || 'Task'}
                  </p>
                  {task.frequency && <p className="text-[11px] text-neutral-400">{task.frequency}</p>}
                </div>
                <button
                  onClick={() => handleToggleTask(task._id || task.id)}
                  disabled={toggling === (task._id || task.id)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition disabled:opacity-50 shrink-0"
                >
                  {toggling === (task._id || task.id) ? '...' : task.reminderEnabled ? 'Mute' : 'Remind'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
