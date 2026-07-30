import {
  Stethoscope, RotateCcw, AlertTriangle, Video,
} from 'lucide-react';

// ─── Appointment Status Styles ──────────────────────────
export const APPOINTMENT_STATUS_STYLES = {
  requested:   { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Requested' },
  confirmed:   { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',     label: 'Confirmed' },
  checked_in:  { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',   label: 'Checked In' },
  in_progress: { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500',  label: 'In Progress' },
  completed:   { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400',  label: 'Completed' },
  cancelled:   { bg: 'bg-red-50',      text: 'text-red-600',     dot: 'bg-red-500',      label: 'Cancelled' },
  no_show:     { bg: 'bg-rose-50',     text: 'text-rose-600',    dot: 'bg-rose-400',     label: 'No Show' },
};

// ─── Source Styles ──────────────────────────────────────
export const SOURCE_STYLES = {
  general:        { bg: 'bg-blue-50',      text: 'text-blue-700',    label: 'General' },
  chatbot:        { bg: 'bg-purple-50',    text: 'text-purple-700',  label: 'Chatbot' },
  walk_in:        { bg: 'bg-neutral-100',  text: 'text-neutral-600', label: 'Walk-in' },
  portal:         { bg: 'bg-teal-50',      text: 'text-teal-700',    label: 'Portal' },
  follow_up:      { bg: 'bg-violet-50',    text: 'text-violet-700',  label: 'Follow-up' },
  doctor_mobile:  { bg: 'bg-emerald-50',   text: 'text-emerald-700', label: 'Doctor App' },
};

// ─── Type Configuration ─────────────────────────────────
export const TYPE_CONFIG = {
  consultation: { label: 'Consultation', Icon: Stethoscope,    color: 'text-primary-600' },
  follow_up:    { label: 'Follow Up',    Icon: RotateCcw,      color: 'text-blue-600' },
  emergency:    { label: 'Emergency',     Icon: AlertTriangle,  color: 'text-red-600' },
  teleconsult:  { label: 'Teleconsult',   Icon: Video,          color: 'text-teal-600' },
};

// ─── Queue Priority Styles ──────────────────────────────
export const PRIORITY_STYLES = {
  emergency: { border: 'border-red-300',     bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700' },
  high:      { border: 'border-orange-300',  bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
  normal:    { border: 'border-neutral-200', bg: 'bg-white',     badge: 'bg-neutral-100 text-neutral-600' },
};

// ─── Board View Column Definitions ──────────────────────
export const BOARD_COLUMNS = [
  { key: 'requested',   label: 'Requested' },
  { key: 'confirmed',   label: 'Confirmed' },
  { key: 'checked_in',  label: 'Checked In' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

// ─── Status Transition Map ──────────────────────────────
export const STATUS_TRANSITIONS = {
  requested: [
    { nextStatus: 'confirmed',  label: 'Confirm',  style: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { nextStatus: 'cancelled',  label: 'Cancel',   style: 'bg-red-50 hover:bg-red-100 text-red-600', needsReason: true },
  ],
  confirmed: [
    { nextStatus: 'checked_in', label: 'Check In', style: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { nextStatus: 'cancelled',  label: 'Cancel',   style: 'bg-red-50 hover:bg-red-100 text-red-600', needsReason: true },
  ],
  checked_in: [
    { nextStatus: 'in_progress', label: 'Start',    style: 'bg-primary-600 hover:bg-primary-700 text-white' },
    { nextStatus: 'no_show',     label: 'No Show',  style: 'bg-red-50 hover:bg-red-100 text-red-600' },
    { nextStatus: 'cancelled',   label: 'Cancel',   style: 'bg-red-50 hover:bg-red-100 text-red-600', needsReason: true },
  ],
  in_progress: [
    { nextStatus: 'completed',  label: 'Complete', style: 'bg-secondary-600 hover:bg-secondary-700 text-white' },
    { nextStatus: 'cancelled',  label: 'Cancel',   style: 'bg-red-50 hover:bg-red-100 text-red-600', needsReason: true },
  ],
  completed:  [],
  cancelled:  [],
  no_show:    [],
};

// ─── Filter Options ─────────────────────────────────────
export const TYPE_OPTIONS = ['all', 'consultation', 'follow_up', 'emergency', 'teleconsult'];
export const SOURCE_OPTIONS = ['all', 'general', 'portal', 'chatbot', 'walk_in', 'follow_up', 'doctor_mobile'];

export const STATUS_FILTER_CHIPS = [
  { value: 'all',         label: 'All' },
  { value: 'requested',   label: 'Requested' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'checked_in',  label: 'Checked In' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
  { value: 'no_show',     label: 'No Show' },
];

// ─── Reusable Badge Components ──────────────────────────
export function AppointmentStatusBadge({ status }) {
  const s = APPOINTMENT_STATUS_STYLES[status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

export function SourceBadge({ source }) {
  const s = SOURCE_STYLES[source] || SOURCE_STYLES.general;
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function TypeBadge({ type }) {
  const t = TYPE_CONFIG[type] || TYPE_CONFIG.consultation;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium bg-neutral-50 border border-neutral-200 ${t.color}`}>
      <t.Icon className="h-3 w-3" />
      {t.label}
    </span>
  );
}

// ─── Reminder Timing Options ─────────────────────────────
export const REMINDER_TIMING_OPTIONS = [
  { value: 0,    label: 'Immediately' },
  { value: 20,   label: '20 min' },
  { value: 30,   label: '30 min' },
  { value: 60,   label: '1 hour' },
  { value: 1440, label: '24 hours' },
];

export function formatTimingLabel(minutes) {
  if (minutes === 0) return 'Immediately';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  if (minutes === 1440) return '24 hours';
  return `${Math.round(minutes / 1440)}d`;
}

// ─── CSS class constants ────────────────────────────────
export const selectClasses = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';
export const inputClasses = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
export const labelClasses = 'block text-xs font-semibold text-neutral-500 mb-1.5';
