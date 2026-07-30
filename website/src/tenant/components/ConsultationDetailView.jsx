import {
  Printer, Calendar, Thermometer, Heart, Wind, Droplets, Gauge,
  Phone, Mail, MapPin, BadgeCheck, Paperclip, FileText,
  IndianRupee, Stethoscope, ClipboardList, Pill, AlertTriangle,
} from 'lucide-react';
import { formatCurrency } from './consultationHelpers';
import { resolveAssetUrl } from '../../lib/assetUrl';
import { stripDrPrefix } from '../../utils/doctorName';

/* ── Helpers ─────────────────────────────────────────── */

function calculateAge(dob) {
  if (!dob) return '--';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs`;
}

const genderMap = { male: 'M', female: 'F', other: 'O', prefer_not_to_say: '--' };

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFollowUp(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  completed:  { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  no_show:    { label: 'No Show',    cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  in_progress:{ label: 'In Progress',cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
};

const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] print:shadow-none print:border print:border-neutral-300 print:rounded-none print:p-0';

/* ── Section divider with label ── */
function SectionLabel({ label, abbr }) {
  return (
    <div className="flex items-center gap-2.5 mt-5 mb-2 first:mt-0">
      {abbr && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-700 text-[10px] font-bold border border-primary-200 shrink-0 print:bg-transparent print:border-primary-300">
          {abbr}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

/* ── Vitals badge ── */
function VitalBox({ icon: Icon, label, value, unit }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 print:border-neutral-300">
      <Icon className="h-4 w-4 text-primary-500 shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] text-neutral-500 uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-sm font-bold text-neutral-900">
          {value || '--'}
          {value && unit && <span className="text-[10px] font-normal text-neutral-400 ml-0.5">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

/* ── Card header ── */
function CardHeader({ icon: Icon, title, iconColor = 'text-primary-600' }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-neutral-200">
      <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
      <h3 className="text-sm font-bold text-neutral-800 uppercase tracking-wide">{title}</h3>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component — Dashboard-style OPD Consultation View
   ══════════════════════════════════════════════════════════ */

export default function ConsultationDetailView({
  consultation,
  appointment,
  patient,
  clinic,
  doctor,
  form,
  uploadedFiles,
}) {
  const addr = clinic?.address;
  const addressLine = [addr?.street, addr?.city, addr?.state, addr?.zipCode].filter(Boolean).join(', ');

  const patientName = patient?.firstName
    ? `${patient.firstName} ${patient.lastName || ''}`
    : patient?.name || 'Patient';

  const status = STATUS_BADGE[appointment?.status] || STATUS_BADGE.completed;

  const vitals = form?.vitals || {};
  const hasVitals = vitals.bp || vitals.temperature || vitals.pulse || vitals.spo2 || vitals.painScale;

  const teeth = (form?.teeth || []).filter((t) => t.toothNumber);
  const meds = (form?.prescriptions || []).filter((m) => m.medication?.trim());
  const totalCost = teeth.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);

  const appointmentDate = formatDate(appointment?.scheduledAt || new Date());

  const hasPlanContent = form?.treatment?.trim() || form?.notes?.trim() || form?.followUpDate || uploadedFiles?.length > 0;

  return (
    <div className="cdv-print space-y-6 print:space-y-0">
      {/* Print Button */}
      <div className="flex justify-end no-print">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-[var(--shadow-sm)]"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      {/* ═══ Letterhead + Patient Info Card ═══ */}
      <div className={`${cardCls} overflow-hidden`}>
        {/* Clinic Letterhead */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-4 print:py-3">
          <div className="flex items-center gap-3">
            {clinic?.logo && (
              <img
                src={resolveAssetUrl(clinic.logo)}
                alt=""
                className="w-12 h-12 rounded-lg object-contain bg-white/20 p-1 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white tracking-wide truncate">
                {clinic?.name || 'Clinic'}
              </h2>
              {addressLine && (
                <p className="text-xs text-white/80 mt-0.5 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0" /> {addressLine}
                </p>
              )}
              <p className="text-xs text-white/70 mt-0.5">
                {clinic?.phone && <><Phone className="h-3 w-3 inline mr-1" />{clinic.phone}</>}
                {clinic?.phone && clinic?.email && <span className="mx-2">|</span>}
                {clinic?.email && <><Mail className="h-3 w-3 inline mr-1" />{clinic.email}</>}
              </p>
            </div>
          </div>
        </div>

        {/* Doctor Info Bar */}
        <div className="flex items-center justify-between px-6 py-2 bg-primary-50 border-b border-primary-100">
          <div>
            <p className="text-sm font-semibold text-primary-800">Dr. {stripDrPrefix(doctor?.name || 'Doctor')}</p>
            {doctor?.specialization && (
              <p className="text-xs text-primary-600">{doctor.specialization}</p>
            )}
          </div>
          {doctor?.licenseNumber && (
            <p className="text-xs text-primary-600 flex items-center gap-1">
              <BadgeCheck className="h-3.5 w-3.5" /> Reg: {doctor.licenseNumber}
            </p>
          )}
        </div>

        {/* Patient Details Row */}
        <div className="px-6 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
            <div>
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">Patient Name</span>
              <p className="text-sm font-semibold text-neutral-900 border-b border-neutral-200 pb-0.5">{patientName}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">Age / Gender</span>
              <p className="text-sm font-medium text-neutral-900 border-b border-neutral-200 pb-0.5">
                {calculateAge(patient?.dateOfBirth)} / {genderMap[patient?.gender] || '--'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">Date</span>
              <p className="text-sm font-semibold text-neutral-900 border-b border-neutral-200 pb-0.5">{appointmentDate}</p>
            </div>
            <div className="flex items-end pb-0.5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>
                  {status.label}
                </span>
                {appointment?.type && (
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 capitalize">
                    {appointment.type.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Vitals Strip (full width) ═══ */}
      {hasVitals && (
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Thermometer className="h-4 w-4 text-red-500" />
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Vitals</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <VitalBox icon={Gauge} label="BP" value={vitals.bp} unit="mmHg" />
            <VitalBox icon={Thermometer} label="Temp" value={vitals.temperature} unit="°F" />
            <VitalBox icon={Heart} label="Pulse" value={vitals.pulse} unit="bpm" />
            <VitalBox icon={Droplets} label="SpO2" value={vitals.spo2} unit="%" />
            <VitalBox icon={Wind} label="Pain" value={vitals.painScale} unit="/10" />
          </div>
        </div>
      )}

      {/* ═══ Main Content Grid ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 print:grid-cols-2 print:gap-4">

        {/* ── Left Column: Clinical Assessment ── */}
        <div className={`xl:col-span-3 ${cardCls} overflow-hidden`}>
          <div className="px-6 py-3.5 border-b border-neutral-200 bg-neutral-50">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary-600" />
              <h3 className="text-sm font-bold text-neutral-800">Clinical Assessment</h3>
            </div>
          </div>
          <div className="p-6">
            {/* C/C — Chief Complaint */}
            <SectionLabel abbr="C/C" label="Chief Complaint" />
            <p className={`text-sm leading-relaxed pl-9 ${form?.chiefComplaint?.trim() ? 'text-neutral-900' : 'text-neutral-300 italic'}`}>
              {form?.chiefComplaint?.trim() || 'Not recorded'}
            </p>

            {/* H/O — History */}
            {(patient?.medicalHistory || patient?.allergies) && (
              <>
                <SectionLabel abbr="H/O" label="History" />
                <div className="pl-9 space-y-2">
                  {patient?.medicalHistory && (
                    <div>
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase">Past Medical History</span>
                      <p className="text-sm text-neutral-600 mt-0.5">
                        {typeof patient.medicalHistory === 'string'
                          ? patient.medicalHistory
                          : Array.isArray(patient.medicalHistory)
                            ? patient.medicalHistory.join(', ')
                            : typeof patient.medicalHistory === 'object' && patient.medicalHistory.conditions
                              ? (Array.isArray(patient.medicalHistory.conditions) ? patient.medicalHistory.conditions.join(', ') : patient.medicalHistory.conditions)
                              : '--'}
                      </p>
                    </div>
                  )}
                  {patient?.allergies && (
                    <div>
                      <span className="text-[10px] font-semibold text-red-500 uppercase">Known Allergies</span>
                      <p className="text-sm text-red-600 mt-0.5">
                        {Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* O/E — On Examination */}
            {teeth.length > 0 && (
              <>
                <SectionLabel abbr="O/E" label="On Examination" />
                <div className="pl-9">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase mb-1.5 block">Dental Examination</span>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left py-1.5 pr-3 font-semibold text-neutral-400 w-16">Tooth #</th>
                        <th className="text-left py-1.5 pr-3 font-semibold text-neutral-400">Condition</th>
                        <th className="text-left py-1.5 pr-3 font-semibold text-neutral-400">Procedure</th>
                        <th className="text-right py-1.5 font-semibold text-neutral-400 w-24">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teeth.map((t, i) => (
                        <tr key={i} className="border-b border-neutral-100">
                          <td className="py-1.5 pr-3 font-semibold text-neutral-900">{t.toothNumber}</td>
                          <td className="py-1.5 pr-3 text-neutral-600">{t.condition || '--'}</td>
                          <td className="py-1.5 pr-3 text-neutral-600">{t.procedure || '--'}</td>
                          <td className="py-1.5 text-right text-neutral-600">
                            {t.estimatedCost > 0 ? formatCurrency(t.estimatedCost) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {totalCost > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-neutral-200">
                          <td colSpan={3} className="py-1.5 text-right font-semibold text-neutral-400 pr-3">Total</td>
                          <td className="py-1.5 text-right font-bold text-neutral-900">{formatCurrency(totalCost)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

            {/* Dx — Diagnosis */}
            <SectionLabel abbr="Dx" label="Diagnosis" />
            <p className={`text-sm leading-relaxed pl-9 ${form?.diagnosis?.trim() ? 'text-neutral-900 font-medium' : 'text-neutral-300 italic'}`}>
              {form?.diagnosis?.trim() || 'Not recorded'}
            </p>
          </div>
        </div>

        {/* ── Right Column: Prescription & Plan ── */}
        <div className="xl:col-span-2 space-y-6 print:space-y-0">

          {/* ℞ Prescription Card */}
          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-6 py-3.5 border-b border-neutral-200 bg-neutral-50">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-800">Prescription</h3>
              </div>
            </div>
            <div className="p-6">
              {meds.length > 0 ? (
                <div className="space-y-0">
                  {meds.map((med, i) => (
                    <div key={i} className={`py-2.5 ${i < meds.length - 1 ? 'border-b border-dashed border-neutral-200' : ''}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-bold text-primary-600 w-5 shrink-0">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">{med.medication}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-neutral-500">
                            {med.dosage && <span><b className="text-neutral-400">Dose:</b> {med.dosage}</span>}
                            {med.frequency && <span><b className="text-neutral-400">Freq:</b> {med.frequency}</span>}
                            {med.duration && <span><b className="text-neutral-400">Dur:</b> {med.duration}</span>}
                          </div>
                          {med.notes && (
                            <p className="text-xs text-neutral-400 italic mt-0.5">{med.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-300 italic">No medications prescribed</p>
              )}
            </div>
          </div>

          {/* Plan & Instructions Card */}
          {hasPlanContent && (
            <div className={`${cardCls} overflow-hidden`}>
              <div className="px-6 py-3.5 border-b border-neutral-200 bg-neutral-50">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-neutral-800">Plan & Instructions</h3>
                </div>
              </div>
              <div className="p-6">
                {/* Tx — Treatment Plan */}
                {(form?.treatmentPlan?.trim() || form?.treatment?.trim()) && (
                  <>
                    <SectionLabel abbr="Tx" label="Treatment Plan" />
                    <p className="text-sm text-neutral-800 leading-relaxed pl-9">
                      {form.treatmentPlan || form.treatment}
                    </p>
                  </>
                )}

                {/* Follow-up Instructions */}
                {form?.followUpInstructions?.trim() && (
                  <>
                    <SectionLabel abbr="Adv" label="Follow-Up Instructions" />
                    <p className="text-sm text-neutral-800 leading-relaxed pl-9 whitespace-pre-line">
                      {form.followUpInstructions}
                    </p>
                  </>
                )}

                {/* Notes */}
                {form?.notes?.trim() && (
                  <>
                    <SectionLabel abbr="N" label="Notes" />
                    <p className="text-sm text-neutral-800 leading-relaxed pl-9 whitespace-pre-line">
                      {form.notes}
                    </p>
                  </>
                )}

                {/* Follow-up */}
                {form?.followUpDate && (
                  <>
                    <SectionLabel abbr="F/U" label="Follow Up" />
                    <div className="pl-9 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary-500" />
                      <span className="text-sm font-semibold text-neutral-900">{formatFollowUp(form.followUpDate)}</span>
                    </div>
                  </>
                )}

                {/* Attachments */}
                {uploadedFiles?.length > 0 && (
                  <>
                    <SectionLabel label="Attachments" />
                    <div className="pl-9 flex flex-wrap gap-2">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-500">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[160px]">{typeof f === 'string' ? f : f.name || 'File'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Care Tasks ═══ */}
      {form?.careTasks?.length > 0 && (
        <div className={cardCls}>
          <div className="px-6 py-3.5 border-b border-neutral-200 bg-neutral-50">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-neutral-800">Care Tasks</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              {form.careTasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0">
                  <div className={`w-5 h-5 mt-0.5 rounded-full flex items-center justify-center shrink-0 ${task.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'}`}>
                    {task.enabled ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-800">{task.title}</p>
                    {task.instructions && <p className="text-xs text-neutral-500 mt-0.5">{task.instructions}</p>}
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 capitalize">{(task.taskType || 'custom').replace('_', ' ')}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 capitalize">{(task.frequency || 'once').replace(/_/g, ' ')}</span>
                      {task.reminderEnabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Reminder ON</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Signature Block ═══ */}
      <div className={`${cardCls} px-6 py-5`}>
        <div className="flex justify-end">
          <div className="flex flex-col items-center text-center pr-8 print:pr-12">
            {form?.doctorSignature?.dataUrl || (typeof form?.doctorSignature === 'string' && form?.doctorSignature) ? (
              <>
                <img
                  src={form.doctorSignature?.dataUrl || form.doctorSignature}
                  alt="Doctor Signature"
                  className="h-16 object-contain mb-1"
                />
                {form.doctorSignature?.signedAt && (
                  <p className="text-[10px] text-neutral-400">
                    Signed: {new Date(form.doctorSignature.signedAt).toLocaleString('en-IN')}
                  </p>
                )}
              </>
            ) : (
              <div className="w-48 border-b border-dashed border-neutral-200 mb-1.5" />
            )}
            <p className="text-sm font-semibold text-neutral-900 mt-1">Dr. {stripDrPrefix(doctor?.name || 'Doctor')}</p>
            {doctor?.specialization && (
              <p className="text-[11px] text-neutral-400">{doctor.specialization}</p>
            )}
            {doctor?.licenseNumber && (
              <p className="text-[11px] text-neutral-400">Reg. No: {doctor.licenseNumber}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
