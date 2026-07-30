/**
 * CareReminderTimePicker - Visual time picker for custom reminder schedules
 *
 * Features:
 * - Preset time buttons (Morning, Noon, Evening, Night)
 * - Custom time input (24-hour format)
 * - Time chips with remove option
 * - 24-hour timeline visualization
 * - Smart defaults based on frequency
 *
 * @version 1.0
 * @date April 2026
 */

import { useState } from 'react';
import { Clock, X, AlertCircle } from 'lucide-react';

/* ── Constants ─────────────────────────────────────────── */

const FREQUENCY_LABELS = {
  once: 'Once daily',
  twice_daily: 'Twice daily',
  thrice_daily: 'Three times daily',
  four_times_daily: 'Four times daily',
  after_meals: 'After meals',
  before_meals: 'Before meals',
  bedtime: 'At bedtime',
  custom: 'Custom schedule',
};

const FREQUENCY_DEFAULTS = {
  once: ['09:00'],
  twice_daily: ['09:00', '21:00'],
  thrice_daily: ['08:00', '14:00', '20:00'],
  four_times_daily: ['08:00', '12:00', '16:00', '20:00'],
  after_meals: ['09:30', '14:30', '20:30'],
  before_meals: ['08:30', '13:30', '19:30'],
  bedtime: ['21:30'],
  custom: [],
};

const PRESET_TIMES = [
  { label: 'Morning (9 AM)', value: '09:00' },
  { label: 'Noon (12 PM)', value: '12:00' },
  { label: 'Evening (6 PM)', value: '18:00' },
  { label: 'Night (9 PM)', value: '21:00' },
];

/* ── Helper Functions ──────────────────────────────────── */

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function validateTime(timeStr) {
  if (!timeStr) return false;
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeStr);
}

function normalizeTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ══════════════════════════════════════════════════════════
   Main Component — Care Reminder Time Picker
   ══════════════════════════════════════════════════════════ */

export default function CareReminderTimePicker({
  frequency,
  customTimes = [],
  onChange,
}) {
  const [error, setError] = useState('');

  // Initialize with defaults if empty
  const times = customTimes.length > 0 ? customTimes : (FREQUENCY_DEFAULTS[frequency] || FREQUENCY_DEFAULTS.once);

  const handleAddTime = (timeStr) => {
    if (!timeStr) return;

    const normalized = normalizeTime(timeStr);
    if (!validateTime(normalized)) {
      setError('Invalid time format. Use HH:MM (e.g., 09:00)');
      return;
    }

    if (times.includes(normalized)) {
      setError('This time is already added');
      return;
    }

    setError('');
    const newTimes = [...times, normalized].sort();
    onChange(newTimes);
  };

  const handleRemoveTime = (index) => {
    const newTimes = times.filter((_, i) => i !== index);
    if (newTimes.length === 0) {
      setError('At least one reminder time is required');
      return;
    }
    setError('');
    onChange(newTimes);
  };

  const handleCustomInput = (e) => {
    const value = e.target.value;
    if (value) {
      handleAddTime(value);
      e.target.value = ''; // Clear input after adding
    }
  };

  return (
    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
      {/* Frequency Info */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3 w-3 text-neutral-500" />
        <span className="text-xs font-medium text-neutral-600">
          {FREQUENCY_LABELS[frequency] || 'Custom'} • {times.length} time{times.length !== 1 ? 's' : ''} per day
        </span>
      </div>

      {/* Selected Times (Chips) */}
      <div className="flex flex-wrap gap-2 mb-3">
        {times.map((time, i) => (
          <div
            key={i}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium"
          >
            <Clock className="h-3 w-3" />
            <span>{formatTime(time)}</span>
            <button
              type="button"
              onClick={() => handleRemoveTime(i)}
              className="ml-1 text-primary-400 hover:text-primary-600 transition-colors"
              aria-label="Remove time"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-2 mb-3 bg-red-50 text-red-700 text-xs rounded-lg">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Preset Buttons + Custom Input */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESET_TIMES.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => handleAddTime(preset.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 hover:border-primary-300 transition-colors disabled:opacity-50"
            disabled={times.includes(preset.value)}
          >
            {preset.label}
          </button>
        ))}
        <input
          type="time"
          onChange={handleCustomInput}
          className="px-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          aria-label="Custom time"
        />
      </div>

      {/* 24-hour Timeline Visualization */}
      <div className="relative h-8 bg-neutral-200 rounded-lg overflow-hidden">
        {/* Time markers */}
        <div className="absolute inset-0 flex items-center">
          {[0, 6, 12, 18, 24].map((hour) => (
            <div
              key={hour}
              className="absolute top-0 bottom-0 w-px bg-neutral-300"
              style={{ left: `${(hour / 24) * 100}%` }}
            >
              <span className="absolute top-full mt-0.5 text-[9px] text-neutral-900/40 -translate-x-1/2">
                {hour}
              </span>
            </div>
          ))}
        </div>

        {/* Time indicators */}
        {times.map((time, i) => {
          const [h, m] = time.split(':').map(Number);
          const percent = ((h * 60 + m) / 1440) * 100;
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-1 bg-primary-500 rounded"
              style={{ left: `${percent}%` }}
              title={formatTime(time)}
            />
          );
        })}
      </div>

      {/* Helper Text */}
      <p className="text-[10px] text-neutral-500 mt-2">
        Click preset buttons or enter custom times to schedule reminders throughout the day.
      </p>
    </div>
  );
}
