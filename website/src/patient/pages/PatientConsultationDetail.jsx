/**
 * PatientConsultationDetail — Full-page read-only consultation view for patients.
 * Delegates rendering to the shared ConsultationDetailView (same component used
 * by doctor/admin read-only views and the public shared record page).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, AlertCircle } from 'lucide-react';
import { getConsultationDetail } from '../api';
import { usePatientAuth } from '../PatientAuthContext';
import ConsultationDetailView from '../../tenant/components/ConsultationDetailView';

/* Map API response → form prop shape expected by ConsultationDetailView */
function buildFormFromRecord(c, prescription, careTasks) {
  return {
    chiefComplaint: c.chiefComplaint || '',
    oralFindings: c.oralFindings || '',
    examination: c.examination || '',
    diagnosis: c.diagnosis || '',
    severity: c.severity || '',
    assessmentNotes: c.assessmentNotes || '',
    treatment: c.treatment || c.treatmentPlan || '',
    treatmentPlan: c.treatmentPlan || c.treatment || '',
    procedure: c.procedure || '',
    estimatedCost: c.estimatedCost ?? '',
    visitType: c.visitType || '',
    priority: c.priority || '',
    followUpInstructions: c.followUpInstructions || '',
    followUpDate: c.followUpDate || '',
    notes: c.notes || '',
    patientConsent: c.patientConsent || '',
    vitals: c.vitals || {},
    teeth: c.teeth || [],
    // ConsultationDetailView expects prescriptions with `medication` key
    prescriptions: (c.prescription || prescription?.medications || []).map((m) => ({
      medication: m.medication || m.name || '',
      dosage: m.dosage || '',
      frequency: m.frequency || '',
      duration: m.duration || '',
      notes: m.notes || m.instructions || '',
    })),
    careTasks: (c.careTasks?.length > 0 ? c.careTasks : careTasks) || [],
    doctorSignature: c.doctorSignature || '',
  };
}

export default function PatientConsultationDetail() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { activePatient, activePatientId } = usePatientAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!appointmentId || !activePatientId) return;

    setLoading(true);
    getConsultationDetail(appointmentId, activePatientId)
      .then((res) => setData(res.data || res))
      .catch((err) => setError(err.message || 'Failed to load consultation details'))
      .finally(() => setLoading(false));
  }, [appointmentId, activePatientId]);

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
        <div className="bg-white rounded-2xl border border-red-200 shadow-[var(--shadow-sm)] p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="px-4 py-2.5 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { appointment, consultation, prescription, careTasks, clinic: apiClinic, patient: apiPatient } = data;
  const doctor = consultation?.doctor || appointment?.doctor || {};

  // Build the form object ConsultationDetailView expects
  const form = buildFormFromRecord(consultation || {}, prescription, careTasks);

  // Build the uploadedFiles list from consultation attachments
  const uploadedFiles = (consultation?.attachments || []).map((a) => ({
    name: a.fileName || 'File',
    type: a.fileType,
  }));

  // Clinic info from API response (enriched by backend with name, logo, address, phone, email)
  const clinic = apiClinic || null;

  // Patient info — prefer API response (has full profile), fallback to active patient from context
  const patient = apiPatient || activePatient || null;

  return (
    <div className="w-full max-w-[1280px] mx-auto pb-12 print:pb-0 print:max-w-none">
      {/* Back button — sits outside the letterhead */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-neutral-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-neutral-600" />
        </button>
        <h1 className="text-lg font-semibold text-neutral-900">Consultation Details</h1>
      </div>

      <ConsultationDetailView
        consultation={consultation}
        appointment={appointment}
        patient={patient}
        clinic={clinic}
        doctor={doctor}
        form={form}
        uploadedFiles={uploadedFiles}
      />
    </div>
  );
}
