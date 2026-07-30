/**
 * ConsultationDetail — Read-only detail view for completed consultations.
 *
 * Wraps the existing ConsultationDetailView component with data fetching.
 * Used by doctors, admins, and clinic owners to view completed consultations.
 * Includes "Edit" action to re-open in the consultation editor.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, AlertCircle, Pencil, Activity } from 'lucide-react';
import { getConsultationByAppointment, getPatient, listDoctorAttachments } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import ConsultationDetailView from '../components/ConsultationDetailView';

/* ── Map TreatmentRecord → form prop for ConsultationDetailView ── */

function buildFormFromRecord(record) {
  return {
    chiefComplaint: record.chiefComplaint || '',
    medicalHistory: record.medicalHistory || '',
    allergies: record.allergies || '',
    vitals: record.vitals || {},
    examination: record.examination || '',
    oralFindings: record.oralFindings || '',
    diagnosis: record.diagnosis || '',
    severity: record.severity || '',
    assessmentNotes: record.assessmentNotes || '',
    treatment: record.treatment || record.treatmentPlan || '',
    treatmentPlan: record.treatmentPlan || record.treatment || '',
    prescriptions: record.prescription?.length > 0 ? record.prescription : [],
    followUpInstructions: record.followUpInstructions || '',
    procedure: record.procedure || '',
    priority: record.priority || '',
    estimatedCost: record.estimatedCost ?? '',
    visitType: record.visitType || '',
    patientConsent: record.patientConsent || '',
    followUpDate: record.followUpDate || '',
    teeth: record.teeth || [],
    careTasks: record.careTasks || [],
    doctorSignature: record.doctorSignature || '',
    notes: record.notes || '',
  };
}

/* ── Main Component ── */

export default function ConsultationDetail() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user, clinic } = useTenantAuth();

  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [record, setRecord] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** True when the appointment simply has no consultation record yet. */
  const [notStarted, setNotStarted] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    loadData();
  }, [appointmentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch treatment record by appointment ID
      const recordRes = await getConsultationByAppointment(appointmentId);
      const treatmentRecord = recordRes.data || recordRes;
      setRecord(treatmentRecord);

      // The record includes populated appointment and patient
      const apptData = treatmentRecord.appointment;
      if (apptData) setAppointment(apptData);

      // Fetch full patient details (the populated fields on record are partial)
      const patientId = treatmentRecord.patient?._id || treatmentRecord.patient;
      if (patientId) {
        try {
          const patientRes = await getPatient(patientId);
          setPatient(patientRes.data || patientRes);
        } catch {
          // Fall back to the partial patient data from the record populate
          setPatient(treatmentRecord.patient);
        }
      }

      // Fetch attachments
      if (treatmentRecord._id) {
        try {
          const attachRes = await listDoctorAttachments(treatmentRecord._id);
          setAttachments(Array.isArray(attachRes.data) ? attachRes.data : attachRes.data?.attachments || []);
        } catch {
          // Attachments are optional — silent fail
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to load consultation details';
      // An appointment can sit in `in_progress` without a TreatmentRecord ever
      // having been created for it, and the API answers 404 for that. Treat it
      // as "not started yet" and offer a way forward instead of a dead end.
      setNotStarted(/no consultation record/i.test(msg));
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className={`bg-white rounded-2xl border shadow-[var(--shadow-sm)] p-6 text-center ${notStarted ? 'border-amber-200' : 'border-red-200'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${notStarted ? 'bg-amber-50' : 'bg-red-50'}`}>
            <AlertCircle className={`h-6 w-6 ${notStarted ? 'text-amber-500' : 'text-red-500'}`} />
          </div>
          <p className={`text-sm mb-4 ${notStarted ? 'text-amber-800' : 'text-red-700'}`}>
            {notStarted
              ? 'This consultation has not been started yet, so there are no notes to show.'
              : error}
          </p>
          <div className="flex items-center justify-center gap-2">
            {notStarted && (
              <button
                onClick={() => navigate(`/clinic/consultation/${appointmentId}`)}
                className="px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all"
              >
                Open Consultation
              </button>
            )}
            <button
              onClick={() => navigate('/clinic/consultations')}
              className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all"
            >
              Back to Consultations
            </button>
          </div>
        </div>
      </div>
    );
  }

  const doctor = record?.doctor || user;
  const form = record ? buildFormFromRecord(record) : {};
  const isInProgress = record?.status === 'in_progress';
  const isDoctor = user?.role === 'doctor';
  const showEditButton = isDoctor || !isInProgress;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6 pb-12">
      {/* In-Progress Banner */}
      {isInProgress && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl animate-[fadeUp_0.3s_ease-out_both] no-print">
          <Activity className="h-5 w-5 text-emerald-600 shrink-0 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Consultation In Progress</p>
            <p className="text-xs text-emerald-600 mt-0.5">This consultation is currently active. Content shown below is a live draft and may change.</p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/clinic/consultations')}
            className="p-2 rounded-xl hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-600" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold font-display text-neutral-900">Consultation Record</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {isInProgress ? 'Live view of in-progress consultation' : 'Read-only view of completed consultation'}
            </p>
          </div>
        </div>

        {showEditButton && (
          <button
            onClick={() => navigate(`/clinic/doctor-consultation/${appointmentId}`)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-all border border-primary-200 shadow-[var(--shadow-sm)]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Consultation
          </button>
        )}
      </div>

      {/* Consultation Detail View */}
      <ConsultationDetailView
        consultation={record}
        appointment={appointment}
        patient={patient}
        clinic={clinic}
        doctor={doctor}
        form={form}
        uploadedFiles={attachments}
      />
    </div>
  );
}
