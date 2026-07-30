import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { viewSharedRecord } from '../api';
import ConsultationDetailView from '../../tenant/components/ConsultationDetailView';

// Sanitize text content — strips HTML tags as defense-in-depth
const sanitize = (text) => typeof text === 'string' ? text.replace(/<[^>]*>/g, '') : text;

/* Map TreatmentRecord → form prop for ConsultationDetailView */
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

export default function SharedRecordView() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const tenant = searchParams.get('tenant') || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !tenant) { setError('Invalid share link'); setLoading(false); return; }
    viewSharedRecord(token, tenant)
      .then(res => setData(res.data))
      .catch(err => setError(err.message || 'This share link is invalid or has expired'))
      .finally(() => setLoading(false));
  }, [token, tenant]);

  /* ---- sub-renderers ---- */

  const renderTreatmentLetterhead = (record, enriched) => {
    const form = buildFormFromRecord(record);
    const uploadedFiles = (record.attachments || []).map((a) => ({
      name: a.fileName,
      type: a.fileType,
    }));

    return (
      <ConsultationDetailView
        consultation={record}
        appointment={enriched?.appointment || null}
        patient={enriched?.patient || null}
        clinic={enriched?.clinic || null}
        doctor={enriched?.doctor || null}
        form={form}
        uploadedFiles={uploadedFiles}
      />
    );
  };

  const renderPrescription = (r) => (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800">Prescription</h3>
      {r.medications?.length > 0 ? (
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              {['Medication', 'Dosage', 'Frequency', 'Duration'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.medications.map((m, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-2">{sanitize(m.name)}</td>
                <td className="px-3 py-2">{sanitize(m.dosage)}</td>
                <td className="px-3 py-2">{sanitize(m.frequency)}</td>
                <td className="px-3 py-2">{sanitize(m.duration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-gray-500">No medications listed.</p>}
    </div>
  );

  const renderInvoice = (r) => (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800">Invoice</h3>
      {r.items?.length > 0 && (
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              {['Item', 'Qty', 'Amount'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-2">{sanitize(it.description || it.name)}</td>
                <td className="px-3 py-2">{it.quantity ?? 1}</td>
                <td className="px-3 py-2">{it.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.total != null && <p className="text-right font-semibold text-gray-800">Total: {r.total}</p>}
      {r.status && (
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          {r.status}
        </span>
      )}
    </div>
  );

  const renderRecord = () => {
    if (!data) return null;

    // Enriched treatment response
    if (data.type === 'treatment' && data.record) {
      return renderTreatmentLetterhead(data.record, data);
    }

    // Legacy record types (prescription, invoice) — data IS the record
    const record = data.record || data;
    const type = data.type;

    if (type === 'prescription') return renderPrescription(record);
    if (type === 'invoice') return renderInvoice(record);

    // type === 'all'
    if (record.treatments || record.prescriptions || record.invoices) {
      return (
        <div className="space-y-6 divide-y divide-gray-100">
          {record.treatments?.map((t, i) => <div key={i}>{renderTreatmentLetterhead(t, data)}</div>)}
          {record.prescriptions?.map((p, i) => <div key={i}>{renderPrescription(p)}</div>)}
          {record.invoices?.map((inv, i) => <div key={i}>{renderInvoice(inv)}</div>)}
        </div>
      );
    }

    // Fallback: raw record with diagnosis field → treat as treatment
    if (record.diagnosis) return renderTreatmentLetterhead(record, data);

    return <p className="text-gray-500">No viewable record data.</p>;
  };

  /* ---- main render ---- */
  const isTreatmentLetterhead = data?.type === 'treatment' && data?.record;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50 px-4 py-10">
      <div className={`w-full mx-auto ${isTreatmentLetterhead ? 'max-w-[1280px]' : 'max-w-3xl'}`}>
        {loading && (
          <div className="flex flex-col items-center py-16">
            <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
            <p className="mt-4 text-gray-400 text-sm">Loading shared record...</p>
          </div>
        )}

        {error && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="px-8 pt-8 pb-4 border-b border-gray-100 text-center">
                <h1 className="text-2xl font-bold text-sky-700 tracking-tight">BestoClinic</h1>
                <p className="text-sm text-gray-400 mt-1">Trusted dental care platform</p>
              </div>
              <div className="px-8 py-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                  <p className="text-red-600 font-medium">{error}</p>
                  <a href="/" className="inline-block mt-3 text-sm text-sky-600 hover:underline">Go to BestoClinic</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {data && !error && (
          <>
            {isTreatmentLetterhead ? (
              /* Professional letterhead view for treatment records */
              <div className="space-y-6 pb-12">
                {data.expiresAt && (
                  <div className="max-w-3xl mx-auto px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 text-center no-print">
                    This link expires on{' '}
                    <span className="font-medium">{new Date(data.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                  </div>
                )}

                {renderRecord()}

                <div className="text-center py-4 no-print">
                  <p className="text-xs text-gray-400">Shared via BestoClinic &bull; For authorized viewing only</p>
                  <p className="text-xs text-gray-400 mt-1">Access logged &bull; IP recorded for security</p>
                </div>
              </div>
            ) : (
              /* Card view for prescriptions, invoices, etc. */
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="px-8 pt-8 pb-4 border-b border-gray-100 text-center">
                  <h1 className="text-2xl font-bold text-sky-700 tracking-tight">BestoClinic</h1>
                  <p className="text-sm text-gray-400 mt-1">Trusted dental care platform</p>
                </div>
                <div className="px-8 py-6">
                  <h2 className="text-xl font-semibold text-gray-800 mb-1">Shared Medical Record</h2>
                  {data.expiresAt && (
                    <div className="mb-5 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                      This link expires on{' '}
                      <span className="font-medium">{new Date(data.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  )}
                  {data.patientName && (
                    <p className="text-sm text-gray-500 mb-4">Patient: <span className="font-medium text-gray-700">{data.patientName}</span></p>
                  )}
                  <div className="bg-stone-50 rounded-lg p-5">{renderRecord()}</div>
                </div>
                <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
                  <p className="text-xs text-gray-400">Shared via BestoClinic &bull; For authorized viewing only</p>
                  <p className="text-xs text-gray-400 mt-1">Access logged &bull; IP recorded for security</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
