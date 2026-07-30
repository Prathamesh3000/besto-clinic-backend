/**
 * DoctorConsultation - Modern Consultation Editor Page
 *
 * Complete rewrite with 2025-2026 design system:
 * - Sticky top bar with patient info and actions
 * - Modern consultation form with SOAP sections
 * - Auto-save with 30-second debounce
 * - ReminderConfig state management
 * - Framer Motion animations
 * - Professional healthcare aesthetics
 *
 * @version 3.0 (Complete Resurrection)
 * @date April 2026
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, User, Loader, AlertCircle, CheckCircle2,
  Save,
} from 'lucide-react';
import {
  getAppointment,
  startConsultation,
  updateConsultation,
  completeConsultation,
  getPatient,
  uploadDoctorAttachment,
  createFollowUp,
} from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { useToast } from '../ToastContext';
import ConsultationForm from '../components/ConsultationForm';
import TemplateSelector from '../components/TemplateSelector';

/* ── Helper Functions ──────────────────────────────── */

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--:--';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function validateConsultation(form) {
  const errors = [];

  // Diagnosis required for completion
  if (!form.diagnosis || form.diagnosis === 'In progress') {
    errors.push('Diagnosis is required');
  }

  // At least one of chief complaint or teeth entries
  const hasChiefComplaint = form.chiefComplaint && form.chiefComplaint.trim();
  const hasTeeth = form.teeth && form.teeth.length > 0;

  if (!hasChiefComplaint && !hasTeeth) {
    errors.push('Please provide at least a chief complaint or dental chart entry');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/** Populate form state from a TreatmentRecord document */
function populateFormFromRecord(record) {
  return {
    chiefComplaint: record.chiefComplaint || '',
    medicalHistory: record.medicalHistory || '',
    allergies: record.allergies || '',
    vitals: record.vitals || {},
    examination: record.examination || '',
    oralFindings: record.oralFindings || '',
    diagnosis: (record.diagnosis && record.diagnosis !== 'In progress') ? record.diagnosis : '',
    severity: record.severity || '',
    assessmentNotes: record.assessmentNotes || '',
    treatmentPlan: record.treatmentPlan || record.treatment || '',
    prescriptions: record.prescription?.length > 0
      ? record.prescription
      : [],
    followUpInstructions: record.followUpInstructions || '',
    procedure: record.procedure || '',
    priority: record.priority || '',
    estimatedCost: record.estimatedCost ?? '',
    visitType: record.visitType || '',
    patientConsent: record.patientConsent || '',
    followUpDate: record.followUpDate || '',
    teeth: record.teeth || [],
    careTasks: record.careTasks || [],
    doctorSignature: record.doctorSignature?.dataUrl || '',
  };
}

/** Transform form state into backend-compatible payload for auto-save / draft save */
function buildSavePayload(form, reminderConfig) {
  const { prescriptions, attachments, ...rest } = form;
  return {
    ...rest,
    // Backend field is `prescription`, frontend uses `prescriptions`
    prescription: (prescriptions || []).filter(m => m.medication?.trim()),
    // Map treatmentPlan → treatment (required by backend TreatmentRecord schema)
    treatment: rest.treatmentPlan || undefined,
    // Convert empty strings to null for enum/number fields that Joi rejects as ''
    severity: rest.severity || null,
    priority: rest.priority || null,
    estimatedCost: rest.estimatedCost === '' || rest.estimatedCost == null ? null : Number(rest.estimatedCost),
    // followUpDate: convert empty string to null
    followUpDate: rest.followUpDate || null,
    // doctorSignature as string for draft auto-save
    doctorSignature: rest.doctorSignature || null,
    reminderConfig,
    // NOTE: attachments are uploaded via separate API, not included in draft save
  };
}

/* ══════════════════════════════════════════════════════
   Main Component — Doctor Consultation Editor
   ══════════════════════════════════════════════════════ */

export default function DoctorConsultation() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user, clinic } = useTenantAuth();
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [consultation, setConsultation] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false);

  // Form State
  const [consultForm, setConsultForm] = useState({
    chiefComplaint: '',
    medicalHistory: '',
    allergies: '',
    vitals: {},
    examination: '',
    oralFindings: '',
    diagnosis: '',
    severity: '',
    assessmentNotes: '',
    treatmentPlan: '',
    prescriptions: [],
    followUpInstructions: '',
    procedure: '',
    priority: '',
    estimatedCost: '',
    visitType: '',
    patientConsent: '',
    followUpDate: '',
    teeth: [],
    careTasks: [],
    doctorSignature: '',
  });

  // Reminder Config State
  const [reminderConfig, setReminderConfig] = useState({
    enabled: true,
    medications: {},
  });

  // Auto-save refs
  const autoSaveTimer = useRef(null);
  const autoSaveInFlight = useRef(false);
  const loadInProgress = useRef(false);
  const hasLoaded = useRef(false);

  // Load appointment and patient data
  useEffect(() => {
    if (appointmentId && !loadInProgress.current && !hasLoaded.current) {
      loadInProgress.current = true;
      loadAppointmentData();
    }
  }, [appointmentId]);

  const loadAppointmentData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch appointment
      const apptRes = await getAppointment(appointmentId);
      const apptData = apptRes.data || apptRes;
      setAppointment(apptData);

      // Fetch patient
      if (apptData.patient?._id || apptData.patientId) {
        const patientId = apptData.patient?._id || apptData.patientId;
        const patientRes = await getPatient(patientId);
        setPatient(patientRes.data || patientRes);
      }

      // Check if consultation exists
      if (apptData.treatmentRecord?._id) {
        const record = apptData.treatmentRecord;
        setConsultation(record);

        // Populate form with existing data
        setConsultForm(populateFormFromRecord(record));
      } else if (!isCreatingConsultation) {
        // Start new consultation (guard to prevent infinite loop)
        setIsCreatingConsultation(true);
        try {
          const consultRes = await startConsultation({ appointmentId });
          const record = consultRes.data?.record || consultRes.record;

          if (record?._id) {
            // Use the response directly instead of reloading
            setConsultation(record);
            setConsultForm(populateFormFromRecord(record));
          }
        } finally {
          setIsCreatingConsultation(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load appointment');
      setIsCreatingConsultation(false);
    } finally {
      setLoading(false);
      loadInProgress.current = false;
      hasLoaded.current = true;
    }
  };

  // Auto-save handler
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(async () => {
      if (autoSaveInFlight.current) return;
      if (!consultation?._id) return;

      try {
        autoSaveInFlight.current = true;
        setAutoSaving(true);

        await updateConsultation(consultation._id, buildSavePayload(consultForm, reminderConfig));
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        autoSaveInFlight.current = false;
        setAutoSaving(false);
      }
    }, 30000); // 30 seconds
  }, [consultForm, reminderConfig, consultation]);

  // Trigger auto-save on form changes
  useEffect(() => {
    if (consultation) {
      triggerAutoSave();
    }
  }, [consultForm, triggerAutoSave]);

  // Cleanup auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, []);

  // Form change handlers
  const handleFormChange = (updates) => {
    setConsultForm((prev) => ({ ...prev, ...updates }));
  };

  // Upload file attachments to the server
  const handleFileUpload = async (files) => {
    if (!consultation?._id) return;
    const newAttachments = [];
    for (const file of files) {
      // Skip files already uploaded (they have a fileUrl from the server)
      if (file.fileUrl) { newAttachments.push(file); continue; }
      try {
        // Extract base64 data from data URL (strip prefix like "data:image/jpeg;base64,")
        const base64 = file.data?.split(',')[1];
        if (!base64) continue;
        const res = await uploadDoctorAttachment({
          treatmentId: consultation._id,
          fileData: base64,
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
        });
        const uploaded = res.data || res;
        newAttachments.push(uploaded);
        showToast({ type: 'success', message: `Uploaded: ${file.name}` });
      } catch (err) {
        showToast({ type: 'error', message: `Failed to upload ${file.name}: ${err.message}` });
      }
    }
    // Update form state with server-returned attachment data
    setConsultForm((prev) => ({ ...prev, attachments: newAttachments }));
  };

  // Schedule follow-up appointment from consultation
  const handleScheduleFollowUp = async () => {
    if (!consultation?._id || !consultForm.followUpDate) {
      showToast({ type: 'error', message: 'Please select a follow-up date first' });
      return;
    }
    try {
      await createFollowUp({
        treatmentId: consultation._id,
        followUpDate: new Date(consultForm.followUpDate).toISOString(),
      });
      showToast({ type: 'success', message: 'Follow-up appointment scheduled successfully' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to schedule follow-up' });
    }
  };

  const handleReminderToggle = (medIndex, enabled) => {
    setReminderConfig((prev) => ({
      ...prev,
      medications: {
        ...prev.medications,
        [medIndex]: { ...prev.medications[medIndex], enabled },
      },
    }));
  };

  const handleTimeChange = (medIndex, customTimes) => {
    setReminderConfig((prev) => ({
      ...prev,
      medications: {
        ...prev.medications,
        [medIndex]: { ...prev.medications[medIndex], customTimes },
      },
    }));
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!consultation?._id) return;

    try {
      await updateConsultation(consultation._id, buildSavePayload(consultForm, reminderConfig));
      showToast({ type: 'success', message: 'Draft saved successfully' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to save draft' });
    }
  };

  // Complete consultation
  const handleComplete = async () => {
    const { isValid, errors } = validateConsultation(consultForm);

    if (!isValid) {
      showToast({ type: 'error', message: errors[0] || 'Please fill all required fields' });
      return;
    }

    if (!consultForm.doctorSignature) {
      showToast({ type: 'error', message: 'Doctor signature is required to complete the consultation' });
      return;
    }

    try {
      setCompleting(true);

      // Save draft first to persist all form data
      await updateConsultation(consultation._id, buildSavePayload(consultForm, reminderConfig));

      // Then complete with signature
      await completeConsultation(consultation._id, {
        doctorSignature: { dataUrl: consultForm.doctorSignature },
        reminderConfig,
      });
      showToast({ type: 'success', message: 'Consultation completed successfully' });
      navigate('/clinic/consultations');
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to complete consultation' });
    } finally {
      setCompleting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full flex items-center justify-center py-16">
        <Loader className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-[1280px] mx-auto w-full py-16">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-red-200 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 font-display">
                Error Loading Consultation
              </h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 text-sm font-semibold text-neutral-700 rounded-xl border border-neutral-300 hover:bg-neutral-50 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={loadAppointmentData}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-sm shadow-primary-600/20 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Back + Patient Info */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5 text-neutral-600" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-neutral-900 font-display truncate">
                  {patient?.name || 'Unknown Patient'}
                </h2>
                <p className="text-xs text-neutral-500">
                  {appointment?.scheduledAt && (
                    <>
                      {formatDate(appointment.scheduledAt)} • {formatTime(appointment.scheduledAt)}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Auto-save + Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {autoSaving && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-neutral-500 flex items-center gap-1"
              >
                <Loader className="h-3 w-3 animate-spin" />
                Saving...
              </motion.span>
            )}
            <TemplateSelector
              onSelect={(templateData) => {
                setConsultForm((prev) => {
                  const merged = { ...prev };
                  for (const [key, val] of Object.entries(templateData)) {
                    if (val !== undefined && val !== '') {
                      if (key === 'materialsUsed') {
                        // Additive merge: add template materials, skip duplicates by item ID
                        const existingIds = new Set((prev.materialsUsed || []).map(m => m.item));
                        const newMaterials = (val || []).filter(m => !existingIds.has(m.item));
                        merged.materialsUsed = [...(prev.materialsUsed || []), ...newMaterials];
                      } else {
                        merged[key] = val;
                      }
                    }
                  }
                  return merged;
                });
              }}
            />
            <button
              onClick={handleSaveDraft}
              disabled={autoSaving}
              className="px-4 py-2 text-sm font-semibold text-neutral-700 rounded-xl border border-neutral-300 hover:bg-neutral-50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
            <button
              onClick={handleComplete}
              disabled={completing || autoSaving}
              className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {completing ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Completing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Complete</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Consultation Form */}
      <ConsultationForm
        form={consultForm}
        reminderConfig={reminderConfig}
        onChange={handleFormChange}
        onReminderToggle={handleReminderToggle}
        onTimeChange={handleTimeChange}
        onFileUpload={handleFileUpload}
        onScheduleFollowUp={handleScheduleFollowUp}
        patient={patient}
        appointment={appointment}
        doctor={user}
        clinic={clinic || {}}
      />
    </div>
  );
}
