import { useState, useEffect } from 'react';
import { getRawBookingPolicy, updateBookingPolicy } from '../api';
import { ErrorAlert, Spinner } from '../../platform/components/shared';
import { useToast } from '../ToastContext';
import {
  Save, Clock, CalendarX2, CheckCircle2, Timer, Bell, RotateCcw,
} from 'lucide-react';

/* ─── Preset Options ───────────────────────────── */
const SLOT_DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

const BUFFER_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
];

const MIN_NOTICE_OPTIONS = [
  { value: 0, label: 'Walk-in' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
];

const MAX_ADVANCE_OPTIONS = [
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 60, label: '2 months' },
  { value: 90, label: '3 months' },
];

const CANCEL_CUTOFF_OPTIONS = [
  { value: null, label: 'No limit' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
  { value: 2880, label: '48 hours' },
];

const RESCHEDULE_CUTOFF_OPTIONS = [
  { value: null, label: 'No limit' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
];

const MAX_RESCHEDULE_OPTIONS = [
  { value: null, label: 'Unlimited' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
];

const NOSHOW_OPTIONS = [
  { value: null, label: 'Off' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
];

const CHECKIN_BEFORE_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
];

const CHECKIN_AFTER_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];

const APPT_DURATION_OPTIONS = [
  { value: 15, label: '15m' },
  { value: 20, label: '20m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
  { value: 90, label: '90m' },
];

const APPT_TYPES = ['consultation', 'follow_up', 'emergency', 'teleconsult'];
const APPT_TYPE_LABELS = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  emergency: 'Emergency',
  teleconsult: 'Teleconsult',
};

const REMINDER_OPTIONS = [
  { value: 1440, label: '24 hours' },
  { value: 720, label: '12 hours' },
  { value: 240, label: '4 hours' },
  { value: 120, label: '2 hours' },
  { value: 60, label: '1 hour' },
  { value: 30, label: '30 min' },
  { value: 15, label: '15 min' },
];

/* ─── Reusable Components ──────────────────────── */

/**
 * OptionPicker — row of preset pill buttons.
 *
 * If `options` includes a `{ value: null }` entry, null is treated as
 * a valid selectable value (e.g. "No limit", "Off").
 * Otherwise null = "using system default" and a Reset button appears
 * when the user has set an explicit value.
 */
function OptionPicker({ label, hint, value, defaultVal, onChange, options }) {
  const nullIsOption = options.some((o) => o.value === null);
  const isExplicit = value !== null && value !== undefined;
  const activeValue = nullIsOption ? value : (value ?? defaultVal);
  const matchesPreset = options.some((o) => o.value === activeValue);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-neutral-600">{label}</label>
        {!nullIsOption && isExplicit && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-neutral-400 hover:text-primary-600 font-medium flex items-center gap-0.5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Default
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isActive = activeValue === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {!matchesPreset && activeValue != null && (
          <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 border border-primary-200">
            Custom: {activeValue}
          </span>
        )}
      </div>
      {!nullIsOption && !isExplicit && (
        <p className="text-[10px] text-primary-500 mt-1.5 font-medium">Using system default</p>
      )}
      {hint && <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * ReminderPicker — multi-select toggle chips.
 */
function ReminderPicker({ value, defaultVal, onChange }) {
  const effective = value ?? defaultVal ?? [1440, 60, 15];
  const isExplicit = value !== null && value !== undefined;

  const toggle = (minutes) => {
    const current = isExplicit ? [...value] : [...(defaultVal ?? [1440, 60, 15])];
    const next = current.includes(minutes)
      ? current.filter((v) => v !== minutes)
      : [...current, minutes].sort((a, b) => b - a);
    onChange(next.length > 0 ? next : null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-neutral-600">Reminder Timings</label>
        {isExplicit && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-neutral-400 hover:text-primary-600 font-medium flex items-center gap-0.5 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Default
          </button>
        )}
      </div>
      <p className="text-[11px] text-neutral-400 mb-2">Tap to toggle when patients receive appointment reminders</p>
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_OPTIONS.map((opt) => {
          const isActive = effective.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                isActive
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!isExplicit && (
        <p className="text-[10px] text-primary-500 mt-1.5 font-medium">Using system default</p>
      )}
    </div>
  );
}

function ToggleField({ label, hint, value, defaultVal, onChange }) {
  const effective = value ?? defaultVal;
  const isCustom = value !== null && value !== undefined;
  return (
    <div className="flex items-start gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
      <button
        type="button"
        onClick={() => {
          const newVal = !effective;
          onChange(newVal === defaultVal ? null : newVal);
        }}
        className={`mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          effective ? 'bg-primary-600' : 'bg-neutral-300'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
          effective ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800">{label}</span>
          {!isCustom && <span className="text-[10px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded font-medium">Default</span>}
        </div>
        {hint && <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>}
      </div>
      {isCustom && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] text-neutral-400 hover:text-primary-600 font-medium flex items-center gap-0.5 transition-colors flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, accentColor = 'primary', children }) {
  const iconBgMap = {
    primary: 'bg-primary-50',
    amber: 'bg-amber-50',
    emerald: 'bg-emerald-50',
    blue: 'bg-blue-50',
  };
  const iconTextMap = {
    primary: 'text-primary-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${iconBgMap[accentColor]} flex items-center justify-center`}>
          <Icon className={`w-4.5 h-4.5 ${iconTextMap[accentColor]}`} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Main Component ───────────────────────────── */
export default function BookingPolicySettings() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [form, setForm] = useState({
    slotDuration: null,
    bufferMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    cancellationCutoffMin: null,
    rescheduleCutoffMin: null,
    maxReschedulesPerAppt: null,
    noShowBlockThreshold: null,
    checkInWindowBeforeMin: null,
    checkInWindowAfterMin: null,
    autoConfirm: null,
    appointmentTypeDurations: null,
    defaultReminderTimings: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await getRawBookingPolicy();
        const { policy, systemDefaults } = res.data;
        setDefaults(systemDefaults);

        setForm({
          slotDuration: policy.slotDuration ?? null,
          bufferMinutes: policy.bufferMinutes ?? null,
          minNoticeMinutes: policy.minNoticeMinutes ?? null,
          maxAdvanceDays: policy.maxAdvanceDays ?? null,
          cancellationCutoffMin: policy.cancellationCutoffMin ?? null,
          rescheduleCutoffMin: policy.rescheduleCutoffMin ?? null,
          maxReschedulesPerAppt: policy.maxReschedulesPerAppt ?? null,
          noShowBlockThreshold: policy.noShowBlockThreshold ?? null,
          checkInWindowBeforeMin: policy.checkInWindowBeforeMin ?? null,
          checkInWindowAfterMin: policy.checkInWindowAfterMin ?? null,
          autoConfirm: policy.autoConfirm ?? null,
          appointmentTypeDurations: policy.appointmentTypeDurations ?? null,
          defaultReminderTimings: policy.defaultReminderTimings ?? null,
        });
      } catch (err) {
        setError(err.message || 'Failed to load booking policy');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  const setTypeDuration = (type, val) => {
    setForm((prev) => {
      const current = prev.appointmentTypeDurations ? { ...prev.appointmentTypeDurations } : {};
      if (val === null) {
        delete current[type];
      } else {
        current[type] = val;
      }
      return { ...prev, appointmentTypeDurations: Object.keys(current).length > 0 ? current : null };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateBookingPolicy(form);
      showToast({ type: 'success', message: 'Booking policy saved successfully' });
    } catch (err) {
      setError(err.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Booking Policy</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Configure clinic-wide rules for appointment scheduling, cancellations, and patient booking behaviour.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* ── Section 1: Appointment Scheduling ──────── */}
      <SectionCard
        icon={Clock}
        title="Appointment Scheduling"
        description="Slot duration, buffer time, and per-type durations for different appointment types."
        accentColor="primary"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <OptionPicker
              label="Slot Duration"
              value={form.slotDuration}
              defaultVal={defaults.slotDuration}
              onChange={set('slotDuration')}
              options={SLOT_DURATION_OPTIONS}
              hint="Standard length of each bookable slot"
            />
            <OptionPicker
              label="Buffer Between Slots"
              value={form.bufferMinutes}
              defaultVal={defaults.bufferMinutes}
              onChange={set('bufferMinutes')}
              options={BUFFER_OPTIONS}
              hint="Gap for cleanup/sterilization between patients"
            />
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 mb-4">
              <Timer className="w-4 h-4 text-neutral-400" />
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Duration by Appointment Type</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {APPT_TYPES.map((type) => (
                <OptionPicker
                  key={type}
                  label={APPT_TYPE_LABELS[type]}
                  value={form.appointmentTypeDurations?.[type] ?? null}
                  defaultVal={defaults.slotDuration}
                  onChange={(val) => setTypeDuration(type, val)}
                  options={APPT_DURATION_OPTIONS}
                />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 2: Booking Rules ────────────────── */}
      <SectionCard
        icon={CheckCircle2}
        title="Booking Rules"
        description="Control when patients can book and whether appointments require manual approval."
        accentColor="blue"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <OptionPicker
              label="Minimum Notice"
              value={form.minNoticeMinutes}
              defaultVal={defaults.minNoticeMinutes}
              onChange={set('minNoticeMinutes')}
              options={MIN_NOTICE_OPTIONS}
              hint="How early must bookings be made"
            />
            <OptionPicker
              label="Max Advance Booking"
              value={form.maxAdvanceDays}
              defaultVal={defaults.maxAdvanceDays}
              onChange={set('maxAdvanceDays')}
              options={MAX_ADVANCE_OPTIONS}
              hint="How far ahead patients can schedule"
            />
          </div>

          <ToggleField
            label="Auto-confirm new bookings"
            value={form.autoConfirm}
            defaultVal={defaults.autoConfirm ?? true}
            onChange={set('autoConfirm')}
            hint="When disabled, new bookings start as 'Requested' and require staff/doctor approval"
          />
        </div>
      </SectionCard>

      {/* ── Section 3: Cancellation & No-Show ──────── */}
      <SectionCard
        icon={CalendarX2}
        title="Cancellation & No-Show"
        description="Cutoff rules for cancellations, rescheduling limits, and handling repeat no-shows."
        accentColor="amber"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <OptionPicker
            label="Cancellation Cutoff"
            value={form.cancellationCutoffMin}
            onChange={set('cancellationCutoffMin')}
            options={CANCEL_CUTOFF_OPTIONS}
            hint="Minimum time before appointment to allow cancellation"
          />
          <OptionPicker
            label="Reschedule Cutoff"
            value={form.rescheduleCutoffMin}
            onChange={set('rescheduleCutoffMin')}
            options={RESCHEDULE_CUTOFF_OPTIONS}
            hint="Minimum time before appointment to allow rescheduling"
          />
          <OptionPicker
            label="Max Reschedules Per Appointment"
            value={form.maxReschedulesPerAppt}
            onChange={set('maxReschedulesPerAppt')}
            options={MAX_RESCHEDULE_OPTIONS}
            hint="Prevent excessive rescheduling of the same appointment"
          />
          <OptionPicker
            label="No-Show Block Threshold"
            value={form.noShowBlockThreshold}
            onChange={set('noShowBlockThreshold')}
            options={NOSHOW_OPTIONS}
            hint="Block patient booking after this many cumulative no-shows"
          />
        </div>
      </SectionCard>

      {/* ── Section 4: Check-in & Reminders ────────── */}
      <SectionCard
        icon={Bell}
        title="Check-in & Reminders"
        description="Patient check-in window and automated appointment reminder timings."
        accentColor="emerald"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <OptionPicker
              label="Check-in Opens Before"
              value={form.checkInWindowBeforeMin}
              defaultVal={defaults.checkInWindowBeforeMin}
              onChange={set('checkInWindowBeforeMin')}
              options={CHECKIN_BEFORE_OPTIONS}
              hint="How early patients can check in"
            />
            <OptionPicker
              label="Check-in Closes After"
              value={form.checkInWindowAfterMin}
              defaultVal={defaults.checkInWindowAfterMin}
              onChange={set('checkInWindowAfterMin')}
              options={CHECKIN_AFTER_OPTIONS}
              hint="How late after appointment time check-in is allowed"
            />
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <ReminderPicker
              value={form.defaultReminderTimings}
              defaultVal={defaults.defaultReminderTimings}
              onChange={set('defaultReminderTimings')}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
