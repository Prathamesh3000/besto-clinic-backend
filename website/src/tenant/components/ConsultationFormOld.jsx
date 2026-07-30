import { useState, useCallback, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Upload, CheckCircle2, Save, Thermometer,
  IndianRupee, Package, FileText, AlertCircle, Pill,
  ChevronDown, MessageSquare, Paperclip, AlertTriangle,
  Phone, Mail, MapPin, BadgeCheck, Stethoscope, ClipboardList,
  Activity,
} from 'lucide-react';
import {
  inputCls, labelCls, btnPrimary, btnSecondary, cardCls,
  DENTAL_CONDITIONS, formatCurrency,
  SOAP_SECTIONS, getSectionCompleteness,
} from './consultationHelpers';
import { ErrorAlert } from '../../platform/components/shared';
import { stripDrPrefix } from '../../utils/doctorName';
import ConsultationLetterhead from './consultation/ConsultationLetterhead';
import PrescriptionBuilder from './consultation/PrescriptionBuilder';

// ─── Color Maps ─────────────────────────────────
const SECTION_COLORS = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200/60',    dot: 'bg-blue-500',    ring: 'ring-blue-400/30' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200/60',     dot: 'bg-red-500',     ring: 'ring-red-400/30' },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200/60',  dot: 'bg-purple-500',  ring: 'ring-purple-400/30' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/60', dot: 'bg-emerald-500', ring: 'ring-emerald-400/30' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200/60',   dot: 'bg-amber-500',   ring: 'ring-amber-400/30' },
};

const SECTION_ICONS = {
  subjective:  MessageSquare,
  objective:   Activity,
  assessment:  ClipboardList,
  plan:        Stethoscope,
  attachments: Paperclip,
};

// ─── FileDropzone ─────────────────────────────────
function FileDropzone({ onFiles, files = [] }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) onFiles(dropped);
  }, [onFiles]);

  return (
    <div>
      <div
        ref={ref}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'image/*,.pdf,.doc,.docx';
          input.onchange = (e) => onFiles(Array.from(e.target.files));
          input.click();
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-primary-400 bg-primary-50/50'
            : 'border-neutral-300/60 hover:border-primary-300'
        }`}
      >
        <Upload className="h-6 w-6 mx-auto text-neutral-900/30 mb-2" />
        <p className="text-xs text-neutral-900/40">
          Drag and drop files or <span className="text-primary-600 font-medium">browse</span>
        </p>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-lg text-xs text-neutral-900/60">
              <FileText className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{f.name || f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SkeletonLoader ───────────────────────────────
function SkeletonLoader({ className = '', count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />
      ))}
    </>
  );
}

// ─── Consultation Letterhead imported from separate component ───

// ─── SOAP Progress Bar ────────────────────────────
function SOAPProgressBar({ completeness }) {
  const sections = SOAP_SECTIONS.filter((s) => s.key !== 'attachments');
  const filled = sections.filter((s) => completeness[s.key]).length;

  return (
    <div className="px-6 py-3 bg-neutral-50/50 border-b border-neutral-200/60">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-900/30 mr-2">
          Progress
        </span>
        <div className="flex items-center gap-2 flex-1">
          {sections.map((section, idx) => {
            const colors = SECTION_COLORS[section.color];
            const done = completeness[section.key];
            return (
              <Fragment key={section.key}>
                {idx > 0 && (
                  <div className={`flex-1 h-0.5 max-w-[40px] ${done ? colors.dot : 'bg-neutral-300/60'}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full transition-all ${done ? `${colors.dot} ring-2 ${colors.ring}` : 'bg-neutral-300'}`} />
                  <span className={`text-[10px] font-medium hidden sm:inline ${done ? `${colors.text}` : 'text-neutral-900/25'}`}>
                    {section.label[0]}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
        <span className="text-[10px] font-medium text-neutral-900/30 ml-2">
          {filled}/{sections.length}
        </span>
      </div>
    </div>
  );
}

// ─── SOAP Section Accordion ───────────────────────
function SOAPSection({ sectionKey, label, subtitle, color, isOpen, onToggle, isComplete, readOnly, children }) {
  const colors = SECTION_COLORS[color] || SECTION_COLORS.blue;
  const Icon = SECTION_ICONS[sectionKey] || ClipboardList;
  const expanded = readOnly || isOpen;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${expanded ? `${colors.border}` : 'border-neutral-200/60'}`}>
      {/* Section Header */}
      <button
        type="button"
        onClick={readOnly ? undefined : onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
          expanded ? `${colors.bg}` : 'bg-neutral-50/30 hover:bg-neutral-50'
        } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className={`p-1.5 rounded-lg ${expanded ? `${colors.bg}` : 'bg-neutral-100'}`}>
          <Icon className={`h-4 w-4 ${expanded ? `${colors.text}` : 'text-neutral-900/30'}`} />
        </div>
        <div className="flex-1 text-left">
          <p className={`text-sm font-semibold ${expanded ? `${colors.text}` : 'text-neutral-900/60'}`}>
            {label}
          </p>
          <p className="text-[10px] text-neutral-900/30">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isComplete && (
            <CheckCircle2 className={`h-4 w-4 ${colors.text} `} />
          )}
          {!readOnly && (
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4 text-neutral-900/30" />
            </motion.div>
          )}
        </div>
      </button>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="px-4 py-4 space-y-4 bg-white">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Consultation Signature Footer ────────────────
function ConsultationFooter({ doctor, readOnly, saving, completing, onSaveDraft, onComplete, form }) {
  return (
    <div className="px-6 py-5 bg-white border-t border-neutral-200/60 rounded-b-2xl">
      {/* Signature Block */}
      {(readOnly || doctor) && (
        <div className="flex justify-end mb-5">
          <div className="text-right">
            <div className="w-48 border-b border-dashed border-neutral-900/20 mb-2" />
            <p className="text-sm font-semibold text-neutral-900">
              Dr. {stripDrPrefix(doctor?.name || 'Doctor')}
            </p>
            {doctor?.specialization && (
              <p className="text-[11px] text-neutral-900/40">{doctor.specialization}</p>
            )}
            {doctor?.licenseNumber && (
              <p className="text-[11px] text-neutral-900/40">Reg. No: {doctor.licenseNumber}</p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-neutral-200/60">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onSaveDraft} disabled={saving} className={`${btnSecondary} flex items-center justify-center gap-2 flex-1 sm:flex-initial`}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-neutral-900/20 border-t-neutral-900/60 rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <><Save className="h-4 w-4" /> Save Draft</>
            )}
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onComplete} disabled={completing || !form.diagnosis} className={`${btnPrimary} flex items-center justify-center gap-2 flex-1 sm:flex-initial`}>
            {completing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Completing...
              </span>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Complete Consultation</>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}


/**
 * ConsultationForm — Professional SOAP-based consultation form with clinic letterhead.
 *
 * Restructured from the flat form into a clinical document format following
 * the SOAP (Subjective → Objective → Assessment → Plan) medical standard.
 */
export default function ConsultationForm({
  consultation,
  patient,
  form,
  loading,
  error,
  saving,
  completing,
  uploadedFiles,
  procedures,
  reminderConfig = { enabled: true, medications: {} },
  onFieldChange,
  onVitalChange,
  onToothChange,
  onProcedureSelect,
  onAddTooth,
  onRemoveTooth,
  onMedChange,
  onAddMed,
  onRemoveMed,
  onReminderToggle,
  onTimeChange,
  onSaveDraft,
  onComplete,
  onFileUpload,
  showPatientSidebar = true,
  readOnly = false,
  clinic = null,
  doctor = null,
  appointmentDate = null,
}) {
  // ── Accordion state — Subjective open by default ──
  const [openSections, setOpenSections] = useState(new Set(['subjective']));

  const toggleSection = useCallback((key) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Group procedures by category
  const proceduresByCategory = (procedures || []).reduce((acc, p) => {
    const cat = p.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const completeness = getSectionCompleteness(form);

  // ── Loading state ──
  if (loading) {
    return (
      <div className={`${cardCls} p-6`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <SkeletonLoader className="h-8 w-48" />
            <SkeletonLoader className="h-24 w-full" />
            <SkeletonLoader className="h-24 w-full" />
            <SkeletonLoader className="h-32 w-full" />
          </div>
          <div className="space-y-4">
            <SkeletonLoader className="h-32 w-full" />
            <SkeletonLoader className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !consultation) {
    return <ErrorAlert message={error} />;
  }

  // ── Allergy Check ──
  const hasAllergies = patient?.allergies?.length > 0 ||
    (patient?.medicalHistory?.allergies && patient.medicalHistory.allergies.length > 0);
  const allergyList = patient?.allergies ||
    patient?.medicalHistory?.allergies || [];

  // ── SOAP Form Content ──
  const formContent = (
    <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Letterhead — only when clinic data is available */}
      {clinic ? (
        <ConsultationLetterhead
          clinic={clinic}
          doctor={doctor}
          patient={patient}
          appointment={{ scheduledAt: appointmentDate }}
          status={readOnly ? 'View Only' : 'Active'}
        />
      ) : (
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold font-display text-neutral-900">
              Consultation Form
            </h3>
            {readOnly && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold bg-amber-50 text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" /> View Only
              </span>
            )}
          </div>
        </div>
      )}

      {/* SOAP Progress Bar */}
      <SOAPProgressBar completeness={completeness} />

      {error && <div className="px-6 pt-4"><ErrorAlert message={error} /></div>}

      {/* SOAP Accordion Sections */}
      <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0">
        <div className="p-4 space-y-3">

          {/* ═══ S — SUBJECTIVE ═══ */}
          <SOAPSection
            sectionKey="subjective"
            label="Subjective"
            subtitle="Chief Complaint & History"
            color="blue"
            isOpen={openSections.has('subjective')}
            onToggle={() => toggleSection('subjective')}
            isComplete={completeness.subjective}
            readOnly={readOnly}
          >
            <div>
              <label className={labelCls}>Chief Complaint</label>
              <textarea
                value={form.chiefComplaint || ''}
                onChange={(e) => onFieldChange('chiefComplaint', e.target.value)}
                rows={3}
                placeholder="Patient's primary complaint in their own words..."
                className={inputCls}
              />
            </div>

            {/* Patient context: allergies & medical history (read-only) */}
            {patient?.medicalHistory && (
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700/50 mb-1.5">
                  Patient Medical History
                </p>
                <p className="text-xs text-neutral-900/60 leading-relaxed">
                  {typeof patient.medicalHistory === 'string'
                    ? patient.medicalHistory
                    : Array.isArray(patient.medicalHistory)
                      ? patient.medicalHistory.join(', ')
                      : typeof patient.medicalHistory === 'object' && patient.medicalHistory.conditions
                        ? (Array.isArray(patient.medicalHistory.conditions) ? patient.medicalHistory.conditions.join(', ') : patient.medicalHistory.conditions)
                        : null}
                </p>
              </div>
            )}
          </SOAPSection>

          {/* ═══ O — OBJECTIVE ═══ */}
          <SOAPSection
            sectionKey="objective"
            label="Objective"
            subtitle="Vitals & Examination"
            color="red"
            isOpen={openSections.has('objective')}
            onToggle={() => toggleSection('objective')}
            isComplete={completeness.objective}
            readOnly={readOnly}
          >
            {/* Vitals Grid */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Thermometer className="h-4 w-4 text-red-500" />
                <label className={`${labelCls} !mb-0`}>Vitals</label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-red-50/40 rounded-xl border border-red-100/60">
                <div>
                  <label className="block text-[10px] font-medium text-neutral-900/40 mb-1">BP (mmHg)</label>
                  <input value={form.vitals?.bp || ''} onChange={(e) => onVitalChange('bp', e.target.value)} placeholder="120/80" className={`${inputCls} text-center`} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-neutral-900/40 mb-1">Temp (&deg;F)</label>
                  <input value={form.vitals?.temperature || ''} onChange={(e) => onVitalChange('temperature', e.target.value)} placeholder="98.6" className={`${inputCls} text-center`} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-neutral-900/40 mb-1">Pulse (bpm)</label>
                  <input value={form.vitals?.pulse || ''} onChange={(e) => onVitalChange('pulse', e.target.value)} placeholder="72" className={`${inputCls} text-center`} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-neutral-900/40 mb-1">SpO2 (%)</label>
                  <input value={form.vitals?.spo2 || ''} onChange={(e) => onVitalChange('spo2', e.target.value)} placeholder="98" className={`${inputCls} text-center`} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-neutral-900/40 mb-1">Pain (0-10)</label>
                  <select value={form.vitals?.painScale || ''} onChange={(e) => onVitalChange('painScale', e.target.value)} className={inputCls}>
                    <option value="">--</option>
                    {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Teeth Chart & Procedures */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Teeth Chart & Procedures</label>
                <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onAddTooth} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                  <Plus className="h-3.5 w-3.5" /> Add Tooth
                </motion.button>
              </div>
              <div className="space-y-3">
                {form.teeth.map((tooth, i) => (
                  <div key={i} className="p-3 bg-neutral-50/50 rounded-xl border border-neutral-200/60">
                    <div className="flex gap-2 items-start">
                      <select value={tooth.toothNumber} onChange={(e) => onToothChange(i, 'toothNumber', e.target.value)} className={`${inputCls} w-24 shrink-0`}>
                        <option value="">Tooth #</option>
                        {Array.from({ length: 32 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
                      </select>
                      <div className="flex-1 relative">
                        <input list="dental-conditions" value={tooth.condition} onChange={(e) => onToothChange(i, 'condition', e.target.value)} placeholder="Condition (e.g. cavity, decay)" className={inputCls} />
                        <datalist id="dental-conditions">
                          {DENTAL_CONDITIONS.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <button type="button" onClick={() => onRemoveTooth(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Procedure Catalog Dropdown */}
                    <div className="mt-2">
                      <select value={tooth.procedureId || ''} onChange={(e) => onProcedureSelect(i, e.target.value)} className={`${inputCls} w-full`}>
                        <option value="">Select Procedure from Catalog...</option>
                        {Object.entries(proceduresByCategory).map(([cat, procs]) => (
                          <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                            {procs.map((p) => (
                              <option key={p._id || p.id} value={p._id || p.id}>
                                {p.name} ({p.code}) — {formatCurrency(p.estimatedCost || 0)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {!tooth.procedureId && (
                        <input value={tooth.procedure} onChange={(e) => onToothChange(i, 'procedure', e.target.value)} placeholder="Or type procedure manually..." className={`${inputCls} mt-1.5`} />
                      )}
                    </div>
                    {/* Cost + Materials */}
                    {tooth.procedureId && tooth.estimatedCost > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
                          <IndianRupee className="h-3 w-3" />{formatCurrency(tooth.estimatedCost)}
                        </span>
                        {tooth.requiredMaterials?.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700">
                            <Package className="h-3 w-3" />{tooth.requiredMaterials.length} material{tooth.requiredMaterials.length !== 1 ? 's' : ''} required
                          </span>
                        )}
                      </div>
                    )}
                    {tooth.requiredMaterials?.length > 0 && (
                      <div className="mt-2 pl-1">
                        <p className="text-[10px] font-medium text-neutral-900/30 uppercase tracking-wider mb-1">Required Materials</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tooth.requiredMaterials.map((mat, mi) => (
                            <span key={mi} className={`text-[11px] px-2 py-0.5 rounded-md ${mat.isOptional ? 'bg-neutral-200/60 text-neutral-900/40' : 'bg-amber-50 text-amber-700'}`}>
                              {mat.itemName || 'Material'} &times;{mat.quantity || 1}{mat.isOptional && ' (optional)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Cost summary */}
              {form.teeth.some((t) => t.estimatedCost > 0) && (
                <div className="mt-3 flex items-center justify-end gap-2 px-1">
                  <span className="text-xs text-neutral-900/40">Est. Procedure Total:</span>
                  <span className="text-sm font-bold text-neutral-900">
                    {formatCurrency(form.teeth.reduce((sum, t) => sum + (t.estimatedCost || 0), 0))}
                  </span>
                </div>
              )}
            </div>
          </SOAPSection>

          {/* ═══ A — ASSESSMENT ═══ */}
          <SOAPSection
            sectionKey="assessment"
            label="Assessment"
            subtitle="Diagnosis & Notes"
            color="purple"
            isOpen={openSections.has('assessment')}
            onToggle={() => toggleSection('assessment')}
            isComplete={completeness.assessment}
            readOnly={readOnly}
          >
            <div>
              <label className={labelCls}>Diagnosis</label>
              <textarea
                value={form.diagnosis}
                onChange={(e) => onFieldChange('diagnosis', e.target.value)}
                rows={3}
                placeholder="Enter primary diagnosis..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Additional Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => onFieldChange('notes', e.target.value)}
                rows={2}
                placeholder="Any additional clinical notes..."
                className={inputCls}
              />
            </div>
          </SOAPSection>

          {/* ═══ P — PLAN ═══ */}
          <SOAPSection
            sectionKey="plan"
            label="Plan"
            subtitle="Treatment & Prescriptions"
            color="emerald"
            isOpen={openSections.has('plan')}
            onToggle={() => toggleSection('plan')}
            isComplete={completeness.plan}
            readOnly={readOnly}
          >
            {/* Treatment Plan */}
            <div>
              <label className={labelCls}>Treatment Plan</label>
              <textarea
                value={form.treatment}
                onChange={(e) => onFieldChange('treatment', e.target.value)}
                rows={3}
                placeholder="Describe treatment plan..."
                className={inputCls}
              />
            </div>

            {/* Allergy Warning Banner */}
            {hasAllergies && (
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-200/60">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Allergy Alert</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(Array.isArray(allergyList) ? allergyList : [allergyList]).map((allergy, ai) => (
                      <span key={ai} className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        {typeof allergy === 'string' ? allergy : allergy?.name || allergy?.allergen || 'Unknown'}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-red-600/60 mt-1.5">
                    Review patient allergies before prescribing medications
                  </p>
                </div>
              </div>
            )}

            {/* Prescription Builder with Care Reminder Controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Pill className="h-4 w-4 text-emerald-600" />
                <label className={`${labelCls} !mb-0`}>Prescription (Rx)</label>
              </div>
              <PrescriptionBuilder
                medications={form.prescriptions}
                reminderConfig={reminderConfig}
                onChange={onMedChange}
                onReminderToggle={onReminderToggle}
                onTimeChange={onTimeChange}
                onAdd={onAddMed}
                onRemove={onRemoveMed}
              />
            </div>

            {/* Follow-up */}
            <div>
              <label className={labelCls}>Follow-up Date</label>
              <input type="date" value={form.followUpDate} onChange={(e) => onFieldChange('followUpDate', e.target.value)} className={`${inputCls} w-full sm:w-64`} />
            </div>
          </SOAPSection>

          {/* ═══ ATTACHMENTS ═══ */}
          <SOAPSection
            sectionKey="attachments"
            label="Attachments"
            subtitle="X-Rays, Photos & Documents"
            color="amber"
            isOpen={openSections.has('attachments')}
            onToggle={() => toggleSection('attachments')}
            isComplete={uploadedFiles?.length > 0}
            readOnly={readOnly}
          >
            <FileDropzone onFiles={onFileUpload} files={uploadedFiles} />
          </SOAPSection>

        </div>
      </fieldset>

      {/* Signature & Action Buttons */}
      <ConsultationFooter
        doctor={doctor}
        readOnly={readOnly}
        saving={saving}
        completing={completing}
        onSaveDraft={onSaveDraft}
        onComplete={onComplete}
        form={form}
      />
    </div>
  );

  // ── Patient sidebar JSX ──
  const patientSidebar = patient ? (
    <div className="space-y-6">
      {/* Patient Header */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-lg font-bold text-primary-700">
            {(patient?.firstName || patient?.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h4 className="text-base font-bold text-neutral-900">
              {patient?.firstName ? `${patient.firstName} ${patient.lastName || ''}` : patient?.name || 'Patient'}
            </h4>
            <p className="text-xs text-neutral-900/40 font-mono">
              ID: {patient?.patientId || patient?._id?.slice(-8) || '--'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-neutral-50/50 rounded-xl">
            <p className="text-[10px] text-neutral-900/30 uppercase tracking-wider mb-1">Gender</p>
            <p className="text-sm font-medium text-neutral-900 capitalize">{patient?.gender || '--'}</p>
          </div>
          <div className="p-3 bg-neutral-50/50 rounded-xl">
            <p className="text-[10px] text-neutral-900/30 uppercase tracking-wider mb-1">Age</p>
            <p className="text-sm font-medium text-neutral-900">
              {patient?.dateOfBirth ? `${Math.floor((Date.now() - new Date(patient.dateOfBirth)) / 31536000000)} yrs` : patient?.age ? `${patient.age} yrs` : '--'}
            </p>
          </div>
          {patient?.phone && (
            <div className="p-3 bg-neutral-50/50 rounded-xl col-span-2">
              <p className="text-[10px] text-neutral-900/30 uppercase tracking-wider mb-1">Phone</p>
              <p className="text-sm font-medium text-neutral-900">{patient.phone}</p>
            </div>
          )}
          {patient?.bloodGroup && (
            <div className="p-3 bg-neutral-50/50 rounded-xl col-span-2">
              <p className="text-[10px] text-neutral-900/30 uppercase tracking-wider mb-1">Blood Group</p>
              <p className="text-sm font-medium text-neutral-900">{patient.bloodGroup}</p>
            </div>
          )}
        </div>
      </div>

      {/* Allergies & Medical Alerts */}
      {(patient?.allergies?.length > 0 || patient?.medicalHistory) && (
        <div className={`${cardCls} p-5 border-red-200/60`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <h4 className="text-sm font-semibold text-red-700">Medical Alerts</h4>
          </div>
          {patient?.allergies?.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-medium text-neutral-900/30 uppercase tracking-wider mb-1.5">Allergies</p>
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(patient.allergies) ? patient.allergies : [patient.allergies]).map((allergy, ai) => (
                  <span key={ai} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                    {typeof allergy === 'string' ? allergy : allergy.name || allergy.allergen || 'Unknown'}
                  </span>
                ))}
              </div>
            </div>
          )}
          {patient?.medicalHistory && (
            <div>
              <p className="text-[10px] font-medium text-neutral-900/30 uppercase tracking-wider mb-1">Medical History</p>
              <p className="text-xs text-neutral-900/60 leading-relaxed">
                {typeof patient.medicalHistory === 'string' ? patient.medicalHistory : Array.isArray(patient.medicalHistory) ? patient.medicalHistory.join(', ') : '--'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent Prescriptions */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-xl bg-purple-50">
            <Pill className="h-4 w-4 text-purple-600" />
          </div>
          <h4 className="text-sm font-semibold text-neutral-900">Recent Prescriptions</h4>
        </div>
        {patient?.recentPrescriptions?.length > 0 ? (
          <div className="space-y-2">
            {patient.recentPrescriptions.slice(0, 5).map((rx, i) => (
              <div key={i} className="p-3 bg-neutral-50/50 rounded-xl">
                <p className="text-xs font-medium text-neutral-900">
                  {rx.diagnosis || rx.medications?.[0]?.name || 'Prescription'}
                </p>
                <p className="text-[11px] text-neutral-900/30 mt-0.5">
                  {new Date(rx.createdAt || rx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-900/30 py-4 text-center">
            No recent prescriptions
          </p>
        )}
      </div>
    </div>
  ) : null;

  if (!showPatientSidebar || !patient) {
    return formContent;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">{formContent}</div>
      {patientSidebar}
    </div>
  );
}
