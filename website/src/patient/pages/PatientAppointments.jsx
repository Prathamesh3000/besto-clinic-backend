import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarPlus, Clock, Video, Loader2, Building2,
  CheckCircle2, XCircle, CalendarDays, ChevronRight,
  ArrowRight, Phone, Stethoscope, MapPin, Timer,
  Filter, RefreshCw, AlertCircle, Calendar, Shield,
  Sparkles, MousePointerClick, BellRing, PhoneCall, Zap, FileText,
} from 'lucide-react';
import {
  listPatientAppointments, cancelPatientAppointment,
  rescheduleAppointment, confirmAttendance, getPortalDashboard,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Modal, ConfirmDialog, Pagination } from '../../platform/components/shared';
import BookingWizardModal from '../components/BookingWizardModal';
import BookingIntentHub from '../components/BookingIntentHub';
import { usePresence } from '../../lib/telemedicine/usePresence';
import { PresenceChip } from '../../lib/telemedicine/PresenceChip';
import { callLife, emergencyBus, initSocket } from '../../lib/socket';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── helpers ──────────────────────────────────── */

const PAGE = 12;

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function relativeDay(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.ceil((d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff <= 6) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return null;
}

const _utcTime = (d) => {
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const _utcDate = (d) => {
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};
const fmt = {
  day: (d) => new Date(d).getUTCDate(),
  month: (d) => ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][new Date(d).getUTCMonth()],
  weekday: (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getUTCDay()],
  time: (d) => _utcTime(d),
  date: (d) => _utcDate(d),
  full: (d) => `${_utcDate(d)}, ${_utcTime(d)}`,
};

const STATUS = {
  requested:   { label: 'Requested',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',  ring: 'ring-amber-100' },
  confirmed:   { label: 'Confirmed',   bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400',   ring: 'ring-blue-100' },
  checked_in:  { label: 'Checked In',  bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400', ring: 'ring-violet-100' },
  in_progress: { label: 'In Progress', bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400', ring: 'ring-violet-100' },
  completed:   { label: 'Completed',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500',ring: 'ring-emerald-100' },
  cancelled:   { label: 'Cancelled',   bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-400',    ring: 'ring-red-100' },
  no_show:     { label: 'No Show',     bg: 'bg-neutral-100',text: 'text-neutral-600', dot: 'bg-neutral-400',ring: 'ring-neutral-200' },
};

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

function avatarGradient(id) {
  if (!id) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

const VIEWS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'History' },
  { key: 'cancelled', label: 'Cancelled' },
];

/* ═══════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════ */

export default function PatientAppointments() {
  const navigate = useNavigate();
  const { activePatient, activePatientId } = useSafePatientAuth();
  const scrollRef = useRef(null);

  // tenant-wide doctor presence snapshot + live updates
  const { statusFor: presenceStatusFor } = usePresence();

  // data
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('upcoming');

  // spotlight — the next upcoming appointment
  const [spotlight, setSpotlight] = useState(null);
  const [spotlightLoading, setSpotlightLoading] = useState(true);

  // live banners — surfaced when the doctor/clinic emits a live event
  // that affects one of this patient's appointments.
  //   kind : 'doctor-joined' | 'emergency-accepted'
  //   ref  : sessionId | emergencySessionId
  //   text, ctaLabel, ctaPath
  const [liveBanner, setLiveBanner] = useState(null);
  const [pendingBanners, setPendingBanners] = useState([]);

  // booking
  const [bookOpen, setBookOpen] = useState(false);
  const [bookIntent, setBookIntent] = useState('visit');
  const [intentHubOpen, setIntentHubOpen] = useState(false);

  const handleIntentChosen = ({ intent }) => {
    setIntentHubOpen(false);
    if (intent === 'emergency') {
      navigate('/patient/emergency');
      return;
    }
    setBookIntent(intent);
    setBookOpen(true);
  };

  // cancel
  const [cancelAppt, setCancelAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // reschedule
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // confirm attendance
  const [confirmingId, setConfirmingId] = useState(null);

  // toast
  const [toast, setToast] = useState(null);

  /* ── fetch ────────────────────────────────────── */

  const fetchList = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const p = { page, limit: PAGE };
      if (view === 'upcoming') {
        p.from = new Date().toISOString();
        p.statusNin = 'cancelled,completed,no_show';
      } else if (view === 'past') {
        p.to = new Date().toISOString();
        p.statusNin = 'cancelled';
      } else {
        p.status = 'cancelled';
      }
      const res = await listPatientAppointments(activePatientId, p);
      setItems(res.data || []);
      setTotal(res.total || res.pagination?.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activePatientId, page, view]);

  const fetchSpotlight = useCallback(async () => {
    if (!activePatientId) return;
    setSpotlightLoading(true);
    try {
      const res = await getPortalDashboard(activePatientId);
      const d = res.data || res;
      setSpotlight(d.nextAppointment || null);
    } catch {
      setSpotlight(null);
    } finally {
      setSpotlightLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchSpotlight(); }, [fetchSpotlight]);
  useEffect(() => { setPage(1); }, [view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Live banner promotion ────────────────────
  // Show one banner at a time; auto-promote from the queue when the
  // current one is dismissed. Each banner self-expires after 20s.
  useEffect(() => {
    if (liveBanner || pendingBanners.length === 0) return undefined;
    setLiveBanner(pendingBanners[0]);
    setPendingBanners((q) => q.slice(1));
    return undefined;
  }, [liveBanner, pendingBanners]);

  useEffect(() => {
    if (!liveBanner) return undefined;
    const t = setTimeout(() => setLiveBanner(null), 20000);
    return () => clearTimeout(t);
  }, [liveBanner]);

  // ── Socket listeners: live banners for teleconsult + emergency ─
  // Listens for doctor joining a scheduled teleconsult room or a
  // doctor accepting a pending emergency. Banners route the patient
  // straight back to the live session with a single click.
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const spotlightRef = useRef(null);
  useEffect(() => { spotlightRef.current = spotlight; }, [spotlight]);

  useEffect(() => {
    initSocket();

    const offLife = callLife.on((evt, payload) => {
      if (evt !== 'video:peer-joined') return;
      // Try to match the session to one of the patient's appointments
      // by sessionId. If no match we still surface the banner so the
      // patient sees the incoming activity.
      const sid = payload?.sessionId || payload?.session || null;
      const appt =
        itemsRef.current.find((a) => String(a?.videoSession?._id || a?.videoSessionId) === String(sid)) ||
        (String(spotlightRef.current?.videoSession?._id || spotlightRef.current?.videoSessionId) === String(sid)
          ? spotlightRef.current
          : null);
      const doctorName = appt?.doctor?.name || payload?.name || 'Your doctor';
      setPendingBanners((q) => [
        ...q,
        {
          kind: 'doctor-joined',
          ref: sid || appt?._id || 'live',
          text: `Dr. ${stripDrPrefix(doctorName)} just joined your video consultation.`,
          ctaLabel: 'Join Call',
          ctaPath: sid ? `/patient/video/${sid}` : appt ? `/patient/video/${appt._id}` : null,
          tone: 'emerald',
        },
      ]);
    });

    const offEmergency = emergencyBus.on((evt, payload) => {
      if (evt !== 'emergency:accepted') return;
      const doctorName = payload?.doctor?.name || payload?.name || 'A doctor';
      const sid = payload?.sessionId || payload?._id;
      setPendingBanners((q) => [
        ...q,
        {
          kind: 'emergency-accepted',
          ref: sid || 'live-emergency',
          text: `Dr. ${stripDrPrefix(doctorName)} accepted your emergency request. Connect now.`,
          ctaLabel: 'Go to Session',
          ctaPath: '/patient/emergency',
          tone: 'rose',
        },
      ]);
    });

    return () => {
      offLife();
      offEmergency();
    };
  }, []);

  const refresh = () => { fetchList(); fetchSpotlight(); };

  /* ── actions ──────────────────────────────────── */

  const doCancel = async () => {
    if (!cancelAppt) return;
    if (!cancelReason.trim()) {
      setToast({ ok: false, msg: 'Please provide a reason for cancellation' });
      return;
    }
    setCancelling(true);
    try {
      await cancelPatientAppointment(activePatientId, cancelAppt._id, cancelReason);
      setCancelAppt(null);
      setCancelReason('');
      setToast({ ok: true, msg: 'Appointment cancelled successfully' });
      refresh();
    } catch (e) {
      setToast({ ok: false, msg: e.message || 'Could not cancel' });
    } finally {
      setCancelling(false);
    }
  };

  const doReschedule = async () => {
    if (!rescheduleAppt || !newDate || !newTime) return;
    setRescheduling(true);
    try {
      // Use "fake UTC" convention — local display time encoded as UTC (matches backend)
      await rescheduleAppointment(activePatientId, rescheduleAppt._id, `${newDate}T${newTime}:00.000Z`);
      setRescheduleAppt(null);
      setNewDate('');
      setNewTime('');
      setToast({ ok: true, msg: 'Appointment rescheduled' });
      refresh();
    } catch (e) {
      setToast({ ok: false, msg: e.message || 'Could not reschedule' });
    } finally {
      setRescheduling(false);
    }
  };

  const doConfirm = async (appt, status) => {
    setConfirmingId(appt._id);
    try {
      await confirmAttendance(activePatientId, appt._id, status);
      setToast({ ok: true, msg: status === 'confirmed' ? 'See you there!' : 'Noted — declined' });
      refresh();
    } catch (e) {
      setToast({ ok: false, msg: e.message || 'Failed' });
    } finally {
      setConfirmingId(null);
    }
  };

  /* ── predicates ───────────────────────────────── */

  const canAct = (a) => ['requested', 'confirmed'].includes(a.status);
  const needsConfirm = (a) =>
    ['requested', 'confirmed'].includes(a.status) &&
    (!a.patientConfirmation || a.patientConfirmation.status === 'pending');
  const canJoin = (a) =>
    a.type === 'teleconsult' && ['confirmed', 'checked_in', 'in_progress'].includes(a.status) && a.patientConfirmation?.status === 'confirmed';

  // Presence-aware helpers for teleconsult appointments.
  // We treat `doctor._id`'s user identity (populated as `user` by backend
  // or fallback to `_id` if the tenant doctor doc is the user doc itself)
  // as the key for the tenant-wide presence map.
  const doctorPresenceStatus = useCallback(
    (a) => {
      const uid = a?.doctor?.user || a?.doctor?._id;
      return presenceStatusFor(uid);
    },
    [presenceStatusFor],
  );

  const doctorIsReachable = useCallback(
    (a) => {
      const s = doctorPresenceStatus(a);
      return s === 'online' || s === 'busy'; // busy = in another call; doctor is still online
    },
    [doctorPresenceStatus],
  );

  /* ── group by date ────────────────────────────── */

  // Show immersive guide only when: upcoming view, no spotlight, no upcoming items
  const showGuide = view === 'upcoming' && !spotlightLoading && !spotlight;

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((a) => {
      const key = new Date(a.scheduledAt).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return [...map.entries()].map(([dateKey, appts]) => ({
      dateKey,
      label: relativeDay(appts[0].scheduledAt) || fmt.date(appts[0].scheduledAt),
      fullDate: fmt.date(appts[0].scheduledAt),
      weekday: fmt.weekday(appts[0].scheduledAt),
      appts,
    }));
  }, [items]);

  /* ─── render ─────────────────────────────────── */

  return (
    <div ref={scrollRef} className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Toast ───────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
              toast.ok ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ LIVE BANNER — doctor just joined / emergency accepted ═══ */}
      <AnimatePresence>
        {liveBanner && (
          <motion.div
            key={`banner-${liveBanner.ref}-${liveBanner.kind}`}
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={{ duration: 0.25 }}
            className={`relative overflow-hidden rounded-2xl border shadow-[var(--shadow-sm)] ${
              liveBanner.tone === 'rose'
                ? 'bg-gradient-to-r from-rose-50 via-rose-50 to-amber-50 border-rose-200'
                : 'bg-gradient-to-r from-emerald-50 via-emerald-50 to-teal-50 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3 p-4 sm:p-5">
              <div
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  liveBanner.tone === 'rose' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {liveBanner.tone === 'rose' ? <Zap className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
                <span
                  className={`absolute inset-0 rounded-xl opacity-40 animate-ping ${
                    liveBanner.tone === 'rose' ? 'bg-rose-300' : 'bg-emerald-300'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-0.5 ${
                    liveBanner.tone === 'rose' ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {liveBanner.kind === 'emergency-accepted' ? 'Emergency · Live' : 'Teleconsult · Live'}
                </div>
                <p className="text-sm font-semibold text-neutral-900 truncate">{liveBanner.text}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {liveBanner.ctaPath && (
                  <button
                    onClick={() => { const p = liveBanner.ctaPath; setLiveBanner(null); navigate(p); }}
                    className={`h-9 px-4 text-xs font-bold rounded-xl text-white transition-all inline-flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                      liveBanner.tone === 'rose'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    {liveBanner.ctaLabel}
                  </button>
                )}
                <button
                  onClick={() => setLiveBanner(null)}
                  className="h-9 w-9 rounded-xl bg-white/70 hover:bg-white text-neutral-500 hover:text-neutral-700 transition flex items-center justify-center"
                  aria-label="Dismiss"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ HERO — Spotlight next appointment ═══ */}
      {view === 'upcoming' && (
        <div>
          {spotlightLoading ? (
            <Shimmer className="h-48 w-full" />
          ) : spotlight ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-6 md:p-8 text-white"
            >
              {/* Decorative circles */}
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-white/5" />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-200">Next Appointment</span>
                  <span className="h-px flex-1 bg-white/10" />
                  {(() => {
                    const rel = relativeDay(spotlight.scheduledAt);
                    return rel && (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/15 text-white/90">{rel}</span>
                    );
                  })()}
                </div>

                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarGradient(spotlight.doctor?._id)} ring-2 ring-white/20 flex items-center justify-center shadow-lg`}>
                      <span className="text-white font-bold font-display text-xl">
                        {(spotlight.doctor?.name || 'D')[0]}
                      </span>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold font-display leading-tight">
                          Dr. {stripDrPrefix(spotlight.doctor?.name) || 'Unknown'}
                        </h2>
                        {spotlight.type === 'teleconsult' && (
                          <PresenceChip
                            status={doctorPresenceStatus(spotlight)}
                            size="xs"
                            className="!bg-white/15 !text-white !border-white/20"
                          />
                        )}
                      </div>
                      <p className="text-primary-200 text-sm font-medium">
                        {spotlight.doctor?.specialization || spotlight.type?.replace(/_/g, ' ')}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-sm text-primary-100">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {fmt.date(spotlight.scheduledAt)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {fmt.time(spotlight.scheduledAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {needsConfirm(spotlight) && (
                      <>
                        <button
                          onClick={() => doConfirm(spotlight, 'confirmed')}
                          disabled={confirmingId === spotlight._id}
                          className="h-10 px-4 text-xs font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {confirmingId === spotlight._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          I'll Be There
                        </button>
                        <button
                          onClick={() => doConfirm(spotlight, 'declined')}
                          disabled={confirmingId === spotlight._id}
                          className="h-10 px-4 text-xs font-bold bg-white/10 text-white rounded-xl hover:bg-white/20 backdrop-blur transition-all disabled:opacity-50"
                        >
                          Can't Make It
                        </button>
                      </>
                    )}
                    {canJoin(spotlight) && (() => {
                      const reachable = doctorIsReachable(spotlight);
                      return (
                        <button
                          onClick={() => navigate(`/patient/video/${spotlight._id}`)}
                          className={`h-10 px-4 text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
                            reachable
                              ? 'bg-white text-emerald-700 hover:bg-emerald-50'
                              : 'bg-white/90 text-neutral-700 hover:bg-white'
                          }`}
                          title={reachable ? 'Doctor is online — join now' : 'Join the waiting room; we\'ll ring you when the doctor arrives'}
                        >
                          <Video className="h-3.5 w-3.5" />
                          {reachable ? 'Join Call' : 'Enter Waiting Room'}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {/* ── IMMERSIVE GUIDE HERO ──────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white"
              >
                {/* decorative blobs */}
                <div className="absolute -top-24 -right-20 w-64 h-64 rounded-full bg-white/5 blur-2xl" />
                <div className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full bg-white/5 blur-2xl" />
                <div className="absolute top-1/2 right-1/3 w-2 h-2 rounded-full bg-white/40" />
                <div className="absolute top-10 right-1/4 w-1.5 h-1.5 rounded-full bg-white/30" />
                <div className="absolute bottom-14 left-1/3 w-1 h-1 rounded-full bg-white/30" />

                <div className="relative z-10 grid lg:grid-cols-2 gap-6 p-6 md:p-10 items-center">
                  {/* LEFT — copy + CTAs */}
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-100 bg-white/10 backdrop-blur px-3 py-1 rounded-full mb-4">
                      <Sparkles className="h-3 w-3" /> Let's get you started
                    </span>
                    <h2 className="text-2xl md:text-3xl font-bold font-display leading-tight mb-3">
                      Your next visit is just
                      <br />
                      <span className="bg-gradient-to-r from-white to-primary-200 bg-clip-text text-transparent">three taps away.</span>
                    </h2>
                    <p className="text-sm md:text-base text-primary-100 leading-relaxed mb-6 max-w-md">
                      Choose a doctor, pick a time that suits you, and we'll take care of the rest — reminders, records, and all.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setIntentHubOpen(true)}
                        className="group h-12 px-6 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Book Appointment
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                      <button
                        onClick={() => navigate('/patient/emergency')}
                        className="h-12 px-5 text-sm font-semibold bg-white/10 text-white rounded-xl hover:bg-white/20 backdrop-blur transition-all inline-flex items-center gap-2"
                      >
                        <Phone className="h-4 w-4" /> Need it now?
                      </button>
                    </div>
                  </div>

                  {/* RIGHT — illustration composition */}
                  <div className="relative h-64 lg:h-72 hidden sm:block">
                    {/* back calendar card (tilted) */}
                    <motion.div
                      initial={{ opacity: 0, rotate: -12, y: 20 }}
                      animate={{ opacity: 1, rotate: -8, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className="absolute top-2 left-4 md:left-10 w-52 bg-white rounded-2xl shadow-2xl p-4 text-neutral-800"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">APRIL 2026</span>
                        <CalendarDays className="h-4 w-4 text-primary-500" />
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-[10px] text-neutral-400 mb-1.5">
                        {['S','M','T','W','T','F','S'].map((d, i) => <span key={i} className="text-center">{d}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 28 }).map((_, i) => {
                          const isHi = i === 16;
                          const isDot = [10, 20].includes(i);
                          return (
                            <div key={i} className={`aspect-square flex items-center justify-center text-[10px] font-semibold rounded-md relative ${
                              isHi ? 'bg-primary-600 text-white shadow-md' : 'text-neutral-600'
                            }`}>
                              {i + 1}
                              {isDot && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-400" />}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>

                    {/* floating time chip */}
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.35 }}
                      className="absolute top-4 right-4 md:right-0 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Your slot</div>
                        <div className="text-sm font-bold text-neutral-800">10:30 AM</div>
                      </div>
                    </motion.div>

                    {/* floating doctor chip */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                      className="absolute bottom-4 right-8 md:right-4 bg-white rounded-xl shadow-xl p-3 pr-4 flex items-center gap-2.5 min-w-[200px]"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                        <Stethoscope className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-800">Dr. Priya Sharma</div>
                        <div className="text-[11px] text-neutral-500">Dental · Available today</div>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                    </motion.div>

                    {/* cursor pointer cue */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.7 }}
                      className="absolute bottom-16 left-24 md:left-28 text-white"
                    >
                      <MousePointerClick className="h-6 w-6 drop-shadow-lg" />
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* ── 3-STEP PROCEDURAL GUIDE ───────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-4 px-1">
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">How it works</span>
                  <span className="h-px flex-1 bg-neutral-200" />
                  <span className="text-[11px] text-neutral-400 font-medium">3 simple steps</span>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    {
                      n: '01',
                      icon: Stethoscope,
                      tint: 'primary',
                      title: 'Choose your doctor',
                      desc: 'Browse our team by specialty — cardiology, dental, pediatrics and more. See reviews and availability at a glance.',
                      iconBg: 'bg-primary-50',
                      iconText: 'text-primary-600',
                      accent: 'text-primary-500',
                    },
                    {
                      n: '02',
                      icon: CalendarDays,
                      tint: 'amber',
                      title: 'Pick a time that works',
                      desc: 'Real-time slots across all days. Choose an in-person visit or a teleconsult from the comfort of your home.',
                      iconBg: 'bg-amber-50',
                      iconText: 'text-amber-600',
                      accent: 'text-amber-500',
                    },
                    {
                      n: '03',
                      icon: CheckCircle2,
                      tint: 'emerald',
                      title: "You're all set",
                      desc: 'Instant confirmation. We remind you before the visit and keep your records safe — nothing for you to track.',
                      iconBg: 'bg-emerald-50',
                      iconText: 'text-emerald-600',
                      accent: 'text-emerald-500',
                    },
                  ].map((s, i) => (
                    <motion.div
                      key={s.n}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                      className={`relative ${CARD} p-5 overflow-hidden group hover:shadow-[var(--shadow-md)] transition-all`}
                    >
                      {/* watermark number */}
                      <span className={`absolute -top-2 -right-1 text-6xl font-black font-display text-neutral-100 select-none leading-none pointer-events-none`}>
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

                      {/* connector arrow — desktop only */}
                      {i < 2 && (
                        <div className="hidden md:flex absolute top-10 -right-2 w-4 h-px items-center justify-end pointer-events-none">
                          <ChevronRight className="h-4 w-4 text-neutral-300" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* ── TRUST STRIP ───────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className={`${CARD} px-5 py-4`}
              >
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 justify-between">
                  {[
                    { icon: Shield, text: 'Private & encrypted', tint: 'text-primary-500' },
                    { icon: CheckCircle2, text: 'Instant confirmation', tint: 'text-emerald-500' },
                    { icon: RefreshCw, text: 'Reschedule any time', tint: 'text-amber-500' },
                    { icon: Video, text: 'In-person or video', tint: 'text-blue-500' },
                  ].map(({ icon: Ico, text, tint }) => (
                    <div key={text} className="inline-flex items-center gap-2">
                      <Ico className={`h-4 w-4 ${tint}`} />
                      <span className="text-xs font-medium text-neutral-600">{text}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => setIntentHubOpen(true)}
                    className="ml-auto text-xs font-semibold text-primary-700 hover:text-primary-800 inline-flex items-center gap-1 group"
                  >
                    Start now
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TOOLBAR ═══ */}
      {!showGuide && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* View tabs */}
          <div className="flex bg-neutral-100 rounded-xl p-1 gap-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  view === v.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="h-10 w-10 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 shadow-[var(--shadow-sm)] transition-all"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIntentHubOpen(true)}
              className="h-10 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all flex items-center gap-2"
            >
              <CalendarPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Book Appointment</span>
              <span className="sm:hidden">Book</span>
            </button>
          </div>
        </div>
      )}

      {/* ═══ LIST ═══ */}
      {showGuide ? null : loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <Shimmer className="h-3 w-24 mb-3" />
              <Shimmer className="h-32 w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={`${CARD} py-16 text-center`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-100 flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-neutral-300" />
          </div>
          <h3 className="text-base font-semibold text-neutral-700 mb-1">
            {view === 'upcoming' ? 'All clear' : view === 'cancelled' ? 'No cancellations' : 'No history yet'}
          </h3>
          <p className="text-sm text-neutral-400">
            {view === 'upcoming'
              ? 'You have no upcoming appointments scheduled'
              : view === 'cancelled'
                ? "You haven't cancelled any appointments"
                : 'Past appointments will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ dateKey, label, fullDate, weekday, appts }) => (
            <div key={dateKey}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  {label}
                </span>
                {label !== fullDate && (
                  <span className="text-[11px] text-neutral-400">
                    {weekday}, {fullDate}
                  </span>
                )}
                <span className="h-px flex-1 bg-neutral-200" />
                <span className="text-[11px] font-medium text-neutral-400">
                  {appts.length} appt{appts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {appts.map((appt) => {
                  const st = STATUS[appt.status] || STATUS.no_show;
                  const grad = avatarGradient(appt.doctor?._id);
                  const isActive = canAct(appt);

                  return (
                    <motion.div
                      key={appt._id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`group ${CARD} transition-all duration-200 ${
                        isActive
                          ? 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'
                          : 'opacity-80'
                      }`}
                    >
                      <div className="p-4 sm:p-5">
                        <div className="flex gap-4">
                          {/* Avatar */}
                          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shrink-0 shadow-sm`}>
                            <span className="text-white font-bold font-display text-base">
                              {(appt.doctor?.name || 'D')[0]}
                            </span>
                          </div>

                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-semibold text-neutral-900 truncate leading-tight">
                                    Dr. {stripDrPrefix(appt.doctor?.name) || 'Unknown'}
                                  </h4>
                                  {appt.type === 'teleconsult' && canJoin(appt) && (
                                    <PresenceChip
                                      status={doctorPresenceStatus(appt)}
                                      size="xs"
                                      showLabel={false}
                                      aria-label={`Doctor is ${doctorPresenceStatus(appt)}`}
                                    />
                                  )}
                                </div>
                                <p className="text-xs text-neutral-500 truncate">
                                  {appt.doctor?.specialization || appt.type?.replace(/_/g, ' ')}
                                </p>
                              </div>

                              {/* Status chip */}
                              <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${st.bg} ${st.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                            </div>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-neutral-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 text-neutral-400" />
                                {fmt.time(appt.scheduledAt)}
                              </span>
                              {appt.duration && (
                                <span className="inline-flex items-center gap-1">
                                  <Timer className="h-3 w-3 text-neutral-400" />
                                  {appt.duration}m
                                </span>
                              )}
                              {appt.doctor?.branch?.name && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-neutral-400" />
                                  {appt.doctor.branch.name}
                                </span>
                              )}
                              {appt.type === 'teleconsult' && (
                                <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                                  <Video className="h-3 w-3" />
                                  Video
                                </span>
                              )}
                            </div>

                            {appt.reason && (
                              <p className="mt-2 text-xs text-neutral-400 line-clamp-1 italic">
                                {appt.reason}
                              </p>
                            )}

                            {/* Attendance badge */}
                            {appt.patientConfirmation?.status === 'confirmed' && (
                              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                <CheckCircle2 className="h-3 w-3" /> Attendance confirmed
                              </div>
                            )}
                            {appt.patientConfirmation?.status === 'declined' && (
                              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                                <XCircle className="h-3 w-3" /> Declined
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action bar — for actionable + completed appointments */}
                      {(isActive || canJoin(appt) || needsConfirm(appt) || appt.status === 'completed') && (
                        <div className="px-4 sm:px-5 pb-4 pt-0">
                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-neutral-100">
                            {needsConfirm(appt) && (
                              <>
                                <button
                                  onClick={() => doConfirm(appt, 'confirmed')}
                                  disabled={confirmingId === appt._id}
                                  className="h-8 px-3.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all inline-flex items-center gap-1.5"
                                >
                                  {confirmingId === appt._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                  Confirm
                                </button>
                                <button
                                  onClick={() => doConfirm(appt, 'declined')}
                                  disabled={confirmingId === appt._id}
                                  className="h-8 px-3.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-all"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {canJoin(appt) && (() => {
                              const reachable = doctorIsReachable(appt);
                              return (
                                <button
                                  onClick={() => navigate(`/patient/video/${appt._id}`)}
                                  className={`h-8 px-3.5 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 ${
                                    reachable
                                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                  }`}
                                  title={reachable ? 'Doctor is online' : 'Doctor is offline — enter the waiting room'}
                                >
                                  <Video className="h-3 w-3" />
                                  {reachable ? 'Join' : 'Waiting Room'}
                                </button>
                              );
                            })()}

                            <span className="flex-1" />

                            {appt.status === 'completed' && (
                              <button
                                onClick={() => navigate(`/patient/consultation/${appt._id}`)}
                                className="h-8 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                View Consultation
                              </button>
                            )}
                            {canAct(appt) && (
                              <>
                                <button
                                  onClick={() => { setRescheduleAppt(appt); setNewDate(''); setNewTime(''); }}
                                  className="h-8 px-3 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg transition-all"
                                >
                                  Reschedule
                                </button>
                                <button
                                  onClick={() => setCancelAppt(appt)}
                                  className="h-8 px-3 text-xs font-medium text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE && (
        <Pagination page={page} limit={PAGE} total={total} onChange={setPage} />
      )}

      {/* ── Mobile FAB ────────────────────────────── */}
      {!showGuide && (
        <button
          onClick={() => setIntentHubOpen(true)}
          className="md:hidden fixed bottom-20 right-5 w-14 h-14 rounded-2xl bg-primary-600 text-white shadow-[0_6px_24px_-2px_rgba(46,106,184,.4)] flex items-center justify-center z-30 hover:bg-primary-700 active:scale-95 transition-all"
        >
          <CalendarPlus className="h-5 w-5" />
        </button>
      )}

      {/* ═══ CANCEL MODAL ═══ */}
      <Modal
        open={!!cancelAppt}
        onClose={() => setCancelAppt(null)}
        title="Cancel Appointment"
      >
        {cancelAppt && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${avatarGradient(cancelAppt.doctor?._id)} flex items-center justify-center shrink-0`}>
                <span className="text-white font-bold text-sm">{(cancelAppt.doctor?.name || 'D')[0]}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">Dr. {stripDrPrefix(cancelAppt.doctor?.name)}</p>
                <p className="text-xs text-neutral-500">{fmt.full(cancelAppt.scheduledAt)}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Reason *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why are you cancelling?"
                rows={3}
                className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 placeholder:text-neutral-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelAppt(null)} className="h-10 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">
                Keep It
              </button>
              <button
                onClick={doCancel}
                disabled={cancelling}
                className="h-10 px-5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Cancel Appointment
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ RESCHEDULE MODAL ═══ */}
      <Modal
        open={!!rescheduleAppt}
        onClose={() => setRescheduleAppt(null)}
        title="Reschedule Appointment"
      >
        {rescheduleAppt && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-50 border border-primary-100">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${avatarGradient(rescheduleAppt.doctor?._id)} flex items-center justify-center shrink-0`}>
                <span className="text-white font-bold text-sm">{(rescheduleAppt.doctor?.name || 'D')[0]}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">Dr. {stripDrPrefix(rescheduleAppt.doctor?.name)}</p>
                <p className="text-xs text-neutral-500">
                  Current: {fmt.full(rescheduleAppt.scheduledAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">New Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">New Time</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setRescheduleAppt(null)} className="h-10 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">
                Cancel
              </button>
              <button
                onClick={doReschedule}
                disabled={rescheduling || !newDate || !newTime}
                className="h-10 px-5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {rescheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                Reschedule
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ BOOKING WIZARD ═══ */}
      <BookingWizardModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        activePatientId={activePatientId}
        activePatient={activePatient}
        setToast={(t) => setToast({ ok: t.type === 'success', msg: t.message })}
        onBooked={refresh}
        intent={bookIntent}
      />

      {/* ═══ INTENT HUB ═══ */}
      <BookingIntentHub
        open={intentHubOpen}
        onClose={() => setIntentHubOpen(false)}
        onChoose={handleIntentChosen}
      />
    </div>
  );
}
