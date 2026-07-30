import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Stethoscope, Video, Siren, X, ArrowRight,
  Shield, Clock, CalendarDays, MessageCircle, Phone,
} from 'lucide-react';

/**
 * BookingIntentHub
 * ----------------
 * First step of the booking experience. The user picks WHAT kind of
 * interaction they want — a regular visit, a video consult, or an
 * emergency — and the caller routes them to the appropriate flow.
 *
 * Props
 *   open      — controls visibility
 *   onClose   — called when the user dismisses the hub
 *   onChoose  — ({ intent: 'visit'|'video'|'emergency' }) => void
 */

const INTENTS = [
  {
    key: 'visit',
    icon: Stethoscope,
    title: 'In-person visit',
    subtitle: 'Schedule a consultation at the clinic with a doctor of your choice.',
    meta: 'Typically under 2 min',
    metaChip: 'Most popular',
    // Tokens
    tone: 'primary',
    iconBg: 'bg-primary-50 text-primary-700 border-primary-100',
    chipBg: 'bg-primary-50 text-primary-700 border-primary-100',
    accentText: 'text-primary-700',
    focusRing: 'focus-visible:ring-primary-400',
    activeRing: 'ring-primary-400',
    hoverBorder: 'hover:border-primary-200',
    features: [
      { Icon: CalendarDays, text: 'Pick your preferred slot' },
      { Icon: Shield, text: 'Records & invoice saved' },
    ],
  },
  {
    key: 'video',
    icon: Video,
    title: 'Video consultation',
    subtitle: 'Speak with a doctor securely from home — ideal for follow-ups and advice.',
    meta: 'Typically under 2 min',
    metaChip: 'Encrypted',
    tone: 'secondary',
    iconBg: 'bg-secondary-50 text-secondary-700 border-secondary-100',
    chipBg: 'bg-secondary-50 text-secondary-700 border-secondary-100',
    accentText: 'text-secondary-700',
    focusRing: 'focus-visible:ring-secondary-400',
    activeRing: 'ring-secondary-400',
    hoverBorder: 'hover:border-secondary-200',
    features: [
      { Icon: Video, text: 'HD video room' },
      { Icon: Shield, text: 'End-to-end encrypted' },
    ],
  },
  {
    key: 'emergency',
    icon: Siren,
    title: 'Urgent care',
    subtitle: 'Connect with an on-call doctor right now. For urgent but non-critical concerns.',
    meta: 'Real-time · 24/7',
    metaChip: 'On-call',
    tone: 'red',
    iconBg: 'bg-red-50 text-red-700 border-red-100',
    chipBg: 'bg-red-50 text-red-700 border-red-100',
    accentText: 'text-red-700',
    focusRing: 'focus-visible:ring-red-400',
    activeRing: 'ring-red-400',
    hoverBorder: 'hover:border-red-200',
    features: [
      { Icon: MessageCircle, text: 'Chat or video consult' },
      { Icon: Clock, text: 'Typical response < 2 min' },
    ],
  },
];

export default function BookingIntentHub({ open, onClose, onChoose }) {
  const [focusIdx, setFocusIdx] = useState(0);
  const firstBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstBtnRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusIdx((i) => (i + 1) % INTENTS.length);
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusIdx((i) => (i - 1 + INTENTS.length) % INTENTS.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pick = (intent) => onChoose?.({ intent });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-neutral-950/50"
            onClick={onClose}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="intent-hub-title"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-[var(--shadow-lg)] border border-neutral-200"
          >
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-white px-6 md:px-7 pt-5 pb-4 border-b border-neutral-100">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                    New request
                  </p>
                  <h2
                    id="intent-hub-title"
                    className="text-[17px] md:text-lg font-bold font-display text-neutral-900 leading-tight mt-1"
                  >
                    What kind of care do you need?
                  </h2>
                  <p className="text-[13px] text-neutral-500 mt-1 max-w-xl leading-relaxed">
                    Pick the option that best matches your situation — we'll tailor the next steps accordingly.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="p-6 md:p-7">
              <div className="grid md:grid-cols-3 gap-3 md:gap-4">
                {INTENTS.map((it, i) => {
                  const Icon = it.icon;
                  const isFocused = focusIdx === i;
                  return (
                    <motion.button
                      key={it.key}
                      ref={i === 0 ? firstBtnRef : null}
                      onClick={() => pick(it.key)}
                      onFocus={() => setFocusIdx(i)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.04 + i * 0.05 }}
                      className={`group relative text-left rounded-2xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-sm)] ${it.hoverBorder} transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${it.focusRing} ${
                        isFocused ? `ring-2 ring-offset-2 ${it.activeRing}` : ''
                      } p-5 flex flex-col h-full`}
                    >
                      {/* Header: icon + chip */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${it.iconBg}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.14em] border px-2 py-0.5 rounded-md ${it.chipBg}`}>
                          {it.metaChip}
                        </span>
                      </div>

                      {/* Title + subtitle */}
                      <h3 className="text-[15px] font-bold font-display text-neutral-900 leading-tight">
                        {it.title}
                      </h3>
                      <p className="text-[12.5px] text-neutral-500 leading-relaxed mt-1.5 mb-4">
                        {it.subtitle}
                      </p>

                      {/* Features */}
                      <ul className="space-y-1.5 mb-5">
                        {it.features.map(({ Icon: F, text }) => (
                          <li key={text} className="flex items-center gap-2 text-[12px] text-neutral-600">
                            <F className={`h-3.5 w-3.5 ${it.accentText}`} />
                            <span>{text}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Footer */}
                      <div className="mt-auto flex items-center justify-between pt-3 border-t border-neutral-100">
                        <span className="text-[11px] font-semibold text-neutral-500">
                          {it.meta}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${it.accentText} group-hover:gap-1.5 transition-all`}>
                          Continue
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Footnote */}
              <div className="mt-5 flex items-start gap-2.5 text-[11.5px] text-neutral-600 px-3.5 py-3 rounded-xl bg-red-50 border-l-4 border-red-500 border-y border-r border-red-100">
                <Phone className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                <p className="leading-relaxed">
                  <strong className="text-red-800">Life-threatening situations:</strong>{' '}
                  call 108 or your local emergency number immediately. This service is for urgent but non-critical care.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
