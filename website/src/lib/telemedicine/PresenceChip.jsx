/**
 * Small presence indicator used across the patient + tenant UIs.
 *
 * Visual language:
 *   online  — emerald (active pulse)
 *   busy    — rose
 *   dnd     — amber
 *   offline — neutral
 *
 * Props:
 *   status : 'online' | 'busy' | 'dnd' | 'offline'
 *   size   : 'xs' | 'sm' | 'md'
 *   label  : optional custom label
 *   showLabel : default true
 */
import React from 'react';

const LABELS = {
  online: 'Online',
  busy:   'In a call',
  dnd:    'Do not disturb',
  offline:'Offline',
};

const TONES = {
  online:  { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', pulse: true },
  busy:    { dot: 'bg-rose-500',    ring: 'ring-rose-200',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    pulse: false },
  dnd:     { dot: 'bg-amber-500',   ring: 'ring-amber-200',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   pulse: false },
  offline: { dot: 'bg-neutral-400', ring: 'ring-neutral-200', text: 'text-neutral-600', bg: 'bg-neutral-50', border: 'border-neutral-200', pulse: false },
};

const SIZES = {
  xs: { dot: 'w-1.5 h-1.5', padX: 'px-1.5', padY: 'py-0.5', text: 'text-[10px]' },
  sm: { dot: 'w-2 h-2',     padX: 'px-2',   padY: 'py-0.5', text: 'text-xs' },
  md: { dot: 'w-2.5 h-2.5', padX: 'px-2.5', padY: 'py-1',   text: 'text-sm' },
};

export function PresenceChip({ status = 'offline', size = 'sm', label, showLabel = true, className = '' }) {
  const tone = TONES[status] || TONES.offline;
  const sz   = SIZES[size] || SIZES.sm;
  const text = label || LABELS[status] || LABELS.offline;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${tone.bg} ${tone.border} ${tone.text} ${sz.padX} ${sz.padY} ${sz.text} font-medium leading-none ${className}`}
      aria-label={`Presence: ${text}`}
    >
      <span className={`relative inline-flex ${sz.dot} rounded-full ${tone.dot}`}>
        {tone.pulse && (
          <span className={`absolute inset-0 rounded-full ${tone.dot} opacity-60 animate-ping`} />
        )}
      </span>
      {showLabel && <span>{text}</span>}
    </span>
  );
}

export default PresenceChip;
