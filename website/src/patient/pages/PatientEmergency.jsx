import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, Video, MessageCircle, Phone, ShieldCheck, Clock,
  Stethoscope, Loader2, ChevronLeft, X, ArrowRight,
  CheckCircle2, AlertTriangle, Check, HeartPulse,
  MousePointerClick, Bell, FileText, Activity,
} from 'lucide-react';
import { useSafeTenantAuth, useSafePatientAuth } from '../../hooks/useSafeAuth';
import {
  createEmergencyRequest, getEmergencySession, cancelEmergencySession,
  getPatientVideoMessages, sendPatientVideoMessage,
  markVideoMessageRead, sharePatientVideoFile,
} from '../api';
import { emergencyBus, initSocket } from '../../lib/socket';
import { SessionChatThread } from '../../lib/telemedicine/SessionChatThread';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Shared tokens (match Appointments/Dashboard) ─── */
const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const POLL_MS = 3000;
const FORM_ANCHOR_ID = 'emergency-triage-form';

/* ─── Config ──────────────────────────────────── */

const CONNECTION_TYPES = [
  {
    key: 'video',
    label: 'Video consultation',
    hint: 'Face-to-face with the doctor.',
    Icon: Video,
    iconWash: 'from-red-500 to-rose-600',
  },
  {
    key: 'chat',
    label: 'Secure chat',
    hint: 'Text-based conversation.',
    Icon: MessageCircle,
    iconWash: 'from-red-500 to-rose-600',
  },
];

const SYMPTOM_CHIPS = [
  'Severe pain',
  'Bleeding',
  'Swelling',
  'Trauma / injury',
  'Chest pain',
  'Difficulty breathing',
  'Dental abscess',
  'Allergic reaction',
  'High fever',
  'Dizziness',
];

function painLabel(level) {
  if (level <= 2) return 'Mild';
  if (level <= 4) return 'Moderate';
  if (level <= 6) return 'Marked';
  if (level <= 8) return 'Severe';
  return 'Unbearable';
}

function formatElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════ */
export default function PatientEmergency() {
  const navigate = useNavigate();
  const { activePatientId, activePatient } = useSafePatientAuth();
  const { user } = useSafeTenantAuth();

  const [phase, setPhase] = useState('triage');
  const [session, setSession] = useState(null);
  const [toast, setToast] = useState(null);

  const [connectionType, setConnectionType] = useState('video');
  const [symptoms, setSymptoms] = useState(new Set());
  const [pain, setPain] = useState(5);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [waitStart, setWaitStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (phase !== 'waiting' || !waitStart) return;
    tickRef.current = setInterval(() => setElapsed(Date.now() - waitStart), 500);
    return () => clearInterval(tickRef.current);
  }, [phase, waitStart]);

  // ── Socket-driven lifecycle transitions (replaces 3s polling primary) ──
  // We still keep a slow poll as a safety net in case socket reconnects were lossy.
  useEffect(() => {
    if (phase !== 'waiting' || !session?._id) return;
    initSocket();

    // Fast path — accepted/ended via socket
    const off = emergencyBus.on(async (evt, payload) => {
      if (payload?.sessionId !== String(session._id)) return;
      if (evt === 'emergency:accepted' || evt === 'emergency:ended') {
        try {
          const res = await getEmergencySession(session._id);
          const latest = res?.data || res;
          if (!latest) return;
          setSession(latest);
          if (latest.status === 'active') setPhase('active');
          else if (latest.status === 'ended' || latest.status === 'missed') setPhase('ended');
        } catch { /* swallow — the safety-net poll will retry */ }
      }
    });

    // Slow safety-net poll — 10s instead of 3s. Socket handles the fast path.
    const tick = async () => {
      try {
        const res = await getEmergencySession(session._id);
        const latest = res?.data || res;
        if (!latest) return;
        setSession(latest);
        if (latest.status === 'active') setPhase('active');
        else if (latest.status === 'ended' || latest.status === 'missed') setPhase('ended');
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(tick, 10000);
    return () => {
      off();
      clearInterval(pollRef.current);
    };
  }, [phase, session?._id]);

  const toggleSymptom = (s) => {
    setSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const composeReason = useCallback(() => {
    const parts = [];
    if (symptoms.size) parts.push(`Symptoms: ${Array.from(symptoms).join(', ')}`);
    parts.push(`Pain: ${pain}/10 (${painLabel(pain)})`);
    if (description.trim()) parts.push(`Notes: ${description.trim()}`);
    return parts.join('. ').slice(0, 1000);
  }, [symptoms, pain, description]);

  const canSubmit = activePatientId && (symptoms.size > 0 || description.trim().length > 0);

  const scrollToForm = () => {
    document.getElementById(FORM_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setToast({ type: 'error', message: 'Please add at least one symptom or describe your concern.' });
      return;
    }
    setSubmitting(true);
    try {
      const body = { type: connectionType, reason: composeReason() };
      if (activePatient?.branch?._id || activePatient?.branch) {
        body.branch = activePatient.branch._id || activePatient.branch;
      }
      const res = await createEmergencyRequest(activePatientId, body);
      const created = res?.data || res;
      setSession(created);
      setWaitStart(Date.now());
      setElapsed(0);
      setPhase('waiting');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setToast({ type: 'error', message: err?.message || 'Failed to create emergency request. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!session?._id) return;
    setCancelling(true);
    try {
      await cancelEmergencySession(session._id);
      setToast({ type: 'success', message: 'Emergency request cancelled.' });
      setShowCancelConfirm(false);
      setSession(null);
      setWaitStart(null);
      setElapsed(0);
      setPhase('triage');
    } catch (err) {
      setToast({ type: 'error', message: err?.message || 'Could not cancel. Please try again.' });
    } finally {
      setCancelling(false);
    }
  };

  const handleRestart = () => {
    setSession(null);
    setWaitStart(null);
    setElapsed(0);
    setPhase('triage');
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6 animate-[fadeUp_0.4s_ease-out_both]">
      {/* ── PHASE-ADAPTIVE HERO ────────────────── */}
      <PhaseHero
        phase={phase}
        onBack={() => navigate('/patient/appointments')}
        onStart={scrollToForm}
        elapsedMs={elapsed}
        session={session}
      />

      {/* ── Persistent 108 disclaimer ─────────── */}
      <DisclaimerBanner />

      <AnimatePresence mode="wait">
        {phase === 'triage' && (
          <motion.div
            key="triage"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* ── 3-Step procedural guide ───────── */}
            <ProceduralGuide />

            {/* ── Sectional triage form ─────────── */}
            <div id={FORM_ANCHOR_ID}>
              <TriageForm
                connectionType={connectionType} setConnectionType={setConnectionType}
                symptoms={symptoms} toggleSymptom={toggleSymptom}
                pain={pain} setPain={setPain}
                description={description} setDescription={setDescription}
                onSubmit={handleSubmit} submitting={submitting} canSubmit={canSubmit}
              />
            </div>
          </motion.div>
        )}

        {phase === 'waiting' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <WaitingRoom
              session={session}
              elapsedMs={elapsed}
              connectionType={connectionType}
              symptoms={symptoms}
              pain={pain}
              onCancelClick={() => setShowCancelConfirm(true)}
            />
          </motion.div>
        )}

        {phase === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <ActiveSession
              session={session}
              currentUserId={user?.id}
              patientName={activePatient?.name}
              onSessionEnded={(latest) => { setSession(latest); setPhase('ended'); }}
            />
          </motion.div>
        )}

        {phase === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <EndedView
              session={session}
              onRestart={handleRestart}
              onHome={() => navigate('/patient')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cancel confirmation modal ───────── */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-neutral-950/50" onClick={() => !cancelling && setShowCancelConfirm(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-[var(--shadow-lg)] border border-neutral-200 p-6"
            >
              <h3 className="text-base font-bold font-display text-neutral-900">Cancel emergency request?</h3>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                Your request will be withdrawn. If you still need care, please submit a new request or call 108.
              </p>
              <div className="flex gap-2 justify-end mt-5">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="px-4 py-2.5 text-sm font-semibold text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-xl transition-colors disabled:opacity-50"
                >
                  Keep waiting
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Cancel request
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ─────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-xl shadow-[var(--shadow-md)] text-white text-sm font-medium inline-flex items-center gap-2 ${
              toast.type === 'error' ? 'bg-red-600' : 'bg-secondary-600'
            }`}
          >
            {toast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PHASE-ADAPTIVE HERO
   ═══════════════════════════════════════════════ */

function PhaseHero({ phase, onBack, onStart, elapsedMs, session }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-800 via-red-900 to-rose-950 text-white"
    >
      {/* decorative blobs */}
      <div className="absolute -top-24 -right-20 w-64 h-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      <div className="absolute top-1/2 right-1/3 w-2 h-2 rounded-full bg-white/40 pointer-events-none" />
      <div className="absolute top-10 right-1/4 w-1.5 h-1.5 rounded-full bg-white/30 pointer-events-none" />
      <div className="absolute bottom-14 left-1/3 w-1 h-1 rounded-full bg-white/30 pointer-events-none" />

      <div className="relative z-10 grid lg:grid-cols-2 gap-6 p-6 md:p-10 items-center">
        {/* LEFT — copy + CTAs */}
        <HeroCopy phase={phase} onBack={onBack} onStart={onStart} />

        {/* RIGHT — phase-specific illustration composition */}
        <div className="relative h-64 lg:h-72 hidden sm:block">
          {phase === 'triage' && <TriageIllustration />}
          {phase === 'waiting' && <WaitingIllustration elapsedMs={elapsedMs} />}
          {phase === 'active' && <ActiveIllustration session={session} />}
          {phase === 'ended' && <EndedIllustration session={session} />}
        </div>
      </div>
    </motion.div>
  );
}

function HeroCopy({ phase, onBack, onStart }) {
  const content = {
    triage: {
      chip: 'Urgent care',
      dotColor: 'bg-red-300',
      headline: 'Connect with an on-call doctor.',
      sub: 'Complete the brief triage below. A clinician will review your request and respond within minutes — any time, day or night.',
      primary: { icon: Siren, label: 'Begin triage', onClick: onStart },
      secondary: { icon: Phone, label: 'Call 108', href: 'tel:108' },
    },
    waiting: {
      chip: 'Request in progress',
      dotColor: 'bg-amber-300 animate-pulse',
      headline: "We're paging an on-call doctor.",
      sub: 'Please keep this page open. You will be notified the moment a clinician accepts your request.',
    },
    active: {
      chip: 'Doctor connected',
      dotColor: 'bg-emerald-300',
      headline: 'Your doctor has joined.',
      sub: 'Enter the secure room below to begin your consultation. Everything you share stays within your clinical record.',
    },
    ended: {
      chip: 'Session complete',
      dotColor: 'bg-neutral-300',
      headline: 'Your session has ended.',
      sub: 'A summary has been saved to your medical records. We hope you feel better — reach out again any time.',
    },
  }[phase];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 ring-1 ring-white/15 text-white flex items-center justify-center transition-colors"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-red-100 bg-white/10 backdrop-blur px-3 py-1 rounded-full">
          <span className={`w-1.5 h-1.5 rounded-full ${content.dotColor}`} />
          {content.chip}
        </span>
      </div>

      <h2 className="text-2xl md:text-3xl font-bold font-display leading-tight mb-3">
        {content.headline}
      </h2>
      <p className="text-sm md:text-[15px] text-red-100/90 leading-relaxed mb-6 max-w-md">
        {content.sub}
      </p>

      {(content.primary || content.secondary) && (
        <div className="flex flex-wrap gap-3">
          {content.primary && (
            <button
              onClick={content.primary.onClick}
              className="group h-12 px-6 text-sm font-bold bg-white text-red-700 rounded-xl hover:bg-red-50 shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
            >
              <content.primary.icon className="h-4 w-4" />
              {content.primary.label}
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
          {content.secondary && (
            <a
              href={content.secondary.href}
              className="h-12 px-5 text-sm font-semibold bg-white/10 text-white rounded-xl hover:bg-white/20 backdrop-blur transition-all inline-flex items-center gap-2"
            >
              <content.secondary.icon className="h-4 w-4" />
              {content.secondary.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Hero illustration compositions ─── */

function TriageIllustration() {
  return (
    <>
      {/* Back card — On-call doctor */}
      <motion.div
        initial={{ opacity: 0, rotate: -12, y: 20 }}
        animate={{ opacity: 1, rotate: -8, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-2 left-4 md:left-10 w-56 bg-white rounded-2xl shadow-2xl p-4 text-neutral-800"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center ring-2 ring-white shadow-md">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-neutral-900 font-display">On-call doctor</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold text-emerald-700">Available now</span>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Response</span>
          <span className="text-[11px] font-bold text-red-600">&lt; 2 min</span>
        </div>
      </motion.div>

      {/* Floating ECG chip — top right */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="absolute top-4 right-4 md:right-0 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5"
      >
        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
          <HeartPulse className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Live care</div>
          <div className="text-sm font-bold text-neutral-800">24/7 on-call</div>
        </div>
      </motion.div>

      {/* Floating secure chip — bottom right */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="absolute bottom-4 right-8 md:right-4 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5 min-w-[210px]"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-neutral-800">Private & encrypted</div>
          <div className="text-[11px] text-neutral-500">Clinical team only</div>
        </div>
        <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto shrink-0" />
      </motion.div>

      {/* Cursor cue */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
        className="absolute bottom-16 left-24 md:left-28 text-white"
      >
        <MousePointerClick className="h-6 w-6 drop-shadow-lg" />
      </motion.div>
    </>
  );
}

function WaitingIllustration({ elapsedMs }) {
  return (
    <>
      {/* Back card — Paging */}
      <motion.div
        initial={{ opacity: 0, rotate: -12, y: 20 }}
        animate={{ opacity: 1, rotate: -8, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-2 left-4 md:left-10 w-56 bg-white rounded-2xl shadow-2xl p-4 text-neutral-800"
      >
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center ring-2 ring-white shadow-md">
            <Bell className="h-5 w-5 text-white" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-neutral-900 font-display">Doctors alerted</p>
            <p className="text-[10px] font-semibold text-amber-700 mt-0.5">Awaiting acceptance…</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Elapsed</span>
          <span className="text-[13px] font-bold text-neutral-900 tabular-nums">{formatElapsed(elapsedMs)}</span>
        </div>
      </motion.div>

      {/* Floating progress chip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="absolute top-4 right-4 md:right-0 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
        </div>
        <div>
          <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Status</div>
          <div className="text-sm font-bold text-neutral-800">Connecting…</div>
        </div>
      </motion.div>

      {/* Floating reassurance chip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="absolute bottom-4 right-8 md:right-4 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5 min-w-[210px]"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
          <HeartPulse className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-neutral-800">Stay on this page</div>
          <div className="text-[11px] text-neutral-500">We'll notify you instantly</div>
        </div>
      </motion.div>
    </>
  );
}

function ActiveIllustration({ session }) {
  const doctorInitial = session?.doctor?.firstName?.[0]?.toUpperCase() || 'D';
  return (
    <>
      <motion.div
        initial={{ opacity: 0, rotate: -12, y: 20 }}
        animate={{ opacity: 1, rotate: -8, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-2 left-4 md:left-10 w-60 bg-white rounded-2xl shadow-2xl p-4 text-neutral-800"
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center ring-2 ring-white shadow-md text-white font-bold font-display text-sm">
            {doctorInitial}
          </div>
          <div className="h-px w-5 bg-neutral-200 relative">
            <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-red-400 animate-pulse" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center ring-2 ring-white shadow-md">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <p className="text-xs font-bold text-neutral-900 font-display">Session active</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] font-semibold text-emerald-700">Live</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="absolute top-4 right-4 md:right-0 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5"
      >
        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Activity className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Secure link</div>
          <div className="text-sm font-bold text-neutral-800">End-to-end</div>
        </div>
      </motion.div>
    </>
  );
}

function EndedIllustration() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, rotate: -12, y: 20 }}
        animate={{ opacity: 1, rotate: -6, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-4 left-4 md:left-10 w-56 bg-white rounded-2xl shadow-2xl p-4 text-neutral-800"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-600 to-neutral-800 flex items-center justify-center ring-2 ring-white shadow-md">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-900 font-display">Saved to records</p>
            <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">Summary available</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Status</span>
          <span className="text-[11px] font-bold text-neutral-700">Complete</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="absolute bottom-8 right-4 md:right-0 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-xs font-bold text-neutral-800">We hope you feel better</div>
          <div className="text-[11px] text-neutral-500">Reach out any time</div>
        </div>
      </motion.div>
    </>
  );
}

/* ═══════════════════════════════════════════════
   DISCLAIMER + PROCEDURAL GUIDE
   ═══════════════════════════════════════════════ */

function DisclaimerBanner() {
  return (
    <div className="rounded-xl bg-red-50 border-l-4 border-red-500 border-y border-r border-red-100 px-4 py-3 flex items-start gap-3">
      <Phone className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
      <p className="text-[13px] text-red-800 leading-relaxed">
        <span className="font-semibold">Life-threatening emergency?</span>{' '}
        Call <span className="font-bold">108</span> or your local emergency number immediately.
        This service is for urgent but non-critical care.
      </p>
    </div>
  );
}

function ProceduralGuide() {
  const steps = [
    {
      n: '01',
      icon: Stethoscope,
      title: 'Describe the situation',
      desc: 'Tell us what\'s happening in your own words. Pick a connection type, select symptoms, set a pain level, and add any notes.',
      iconBg: 'bg-red-50',
      iconText: 'text-red-600',
    },
    {
      n: '02',
      icon: Bell,
      title: 'A doctor accepts',
      desc: 'An on-call clinician reviews your request and accepts — typically within two minutes. You can cancel any time while waiting.',
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
    },
    {
      n: '03',
      icon: Video,
      title: 'Connect live',
      desc: 'Join the secure, encrypted room. Speak face-to-face or chat in real time. A summary is saved to your records.',
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">How it works</span>
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="text-[11px] text-neutral-400 font-medium">3 simple steps</span>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
            className={`relative ${CARD} p-5 overflow-hidden group hover:shadow-[var(--shadow-md)] transition-all`}
          >
            <span className="absolute -top-2 -right-1 text-6xl font-black font-display text-neutral-100 select-none leading-none pointer-events-none">
              {s.n}
            </span>

            <div className={`relative w-11 h-11 rounded-xl ${s.iconBg} flex items-center justify-center mb-4`}>
              <s.icon className={`h-5 w-5 ${s.iconText}`} />
            </div>

            <h4 className="relative text-[15px] font-semibold font-display text-neutral-900 mb-1.5">
              {s.title}
            </h4>
            <p className="relative text-[13px] text-neutral-500 leading-relaxed">
              {s.desc}
            </p>

            {i < 2 && (
              <div className="hidden md:flex absolute top-10 -right-2 w-4 h-px items-center justify-end pointer-events-none">
                <ArrowRight className="h-4 w-4 text-neutral-300" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TRIAGE FORM — sectional
   ═══════════════════════════════════════════════ */

function TriageForm({
  connectionType, setConnectionType,
  symptoms, toggleSymptom,
  pain, setPain,
  description, setDescription,
  onSubmit, submitting, canSubmit,
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">Your triage</span>
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="text-[11px] text-neutral-400 font-medium">4 quick steps</span>
      </div>

      {/* ─ Section 01: Connection ─ */}
      <FormSection
        step="01"
        icon={Video}
        accent="red"
        title="How should the doctor reach you?"
        hint="Choose how you prefer to speak with the on-call doctor."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {CONNECTION_TYPES.map((ct) => {
            const selected = connectionType === ct.key;
            return (
              <button
                key={ct.key}
                type="button"
                onClick={() => setConnectionType(ct.key)}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-red-500 bg-red-50/60 ring-1 ring-red-500'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selected
                    ? `bg-gradient-to-br ${ct.iconWash} text-white shadow-sm`
                    : 'bg-neutral-100 text-neutral-600'
                }`}>
                  <ct.Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{ct.label}</p>
                  <p className="text-[12px] text-neutral-500 mt-0.5">{ct.hint}</p>
                </div>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  selected ? 'bg-red-600' : 'border border-neutral-300'
                }`}>
                  {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </FormSection>

      {/* ─ Section 02: Symptoms ─ */}
      <FormSection
        step="02"
        icon={HeartPulse}
        accent="amber"
        title="What are you experiencing?"
        hint="Select every symptom that applies. At least one symptom or note is required."
        counter={symptoms.size > 0 ? `${symptoms.size} selected` : null}
      >
        <div className="flex flex-wrap gap-2">
          {SYMPTOM_CHIPS.map((s) => {
            const on = symptoms.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSymptom(s)}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors ${
                  on
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </FormSection>

      {/* ─ Section 03: Pain level ─ */}
      <FormSection
        step="03"
        icon={Activity}
        accent="rose"
        title="Pain level"
        hint="0 indicates no pain; 10 is the most severe you've experienced."
      >
        <div className="flex items-end justify-between mb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-display text-neutral-900 tabular-nums leading-none">
              {pain}
            </span>
            <span className="text-sm font-medium text-neutral-400">/ 10</span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md">
            {painLabel(pain)}
          </span>
        </div>

        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={pain}
          onChange={(e) => setPain(parseInt(e.target.value, 10))}
          className="w-full accent-red-600 cursor-pointer"
        />

        <div className="flex justify-between text-[10px] text-neutral-400 mt-1 px-0.5 tabular-nums">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <span key={n} className={n === pain ? 'text-red-700 font-semibold' : ''}>{n}</span>
          ))}
        </div>
      </FormSection>

      {/* ─ Section 04: Notes ─ */}
      <FormSection
        step="04"
        icon={FileText}
        accent="neutral"
        title="Additional notes"
        hint="Optional — mention onset, location, medication taken, allergies, etc."
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
          rows={4}
          placeholder="e.g. Started 30 minutes ago, swelling on the left side, took one paracetamol at 10:30 AM."
          className="w-full px-3.5 py-3 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition resize-none"
        />
        <p className="text-[11px] text-neutral-400 mt-1 text-right tabular-nums">
          {description.length} / 1000
        </p>
      </FormSection>

      {/* ─ Submit strip ─ */}
      <div className={`${CARD} p-5 md:p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3`}>
        <div className="flex items-start gap-2.5 flex-1">
          <ShieldCheck className="h-4 w-4 text-neutral-500 mt-0.5 shrink-0" />
          <p className="text-[12px] text-neutral-600 leading-relaxed">
            By submitting, you authorise the on-call doctor to review this request and contact you through our secure channel.
          </p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-[var(--shadow-sm)]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              Submit request
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function FormSection({ step, icon: Icon, accent, title, hint, counter, children }) {
  const accentMap = {
    red: { iconBg: 'bg-red-50 border-red-100', iconText: 'text-red-600' },
    amber: { iconBg: 'bg-amber-50 border-amber-100', iconText: 'text-amber-600' },
    rose: { iconBg: 'bg-rose-50 border-rose-100', iconText: 'text-rose-600' },
    neutral: { iconBg: 'bg-neutral-50 border-neutral-200', iconText: 'text-neutral-600' },
  }[accent] || { iconBg: 'bg-neutral-50 border-neutral-200', iconText: 'text-neutral-600' };

  return (
    <div className={`${CARD} p-5 md:p-6 overflow-hidden relative`}>
      {/* Watermark number */}
      <span className="absolute -top-2 -right-1 text-6xl font-black font-display text-neutral-100 select-none leading-none pointer-events-none">
        {step}
      </span>

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${accentMap.iconBg}`}>
            <Icon className={`h-4 w-4 ${accentMap.iconText}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold font-display text-neutral-900 leading-tight">
              {title}
            </h3>
            <p className="text-[12.5px] text-neutral-500 mt-0.5 leading-relaxed">{hint}</p>
          </div>
        </div>
        {counter && (
          <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
            {counter}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   WAITING ROOM
   ═══════════════════════════════════════════════ */

function WaitingRoom({ session, elapsedMs, connectionType, symptoms, pain, onCancelClick }) {
  const rows = [
    { label: 'Request ID', value: session?.sessionNumber || session?.tokenNumber || '—' },
    { label: 'Connection', value: connectionType === 'video' ? 'Video consultation' : 'Secure chat' },
    { label: 'Pain level', value: `${pain} / 10 · ${painLabel(pain)}` },
    { label: 'Symptoms', value: symptoms.size ? Array.from(symptoms).join(', ') : '—' },
  ];

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
      {/* Status panel */}
      <div className={`${CARD} p-6 md:p-7`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Loader2 className="h-4 w-4 text-red-600 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-700">
              In progress
            </p>
            <h2 className="text-lg font-bold font-display text-neutral-900 mt-0.5 leading-tight">
              Connecting you to an on-call doctor
            </h2>
            <p className="text-[13px] text-neutral-600 mt-1 leading-relaxed">
              Typical response time is under 2 minutes. Please stay on this page.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
              Waiting time
            </p>
            <p className="text-2xl font-bold font-display text-neutral-900 tabular-nums leading-none mt-1">
              {formatElapsed(elapsedMs)}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
            <Clock className="h-3.5 w-3.5" />
            Target &lt; 02:00
          </div>
        </div>

        <ol className="mt-5 space-y-2.5">
          <StepRow done label="Request received" />
          <StepRow done label="Notifying on-call doctors" />
          <StepRow active label="Waiting for a doctor to accept" />
          <StepRow label="Session begins" />
        </ol>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[11px] text-neutral-500">
            We'll keep polling for a response automatically.
          </p>
          <button
            type="button"
            onClick={onCancelClick}
            className="text-[13px] font-semibold text-neutral-600 hover:text-red-700 transition-colors inline-flex items-center gap-1.5"
          >
            <X className="h-4 w-4" />
            Cancel request
          </button>
        </div>
      </div>

      {/* Summary panel */}
      <div className={`${CARD} p-6 md:p-7`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500 mb-3">
          Request summary
        </p>
        <dl className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <div key={r.label} className="py-2.5 flex items-start justify-between gap-3">
              <dt className="text-[12px] text-neutral-500 shrink-0 w-28">{r.label}</dt>
              <dd className="text-[13px] text-neutral-900 font-medium text-right flex-1 min-w-0 break-words">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2.5 flex items-start gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-neutral-500 mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-neutral-600 leading-relaxed">
            Your request is visible only to the on-call clinical team and is encrypted in transit.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepRow({ label, done, active }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${
        done
          ? 'bg-secondary-600 text-white'
          : active
            ? 'bg-red-600 text-white'
            : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
      }`}>
        {done
          ? <Check className="h-3 w-3" strokeWidth={3} />
          : active
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
        }
      </span>
      <span className={`text-[13px] ${
        done ? 'text-neutral-600' : active ? 'text-neutral-900 font-semibold' : 'text-neutral-400'
      }`}>
        {label}
      </span>
    </li>
  );
}

/* ═══════════════════════════════════════════════
   ACTIVE SESSION
   ═══════════════════════════════════════════════ */

/**
 * ActiveSession — post-accept phase.
 *
 *   type === 'video' →  Launch card routing to <PatientVideoCall /> at
 *                       /patient/video/{videoSessionId}. The backend auto-
 *                       created a VideoSession at accept time (see
 *                       emergency.service.acceptSession) and attached it to
 *                       session.videoSession.
 *
 *   type === 'chat'  →  Inline unified chat thread backed by the same
 *                       VideoSession (WAITING status) + encrypted
 *                       ChatMessage store. Uses <SessionChatThread>.
 */
function ActiveSession({ session, currentUserId, patientName, onSessionEnded }) {
  const navigate = useNavigate();
  const isVideo = session?.type === 'video';

  const doctor = session?.doctor;
  const doctorName = doctor
    ? `Dr. ${stripDrPrefix(doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim())}`.trim()
    : 'On-call doctor';
  const doctorSpec = doctor?.specialization || '';

  // The populated video session (from getEmergencySession populate chain).
  const videoSessionId = session?.videoSession?._id || session?.videoSession || null;
  const roomId = session?.videoSession?.roomId || session?.roomId || null;

  // Live-listen for emergency:ended so the chat view flips to the ended
  // state the moment the doctor closes the case.
  useEffect(() => {
    if (!session?._id || !onSessionEnded) return undefined;
    const off = emergencyBus.on((evt, payload) => {
      if (evt !== 'emergency:ended') return;
      if (payload?.sessionId !== String(session._id)) return;
      onSessionEnded({ ...session, status: 'ended', endedAt: new Date().toISOString() });
    });
    return () => off();
  }, [session, onSessionEnded]);

  const chatApi = useMemo(() => ({
    list:      getPatientVideoMessages,
    send:      sendPatientVideoMessage,
    markRead:  markVideoMessageRead,
    shareFile: sharePatientVideoFile,
  }), []);

  /* ── Video variant — launch card ─────────────────────────────── */
  if (isVideo) {
    return (
      <div className={`${CARD} overflow-hidden`}>
        {/* Hero strip */}
        <div className="relative bg-gradient-to-br from-secondary-600 via-secondary-700 to-emerald-800 text-white p-6 md:p-7 overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute right-10 bottom-4 w-3 h-3 rounded-full bg-white/60" />
          <div className="relative flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-white/20 animate-pulse" />
              <div className="relative w-12 h-12 rounded-2xl bg-white/20 border border-white/30 backdrop-blur flex items-center justify-center">
                <Video className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
                Doctor connected · Ready to join
              </p>
              <h2 className="text-lg md:text-xl font-bold font-display mt-0.5 leading-tight">
                {doctorName} is waiting for you
              </h2>
              {doctorSpec && (
                <p className="text-[12.5px] text-white/75 mt-0.5">{doctorSpec}</p>
              )}
              <p className="text-[13px] text-white/80 mt-2 leading-relaxed max-w-lg">
                Step into the secure video room whenever you're ready. Your doctor is standing by.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-7 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/patient/video/${videoSessionId || session?._id}`)}
              className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-secondary-600 hover:bg-secondary-700 transition-colors inline-flex items-center gap-2 shadow-sm"
            >
              <Video className="h-4 w-4" />
              Enter video room
              <ArrowRight className="h-4 w-4 opacity-70" />
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500 ml-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              End-to-end encrypted · Saved to your record
            </span>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 p-3.5 text-[12.5px] text-neutral-600 leading-relaxed">
            <p className="inline-flex items-center gap-1.5 font-semibold text-neutral-700">
              <FileText className="h-3.5 w-3.5 text-secondary-600" />
              What happens after
            </p>
            <p className="mt-0.5 text-neutral-500">
              A summary of the consultation — including prescriptions and follow-up
              instructions — will be added to your medical records.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Chat variant — inline SessionChatThread ─────────────────── */
  return (
    <div className={`${CARD} overflow-hidden`}>
      {/* Top strip */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-secondary-50/80 to-white">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-secondary-200/40 animate-pulse" />
          <div className="relative w-10 h-10 rounded-xl bg-secondary-600 text-white flex items-center justify-center shadow-sm">
            <Stethoscope className="h-4 w-4" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-secondary-700">
            Live · Chat with {doctorName}
          </p>
          <p className="text-[13px] font-semibold text-neutral-900 truncate font-display">
            {doctorName}
            {doctorSpec && <span className="text-neutral-400 font-medium"> · {doctorSpec}</span>}
          </p>
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Encrypted
        </span>
      </div>

      {/* Thread */}
      <div className="h-[560px] md:h-[640px]">
        {videoSessionId && roomId && currentUserId ? (
          <SessionChatThread
            sessionId={videoSessionId}
            roomId={roomId}
            currentUserId={currentUserId}
            currentUserRole="patient"
            api={chatApi}
            variant="standalone"
            accentClassName="bg-secondary-600 text-white"
            emptyState={
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-6">
                <MessageCircle className="h-10 w-10 text-neutral-300" />
                <p className="text-sm font-semibold text-neutral-700">
                  Say hi to {doctorName}
                </p>
                <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
                  {patientName ? `Tell ${doctorName} what's going on, ${patientName.split(' ')[0]}.` : `Describe what's going on.`} Messages are encrypted and saved to your record.
                </p>
              </div>
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
            <Loader2 className="h-6 w-6 animate-spin text-secondary-600" />
            <p className="text-sm text-neutral-600">
              Connecting to secure chat…
            </p>
            {!videoSessionId && (
              <p className="text-[11.5px] text-neutral-400 max-w-sm">
                Waiting for your doctor's device to finalise the session. This normally takes a few seconds.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ENDED VIEW
   ═══════════════════════════════════════════════ */

function EndedView({ session, onRestart, onHome }) {
  const missed = session?.status === 'missed';
  return (
    <div className={`${CARD} p-6 md:p-7`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
          missed
            ? 'bg-amber-50 border-amber-100'
            : 'bg-secondary-50 border-secondary-100'
        }`}>
          {missed
            ? <AlertTriangle className="h-4 w-4 text-amber-600" />
            : <CheckCircle2 className="h-4 w-4 text-secondary-700" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
            missed ? 'text-amber-700' : 'text-secondary-700'
          }`}>
            {missed ? 'Unanswered' : 'Completed'}
          </p>
          <h2 className="text-lg font-bold font-display text-neutral-900 mt-0.5 leading-tight">
            {missed ? 'No doctor was available to accept your request' : 'Session ended'}
          </h2>
          <p className="text-[13px] text-neutral-600 mt-1 leading-relaxed">
            {missed
              ? 'Please resubmit the request, or call 108 if this is a life-threatening emergency.'
              : 'A summary has been added to your medical records.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
        >
          Submit a new request
        </button>
        <button
          type="button"
          onClick={onHome}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
