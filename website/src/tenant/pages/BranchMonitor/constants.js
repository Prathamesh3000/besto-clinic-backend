import {
  Stethoscope, Syringe, HeartPulse, DoorOpen,
  UserPlus, CheckCircle2, AlertTriangle, XCircle,
  ClipboardCheck, CalendarCheck, CalendarX, CircleDot,
} from 'lucide-react';

// ─── Tab Definitions ──────────────────────────────
export const TABS = [
  { key: 'presence', label: 'Doctor Board' },
  { key: 'waiting', label: 'Waiting Room' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'activity', label: 'Activity' },
];

// ─── Days ─────────────────────────────────────────
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

// ─── Doctor Presence ──────────────────────────────
export const PRESENCE_STYLES = {
  in_consultation: { dot: 'bg-primary-500', text: 'text-primary-700', label: 'Consulting', pulse: true },
  available:       { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Available', pulse: false },
  upcoming:        { dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Upcoming', pulse: false },
  on_leave:        { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'On Leave', pulse: false },
  shift_ended:     { dot: 'bg-neutral-400', text: 'text-neutral-600', label: 'Off Duty', pulse: false },
  offline:         { dot: 'bg-neutral-300', text: 'text-neutral-500', label: 'Offline', pulse: false },
};

// ─── Room Status ──────────────────────────────────
export const ROOM_STATUS = {
  available:   { accent: 'border-l-emerald-400', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Available' },
  occupied:    { accent: 'border-l-primary-400', dot: 'bg-primary-500', text: 'text-primary-700', label: 'Occupied' },
  cleaning:    { accent: 'border-l-amber-400',   dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Cleaning' },
  maintenance: { accent: 'border-l-red-400',     dot: 'bg-red-500',     text: 'text-red-700',     label: 'Maintenance' },
  reserved:    { accent: 'border-l-blue-400',    dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Reserved' },
};

// ─── Room Type Icons ──────────────────────────────
export const ROOM_ICONS = { consultation: Stethoscope, procedure: Syringe, emergency: HeartPulse, general: DoorOpen };

// ─── Activity Feed Icons & Styles ─────────────────
export const FEED_ICONS = {
  user_plus: UserPlus, stethoscope: Stethoscope, check: CheckCircle2,
  alert: AlertTriangle, x: XCircle, clipboard_check: ClipboardCheck,
  calendar_check: CalendarCheck, calendar_x: CalendarX,
};

export const FEED_STYLES = {
  consultation_start:     'bg-primary-50 text-primary-600',
  consultation_end:       'bg-emerald-50 text-emerald-600',
  queue_add:              'bg-blue-50 text-blue-600',
  patient_checkin:        'bg-primary-50 text-primary-600',
  appointment_confirmed:  'bg-blue-50 text-blue-600',
  appointment_cancelled:  'bg-red-50 text-red-600',
  no_show:                'bg-red-50 text-red-600',
  queue_cancel:           'bg-neutral-100 text-neutral-500',
};

// ─── Shared Input Class ───────────────────────────
export const selectCls = 'px-3 py-2.5 text-sm rounded-lg border border-neutral-300 bg-white text-neutral-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all';

// ─── Utility Functions ────────────────────────────
export function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function getElapsedMinutes(since) {
  if (!since) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
}

export function formatElapsed(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function timerColor(mins) {
  if (mins >= 45) return 'text-red-600';
  if (mins >= 25) return 'text-amber-600';
  return 'text-neutral-600';
}

// ─── Framer Motion Config ─────────────────────────
export const tabMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};
