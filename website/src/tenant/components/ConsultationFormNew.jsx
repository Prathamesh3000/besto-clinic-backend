/**
 * ConsultationFormNew - Professional Medical Consultation Form
 *
 * Completely redesigned modern consultation form with:
 * - Clean, professional medical layout (no accordions)
 * - Print-optimized design with clinic letterhead
 * - Customizable care reminder times (Morning/Noon/Evening)
 * - Modern input styling with professional aesthetics
 * - SOAP format with better visual hierarchy
 * - Integrated prescription builder with time customization
 *
 * @version 4.0 (Complete Redesign)
 * @date April 2026
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { stripDrPrefix } from '../../utils/doctorName';
import { resolveAssetUrl } from '../../lib/assetUrl';
import {
  User, Calendar, Phone, Mail, MapPin, Stethoscope,
  Activity, Thermometer, Heart, Wind,
  FileText, Pill, Plus, X, Clock, Bell, Printer, Sunrise, Sun, Moon,
  ChevronDown, Check, AlertCircle,
} from 'lucide-react';

/* ── Print Styles ─────────────────────────────────────── */
const printStyles = `
@media print {
  @page {
    size: A4;
    margin: 1.5cm;
  }

  body * {
    visibility: hidden;
  }

  .print-container, .print-container * {
    visibility: visible;
  }

  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

  .no-print {
    display: none !important;
  }

  .print-page-break {
    page-break-before: always;
  }

  .print-avoid-break {
    page-break-inside: avoid;
  }
}
`;

/* ── Helper Components ────────────────────────────────── */

// Professional Section Header
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2.5 rounded-xl bg-primary-50">
        <Icon className="h-5 w-5 text-primary-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 font-display">{title}</h3>
        {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Form Input Component
function FormInput({ label, value, onChange, placeholder, rows, required, type = 'text', className = '' }) {
  const isTextarea = rows > 1;
  const Component = isTextarea ? 'textarea' : 'input';

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <Component
        type={!isTextarea ? type : undefined}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={isTextarea ? rows : undefined}
        className={`w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all ${isTextarea ? 'resize-none' : ''}`}
      />
    </div>
  );
}

// Vital Sign Input
function VitalInput({ icon: Icon, label, value, onChange, unit, placeholder }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-neutral-500" />
        <label className="text-xs font-medium text-neutral-600">{label}</label>
      </div>
      <div className="relative">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-12 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-medium">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// Prescription Row Component
function PrescriptionRow({
  medication,
  index,
  onChange,
  onRemove,
  reminderConfig,
  onReminderToggle,
  onTimeChange,
  showReminder = true,
}) {
  const [showTimeCustomizer, setShowTimeCustomizer] = useState(false);
  const medConfig = reminderConfig?.medications?.[index] || {};
  const reminderEnabled = medConfig.enabled !== false;
  const customTimes = medConfig.customTimes || ['08:00', '13:00', '20:00'];

  const handleTimeSlotChange = (slotIndex, value) => {
    const newTimes = [...customTimes];
    newTimes[slotIndex] = value;
    onTimeChange(index, newTimes);
  };

  const timeSlots = [
    { label: 'Morning', Icon: Sunrise, defaultTime: '08:00' },
    { label: 'Noon', Icon: Sun, defaultTime: '13:00' },
    { label: 'Evening', Icon: Moon, defaultTime: '20:00' },
  ];

  return (
    <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50/50 space-y-3 print-avoid-break">
      {/* Medication Details */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Medication *</label>
          <input
            type="text"
            value={medication.medication || ''}
            onChange={(e) => onChange(index, 'medication', e.target.value)}
            placeholder="e.g., Amoxicillin"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Dosage *</label>
          <input
            type="text"
            value={medication.dosage || ''}
            onChange={(e) => onChange(index, 'dosage', e.target.value)}
            placeholder="e.g., 500mg"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Duration *</label>
          <input
            type="text"
            value={medication.duration || ''}
            onChange={(e) => onChange(index, 'duration', e.target.value)}
            placeholder="e.g., 7 days"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Frequency *</label>
          <select
            value={medication.frequency || 'twice_daily'}
            onChange={(e) => onChange(index, 'frequency', e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          >
            <option value="once_daily">Once daily</option>
            <option value="twice_daily">Twice daily</option>
            <option value="thrice_daily">Three times daily</option>
            <option value="four_times_daily">Four times daily</option>
            <option value="as_needed">As needed</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Special Instructions</label>
          <input
            type="text"
            value={medication.notes || ''}
            onChange={(e) => onChange(index, 'notes', e.target.value)}
            placeholder="e.g., Take with food, avoid alcohol"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          />
        </div>
      </div>

      {/* Care Reminder Section */}
      {showReminder && medication.medication && (
        <div className="pt-3 border-t border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-neutral-700">Care Reminders</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowTimeCustomizer(!showTimeCustomizer)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 no-print"
              >
                <Clock className="h-3.5 w-3.5" />
                Customize Times
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTimeCustomizer ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => onReminderToggle(index, !reminderEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors no-print ${
                  reminderEnabled ? 'bg-emerald-500' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    reminderEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {showTimeCustomizer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="grid grid-cols-3 gap-3 no-print"
            >
              {timeSlots.map((slot, slotIndex) => (
                <div key={slotIndex} className="p-3 bg-white border border-neutral-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <slot.Icon className="h-5 w-5 text-primary-500" />
                    <span className="text-xs font-medium text-neutral-700">{slot.label}</span>
                  </div>
                  <input
                    type="time"
                    value={customTimes[slotIndex] || slot.defaultTime}
                    onChange={(e) => handleTimeSlotChange(slotIndex, e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 outline-none"
                  />
                </div>
              ))}
            </motion.div>
          )}

          {reminderEnabled && !showTimeCustomizer && (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <Clock className="h-3.5 w-3.5" />
              <span>Scheduled at: {customTimes.join(' • ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Remove Button */}
      <div className="flex justify-end no-print">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Main Component — Professional Consultation Form
   ══════════════════════════════════════════════════════ */

export default function ConsultationFormNew({
  form,
  reminderConfig,
  onChange,
  onReminderToggle,
  onTimeChange,
  patient,
  appointment,
  doctor,
  clinic,
}) {
  const handleChange = (field, value) => {
    onChange({ [field]: value });
  };

  const handleVitalChange = (vital, value) => {
    onChange({ vitals: { ...form.vitals, [vital]: value } });
  };

  const handlePrescriptionChange = (index, field, value) => {
    const updated = [...form.prescriptions];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ prescriptions: updated });
  };

  const handleAddMedication = () => {
    onChange({
      prescriptions: [
        ...form.prescriptions,
        { medication: '', dosage: '', frequency: 'twice_daily', duration: '', notes: '' },
      ],
    });
  };

  const handleRemoveMedication = (index) => {
    const updated = form.prescriptions.filter((_, i) => i !== index);
    onChange({ prescriptions: updated });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{printStyles}</style>

      <div className="print-container space-y-6">
        {/* Print Button - Hidden in print */}
        <div className="flex justify-end no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Consultation
          </button>
        </div>

        {/* Professional Letterhead */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-8 print-avoid-break">
          {/* Clinic Header */}
          <div className="flex items-start justify-between mb-6 pb-6 border-b-2 border-primary-600">
            <div className="flex items-center gap-4">
              {clinic?.logo && (
                <img
                  src={resolveAssetUrl(clinic.logo)}
                  alt={clinic.name}
                  className="h-16 w-16 object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-neutral-900 font-display">
                  {clinic?.name || 'Medical Clinic'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-600">
                  {clinic?.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{clinic.address}</span>
                    </div>
                  )}
                  {clinic?.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{clinic.phone}</span>
                    </div>
                  )}
                  {clinic?.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{clinic.email}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-neutral-900">Consultation Record</p>
              <p className="text-xs text-neutral-600 mt-1">
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Patient & Doctor Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Patient Details */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Patient Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="text-neutral-600 w-24">Name:</span>
                  <span className="font-medium text-neutral-900">{patient?.name || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-24">Patient ID:</span>
                  <span className="font-medium text-neutral-900">{patient?.patientId || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-24">Age:</span>
                  <span className="font-medium text-neutral-900">
                    {patient?.dateOfBirth
                      ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                      : 'N/A'} years
                  </span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-24">Gender:</span>
                  <span className="font-medium text-neutral-900 capitalize">{patient?.gender || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-24">Contact:</span>
                  <span className="font-medium text-neutral-900">{patient?.phone || patient?.email || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Doctor Details */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Consulting Physician
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="text-neutral-600 w-32">Doctor:</span>
                  <span className="font-medium text-neutral-900">Dr. {stripDrPrefix(doctor?.name || 'N/A')}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-32">Specialization:</span>
                  <span className="font-medium text-neutral-900">{doctor?.specialization || 'General Practitioner'}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-32">Registration:</span>
                  <span className="font-medium text-neutral-900">{doctor?.registrationNumber || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="text-neutral-600 w-32">Appointment Date:</span>
                  <span className="font-medium text-neutral-900">
                    {appointment?.scheduledAt
                      ? new Date(appointment.scheduledAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SUBJECTIVE - Patient History */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6 print-avoid-break">
          <SectionHeader
            icon={User}
            title="Subjective - Patient History"
            subtitle="Patient-reported symptoms and medical background"
          />

          <div className="space-y-4">
            <FormInput
              label="Chief Complaint"
              value={form.chiefComplaint}
              onChange={(v) => handleChange('chiefComplaint', v)}
              placeholder="Primary reason for consultation (e.g., persistent tooth pain, routine checkup)"
              rows={3}
              required
            />

            <FormInput
              label="History of Present Illness"
              value={form.medicalHistory}
              onChange={(v) => handleChange('medicalHistory', v)}
              placeholder="Relevant medical history, current medications, previous treatments, family history"
              rows={4}
            />

            <FormInput
              label="Known Allergies"
              value={form.allergies}
              onChange={(v) => handleChange('allergies', v)}
              placeholder="List any known allergies (medications, foods, environmental)"
              rows={1}
            />
          </div>
        </div>

        {/* OBJECTIVE - Clinical Findings */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6 print-avoid-break">
          <SectionHeader
            icon={Activity}
            title="Objective - Clinical Findings"
            subtitle="Measurable data and physical examination"
          />

          <div className="space-y-6">
            {/* Vital Signs */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-700 mb-4">Vital Signs</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <VitalInput
                  icon={Activity}
                  label="Blood Pressure"
                  value={form.vitals?.bloodPressure}
                  onChange={(v) => handleVitalChange('bloodPressure', v)}
                  unit="mmHg"
                  placeholder="120/80"
                />
                <VitalInput
                  icon={Heart}
                  label="Heart Rate"
                  value={form.vitals?.heartRate}
                  onChange={(v) => handleVitalChange('heartRate', v)}
                  unit="bpm"
                  placeholder="72"
                />
                <VitalInput
                  icon={Thermometer}
                  label="Temperature"
                  value={form.vitals?.temperature}
                  onChange={(v) => handleVitalChange('temperature', v)}
                  unit="°F"
                  placeholder="98.6"
                />
                <VitalInput
                  icon={Wind}
                  label="SpO2"
                  value={form.vitals?.oxygenSaturation}
                  onChange={(v) => handleVitalChange('oxygenSaturation', v)}
                  unit="%"
                  placeholder="98"
                />
              </div>
            </div>

            {/* Physical Examination */}
            <FormInput
              label="Physical Examination Findings"
              value={form.examination}
              onChange={(v) => handleChange('examination', v)}
              placeholder="Detailed physical examination findings, clinical observations, test results"
              rows={5}
            />
          </div>
        </div>

        {/* ASSESSMENT - Diagnosis */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6 print-avoid-break">
          <SectionHeader
            icon={FileText}
            title="Assessment - Clinical Diagnosis"
            subtitle="Professional medical assessment and diagnosis"
          />

          <div className="space-y-4">
            <FormInput
              label="Diagnosis / Clinical Impression"
              value={form.diagnosis}
              onChange={(v) => handleChange('diagnosis', v)}
              placeholder="Primary diagnosis and differential diagnoses"
              rows={3}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Severity / Stage
                </label>
                <select
                  value={form.severity || ''}
                  onChange={(e) => handleChange('severity', e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                >
                  <option value="">Select severity</option>
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <FormInput
              label="Clinical Notes & Assessment"
              value={form.assessmentNotes}
              onChange={(v) => handleChange('assessmentNotes', v)}
              placeholder="Additional clinical reasoning, risk factors, prognosis, differential diagnoses"
              rows={4}
            />
          </div>
        </div>

        {/* PLAN - Treatment & Prescriptions */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6 print-avoid-break">
          <SectionHeader
            icon={Pill}
            title="Plan - Treatment & Medications"
            subtitle="Recommended treatment plan and prescriptions"
          />

          <div className="space-y-6">
            <FormInput
              label="Treatment Plan"
              value={form.treatmentPlan}
              onChange={(v) => handleChange('treatmentPlan', v)}
              placeholder="Detailed treatment plan, procedures, interventions, lifestyle modifications"
              rows={4}
            />

            {/* Prescriptions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                  <Pill className="h-4 w-4 text-emerald-600" />
                  Prescriptions
                </h4>
                <button
                  type="button"
                  onClick={handleAddMedication}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors no-print"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Medication
                </button>
              </div>

              {form.prescriptions?.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-neutral-200 rounded-xl">
                  <Pill className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500">No medications prescribed</p>
                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium no-print"
                  >
                    Add first medication
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {form.prescriptions.map((medication, index) => (
                    <PrescriptionRow
                      key={index}
                      medication={medication}
                      index={index}
                      onChange={handlePrescriptionChange}
                      onRemove={handleRemoveMedication}
                      reminderConfig={reminderConfig}
                      onReminderToggle={onReminderToggle}
                      onTimeChange={onTimeChange}
                    />
                  ))}
                </div>
              )}
            </div>

            <FormInput
              label="Follow-up Instructions"
              value={form.followUpInstructions}
              onChange={(v) => handleChange('followUpInstructions', v)}
              placeholder="Follow-up schedule, warning signs to watch for, self-care instructions, lifestyle recommendations"
              rows={4}
            />
          </div>
        </div>

        {/* Doctor Signature (Print Only) */}
        <div className="bg-white rounded-2xl border border-neutral-300 shadow-[0_1px_3px_0_rgba(46,95,162,0.1)] p-6 print-avoid-break print-only">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-sm text-neutral-600 mb-2">Patient Signature</p>
              <div className="w-48 border-b-2 border-neutral-300 h-12"></div>
            </div>
            <div className="text-right">
              <p className="text-sm text-neutral-600 mb-2">Doctor Signature</p>
              <div className="w-48 border-b-2 border-neutral-300 h-12"></div>
              <p className="text-xs text-neutral-600 mt-2">Dr. {stripDrPrefix(doctor?.name || 'N/A')}</p>
              <p className="text-xs text-neutral-500">Reg. No: {doctor?.registrationNumber || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
