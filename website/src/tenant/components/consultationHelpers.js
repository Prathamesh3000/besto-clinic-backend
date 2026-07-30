// ─── Consultation shared constants & helpers ────────────────

export const EMPTY_TOOTH = { toothNumber: '', condition: '', procedure: '', procedureId: '', estimatedCost: 0, requiredMaterials: [] };
export const EMPTY_MED = { medication: '', dosage: '', frequency: '', duration: '', notes: '' };

export const DENTAL_CONDITIONS = [
  'Cavity', 'Decay', 'Fracture', 'Abscess', 'Impaction', 'Gingivitis',
  'Periodontitis', 'Erosion', 'Malocclusion', 'Pulpitis', 'Caries',
  'Crown damage', 'Root canal needed', 'Sensitivity', 'Other',
];

export const inputCls =
  'w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';

export const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1.5';

export const btnPrimary =
  'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed';

export const btnSecondary =
  'px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all disabled:opacity-50';

export const cardCls =
  'bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-sm)]';

export const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

export const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
};

export const formatTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '--:--';
  const h = dt.getUTCHours();
  const m = dt.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

export function buildEnrichedNotes(form) {
  const parts = [];
  if (form.chiefComplaint) {
    parts.push(`Chief Complaint: ${form.chiefComplaint}`);
  }
  const v = form.vitals || {};
  const vitalParts = [];
  if (v.bp) vitalParts.push(`BP: ${v.bp}`);
  if (v.temperature) vitalParts.push(`Temp: ${v.temperature}°F`);
  if (v.pulse) vitalParts.push(`Pulse: ${v.pulse} bpm`);
  if (v.spo2) vitalParts.push(`SpO2: ${v.spo2}%`);
  if (v.painScale) vitalParts.push(`Pain: ${v.painScale}/10`);
  if (vitalParts.length) {
    parts.push(`Vitals: ${vitalParts.join(' | ')}`);
  }
  if (form.notes) {
    parts.push(form.notes);
  }
  return parts.join('\n\n');
}

// ─── SOAP section definitions ────────────────────────────
export const SOAP_SECTIONS = [
  { key: 'subjective', label: 'Subjective', subtitle: 'Chief Complaint & History', color: 'blue' },
  { key: 'objective',  label: 'Objective',  subtitle: 'Vitals & Examination',      color: 'red' },
  { key: 'assessment', label: 'Assessment', subtitle: 'Diagnosis & Notes',         color: 'purple' },
  { key: 'plan',       label: 'Plan',       subtitle: 'Treatment & Prescriptions', color: 'emerald' },
  { key: 'attachments',label: 'Attachments',subtitle: 'X-Rays, Photos & Documents',color: 'amber' },
];

export function getSectionCompleteness(form) {
  return {
    subjective: Boolean(form.chiefComplaint?.trim()),
    objective: Boolean(
      form.vitals?.bp || form.vitals?.temperature || form.vitals?.pulse ||
      form.vitals?.spo2 || form.vitals?.painScale ||
      form.teeth?.some(t => t.toothNumber)
    ),
    assessment: Boolean(form.diagnosis?.trim()),
    plan: Boolean(
      form.treatment?.trim() ||
      form.prescriptions?.some(p => p.medication?.trim()) ||
      form.followUpDate
    ),
    attachments: false,
  };
}

export const INITIAL_CONSULT_FORM = {
  chiefComplaint: '',
  vitals: { bp: '', temperature: '', pulse: '', spo2: '', painScale: '' },
  diagnosis: '',
  treatment: '',
  teeth: [{ ...EMPTY_TOOTH }],
  prescriptions: [{ ...EMPTY_MED }],
  notes: '',
  followUpDate: '',
};
