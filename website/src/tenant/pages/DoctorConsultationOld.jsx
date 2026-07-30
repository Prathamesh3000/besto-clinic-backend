/**
 * DoctorConsultation — Modern single consultation view & editor
 *
 * Design: 2025 Redesign with sectioned layout, modern cards, auto-save
 * Features: Consultation form, vitals, prescriptions, dental chart, video calls
 *
 * @version 2.0
 * @date April 2026
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Video, Stethoscope, CalendarDays, Tag,
  Check, AlertCircle, DoorOpen, Save, Loader2, CheckCircle2,
  User, Phone, Mail, Activity, Heart, Thermometer, Droplets,
  Pill, FileText, AlertTriangle, ChevronRight, Edit, Eye,
  Sparkles, Clipboard, Upload, Download, Plus, X,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import { useToast } from '../ToastContext';
import {
  getAppointment,
  startConsultation,
  updateConsultation,
  completeConsultation,
  uploadDoctorAttachment,
  listDoctorAttachments,
  createFollowUp,
  getPatient,
  listProcedures,
  listVideoSessions,
  createVideoSession,
  getClinicSettings,
  getDoctorProfile,
  getDoctorCurrentRoom,
  listRooms,
} from '../api';
import ConsultationForm from '../components/ConsultationFormOld';
import ConsultationDetailView from '../components/ConsultationDetailView';
import VideoCallPanel from '../components/VideoCallPanel';
import {
  EMPTY_TOOTH, EMPTY_MED, INITIAL_CONSULT_FORM,
  buildEnrichedNotes, cardCls as oldCardCls,
} from '../components/consultationHelpers';
import { Spinner, ErrorAlert } from '../../platform/components/shared';

// ─── Design Constants ─────────────────────────────
const cardCls = 'bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-sm)]';
const sectionTitle = 'text-lg font-bold text-neutral-900 font-display mb-4 flex items-center gap-2';
const inputCls = 'w-full px-4 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const btnPrimary = 'px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = 'px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all disabled:opacity-50';

// ─── Auto-save interval ───────────────────────────
const AUTO_SAVE_INTERVAL = 30000;

// ─── Format helpers ───────────────────────────────
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const relativeTime = (d) => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

// ─── Main Component ───────────────────────────────
export default function DoctorConsultation() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const { showToast } = useToast();
  const backPath = user?.role === 'doctor' ? '/clinic/doctor-consultations' : '/clinic/consultations';

  // ── Appointment & consultation state ──
  const [appointment, setAppointment] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [activeConsultation, setActiveConsultation] = useState(null);
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultError, setConsultError] = useState('');
  const [consultPatient, setConsultPatient] = useState(null);

  // ── Room selection & assignment ──
  const [currentRoom, setCurrentRoom] = useState(null);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [needsRoomSelection, setNeedsRoomSelection] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // ── Consultation form state ──
  const [consultForm, setConsultForm] = useState({ ...INITIAL_CONSULT_FORM });
  const [reminderConfig, setReminderConfig] = useState({ enabled: true, medications: {} });
  const [attachments, setAttachments] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  // ── Procedure catalog ──
  const [procedures, setProcedures] = useState([]);

  // ── Clinic & Doctor letterhead ──
  const [clinicData, setClinicData] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);

  // ── Telemedicine ──
  const [videoSessionId, setVideoSessionId] = useState(null);
  const [videoMinimized, setVideoMinimized] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  // ── Auto-save ──
  const [lastSaved, setLastSaved] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const hasUnsavedChanges = useRef(false);
  const autoSaveTimerRef = useRef(null);
  const formRef = useRef(consultForm);
  const consultationRef = useRef(null);
  const savingRef = useRef(false);

  // ── View mode toggle ──
  const [viewMode, setViewMode] = useState(false);

  // Load appointment
  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    setPageLoading(true);
    getAppointment(appointmentId)
      .then((res) => {
        if (cancelled) return;
        const appt = res.data || res;
        setAppointment(appt);

        // If consultation exists and is in_progress/completed, load it
        if (appt.consultation && ['in_progress', 'completed'].includes(appt.consultation.status)) {
          const consultation = appt.consultation;
          setActiveConsultation(consultation);
          consultationRef.current = consultation;

          // Pre-fill form
          setConsultForm({
            chiefComplaint: consultation.chiefComplaint || '',
            vitals: consultation.vitals || { bp: '', temperature: '', pulse: '', spo2: '', painScale: '' },
            diagnosis: consultation.diagnosis && consultation.diagnosis !== 'In progress' ? consultation.diagnosis : '',
            treatment: consultation.treatment && consultation.treatment !== 'In progress' ? consultation.treatment : '',
            teeth: consultation.teeth?.length ? consultation.teeth : [{ ...EMPTY_TOOTH }],
            prescriptions: consultation.prescriptions?.length ? consultation.prescriptions : [{ ...EMPTY_MED }],
            notes: consultation.notes || '',
            followUpDate: consultation.followUpDate ? consultation.followUpDate.slice(0, 10) : '',
          });

          if (consultation.status === 'completed') {
            setViewMode(true);
          }
        }

        // Load patient
        const patientId = appt.patient?._id || appt.patient?.id || appt.patient;
        if (patientId) {
          getPatient(patientId).then((r) => {
            if (!cancelled) setConsultPatient(r.data || r);
          }).catch(() => {});
        }

        setPageLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPageError(err.message || 'Failed to load appointment');
        setPageLoading(false);
      });

    return () => { cancelled = true; };
  }, [appointmentId]);

  // Load procedures, clinic, doctor
  useEffect(() => {
    listProcedures({ limit: 500 }).then((r) => setProcedures(r.data || [])).catch(() => {});
    getClinicSettings().then((r) => setClinicData(r.data || r)).catch(() => {});
    getDoctorProfile().then((r) => setDoctorProfile(r.data || r)).catch(() => {});
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (!activeConsultation || viewMode || !appointment) return;
    formRef.current = consultForm;
    hasUnsavedChanges.current = true;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (savingRef.current || !hasUnsavedChanges.current) return;
      savingRef.current = true;
      setAutoSaveStatus('saving');
      try {
        await updateConsultation(activeConsultation._id, {
          ...formRef.current,
          updatedAt: new Date().toISOString(),
        });
        setLastSaved(new Date());
        setAutoSaveStatus('saved');
        hasUnsavedChanges.current = false;
        setTimeout(() => setAutoSaveStatus(''), 2000);
      } catch {
        setAutoSaveStatus('');
      } finally {
        savingRef.current = false;
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [consultForm, activeConsultation, viewMode, appointment]);

  const handleStartConsultation = async () => {
    if (!appointment) return;
    setConsultLoading(true);
    try {
      const res = await startConsultation({ appointmentId: appointment._id });
      const consultation = res.data?.record || res.data || res;
      setActiveConsultation(consultation);
      consultationRef.current = consultation;
      setConsultLoading(false);
      showToast('Consultation started successfully', 'success');
    } catch (err) {
      setConsultError(err.message || 'Failed to start consultation');
      setConsultLoading(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (!activeConsultation || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateConsultation(activeConsultation._id, consultForm);
      setLastSaved(new Date());
      hasUnsavedChanges.current = false;
      showToast('Consultation saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleCompleteConsultation = async () => {
    if (!activeConsultation) return;
    setCompleting(true);
    try {
      await completeConsultation(activeConsultation._id, {
        ...consultForm,
        reminderConfig, // Include reminder configuration
      });
      showToast('Consultation completed successfully', 'success');
      setViewMode(true);
      navigate(backPath);
    } catch (err) {
      showToast(err.message || 'Failed to complete consultation', 'error');
    } finally {
      setCompleting(false);
    }
  };

  // ── Form field handlers ──
  const handleFieldChange = (field, value) => {
    setConsultForm(prev => ({ ...prev, [field]: value }));
  };

  const handleVitalChange = (field, value) => {
    setConsultForm(prev => ({
      ...prev,
      vitals: { ...prev.vitals, [field]: value }
    }));
  };

  const handleToothChange = (index, field, value) => {
    setConsultForm(prev => ({
      ...prev,
      teeth: prev.teeth.map((t, i) => i === index ? { ...t, [field]: value } : t)
    }));
  };

  const handleProcedureSelect = (index, procedureId) => {
    const procedure = procedures.find(p => p._id === procedureId || p.id === procedureId);
    if (procedure) {
      setConsultForm(prev => ({
        ...prev,
        teeth: prev.teeth.map((t, i) => i === index ? {
          ...t,
          procedureId,
          procedure: procedure.name,
          estimatedCost: procedure.estimatedCost || 0,
          requiredMaterials: procedure.requiredMaterials || []
        } : t)
      }));
    }
  };

  const handleAddTooth = () => {
    setConsultForm(prev => ({
      ...prev,
      teeth: [...prev.teeth, { ...EMPTY_TOOTH }]
    }));
  };

  const handleRemoveTooth = (index) => {
    setConsultForm(prev => ({
      ...prev,
      teeth: prev.teeth.filter((_, i) => i !== index)
    }));
  };

  const handleMedChange = (index, field, value) => {
    setConsultForm(prev => ({
      ...prev,
      prescriptions: prev.prescriptions.map((m, i) => i === index ? { ...m, [field]: value } : m)
    }));
  };

  const handleAddMed = () => {
    setConsultForm(prev => ({
      ...prev,
      prescriptions: [...prev.prescriptions, { ...EMPTY_MED }]
    }));
  };

  const handleRemoveMed = (index) => {
    setConsultForm(prev => ({
      ...prev,
      prescriptions: prev.prescriptions.filter((_, i) => i !== index)
    }));
    // Also remove reminder config for this medication
    setReminderConfig(prev => {
      const newMedications = { ...prev.medications };
      delete newMedications[index];
      // Re-index remaining medications
      const reindexed = {};
      Object.keys(newMedications).forEach(key => {
        const oldIndex = parseInt(key, 10);
        if (oldIndex > index) {
          reindexed[oldIndex - 1] = newMedications[key];
        } else {
          reindexed[key] = newMedications[key];
        }
      });
      return { ...prev, medications: reindexed };
    });
  };

  const handleReminderToggle = (index, enabled) => {
    setReminderConfig(prev => ({
      ...prev,
      medications: {
        ...prev.medications,
        [index]: { ...prev.medications[index], enabled }
      }
    }));
  };

  const handleTimeChange = (index, customTimes) => {
    setReminderConfig(prev => ({
      ...prev,
      medications: {
        ...prev.medications,
        [index]: { ...prev.medications[index], customTimes }
      }
    }));
  };

  const handleFileUpload = (files) => {
    // TODO: Implement file upload
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const patient = consultPatient || appointment?.patient;
  const patientAge = calculateAge(patient?.dateOfBirth);

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="p-6">
        <ErrorAlert message={pageError} onClose={() => navigate(backPath)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header Bar */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(backPath)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>

            <div className="h-6 w-px bg-neutral-300" />

            <div>
              <h1 className="text-xl font-bold text-neutral-900 font-display">
                Consultation
              </h1>
              <p className="text-sm text-neutral-500">
                {patient?.name || 'Patient'} • {fmtDate(appointment?.scheduledDate)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {autoSaveStatus && (
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                {autoSaveStatus === 'saving' && (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-600">Saved</span>
                  </>
                )}
              </div>
            )}

            {!viewMode && activeConsultation && (
              <>
                <button
                  onClick={handleSaveConsultation}
                  disabled={saving}
                  className={btnSecondary}
                >
                  <Save className="w-4 h-4 inline mr-2" />
                  Save Draft
                </button>
                <button
                  onClick={handleCompleteConsultation}
                  disabled={completing}
                  className={btnPrimary}
                >
                  <CheckCircle2 className="w-4 h-4 inline mr-2" />
                  Complete Consultation
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Patient Info Card */}
        {patient && (
          <div className={`${cardCls} p-6`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  {patient.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P'}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900">{patient.name}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-neutral-600">
                    {patientAge && (
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>{patientAge} years old</span>
                      </div>
                    )}
                    {patient.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        <span>{patient.phone}</span>
                      </div>
                    )}
                    {patient.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        <span>{patient.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Appointment Status */}
              <div className="text-right">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold">
                  <CalendarDays className="w-4 h-4" />
                  <span>{fmtTime(appointment?.scheduledDate)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Start Consultation Button */}
        {!activeConsultation && appointment && (
          <div className={`${cardCls} p-8 text-center`}>
            <Stethoscope className="w-16 h-16 mx-auto mb-4 text-primary-500" />
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Ready to start consultation?</h3>
            <p className="text-neutral-600 mb-6">
              Begin the consultation session for {patient?.name}
            </p>
            <button
              onClick={handleStartConsultation}
              disabled={consultLoading}
              className={btnPrimary}
            >
              {consultLoading ? (
                <>
                  <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Stethoscope className="w-4 h-4 inline mr-2" />
                  Start Consultation
                </>
              )}
            </button>
          </div>
        )}

        {/* Consultation Form/View */}
        {activeConsultation && (
          viewMode ? (
            <ConsultationDetailView
              consultation={activeConsultation}
              patient={patient}
              doctor={doctorProfile}
              clinic={clinicData}
              form={consultForm}
              appointment={appointment}
              uploadedFiles={uploadedFiles}
            />
          ) : (
            <ConsultationForm
              consultation={activeConsultation}
              patient={patient}
              form={consultForm}
              loading={consultLoading}
              error={consultError}
              saving={saving}
              completing={completing}
              uploadedFiles={uploadedFiles}
              procedures={procedures}
              reminderConfig={reminderConfig}
              onFieldChange={handleFieldChange}
              onVitalChange={handleVitalChange}
              onToothChange={handleToothChange}
              onProcedureSelect={handleProcedureSelect}
              onAddTooth={handleAddTooth}
              onRemoveTooth={handleRemoveTooth}
              onMedChange={handleMedChange}
              onAddMed={handleAddMed}
              onRemoveMed={handleRemoveMed}
              onReminderToggle={handleReminderToggle}
              onTimeChange={handleTimeChange}
              onSaveDraft={handleSaveConsultation}
              onComplete={handleCompleteConsultation}
              onFileUpload={handleFileUpload}
              showPatientSidebar={false}
              readOnly={viewMode}
              clinic={clinicData}
              doctor={doctorProfile}
              appointmentDate={appointment?.scheduledDate}
            />
          )
        )}
      </div>
    </div>
  );
}
