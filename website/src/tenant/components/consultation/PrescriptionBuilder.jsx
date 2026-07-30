/**
 * PrescriptionBuilder - Medication list editor with integrated care reminder controls
 *
 * Features:
 * - Add/remove medications
 * - Inline editing (name, dosage, frequency, duration, instructions)
 * - Per-medication care reminder toggle
 * - Frequency selector with custom option
 * - Integrated time picker for custom schedules
 * - Preview of scheduled reminder times
 *
 * @version 1.0
 * @date April 2026
 */

import { Pill, Plus, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import CareReminderTimePicker from './CareReminderTimePicker';

/* ── Helper Components ─────────────────────────────────── */

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      {label && <span className="text-xs font-medium text-neutral-600">{label}</span>}
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-primary-600' : 'bg-neutral-300'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  );
}

/* ── Main Component ────────────────────────────────────── */

export default function PrescriptionBuilder({
  medications,
  reminderConfig,
  onChange,
  onReminderToggle,
  onTimeChange,
  onAdd,
  onRemove,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const handleFieldChange = (index, field, value) => {
    onChange(index, field, value);
  };

  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="space-y-3">
      {medications.map((med, index) => {
        const isExpanded = expandedIndex === index;
        const reminderEnabled = reminderConfig?.medications?.[index]?.enabled ?? true;
        const customTimes = reminderConfig?.medications?.[index]?.customTimes || [];

        return (
          <div
            key={index}
            className="p-4 bg-white rounded-xl border border-neutral-200 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)] transition-all"
          >
            {/* Medication Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Pill className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-neutral-900/70 mb-1">
                  Medication {index + 1}
                </p>
                <input
                  type="text"
                  value={med.medication || ''}
                  onChange={(e) => handleFieldChange(index, 'medication', e.target.value)}
                  placeholder="e.g., Amoxicillin"
                  className="w-full px-3 py-2 text-sm font-medium border border-neutral-300/60 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                />
              </div>
              {medications.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Remove medication"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Medication Details Grid */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Dosage */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Dosage
                </label>
                <input
                  type="text"
                  value={med.dosage || ''}
                  onChange={(e) => handleFieldChange(index, 'dosage', e.target.value)}
                  placeholder="e.g., 500mg"
                  className="w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Frequency
                </label>
                <select
                  value={med.frequency || 'twice_daily'}
                  onChange={(e) => handleFieldChange(index, 'frequency', e.target.value)}
                  className="w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                >
                  <option value="once">Once daily</option>
                  <option value="twice_daily">Twice daily</option>
                  <option value="thrice_daily">Three times daily</option>
                  <option value="four_times_daily">Four times daily</option>
                  <option value="after_meals">After meals</option>
                  <option value="before_meals">Before meals</option>
                  <option value="bedtime">At bedtime</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Duration */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Duration
                </label>
                <input
                  type="text"
                  value={med.duration || ''}
                  onChange={(e) => handleFieldChange(index, 'duration', e.target.value)}
                  placeholder="e.g., 5 days, 2 weeks"
                  className="w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Instructions (Optional)
              </label>
              <textarea
                value={med.notes || ''}
                onChange={(e) => handleFieldChange(index, 'notes', e.target.value)}
                placeholder="e.g., Take with food, avoid alcohol"
                rows={2}
                className="w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all resize-none"
              />
            </div>

            {/* Care Reminder Section */}
            <div className="mt-3 pt-3 border-t border-neutral-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-600">
                    Care Reminders
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {reminderEnabled && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(index)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          <span>Collapse</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          <span>Customize times</span>
                        </>
                      )}
                    </button>
                  )}
                  <Toggle
                    checked={reminderEnabled}
                    onChange={(enabled) => onReminderToggle(index, enabled)}
                  />
                </div>
              </div>

              {/* Time Picker (Expandable) */}
              {reminderEnabled && isExpanded && (
                <div className="mt-3">
                  <CareReminderTimePicker
                    frequency={med.frequency || 'twice_daily'}
                    customTimes={customTimes}
                    onChange={(times) => onTimeChange(index, times)}
                  />
                </div>
              )}

              {/* Quick Preview (When Collapsed) */}
              {reminderEnabled && !isExpanded && customTimes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {customTimes.map((time, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 bg-primary-50 text-primary-700 rounded font-medium"
                    >
                      {time}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add Medication Button */}
      <button
        type="button"
        onClick={onAdd}
        className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-sm font-semibold text-primary-600 hover:border-primary-400 hover:bg-primary-50/30 transition-all flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Medication
      </button>
    </div>
  );
}
