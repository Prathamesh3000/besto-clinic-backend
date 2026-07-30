/**
 * ConsultationForm — Enterprise EHR SaaS Redesign
 *
 * A highly polished, production-grade clinical interface designed for SaaS distribution.
 * Utilizes a modern "bento-box" grid layout to maximize screen real estate, sleek 
 * ghost inputs for reduced visual fatigue, and a condensed patient ribbon.
 *
 * All state management, handlers, and color-grades are preserved perfectly from V4.
 *
 * @version 7.0 — Premium SaaS Layout Overhaul
 */

import { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {
  User, Calendar, Hash, Stethoscope, Activity, FileText,
  Pill, ClipboardCheck, Paperclip, PenTool, Shield, Phone,
  Mail, MapPin, Plus, Trash2, X, Bell, BellOff, Clock,
  Upload, AlertTriangle, Heart, Building2, Eye, ChevronRight,
  Package, Search
} from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';
import { listInventory } from '../api';

// ════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════

const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const TASK_TYPE_CONFIG = {
  medication: { label: 'Medication', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  hygiene:    { label: 'Hygiene',    bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200',    dot: 'bg-sky-500' },
  post_care:  { label: 'Post Care',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  follow_up:  { label: 'Follow Up',  bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  dietary:    { label: 'Dietary',    bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  custom:     { label: 'Custom',     bg: 'bg-neutral-100',text: 'text-neutral-600',border: 'border-neutral-200',dot: 'bg-neutral-400' },
};

const FREQUENCY_OPTIONS = [
  { value: '', label: 'Select frequency' },
  { value: 'once', label: 'Once' },
  { value: 'once_daily', label: 'Once daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'thrice_daily', label: 'Three times daily' },
  { value: 'four_times_daily', label: 'Four times daily' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'before_meals', label: 'Before meals' },
  { value: 'after_meals', label: 'After meals' },
  { value: 'bedtime', label: 'At bedtime' },
];

const VISIT_TYPES = ['Consultation', 'Follow-up', 'Review Visit', 'Check-up', 'Emergency'];

// ════════════════════════════════════════════════════════════
//  MODERN SAAS UI PRIMITIVES
// ════════════════════════════════════════════════════════════

const FormLabel = ({ children, required }) => (
  <label className="block text-[11px] font-bold text-neutral-500 mb-1.5 uppercase tracking-wide">
    {children}
    {required && <span className="text-red-500 ml-1">*</span>}
  </label>
);

const FormInput = ({ value, onChange, placeholder, readOnly, prefix, type = 'text', className = '' }) => (
  <div className={`flex items-center rounded-xl overflow-hidden transition-all border
    ${readOnly
      ? 'border-transparent bg-neutral-50'
      : 'border-transparent bg-neutral-100/60 hover:bg-neutral-200/50 focus-within:bg-white focus-within:border-primary-400 focus-within:shadow-[0_0_0_3px_rgba(46,95,162,0.1)]'
    } ${className}`}>
    {prefix && (
      <span className="px-3.5 py-2.5 text-sm font-semibold text-neutral-500 bg-neutral-200/50">{prefix}</span>
    )}
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`flex-1 px-3.5 py-2.5 text-sm bg-transparent outline-none placeholder:text-neutral-400
        ${type === 'date' ? '[&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer' : ''}
        ${readOnly ? 'cursor-default text-neutral-600 font-medium' : 'text-neutral-900 font-medium'}`}
    />
  </div>
);

const FormTextarea = ({ value, onChange, placeholder, rows = 3 }) => (
  <textarea
    value={value || ''}
    onChange={(e) => onChange?.(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className="w-full px-3.5 py-2.5 text-sm rounded-xl transition-all resize-none leading-relaxed border border-transparent
      bg-neutral-100/60 hover:bg-neutral-200/50 focus:bg-white focus:border-primary-400 focus:shadow-[0_0_0_3px_rgba(46,95,162,0.1)]
      text-neutral-900 font-medium placeholder:text-neutral-400 outline-none"
  />
);

const FormSelect = ({ value, onChange, children }) => (
  <select
    value={value || ''}
    onChange={(e) => onChange?.(e.target.value || null)}
    className="w-full px-3.5 py-2.5 text-sm rounded-xl transition-all border border-transparent cursor-pointer
      bg-neutral-100/60 hover:bg-neutral-200/50 focus:bg-white focus:border-primary-400 focus:shadow-[0_0_0_3px_rgba(46,95,162,0.1)]
      text-neutral-900 font-medium outline-none"
  >
    {children}
  </select>
);

const SectionCard = ({ icon: Icon, iconColor = 'primary', title, subtitle, children, action, className = '' }) => {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose:    'bg-rose-50 text-rose-600',
    violet:  'bg-violet-50 text-violet-600',
    teal:    'bg-teal-50 text-teal-600',
    sky:     'bg-sky-50 text-sky-600',
    neutral: 'bg-neutral-100 text-neutral-600',
  };

  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] flex flex-col ${className}`}>
      <div className="px-6 py-5 flex items-center justify-between border-b border-neutral-100/80">
        <div className="flex items-center gap-3.5">
          {Icon && (
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[iconColor] || colors.primary}`}>
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
          )}
          <div>
            <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="p-6 flex-1">{children}</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  FDI DENTAL CHART
// ════════════════════════════════════════════════════════════

const CONDITION_COLORS = {
  cavity:  { bg: 'bg-blue-500', ring: 'ring-blue-300', label: 'Cavity' },
  filling: { bg: 'bg-emerald-500', ring: 'ring-emerald-300', label: 'Filling' },
  pain:    { bg: 'bg-red-500', ring: 'ring-red-300', label: 'Pain' },
  missing: { bg: 'bg-neutral-200', ring: 'ring-neutral-200', label: 'Missing' },
};

const FDIDentalChart = ({ selectedTeeth = [], onToothClick }) => {
  const renderTooth = (toothNum) => {
    const data = selectedTeeth.find(t => t.tooth === toothNum);
    const isSelected = !!data;
    const conditions = data?.conditions || [];
    const isMissing = conditions.includes('missing');

    return (
      <div
        key={toothNum}
        className="flex flex-col items-center cursor-pointer group"
        onClick={() => onToothClick(toothNum)}
        title={isSelected ? `#${toothNum}: ${conditions.join(', ')}` : `Tooth #${toothNum} — click to mark`}
      >
        <span className={`text-[10px] font-bold mb-1.5 transition-colors
          ${isSelected ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-600'}`}>
          {toothNum}
        </span>
        <div className={`w-8 h-10 border-[1.5px] rounded-b-xl rounded-t-md relative transition-all duration-200
          ${isMissing
            ? 'bg-neutral-100 border-neutral-200 opacity-60'
            : isSelected
              ? 'bg-primary-50 border-primary-500 shadow-[0_2px_8px_-2px_rgba(46,95,162,0.3)]'
              : 'bg-white border-neutral-300 group-hover:border-neutral-400 group-hover:bg-neutral-50'
          }`}>
          {conditions.includes('cavity') && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full bg-blue-500 shadow-sm" />
            </div>
          )}
          {conditions.includes('filling') && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {conditions.includes('pain') && (
            <div className="absolute -top-1.5 -right-1.5 z-10">
              <span className="flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                  <span className="text-[7px] text-white font-bold">!</span>
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const selectedCount = selectedTeeth.length;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-50/50 rounded-2xl p-4 sm:p-6 border border-neutral-100 overflow-x-auto">
        <div className="text-center mb-3">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em]">Upper Jaw — Maxilla</span>
        </div>
        <div className="flex justify-center gap-1.5 min-w-[560px]">{FDI_UPPER.map(renderTooth)}</div>

        <div className="flex items-center gap-3 my-5 min-w-[560px]">
          <div className="flex-1 border-t-2 border-dashed border-neutral-200" />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">R</span>
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-300" />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">L</span>
          <div className="flex-1 border-t-2 border-dashed border-neutral-200" />
        </div>

        <div className="flex justify-center gap-1.5 min-w-[560px]">{FDI_LOWER.map(renderTooth)}</div>
        <div className="text-center mt-3">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em]">Lower Jaw — Mandible</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
          {Object.entries(CONDITION_COLORS).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${cfg.bg}`} />
              <span className="text-xs font-semibold text-neutral-600">{cfg.label}</span>
            </div>
          ))}
        </div>
        {selectedCount > 0 && (
          <span className="text-xs font-bold text-primary-700 bg-primary-50 px-3 py-1 rounded-lg border border-primary-100">
            {selectedCount} {selectedCount === 1 ? 'tooth' : 'teeth'} marked
          </span>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  DIGITAL SIGNATURE PAD
// ════════════════════════════════════════════════════════════

const SignaturePad = ({ value, onChange, doctorName }) => {
  const sigPad = useRef(null);
  const [mode, setMode] = useState('draw');

  const handleClear = () => { sigPad.current?.clear(); onChange(''); };
  const handleSave = () => { if (!sigPad.current?.isEmpty()) onChange(sigPad.current.toDataURL()); };
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl bg-neutral-100 p-1">
        {[
          { key: 'draw', icon: PenTool, label: 'Draw' },
          { key: 'upload', icon: Upload, label: 'Upload' },
        ].map(({ key, icon: Ic, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === key ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Ic className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'draw' ? (
        <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50/50 hover:border-neutral-300 transition-colors focus-within:border-primary-400 focus-within:shadow-[0_0_0_3px_rgba(46,95,162,0.1)]">
          <SignatureCanvas
            ref={sigPad}
            canvasProps={{ className: 'w-full', style: { width: '100%', height: '120px' } }}
            onEnd={handleSave}
          />
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-neutral-100">
            <span className="text-[11px] text-neutral-400 font-medium">Sign within the area</span>
            <button type="button" onClick={handleClear} className="text-[11px] text-red-500 hover:text-red-700 font-bold transition-colors">
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" id="sig-upload" />
          <button
            type="button"
            onClick={() => document.getElementById('sig-upload')?.click()}
            className="w-full py-5 text-sm font-bold text-primary-600 border-2 border-dashed border-primary-200 rounded-xl
              bg-primary-50/50 hover:bg-primary-50 transition-all flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Signature Image
          </button>
          {value && (
            <div className="mt-4 relative inline-block">
              <img src={value} alt="Signature" className="h-20 border border-neutral-200 rounded-xl p-2 bg-white shadow-sm" />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {doctorName && (
        <div className="pt-3">
          <p className="text-sm font-bold text-neutral-900">{doctorName}</p>
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mt-0.5">Authorized Signatory</p>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  REMINDER TIME SLOTS
// ════════════════════════════════════════════════════════════

const ReminderTimeSlots = ({ times = [], onChange }) => {
  const addTime = () => onChange([...times, '']);
  const removeTime = (idx) => onChange(times.filter((_, i) => i !== idx));
  const updateTime = (idx, val) => onChange(times.map((t, i) => i === idx ? val : t));

  return (
    <div className="mt-3 ml-7 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Scheduled Times</span>
        </div>
        <button
          type="button"
          onClick={addTime}
          className="text-[11px] text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1 bg-primary-50 px-2 py-1 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Time
        </button>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {times.length === 0 && (
          <span className="text-[11px] text-neutral-400 italic">No times set — click "Add Time" to schedule reminders</span>
        )}
        {times.map((t, idx) => (
          <div key={idx} className="flex items-center gap-1.5 bg-neutral-100 border border-neutral-200 rounded-lg px-2.5 py-1.5">
            <input
              type="time"
              value={t}
              onChange={(e) => updateTime(idx, e.target.value)}
              className="text-xs font-bold text-neutral-700 bg-transparent outline-none w-[76px]"
            />
            <button type="button" onClick={() => removeTime(idx)} className="text-neutral-400 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  PRESCRIPTION EDITOR (Rx Pad)
// ════════════════════════════════════════════════════════════

const PrescriptionEditor = ({ prescriptions = [], onChange, reminderConfig, onReminderToggle, onTimeChange }) => {
  const handleAdd = () => onChange([...prescriptions, { medication: '', dosage: '', frequency: '', duration: '', notes: '' }]);
  const handleRemove = (idx) => onChange(prescriptions.filter((_, i) => i !== idx));
  const handleChange = (idx, field, val) => onChange(prescriptions.map((m, i) => i === idx ? { ...m, [field]: val } : m));

  return (
    <div className="space-y-5">
      {prescriptions.length === 0 && (
        <div className="text-center py-10 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
          <div className="w-12 h-12 rounded-xl bg-white border border-neutral-100 flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Pill className="h-6 w-6 text-neutral-400" />
          </div>
          <p className="text-sm font-semibold text-neutral-600">No medications ordered</p>
        </div>
      )}

      {prescriptions.map((med, idx) => {
        const medConfig = reminderConfig?.medications?.[idx] || {};
        const isReminderOn = !!medConfig.enabled;

        return (
          <div key={idx} className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-50/80 border-b border-neutral-100">
              <div className="flex items-center gap-3 w-full max-w-md">
                <div className="w-7 h-7 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shadow-sm">
                  <span className="text-xs font-bold text-neutral-600">{idx + 1}</span>
                </div>
                <input
                  type="text"
                  value={med.medication}
                  onChange={(e) => handleChange(idx, 'medication', e.target.value)}
                  placeholder="Medication name (e.g., Amoxicillin 500mg)"
                  className="flex-1 text-sm font-bold text-neutral-900 bg-transparent outline-none placeholder:text-neutral-400"
                />
              </div>
              <button type="button" onClick={() => handleRemove(idx)} className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors bg-white rounded-md border border-neutral-200 shadow-sm">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <FormLabel>Dosage</FormLabel>
                  <FormInput value={med.dosage} onChange={(v) => handleChange(idx, 'dosage', v)} placeholder="500mg" />
                </div>
                <div>
                  <FormLabel>Frequency</FormLabel>
                  <FormSelect value={med.frequency} onChange={(v) => handleChange(idx, 'frequency', v)}>
                    {FREQUENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value} disabled={!opt.value}>{opt.label}</option>)}
                  </FormSelect>
                </div>
                <div>
                  <FormLabel>Duration</FormLabel>
                  <FormInput value={med.duration} onChange={(v) => handleChange(idx, 'duration', v)} placeholder="5 days" />
                </div>
                <div>
                  <FormLabel>Instructions</FormLabel>
                  <FormInput value={med.notes} onChange={(v) => handleChange(idx, 'notes', v)} placeholder="After meals" />
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-neutral-100">
                <label className="flex items-center gap-3 cursor-pointer w-max group">
                  <div className={`w-9 h-5 rounded-full relative transition-colors ${isReminderOn ? 'bg-primary-500' : 'bg-neutral-200'}`}
                    onClick={(e) => { e.preventDefault(); onReminderToggle?.(idx, !isReminderOn); }}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isReminderOn ? 'left-[18px]' : 'left-0.5'}`} />
                  </div>
                  <span className="text-[12px] font-bold text-neutral-600 group-hover:text-neutral-900 flex items-center gap-2">
                    {isReminderOn ? <Bell className="h-3.5 w-3.5 text-primary-500" /> : <BellOff className="h-3.5 w-3.5 text-neutral-400" />}
                    Patient Reminders
                  </span>
                </label>
                {isReminderOn && <ReminderTimeSlots times={medConfig.customTimes || []} onChange={(t) => onTimeChange?.(idx, t)} />}
              </div>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={handleAdd}
        className="w-full py-4 text-sm font-bold text-primary-600 border border-transparent bg-primary-50 rounded-xl hover:bg-primary-100 transition-all flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add Prescription Order
      </button>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  FILE UPLOAD
// ════════════════════════════════════════════════════════════

const FileUpload = ({ attachments = [], onChange }) => {
  const fileRef = useRef(null);

  const handleSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const readers = files.map(f => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ name: f.name, type: f.type, size: f.size, data: ev.target.result, uploadedAt: new Date().toISOString() });
      reader.readAsDataURL(f);
    }));
    Promise.all(readers).then(r => onChange([...attachments, ...r]));
    if (fileRef.current) fileRef.current.value = '';
  };

  const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleSelect} className="hidden" />
      <button type="button" onClick={() => fileRef.current?.click()}
        className="w-full py-5 text-sm font-bold text-neutral-600 border-2 border-dashed border-neutral-200 bg-neutral-50/50
          rounded-xl hover:bg-neutral-100 hover:border-neutral-300 transition-all flex items-center justify-center gap-2">
        <Upload className="w-4 h-4 text-neutral-400" />
        Upload Scans or Documents
      </button>
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                   <Paperclip className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="flex flex-col truncate">
                   <span className="text-xs font-bold text-neutral-900 truncate">{file.name}</span>
                   <span className="text-[10px] text-neutral-500 shrink-0 font-medium">{fmtSize(file.size)}</span>
                </div>
              </div>
              <button type="button" onClick={() => onChange(attachments.filter((_, i) => i !== idx))}
                className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-3 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
//  MATERIALS USED EDITOR
// ════════════════════════════════════════════════════════════════

const MaterialsUsedEditor = ({ materials = [], onChange, branchId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);

  const handleSearch = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (!val || val.length < 2) { setResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const params = { search: val, limit: 10 };
        if (branchId) params.branch = branchId;
        const res = await listInventory(params);
        const items = res?.data || res?.items || res || [];
        // Filter out items already added
        const addedIds = new Set(materials.map(m => m.item));
        setResults(Array.isArray(items) ? items.filter(i => !addedIds.has(i._id)) : []);
        setShowDropdown(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
  };

  const addItem = (invItem) => {
    onChange([...materials, {
      item: invItem._id,
      itemName: invItem.name,
      quantity: 1,
      costPerUnit: invItem.unitCost || invItem.costPerUnit || 0,
    }]);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  const updateQty = (idx, qty) => {
    const n = Math.max(1, parseInt(qty, 10) || 1);
    onChange(materials.map((m, i) => i === idx ? { ...m, quantity: n } : m));
  };

  const removeItem = (idx) => onChange(materials.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <div className="flex items-center rounded-xl overflow-hidden border border-transparent bg-neutral-100/60 hover:bg-neutral-200/50 focus-within:bg-white focus-within:border-primary-400 focus-within:shadow-[0_0_0_3px_rgba(46,95,162,0.1)]">
          <span className="pl-3.5 text-neutral-400"><Search className="w-4 h-4" /></span>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Search inventory items..."
            className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-neutral-900 font-medium placeholder:text-neutral-400"
          />
          {searching && <span className="pr-3.5 text-xs text-neutral-400 animate-pulse">Searching...</span>}
        </div>

        {/* Dropdown results */}
        {showDropdown && results.length > 0 && (
          <div ref={dropdownRef} className="absolute z-20 mt-1.5 w-full bg-white rounded-xl border border-neutral-200 shadow-lg max-h-56 overflow-y-auto">
            {results.map((item) => (
              <button
                key={item._id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addItem(item)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-primary-50 transition-colors text-left border-b border-neutral-50 last:border-b-0"
              >
                <div>
                  <span className="text-sm font-semibold text-neutral-900">{item.name}</span>
                  {item.code && <span className="ml-2 text-[10px] font-bold text-neutral-400 uppercase">{item.code}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-bold ${item.currentStock <= (item.minimumThreshold || 0) ? 'text-red-500' : 'text-emerald-600'}`}>
                    Stock: {item.currentStock ?? '—'}
                  </span>
                  {item.unit && <span className="text-neutral-400">{item.unit}</span>}
                  <Plus className="w-4 h-4 text-primary-500" />
                </div>
              </button>
            ))}
          </div>
        )}
        {showDropdown && query.length >= 2 && results.length === 0 && !searching && (
          <div className="absolute z-20 mt-1.5 w-full bg-white rounded-xl border border-neutral-200 shadow-lg px-4 py-6 text-center">
            <p className="text-sm text-neutral-500">No items found</p>
          </div>
        )}
      </div>

      {/* Selected items list */}
      {materials.length === 0 ? (
        <div className="text-center py-8 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
          <Package className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-neutral-500">No materials recorded</p>
          <p className="text-xs text-neutral-400 mt-1">Search above to add inventory items used</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2">
            <span className="col-span-5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Item</span>
            <span className="col-span-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Qty</span>
            <span className="col-span-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Cost/Unit</span>
            <span className="col-span-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-right">Total</span>
          </div>

          {materials.map((mat, idx) => (
            <div key={mat.item || idx} className="grid grid-cols-12 gap-3 items-center border border-neutral-200 rounded-xl bg-white px-4 py-3 shadow-sm">
              <div className="col-span-5 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-primary-600" />
                </div>
                <span className="text-sm font-semibold text-neutral-900 truncate">{mat.itemName}</span>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="1"
                  value={mat.quantity}
                  onChange={(e) => updateQty(idx, e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-bold text-neutral-900 bg-neutral-100/60 rounded-lg border border-transparent focus:bg-white focus:border-primary-400 outline-none text-center"
                />
              </div>
              <div className="col-span-3 text-sm font-medium text-neutral-600">
                {mat.costPerUnit > 0 ? `₹${mat.costPerUnit.toLocaleString()}` : '—'}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                <span className="text-sm font-bold text-neutral-900">
                  {mat.costPerUnit > 0 ? `₹${(mat.quantity * mat.costPerUnit).toLocaleString()}` : '—'}
                </span>
                <button type="button" onClick={() => removeItem(idx)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Total row */}
          {materials.some(m => m.costPerUnit > 0) && (
            <div className="flex items-center justify-end gap-3 px-4 py-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Material Total</span>
              <span className="text-base font-black text-neutral-900">
                ₹{materials.reduce((sum, m) => sum + (m.quantity * (m.costPerUnit || 0)), 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  MAIN COMPONENT (The SaaS "Bento" Grid Overhaul)
// ════════════════════════════════════════════════════════════════

export default function ConsultationForm({
  form = {},
  onChange,
  reminderConfig = {},
  onReminderToggle,
  onTimeChange,
  onFileUpload,
  onScheduleFollowUp,
  patient = {},
  appointment = {},
  doctor = {},
  clinic = {},
}) {
  const calcAge = (dob) => {
    if (!dob) return '';
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
  };

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(dt.getUTCDate()).padStart(2,'0')} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  };
  const fmtTime = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
    return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const handleChange = (field, value) => onChange?.({ [field]: value });

  // ── Handlers (Untouched) ──
  const careTasks = form.careTasks || [];
  const updateTask = (idx, field, val) => handleChange('careTasks', careTasks.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  const toggleTask = (idx, field) => handleChange('careTasks', careTasks.map((t, i) => i === idx ? { ...t, [field]: !t[field] } : t));
  const addTask = () => handleChange('careTasks', [...careTasks, { title: '', taskType: 'custom', instructions: '', frequency: '', enabled: true, reminderEnabled: false, customTimes: [], reminderMode: 'item_wise', eodTime: '20:00' }]);
  const removeTask = (idx) => handleChange('careTasks', careTasks.filter((_, i) => i !== idx));

  const handleToothClick = (toothNum) => {
    const teeth = form.teeth || [];
    const existing = teeth.find(t => t.tooth === toothNum);
    if (existing) {
      const c = existing.conditions || [];
      if (c.includes('missing'))      handleChange('teeth', teeth.filter(t => t.tooth !== toothNum));
      else if (c.includes('pain'))    handleChange('teeth', teeth.map(t => t.tooth === toothNum ? { ...t, conditions: ['missing'] } : t));
      else if (c.includes('filling')) handleChange('teeth', teeth.map(t => t.tooth === toothNum ? { ...t, conditions: ['pain'] } : t));
      else if (c.includes('cavity'))  handleChange('teeth', teeth.map(t => t.tooth === toothNum ? { ...t, conditions: ['filling'] } : t));
      else handleChange('teeth', teeth.map(t => t.tooth === toothNum ? { ...t, conditions: ['cavity'] } : t));
    } else {
      handleChange('teeth', [...teeth, { tooth: toothNum, conditions: ['cavity'] }]);
    }
  };

  const patientAge = calcAge(patient.dateOfBirth);
  const apptDate = fmtDate(appointment.scheduledAt || new Date());
  const apptTime = fmtTime(appointment.scheduledAt);

  // ══════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════

  return (
    <div className="w-full max-w-[1400px] mx-auto bg-neutral-50/50 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral-200 overflow-hidden font-sans">
      
      {/* ╔═══════════════════════════════════════════════════╗
          ║  EHR HEADER & CLINIC INFO                         ║
          ╚═══════════════════════════════════════════════════╝ */}
      <div className="bg-white border-b border-neutral-200">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-5 gap-4">
          <div className="flex items-center gap-4">
            {clinic.logo ? (
              <img src={resolveAssetUrl(clinic.logo)} alt={clinic.name} className="w-12 h-12 rounded-xl object-contain border border-neutral-100 shadow-sm p-1" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
                <span className="text-white text-lg font-black font-display">{(clinic.name || 'C')[0]}</span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-black text-neutral-900 tracking-tight">{clinic.name || 'Clinic'}</h1>
              <div className="flex items-center gap-3 mt-1 text-neutral-500 text-[11px] font-medium">
                {clinic.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{clinic.address}</span>}
                {(clinic.phone || doctor.phone) && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{clinic.phone || doctor.phone}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div className="hidden md:flex items-center gap-3">
              {doctor.profileImage ? (
                <img src={resolveAssetUrl(doctor.profileImage)} alt={doctor.name} className="w-10 h-10 rounded-full object-cover border border-neutral-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-bold">
                  {(doctor.name || 'D').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-right">
                <p className="text-sm font-bold text-neutral-900">{doctor.name || 'Attending Physician'}</p>
                <p className="text-[11px] text-neutral-500 font-medium">{doctor.specialization}</p>
              </div>
            </div>
            <div className="h-10 w-px bg-neutral-200 hidden md:block" />
            <div className="flex flex-col items-end">
               <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Consultation Date</span>
               <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                 <Calendar className="w-4 h-4 text-primary-500" />
                 {apptDate} <span className="text-neutral-400 font-medium">{apptTime}</span>
               </div>
            </div>
          </div>
        </div>

        {/* ╔═══════════════════════════════════════════════════╗
            ║  HORIZONTAL PATIENT RIBBON                        ║
            ╚═══════════════════════════════════════════════════╝ */}
        <div className="bg-gradient-to-r from-neutral-100/80 to-white border-t border-neutral-100 px-8 py-3 flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                    <User className="w-4 h-4" />
                 </div>
                 <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Patient</span>
                    <span className="text-sm font-black text-neutral-900">{patient.name || '—'}</span>
                 </div>
              </div>
              <div className="h-6 w-px bg-neutral-200" />
              <div className="flex items-center gap-6 text-sm font-medium text-neutral-700">
                 <div><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Age</span>{patientAge ? `${patientAge} yrs` : '—'}</div>
                 <div><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Gender</span>{patient.gender || '—'}</div>
                 <div><span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Blood</span>{patient.bloodGroup || '—'}</div>
              </div>
           </div>
           
           {patient.allergies && (
              <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                 <AlertTriangle className="w-4 h-4 text-red-500" />
                 <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Allergy: {patient.allergies}</span>
              </div>
           )}
        </div>
      </div>

      {/* ═══ BENTO GRID BODY ═══ */}
      <div className="p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* TOP ROW: Exam & Diagnosis */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <SectionCard icon={Stethoscope} iconColor="blue" title="Clinical Examination" className="flex-1">
              <div className="space-y-4">
                <div>
                  <FormLabel required>Chief Complaint</FormLabel>
                  <FormTextarea value={form.chiefComplaint} onChange={(v) => handleChange('chiefComplaint', v)} placeholder="Patient's primary concern..." rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FormLabel>Intraoral Findings</FormLabel>
                    <FormTextarea value={form.oralFindings} onChange={(v) => handleChange('oralFindings', v)} placeholder="Observations..." rows={2} />
                  </div>
                  <div>
                    <FormLabel>Extraoral / Exam Notes</FormLabel>
                    <FormTextarea value={form.examination} onChange={(v) => handleChange('examination', v)} placeholder="Observations..." rows={2} />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <SectionCard icon={Activity} iconColor="amber" title="Assessment & Diagnosis" className="flex-1">
               <div className="space-y-4">
                <div>
                  <FormLabel required>Primary Diagnosis</FormLabel>
                  <FormTextarea value={form.diagnosis} onChange={(v) => handleChange('diagnosis', v)} placeholder="Diagnosis and differentials..." rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FormLabel>Severity Grade</FormLabel>
                    <FormSelect value={form.severity} onChange={(v) => handleChange('severity', v)}>
                      <option value="">Select severity</option>
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </FormSelect>
                  </div>
                  <div>
                    <FormLabel>Assessment Notes</FormLabel>
                    <FormInput value={form.assessmentNotes} onChange={(v) => handleChange('assessmentNotes', v)} placeholder="Additional notes..." />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* MIDDLE ROW: Treatment Plan & Dental Chart */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <SectionCard icon={FileText} iconColor="emerald" title="Treatment Plan" className="flex-1">
               <div className="space-y-4">
                <div>
                  <FormLabel>Proposed Intervention</FormLabel>
                  <FormTextarea value={form.treatmentPlan} onChange={(v) => handleChange('treatmentPlan', v)} placeholder="Phases, timeline, expected outcomes..." rows={3} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FormLabel>Primary Procedure</FormLabel>
                    <FormInput value={form.procedure} onChange={(v) => handleChange('procedure', v)} placeholder="e.g. RCT" />
                  </div>
                  <div>
                    <FormLabel>Cost Estimate</FormLabel>
                    <FormInput value={form.estimatedCost} onChange={(v) => handleChange('estimatedCost', v)} prefix="₹" placeholder="Amount" />
                  </div>
                </div>
                <div>
                  <FormLabel>Follow-up Instructions</FormLabel>
                  <FormTextarea value={form.followUpInstructions} onChange={(v) => handleChange('followUpInstructions', v)} placeholder="Post-treatment care, diet restrictions, warning signs to watch for..." rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div>
                     <FormLabel>Follow-up Date</FormLabel>
                     <FormInput type="date" value={form.followUpDate} onChange={(v) => handleChange('followUpDate', v)} />
                     {onScheduleFollowUp && form.followUpDate && (
                       <button type="button" onClick={onScheduleFollowUp}
                         className="mt-1.5 text-[11px] font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                         <Calendar className="w-3 h-3" /> Schedule Appointment
                       </button>
                     )}
                   </div>
                   <div>
                     <FormLabel>Visit Type</FormLabel>
                     <FormSelect value={form.visitType} onChange={(v) => handleChange('visitType', v)}>
                        <option value="">Select type</option>
                        {VISIT_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                     </FormSelect>
                   </div>
                   <div>
                     <FormLabel>Priority</FormLabel>
                     <FormSelect value={form.priority} onChange={(v) => handleChange('priority', v)}>
                        <option value="">Select priority</option>
                        <option value="immediate">Immediate</option>
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                     </FormSelect>
                   </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-6">
            <SectionCard icon={Heart} iconColor="rose" title="FDI Dental Schematic" className="flex-1">
               <FDIDentalChart selectedTeeth={form.teeth || []} onToothClick={handleToothClick} />
               {(form.teeth || []).length > 0 && (
                 <div className="mt-5 pt-4 border-t border-neutral-100">
                   <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-2.5">Marked Teeth Summary</span>
                   <div className="flex flex-wrap gap-2">
                     {(form.teeth || []).map((t) => (
                       <div key={t.tooth} className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                         <span className="text-xs font-black text-primary-700 font-mono">#{t.tooth}</span>
                         <span className="text-neutral-300">|</span>
                         {(t.conditions || []).map((c) => {
                           const tagColors = {
                             cavity: 'bg-blue-50 text-blue-700',
                             filling: 'bg-emerald-50 text-emerald-700',
                             pain: 'bg-red-50 text-red-700',
                             missing: 'bg-neutral-100 text-neutral-600',
                           };
                           const cfg = CONDITION_COLORS[c];
                           return cfg ? (
                             <span key={c} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tagColors[c] || 'bg-neutral-100 text-neutral-600'}`}>
                               {cfg.label}
                             </span>
                           ) : null;
                         })}
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </SectionCard>
          </div>

          {/* FULL WIDTH: Materials Used */}
          <div className="lg:col-span-12">
            <SectionCard icon={Package} iconColor="amber" title="Materials Used" subtitle="Inventory items consumed during this consultation">
              <MaterialsUsedEditor
                materials={form.materialsUsed || []}
                onChange={(m) => handleChange('materialsUsed', m)}
                branchId={appointment?.branch?._id || appointment?.branch}
              />
            </SectionCard>
          </div>

          {/* FULL WIDTH: Rx Pad */}
          <div className="lg:col-span-12">
            <div className="rounded-2xl border border-primary-200 bg-white shadow-sm overflow-hidden flex flex-col md:flex-row">
               <div className="md:w-48 bg-gradient-to-b from-primary-50 to-white p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-primary-100">
                  <span className="text-6xl font-serif text-primary-600 leading-none select-none">&#8478;</span>
                  <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest mt-4">Rx Pad</h3>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center mt-1">Medical Directives</p>
               </div>
               <div className="p-6 flex-1">
                  <PrescriptionEditor prescriptions={form.prescriptions || []} onChange={(p) => handleChange('prescriptions', p)} reminderConfig={reminderConfig} onReminderToggle={onReminderToggle} onTimeChange={onTimeChange} />
               </div>
            </div>
          </div>

          {/* BOTTOM ROW: Post-Care & Meta */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <SectionCard icon={ClipboardCheck} iconColor="teal" title="Post-Care Protocols" action={
              <button type="button" onClick={addTask} className="text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            } className="flex-1">
              {careTasks.length === 0 ? (
                <div className="text-center py-8 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                  <ClipboardCheck className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-neutral-500">No protocols assigned</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {careTasks.map((task, idx) => {
                    const typeConf = TASK_TYPE_CONFIG[task.taskType] || TASK_TYPE_CONFIG.custom;
                    return (
                      <div key={idx} className="border border-neutral-200 rounded-xl bg-white shadow-sm overflow-hidden">
                        {/* Task header */}
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-50/50 border-b border-neutral-100">
                          <button type="button" onClick={() => toggleTask(idx, 'enabled')} className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${task.enabled ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-neutral-300'}`}>
                            {task.enabled && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${typeConf.bg} ${typeConf.text}`}>{typeConf.label}</span>
                          <input type="text" value={task.title || ''} onChange={(e) => updateTask(idx, 'title', e.target.value)} placeholder="Task name (e.g., Take prescribed antibiotics)" className="flex-1 text-sm font-bold text-neutral-900 bg-transparent outline-none placeholder:text-neutral-400" />
                          <button type="button" onClick={() => removeTask(idx)} className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>

                        {/* Task details */}
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <FormLabel>Type</FormLabel>
                              <FormSelect value={task.taskType} onChange={(v) => updateTask(idx, 'taskType', v)}>
                                {Object.entries(TASK_TYPE_CONFIG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
                              </FormSelect>
                            </div>
                            <div>
                              <FormLabel>Frequency</FormLabel>
                              <FormSelect value={task.frequency} onChange={(v) => updateTask(idx, 'frequency', v)}>
                                {FREQUENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value} disabled={!opt.value}>{opt.label}</option>)}
                              </FormSelect>
                            </div>
                          </div>
                          <div>
                            <FormLabel>Instructions</FormLabel>
                            <FormTextarea value={task.instructions} onChange={(v) => updateTask(idx, 'instructions', v)} placeholder="Specific directions for the patient..." rows={2} />
                          </div>

                          {/* Reminder toggle */}
                          <div className="pt-3 border-t border-neutral-100">
                            <label className="flex items-center gap-3 cursor-pointer w-max group">
                              <div className={`w-9 h-5 rounded-full relative transition-colors ${task.reminderEnabled ? 'bg-primary-500' : 'bg-neutral-200'}`}
                                onClick={(e) => { e.preventDefault(); toggleTask(idx, 'reminderEnabled'); }}>
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${task.reminderEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                              </div>
                              <span className="text-[12px] font-bold text-neutral-600 group-hover:text-neutral-900 flex items-center gap-2">
                                {task.reminderEnabled ? <Bell className="h-3.5 w-3.5 text-primary-500" /> : <BellOff className="h-3.5 w-3.5 text-neutral-400" />}
                                Patient Reminders
                              </span>
                            </label>
                            {task.reminderEnabled && (
                              <div className="mt-3 space-y-3">
                                {/* Reminder Mode selector */}
                                <div>
                                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Notification Mode</span>
                                  <div className="flex gap-2 mt-1.5">
                                    <button type="button"
                                      onClick={() => updateTask(idx, 'reminderMode', 'item_wise')}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                        (task.reminderMode || 'item_wise') === 'item_wise'
                                          ? 'bg-primary-50 text-primary-700 border-primary-200'
                                          : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50'
                                      }`}>
                                      Individual Reminders
                                    </button>
                                    <button type="button"
                                      onClick={() => updateTask(idx, 'reminderMode', 'eod_checklist')}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                        task.reminderMode === 'eod_checklist'
                                          ? 'bg-primary-50 text-primary-700 border-primary-200'
                                          : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50'
                                      }`}>
                                      End-of-Day Checklist
                                    </button>
                                  </div>
                                </div>

                                {/* Show time slots for item_wise, EOD time picker for eod_checklist */}
                                {task.reminderMode === 'eod_checklist' ? (
                                  <div>
                                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Checklist Time</span>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <input type="time" value={task.eodTime || '20:00'}
                                        onChange={(e) => updateTask(idx, 'eodTime', e.target.value)}
                                        className="text-sm font-bold text-neutral-700 bg-neutral-100 rounded-lg px-3 py-2 border border-neutral-200" />
                                      <span className="text-[11px] text-neutral-400">Patient gets one checklist at this time daily</span>
                                    </div>
                                  </div>
                                ) : (
                                  <ReminderTimeSlots
                                    times={task.customTimes || []}
                                    onChange={(t) => updateTask(idx, 'customTimes', t)}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <SectionCard icon={Paperclip} iconColor="sky" title="Reference Material" className="mb-6">
              <FileUpload attachments={form.attachments || []} onChange={(files) => onFileUpload ? onFileUpload(files) : handleChange('attachments', files)} />
            </SectionCard>
            
            <SectionCard icon={Shield} iconColor="neutral" title="Authorization">
              <div className="space-y-6">
                <div>
                  <FormLabel>Attending Physician Signature</FormLabel>
                  <SignaturePad value={form.doctorSignature || ''} onChange={(sig) => handleChange('doctorSignature', sig)} doctorName={doctor.name} />
                </div>
                <div className="pt-4 border-t border-neutral-100">
                  <FormLabel>Patient Consent</FormLabel>
                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100 space-y-3">
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      I acknowledge that the proposed treatment plan has been explained, including risks, benefits, and alternatives. I consent to proceed with the recommended treatment.
                    </p>
                    <FormSelect value={form.patientConsent} onChange={(v) => handleChange('patientConsent', v)}>
                      <option value="">Select consent status</option>
                      <option value="Verbal consent obtained">Verbal consent obtained</option>
                      <option value="Written consent obtained">Written consent obtained</option>
                      <option value="Consent declined">Consent declined</option>
                      <option value="Informed consent pending">Informed consent pending</option>
                    </FormSelect>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

        </div>
      </div>

      {/* ╔═══════════════════════════════════════════════════╗
          ║  EHR FOOTER                                       ║
          ╚═══════════════════════════════════════════════════╝ */}
      <div className="bg-neutral-100 border-t border-neutral-200 px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-widest gap-2">
          <span>{clinic.name || 'Clinic'}{(clinic.phone || doctor.phone) ? ` // ${clinic.phone || doctor.phone}` : ''}{clinic.email ? ` // ${clinic.email}` : ''}</span>
          <span className="text-neutral-400">Confidential clinical document — For authorized medical use only</span>
        </div>
      </div>
      
    </div>
  );
}