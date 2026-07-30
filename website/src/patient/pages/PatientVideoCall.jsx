/**
 * PatientVideoCall — production-grade redesign (Wave 2.7).
 *
 * Three phases, one stateful container:
 *   1. PRECALL  — device preflight (permission gate, mic meter, camera preview,
 *                 consent checkbox) before the patient commits to joining.
 *   2. INCALL   — full-bleed remote video with PiP self-view, floating HUD,
 *                 glass control bar, slide-over chat drawer with real-time
 *                 socket messages, live connection-quality bars, reconnecting
 *                 banner, 5-minute-to-expiry warning.
 *   3. POSTCALL — summary card (duration, notes preview if available),
 *                 5-star feedback + comment, "Back to appointments" CTA.
 *
 * The route parameter (historically `:appointmentId`) is treated as a
 * "mystery ID" — we try resolving it as a VideoSession _id first (fast path
 * when an IncomingCallOverlay navigates here), falling back to the legacy
 * appointment-based lookup.
 *
 * Wiring:
 *   - `useCallBridge` at PatientLayout level keeps `callStore.activeCall`
 *     in sync. We publish on join and clear on leave so <ActiveCallPill>
 *     works when the user navigates away.
 *   - Chat is delegated to <SessionChatThread> (socket + REST backfill +
 *     typing + read receipts + file share). No 3-second polling.
 *   - Lifecycle events (video:peer-joined / peer-left / call-ended) route
 *     through the shared `callLife` subscriber bus from lib/socket.
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, CameraOff, CheckCircle2,
  ChevronLeft, ChevronDown, Clock, FileText, Loader2,
  Maximize, MessageSquare, Mic, MicOff, Minimize, PhoneOff, Shield,
  Star, Video, VideoOff, X, Camera, TimerReset, Plus,
} from 'lucide-react';
import { useSafeTenantAuth, useSafePatientAuth } from '../../hooks/useSafeAuth';
import {
  getPatientVideoSession,
  listPatientVideoSessions,
  joinPatientVideoSession,
  endPatientVideoSession,
  cancelPatientVideoSession,
  updatePatientVideoConsent,
  sendPatientVideoMessage,
  getPatientVideoMessages,
  markVideoMessageRead,
  sharePatientVideoFile,
  extendPatientVideoSession,
  submitReview,
  setSuppressAuthRedirect,
} from '../api';
import {
  initSocket, joinVideoRoom, leaveVideoRoom,
  sendVideoOffer, sendVideoAnswer, sendIceCandidate,
  sendMediaToggle, videoRelay, callLife, chatBus,
} from '../../lib/socket';
import { SessionChatThread } from '../../lib/telemedicine/SessionChatThread';
import {
  setActiveCall, clearActiveCall,
} from '../../lib/telemedicine/callStore';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─────────────────────────────────────────────────────────────────
   Constants & small utilities
   ───────────────────────────────────────────────────────────────── */

const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const EXPIRY_WARNING_SEC = 300;     // 5-minute-before-expiry toast
const QUALITY_SAMPLE_MS = 2000;

const PHASES = {
  RESOLVING: 'resolving',
  WAITING:   'waiting',
  PRECALL:   'precall',
  INCALL:    'incall',
  POSTCALL:  'postcall',
  ERROR:     'error',
};

function padTwo(n) { return String(n).padStart(2, '0'); }

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${padTwo(m)}:${padTwo(s)}` : `${padTwo(m)}:${padTwo(s)}`;
}

/* ─────────────────────────────────────────────────────────────────
   Tiny toast bus (module-scoped — no lib dep)
   ───────────────────────────────────────────────────────────────── */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, tone = 'info', duration = 3800) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);
  return { toasts, push };
}

function ToastStack({ toasts }) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-[9000] -translate-x-1/2 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            `pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md
             ${t.tone === 'danger'  ? 'bg-rose-500/95 text-white'
               : t.tone === 'success' ? 'bg-emerald-500/95 text-white'
               : t.tone === 'warn'    ? 'bg-amber-500/95 text-white'
                                      : 'bg-neutral-900/95 text-white'}`
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Duration timer (display-only)
   ───────────────────────────────────────────────────────────────── */
function useLiveDuration(startedAt) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return elapsed;
}

/* ─────────────────────────────────────────────────────────────────
   Audio level meter — wraps a MediaStream and emits 0..1 amplitude
   ───────────────────────────────────────────────────────────────── */
function useAudioLevel(stream) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) { setLevel(0); return; }
    let cancelled = false;
    let ctx;
    let rafId;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        if (cancelled) return;
        analyser.getByteTimeDomainData(data);
        // RMS from centred samples
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 2.8));
        rafId = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* fail silently — meter is a nice-to-have */ }
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [stream]);
  return level;
}

/* ─────────────────────────────────────────────────────────────────
   Connection quality — polls RTCPeerConnection.getStats
   ───────────────────────────────────────────────────────────────── */
function useConnectionQuality(pcRef, isActive) {
  const [bars, setBars] = useState(0); // 0..4
  const [labelState, setLabelState] = useState('measuring');
  useEffect(() => {
    if (!isActive) { setBars(0); setLabelState('idle'); return; }
    let cancelled = false;
    const sample = async () => {
      const pc = pcRef.current;
      if (!pc || cancelled) return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        let packetLoss = 0;
        let packetsReceived = 0;
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime;
          }
          if (r.type === 'inbound-rtp' && !r.isRemote) {
            packetsReceived += (r.packetsReceived || 0);
            packetLoss += (r.packetsLost || 0);
          }
        });
        const lossRatio = packetsReceived > 0 ? packetLoss / (packetsReceived + packetLoss) : 0;
        const rttMs = rtt != null ? rtt * 1000 : 150;

        let next = 4;
        if (rttMs > 500 || lossRatio > 0.08) next = 1;
        else if (rttMs > 300 || lossRatio > 0.05) next = 2;
        else if (rttMs > 150 || lossRatio > 0.02) next = 3;
        if (!cancelled) {
          setBars(next);
          setLabelState(next >= 3 ? 'excellent' : next === 2 ? 'fair' : 'poor');
        }
      } catch { /* ignore */ }
    };
    sample();
    const iv = setInterval(sample, QUALITY_SAMPLE_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [pcRef, isActive]);
  return { bars, label: labelState };
}

/* ─────────────────────────────────────────────────────────────────
   Small presentational pieces
   ───────────────────────────────────────────────────────────────── */

function QualityBars({ bars }) {
  return (
    <div className="inline-flex items-end gap-[2px] h-4">
      {[1, 2, 3, 4].map((b) => (
        <span
          key={b}
          className={`w-[3px] rounded-sm transition-colors ${
            b <= bars
              ? b <= 2 ? 'bg-amber-400' : 'bg-emerald-400'
              : 'bg-white/20'
          }`}
          style={{ height: `${25 * b}%` }}
        />
      ))}
    </div>
  );
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          type="button"
          className="p-1 transition-transform hover:scale-110"
          aria-label={`${n} stars`}
        >
          <Star
            className={`h-8 w-8 ${
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Phase: RESOLVING / WAITING / ERROR shell
   ───────────────────────────────────────────────────────────────── */

function CenteredShell({ children }) {
  return (
    <div className="relative flex min-h-[calc(100vh-7rem)] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary-50 via-white to-secondary-50 p-6">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary-200/30 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────── */

export default function PatientVideoCall() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  /**
   * Stamped by IncomingCallOverlay each time a call is accepted. Accepting a
   * call while already sitting on this route is a no-op navigation — same path,
   * no remount — so without this the page stayed on the post-call screen and
   * the call module never rendered. Re-running session resolution on a fresh
   * timestamp pulls the phase back out of POSTCALL.
   */
  const acceptedAt = location.state?.acceptedAt;
  const { user } = useSafeTenantAuth();
  const { activePatientId, activePatient } = useSafePatientAuth();

  const { toasts, push: pushToast } = useToasts();

  /**
   * Own user id, kept in a ref because the socket listeners below intentionally
   * do NOT re-subscribe when `user` changes. TenantAuthContext starts `user` as
   * null and fills it from localStorage in an effect, so a listener that closed
   * over `user` directly compared against undefined forever — which made the
   * "ignore my own media-state echo" guard never fire, so muting your own mic
   * lit up the *remote* muted badge with the peer's name.
   */
  const selfIdRef = useRef(null);
  useEffect(() => { selfIdRef.current = user?._id || user?.id || null; }, [user]);

  // ── Core state ────────────────────────────────────────────────
  const [phase, setPhase]             = useState(PHASES.RESOLVING);
  const [error, setError]             = useState('');
  const [session, setSession]         = useState(null);
  const [roomData, setRoomData]       = useState(null);
  const [connState, setConnState]     = useState('idle'); // idle | connecting | connected | reconnecting | disconnected
  const [peerJoined, setPeerJoined]   = useState(false);

  // Precall/device test state
  const [previewStream, setPreviewStream] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [consent, setConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  // Media state
  const [audioOn, setAudioOn]               = useState(true);
  const [videoOn, setVideoOn]               = useState(true);
  const [peerAudioOn, setPeerAudioOn]       = useState(true);
  const [peerVideoOn, setPeerVideoOn]       = useState(true);

  // Chat
  const [chatOpen, setChatOpen]             = useState(false);
  const [unreadChat, setUnreadChat]         = useState(0);

  // End confirmation + device selection
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [devices, setDevices]               = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic]       = useState('');
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const [extending, setExtending]           = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [disconnectedFatal, setDisconnectedFatal] = useState(false);

  // PostCall
  const [callEndedAt, setCallEndedAt]       = useState(null);
  const [callStartedAt, setCallStartedAt]   = useState(null);
  const [leaveReason, setLeaveReason]       = useState('');
  const [rating, setRating]                 = useState(0);
  const [review, setReview]                 = useState('');
  const [submittedReview, setSubmittedReview] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  /**
   * Bumped every time localStreamRef is (re)assigned. localStreamRef is a ref,
   * so binding it to the <video> element cannot be driven off the ref alone —
   * an effect keyed only on `phase` runs once and, if the stream is not ready
   * yet, never retries, leaving the self-view black.
   */
  const [localStreamVersion, setLocalStreamVersion] = useState(0);

  // ── Refs (non-reactive bookkeeping) ───────────────────────────
  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  const remoteStreamRef  = useRef(null);
  const previewVideoRef  = useRef(null);
  const pcRef            = useRef(null);
  const localStreamRef   = useRef(null);
  const roomIdRef        = useRef(null);
  const reconnectTimer   = useRef(null);
  const reconnectCount   = useRef(0);
  const videoUnsubRef    = useRef(null);
  const lifeUnsubRef     = useRef(null);
  const pollTimerRef     = useRef(null);
  const expiryWarnFired  = useRef(false);
  const pendingCandidatesRef = useRef([]);

  const previewLevel = useAudioLevel(previewStream);
  const { bars: qualityBars, label: qualityLabel } = useConnectionQuality(pcRef, phase === PHASES.INCALL);
  const sessionId = session?._id || null;
  const liveDuration = useLiveDuration(callStartedAt);
  const doctorDisplay = session?.doctor?.name ? `Dr. ${stripDrPrefix(session.doctor.name)}` : 'Your Doctor';

  // ── Chat API prop for <SessionChatThread> ─────────────────────
  const chatApi = useMemo(() => ({
    list:      getPatientVideoMessages,
    send:      sendPatientVideoMessage,
    markRead:  markVideoMessageRead,
    shareFile: sharePatientVideoFile,
  }), []);

  /* ═══════════════════════════════════════════════════════════════
     Session resolution
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!appointmentId) {
      setError('Missing consultation reference.');
      setPhase(PHASES.ERROR);
      return undefined;
    }

    let cancelled = false;

    const tryResolve = async () => {
      // 1) Fast path — treat param as VideoSession _id directly.
      try {
        const direct = await getPatientVideoSession(appointmentId);
        if (cancelled) return;
        const s = direct?.data || direct;
        if (s?._id) {
          setSession(s);
          setPhase(
            ['ended', 'cancelled', 'expired'].includes(s.status)
              ? PHASES.POSTCALL
              : PHASES.PRECALL,
          );
          if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
          return;
        }
      } catch { /* fall through to legacy path */ }

      // 2) Legacy path — look up by appointment id.
      if (!activePatientId) return;
      try {
        const res = await listPatientVideoSessions(activePatientId, { appointment: appointmentId });
        if (cancelled) return;
        const list = res?.data?.items || res?.data || res?.items || [];
        const active = list.find((s) => !['ended', 'cancelled', 'expired'].includes(s.status));

        if (active) {
          setSession(active);
          setPhase(PHASES.PRECALL);
          if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
        } else {
          setPhase(PHASES.WAITING);
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(() => {
              if (!cancelled) tryResolve();
            }, 5000);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Unable to load consultation.');
        setPhase(PHASES.ERROR);
      }
    };

    tryResolve();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };
  }, [appointmentId, activePatientId, acceptedAt]);

  /* ═══════════════════════════════════════════════════════════════
     Preview stream lifecycle (PRECALL only)
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASES.PRECALL) return undefined;
    let cancelled = false;
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setPreviewStream(stream);
        setPermissionError('');
        // Note: previewVideoRef.current is null here because the <video> is
        // conditionally rendered on previewStream. A separate useEffect below
        // handles connecting srcObject after React re-renders the element.
        // Enumerate available devices for picker
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices({
            cameras: devs.filter((d) => d.kind === 'videoinput'),
            mics: devs.filter((d) => d.kind === 'audioinput'),
          });
        } catch { /* best-effort */ }
      } catch (err) {
        if (cancelled) return;
        setPermissionError(err.message || 'Camera/microphone access blocked.');
      }
    })();
    return () => {
      cancelled = true;
      // Only stop tracks if the stream was NOT handed off to the live call
      if (stream && stream !== localStreamRef.current) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setPreviewStream(null);
    };
  }, [phase]);

  // Sync previewStream to the video element after React renders the conditional <video>
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Sync local stream to the INCALL PiP video element.
  // Keyed on localStreamVersion as well as phase: on a reconnect the phase does
  // not change, and if getUserMedia resolves after the phase flip then a
  // phase-only effect would have already run against a null stream.
  useEffect(() => {
    if (phase === PHASES.INCALL && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [phase, localStreamVersion]);

  /**
   * Callback ref for the PiP <video>. Binds the stream the instant the node
   * mounts, so the mount-vs-stream ordering never matters.
   */
  const attachLocalVideo = useCallback((node) => {
    localVideoRef.current = node;
    if (node && localStreamRef.current && node.srcObject !== localStreamRef.current) {
      node.srcObject = localStreamRef.current;
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     Active-call bookkeeping for <ActiveCallPill>
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase === PHASES.INCALL && sessionId) {
      setActiveCall({
        sessionId,
        roomId: roomIdRef.current,
        peerName: doctorDisplay,
        peerRole: 'doctor',
        startedAt: callStartedAt || Date.now(),
        type: session?.type || 'video',
        routePath: `/patient/video/${appointmentId}`,
      });
    }
    return () => {
      if (phase !== PHASES.INCALL) clearActiveCall();
    };
  }, [phase, sessionId, doctorDisplay, callStartedAt, appointmentId, session?.type]);

  /* ═══════════════════════════════════════════════════════════════
     5-minute-before-expiry warning
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASES.INCALL) return undefined;
    if (!session?.expiresAt) return undefined;
    expiryWarnFired.current = false;
    const iv = setInterval(() => {
      const remaining = new Date(session.expiresAt).getTime() - Date.now();
      if (remaining <= EXPIRY_WARNING_SEC * 1000 && !expiryWarnFired.current) {
        expiryWarnFired.current = true;
        setShowExpiryBanner(true);
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [phase, session?.expiresAt]);

  const handleExtendSession = async () => {
    if (!session?._id) return;
    setExtending(true);
    try {
      await extendPatientVideoSession(session._id);
      pushToast('Session extended by 15 minutes.', 'success', 4000);
      setShowExpiryBanner(false);
      expiryWarnFired.current = false;
      setSession((prev) => prev ? { ...prev, extensions: (prev.extensions || 0) + 1 } : prev);
    } catch (err) {
      pushToast(err?.message || 'Failed to extend session.', 'danger', 4000);
    } finally {
      setExtending(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     Socket lifecycle subscribers (peer events + call-ended)
     ═══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASES.INCALL) return undefined;
    const offLife = callLife.on((evt, payload) => {
      if (!roomIdRef.current) return;
      if (payload?.roomId && payload.roomId !== roomIdRef.current) return;
      switch (evt) {
        case 'video:peer-joined':
          setPeerJoined(true);
          setConnState((prev) => prev === 'reconnecting' ? 'connected' : 'connecting');
          setSession((prev) => prev && prev.status === 'waiting' ? { ...prev, status: 'active' } : prev);
          pushToast(`${doctorDisplay} joined`, 'success');
          break;
        case 'video:peer-left': {
          const isTransient = payload?.reason === 'disconnect';
          if (isTransient) {
            setPeerJoined(false);
            setConnState('reconnecting');
            pushToast(`${doctorDisplay} temporarily disconnected — reconnecting…`, 'warn');
          } else {
            setPeerJoined(false);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            remoteStreamRef.current = null;
            pushToast(`${doctorDisplay} left the call`, 'warn');
          }
          break;
        }
        case 'video:call-ended':
          // Guard against duplicate call-ended events triggering double transition
          if (phase === PHASES.POSTCALL) break;
          setLeaveReason(payload?.endedBy === 'emergency-closed'
            ? 'The emergency was closed by the doctor.'
            : 'The consultation has ended.');
          goToPostCall(payload?.durationSec);
          break;
        case 'video:media-state':
          // Ignore own media-state echo (io.to sends to everyone including sender)
          if (payload?.userId && String(payload.userId) === String(selfIdRef.current)) break;
          if (payload?.audio != null) setPeerAudioOn(!!payload.audio);
          if (payload?.video != null) setPeerVideoOn(!!payload.video);
          break;
        case 'video:reconnecting':
          setConnState('reconnecting');
          break;
        default: break;
      }
    });
    lifeUnsubRef.current = offLife;
    return () => { offLife(); lifeUnsubRef.current = null; };
  }, [phase, doctorDisplay, pushToast]);

  /* ═══════════════════════════════════════════════════════════════
     Join / leave — WebRTC orchestration
     ═══════════════════════════════════════════════════════════════ */

  const setupPeerConnection = useCallback((data) => {
    // Close previous peer connection before creating a new one (prevents leaks on reconnect)
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* already closed */ }
    }

    const iceConfig = data.iceServers?.length ? { iceServers: data.iceServers } : DEFAULT_ICE_CONFIG;
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;

    // Attach local tracks (use the media stream we're already previewing
    // when available; otherwise getUserMedia a fresh one).
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        sendIceCandidate(roomIdRef.current, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') setConnState('connected');
      else if (s === 'connecting') setConnState('connecting');
      else if (s === 'failed' || s === 'disconnected') {
        setConnState('reconnecting');
        scheduleReconnect();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnState('connected');
      }
    };

    // WebRTC signaling relay (legacy-named events)
    if (videoUnsubRef.current) videoUnsubRef.current();
    videoUnsubRef.current = videoRelay.on(async (eventName, payload) => {
      const curr = pcRef.current;
      if (!curr) return;
      const room = roomIdRef.current;
      try {
        switch (eventName) {
          case 'video:user-joined': {
            // Only create offer on user-joined (sent to others only — no self-echo).
            // Guard: skip if we already have a pending local description (glare prevention).
            if (curr.signalingState !== 'stable') {
              console.warn('[WebRTC] Skipping offer — signalingState:', curr.signalingState);
              break;
            }
            const offer = await curr.createOffer();
            await curr.setLocalDescription(offer);
            sendVideoOffer(room, offer);
            break;
          }
          case 'video:peer-joined': {
            // peer-joined is broadcast to everyone (including self) via io.to().
            // Do NOT create an offer here — video:user-joined already handles it.
            break;
          }
          case 'video:offer': {
            await curr.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await curr.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
            const answer = await curr.createAnswer();
            await curr.setLocalDescription(answer);
            sendVideoAnswer(room, answer);
            break;
          }
          case 'video:answer': {
            await curr.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await curr.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
            break;
          }
          case 'video:ice-candidate': {
            if (payload?.candidate) {
              const candidate = new RTCIceCandidate(payload.candidate);
              if (!curr.remoteDescription) {
                pendingCandidatesRef.current.push(candidate);
              } else {
                await curr.addIceCandidate(candidate);
              }
            }
            break;
          }
          case 'video:user-left':
          case 'video:peer-left': {
            // Transient socket disconnects — peer will auto-rejoin; keep the
            // WebRTC connection alive and just show a reconnecting state.
            const isTransient = payload?.reason === 'disconnect';
            if (isTransient) {
              setPeerJoined(false);
              setConnState('reconnecting');
            } else {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              remoteStreamRef.current = null;
              setPeerJoined(false);
            }
            break;
          }
          case 'video:toggle-media':
          case 'video:media-state': {
            // Guard: ignore own media-state echo
            if (payload?.userId && String(payload.userId) === String(selfIdRef.current)) break;
            if (payload?.mediaType === 'audio') setPeerAudioOn(!!payload.enabled);
            if (payload?.mediaType === 'video') setPeerVideoOn(!!payload.enabled);
            // Also handle normalized form from video:media-state
            if (payload?.audio != null) setPeerAudioOn(!!payload.audio);
            if (payload?.video != null) setPeerVideoOn(!!payload.video);
            break;
          }
          case 'video:session-extended': {
            setSession((prev) => prev ? { ...prev, expiresAt: payload.expiresAt, maxDuration: payload.maxDuration, extensions: payload.extensionsUsed } : prev);
            expiryWarnFired.current = false;
            setShowExpiryBanner(false);
            pushToast('Session extended — more time has been added.', 'success', 5000);
            break;
          }
          case 'video:error': {
            pushToast(payload?.message || 'Connection error', 'danger');
            break;
          }
          default: break;
        }
      } catch (err) {
        console.error('[WebRTC]', eventName, err);
      }
    });
  }, [pushToast]);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (reconnectCount.current >= MAX_RECONNECT_ATTEMPTS) {
      setDisconnectedFatal(true);
      setConnState('disconnected');
      return;
    }
    const attempt = reconnectCount.current;
    const delay = Math.min(3000 * Math.pow(1.5, attempt), 15000);
    reconnectCount.current = attempt + 1;
    setConnState('reconnecting');
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      handleJoin(true)
        .then(() => { reconnectCount.current = 0; setDisconnectedFatal(false); })
        .catch(() => {});
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual rejoin (after auto-reconnect exhausted) ──
  const handleRejoin = useCallback(async () => {
    setDisconnectedFatal(false);
    setError('');
    reconnectCount.current = 0;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    try {
      await handleJoin(true);
    } catch (err) {
      setError(err.message || 'Rejoin failed. Please try again.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = useCallback(async (isReconnect = false) => {
    if (!sessionId) return;
    try {
      setError('');
      // Claim preview stream as the active local stream (avoid re-prompting).
      if (previewStream && !localStreamRef.current) {
        localStreamRef.current = previewStream;
      }
      // If we don't have local media yet (e.g. reconnect after teardown), grab it.
      if (!localStreamRef.current) {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = s;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      // Tell the sync effect the stream is available, in case the PiP element
      // mounts (or the phase flips) before this point.
      setLocalStreamVersion((v) => v + 1);

      const res = await joinPatientVideoSession(sessionId);
      const data = res?.data || res;
      setRoomData(data);
      roomIdRef.current = data.roomId;

      // Merge any updated session fields
      setSession((prev) => ({ ...prev, ...(data.session || {}) }));
      setCallStartedAt(data.session?.startedAt || Date.now());

      initSocket();
      setupPeerConnection(data);
      joinVideoRoom(data.roomId, data.token, data.iv);

      if (!isReconnect) {
        setPhase(PHASES.INCALL);
        setSuppressAuthRedirect(true); // prevent 401 hard-redirect during call
      }
      setConnState('connecting');
    } catch (err) {
      setError(err.message || 'Failed to join consultation.');
      if (!isReconnect) setPhase(PHASES.ERROR);
    }
  }, [sessionId, previewStream, setupPeerConnection]);

  // Sync remote stream to the video element after phase transitions.
  // Covers the race where pc.ontrack fires before React renders <video>.
  useEffect(() => {
    if (phase === PHASES.INCALL && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [phase]);

  const teardown = useCallback(() => {
    if (roomIdRef.current) { leaveVideoRoom(roomIdRef.current); roomIdRef.current = null; }
    if (videoUnsubRef.current) { videoUnsubRef.current(); videoUnsubRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    clearActiveCall();
    setSuppressAuthRedirect(false); // re-enable 401 redirect after call ends
  }, []);

  const goToPostCall = useCallback((serverDurationSec) => {
    setCallEndedAt(Date.now());
    if (serverDurationSec && !callStartedAt) {
      setCallStartedAt(Date.now() - serverDurationSec * 1000);
    }
    teardown();
    setPhase(PHASES.POSTCALL);
  }, [callStartedAt, teardown]);

  // ── Switch Device ────────────────────────────
  const switchDevice = async (kind, deviceId) => {
    if (kind === 'videoinput') setSelectedCamera(deviceId);
    else setSelectedMic(deviceId);
    try {
      const constraints = kind === 'videoinput'
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: false, audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getTracks()[0];
      const stream = localStreamRef.current || previewStream;
      if (!stream) { newTrack.stop(); return; }
      const oldTrack = stream.getTracks().find((t) => t.kind === newTrack.kind);
      if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
      stream.addTrack(newTrack);
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === newTrack.kind);
        if (sender) sender.replaceTrack(newTrack);
      }
      if (kind === 'videoinput') {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream;
      }
    } catch { /* device switch failed */ }
  };

  const handleEnd = useCallback(async () => {
    try {
      if (sessionId) await endPatientVideoSession(sessionId, {});
    } catch (err) {
      console.warn('End session failed:', err.message || err);
    }
    setLeaveReason('You ended the consultation.');
    goToPostCall();
  }, [sessionId, goToPostCall]);

  const handleCancelBeforeJoin = useCallback(async () => {
    if (!sessionId) { navigate('/patient/appointments'); return; }
    try { await cancelPatientVideoSession(sessionId, 'Patient cancelled before join'); } catch { /* ignore */ }
    teardown();
    navigate('/patient/appointments');
  }, [sessionId, navigate, teardown]);

  // Final unmount safety
  useEffect(() => () => teardown(), [teardown]);

  /* ═══════════════════════════════════════════════════════════════
     Media toggles
     ═══════════════════════════════════════════════════════════════ */
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const tracks = localStreamRef.current.getAudioTracks();
    if (!tracks.length) return;
    const next = !audioOn;
    tracks.forEach((t) => { t.enabled = next; });
    setAudioOn(next);
    if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'audio', next);
  }, [audioOn]);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const tracks = localStreamRef.current.getVideoTracks();
    if (!tracks.length) return;
    const next = !videoOn;
    tracks.forEach((t) => { t.enabled = next; });
    setVideoOn(next);
    if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'video', next);
  }, [videoOn]);

  /* ═══════════════════════════════════════════════════════════════
     Consent handling
     ═══════════════════════════════════════════════════════════════ */
  const handleConsentChange = useCallback(async (next) => {
    if (!sessionId) { setConsent(next); return; }
    setSavingConsent(true);
    try {
      await updatePatientVideoConsent(sessionId, { consent: next });
      setConsent(next);
    } catch (err) {
      pushToast(err.message || 'Could not update consent', 'danger');
    } finally {
      setSavingConsent(false);
    }
  }, [sessionId, pushToast]);

  /* ═══════════════════════════════════════════════════════════════
     Chat drawer — increment unread when closed
     ═══════════════════════════════════════════════════════════════ */
  const handleChatOpen = useCallback(() => { setChatOpen(true); setUnreadChat(0); }, []);
  const handleChatClose = useCallback(() => setChatOpen(false), []);

  // Track incoming chat while drawer is closed — bumps the unread badge.
  useEffect(() => {
    if (phase !== PHASES.INCALL) return undefined;
    const off = chatBus.on((evt, payload) => {
      if (evt !== 'chat:message') return;
      if (payload?.session && payload.session !== sessionId) return;
      if (payload?.sender === user?.id) return;
      if (!chatOpen) setUnreadChat((n) => n + 1);
    });
    return () => off();
  }, [phase, chatOpen, sessionId, user?.id]);

  /* ═══════════════════════════════════════════════════════════════
     Review submission
     ═══════════════════════════════════════════════════════════════ */
  const handleSubmitReview = useCallback(async () => {
    if (!rating || !activePatientId) return;
    setSubmittingReview(true);
    try {
      await submitReview(activePatientId, {
        rating,
        comment: review.trim(),
        context: 'teleconsult',
        referenceId: sessionId,
      });
      setSubmittedReview(true);
    } catch (err) {
      pushToast(err.message || 'Could not submit review', 'danger');
    } finally {
      setSubmittingReview(false);
    }
  }, [rating, review, sessionId, activePatientId, pushToast]);

  /* ═════════════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════════════ */

  /* ── RESOLVING ───────────────────────────────────────────────── */
  if (phase === PHASES.RESOLVING) {
    return (
      <CenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-neutral-600">Loading your consultation…</p>
        </div>
      </CenteredShell>
    );
  }

  /* ── ERROR ───────────────────────────────────────────────────── */
  if (phase === PHASES.ERROR) {
    return (
      <CenteredShell>
        <div className="rounded-3xl border border-rose-200/60 bg-white/90 p-8 text-center shadow-xl shadow-rose-500/5 backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
            <AlertCircle className="h-7 w-7 text-rose-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-neutral-900">Couldn't start consultation</h2>
          <p className="mt-2 text-sm text-neutral-500">{error}</p>
          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to appointments
          </button>
        </div>
      </CenteredShell>
    );
  }

  /* ── WAITING ─────────────────────────────────────────────────── */
  if (phase === PHASES.WAITING) {
    return (
      <CenteredShell>
        <div className="rounded-3xl border border-primary-200/60 bg-white/90 p-8 text-center shadow-xl shadow-primary-500/10 backdrop-blur">
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary-300/40" />
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/30">
              <Video className="h-9 w-9" />
            </div>
          </div>
          <h2 className="font-display text-xl font-bold text-neutral-900">Waiting for your doctor</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
            Your consultation hasn't started yet. We'll move you into the waiting
            room the moment it's ready.
          </p>
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3.5 py-1.5 text-xs font-medium text-primary-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Listening for updates…
          </div>
          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 block w-full text-sm text-neutral-400 transition hover:text-neutral-600"
          >
            ← Back to appointments
          </button>
        </div>
      </CenteredShell>
    );
  }

  /* ── PRECALL ─────────────────────────────────────────────────── */
  if (phase === PHASES.PRECALL) {
    const meterBars = 20;
    const active = Math.round(previewLevel * meterBars);
    return (
      <>
        <ToastStack toasts={toasts} />
        <CenteredShell>
          <div className="w-full rounded-3xl border border-neutral-200 bg-white/95 p-6 shadow-2xl shadow-primary-500/5 backdrop-blur">
            <div className="mb-5 flex items-start gap-3">
              <button
                onClick={() => navigate('/patient/appointments')}
                className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-500">
                  Device check
                </p>
                <h2 className="mt-0.5 font-display text-xl font-bold text-neutral-900">
                  Ready to meet {doctorDisplay}?
                </h2>
                {session?.reason && (
                  <p className="mt-1 text-sm italic text-neutral-500 line-clamp-2">
                    "{session.reason}"
                  </p>
                )}
              </div>
            </div>

            {/* Camera preview */}
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900 shadow-inner">
              {previewStream && (
                <video
                  ref={previewVideoRef}
                  autoPlay playsInline muted
                  className="h-full w-full object-cover"
                />
              )}
              {!previewStream && !permissionError && (
                <div className="flex h-full items-center justify-center text-sm text-white/60">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initialising…
                </div>
              )}
              {permissionError && (
                <div className="flex h-full items-center justify-center bg-neutral-900/95 px-6 text-center">
                  <div>
                    <CameraOff className="mx-auto mb-2 h-8 w-8 text-rose-400" />
                    <p className="text-sm text-white/80">{permissionError}</p>
                    <p className="mt-1 text-xs text-white/50">
                      Allow camera & microphone access in your browser.
                    </p>
                  </div>
                </div>
              )}

              {/* You badge */}
              {previewStream && (
                <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                  You · {activePatient?.name?.split(' ')[0] || 'Patient'}
                </div>
              )}
            </div>

            {/* Audio meter */}
            <div className="mt-4 flex items-center gap-3">
              <Mic className="h-4 w-4 text-neutral-400" />
              <div className="flex flex-1 items-center gap-[3px]">
                {Array.from({ length: meterBars }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 flex-1 rounded-sm transition-all ${
                      i < active
                        ? i < meterBars * 0.6
                          ? 'bg-emerald-400'
                          : i < meterBars * 0.85
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        : 'bg-neutral-200'
                    }`}
                  />
                ))}
              </div>
              <span className="w-20 text-right text-[11px] font-medium tabular-nums text-neutral-400">
                {previewLevel > 0.02 ? 'Voice detected' : 'Speak to test'}
              </span>
            </div>

            {/* Device selectors */}
            {(devices.cameras.length > 1 || devices.mics.length > 1) && (
              <div className="mt-4 space-y-2">
                {devices.cameras.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-neutral-400 shrink-0" />
                    <div className="relative flex-1">
                      <select
                        value={selectedCamera}
                        onChange={(e) => switchDevice('videoinput', e.target.value)}
                        className="w-full appearance-none bg-white border border-neutral-200 text-neutral-700 text-xs rounded-lg px-3 py-2 pr-8 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {devices.cameras.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                )}
                {devices.mics.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-neutral-400 shrink-0" />
                    <div className="relative flex-1">
                      <select
                        value={selectedMic}
                        onChange={(e) => switchDevice('audioinput', e.target.value)}
                        className="w-full appearance-none bg-white border border-neutral-200 text-neutral-700 text-xs rounded-lg px-3 py-2 pr-8 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {devices.mics.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Consent */}
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200/70 bg-neutral-50/60 p-3.5 transition hover:border-primary-300 hover:bg-primary-50/40">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => handleConsentChange(e.target.checked)}
                disabled={savingConsent}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                  <Shield className="h-4 w-4 text-primary-600" />
                  I consent to session recording
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                  Your doctor may save this session for your medical record. You can revoke this
                  anytime from your consents page.
                </p>
              </div>
            </label>

            {/* CTAs */}
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleCancelBeforeJoin}
                className="flex-1 rounded-xl border border-neutral-200 bg-white py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleJoin(false)}
                disabled={!previewStream}
                className="flex-[2] rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:shadow-xl disabled:opacity-50 disabled:shadow-none"
              >
                Join consultation
              </button>
            </div>

            {error && (
              <p className="mt-3 text-center text-sm text-rose-600">{error}</p>
            )}
          </div>
        </CenteredShell>
      </>
    );
  }

  /* ── POSTCALL ────────────────────────────────────────────────── */
  if (phase === PHASES.POSTCALL) {
    const dur = callStartedAt && callEndedAt
      ? Math.max(0, Math.floor((callEndedAt - (typeof callStartedAt === 'number' ? callStartedAt : new Date(callStartedAt).getTime())) / 1000))
      : (session?.duration || 0);

    return (
      <CenteredShell>
        <div className="w-full rounded-3xl border border-neutral-200 bg-white/95 p-7 shadow-2xl shadow-primary-500/5 backdrop-blur">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-neutral-900">
              Consultation complete
            </h2>
            <p className="mt-1 text-sm text-neutral-500">{leaveReason || 'The consultation has ended.'}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-neutral-50 p-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                Duration
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-neutral-900">
                {formatDuration(dur)}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-50 p-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                With
              </p>
              <p className="mt-1 line-clamp-1 text-sm font-bold text-neutral-900">
                {doctorDisplay}
              </p>
              {session?.doctor?.specialization && (
                <p className="line-clamp-1 text-[11px] text-neutral-400">
                  {session.doctor.specialization}
                </p>
              )}
            </div>
          </div>

          {session?.notes && (
            <div className="mt-4 rounded-2xl border border-primary-100 bg-primary-50/40 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-700">
                <FileText className="h-3.5 w-3.5" /> Doctor notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 line-clamp-6">
                {session.notes}
              </p>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold text-neutral-900">Rate your experience</p>
            {submittedReview ? (
              <p className="mt-2 text-sm text-emerald-600">Thanks for your feedback!</p>
            ) : (
              <>
                <div className="mt-2 flex justify-center">
                  <StarRating value={rating} onChange={setRating} />
                </div>
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Share how the consultation went (optional)"
                  rows={3}
                  className="mt-3 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button
                  onClick={handleSubmitReview}
                  disabled={!rating || submittingReview}
                  className="mt-3 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting…' : 'Submit feedback'}
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Back to appointments
          </button>
        </div>
      </CenteredShell>
    );
  }

  /* ── INCALL ──────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[9999] flex bg-neutral-950 overflow-hidden text-white">
      <ToastStack toasts={toasts} />

      {/* ── Main Video Area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/80">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${connState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'} ${connState !== 'connected' ? 'animate-pulse' : ''}`} />
            <span className="text-sm text-white/70 truncate">{doctorDisplay}</span>
            {session?.doctor?.specialization && (
              <span className="hidden text-xs text-white/50 md:inline flex-shrink-0">{'\u00b7'} {session.doctor.specialization}</span>
            )}
            <span className="text-[10px] text-white/40 flex-shrink-0">
              {session?.type === 'emergency' ? 'Emergency' : 'Consultation'}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[11px] backdrop-blur-sm">
              <Clock className="h-3 w-3 text-white/70" />
              <span className="tabular-nums">{formatDuration(liveDuration)}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
              <QualityBars bars={qualityBars} />
              <span className="text-[11px] capitalize text-white/60">{qualityLabel}</span>
            </div>
          </div>
        </div>

        {/* Reconnecting banner */}
        {connState === 'reconnecting' && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting to call
          </div>
        )}

        {/* Video Grid */}
        <div className="flex-1 relative min-h-0">
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-neutral-900"
          />

          {/* Disconnected — manual rejoin overlay */}
          {disconnectedFatal && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/90 backdrop-blur-sm">
              <div className="text-center max-w-xs">
                <VideoOff className="h-12 w-12 text-red-400 mx-auto mb-3" />
                <p className="text-white text-lg font-semibold">Connection lost</p>
                <p className="text-white/60 text-sm mt-2 mb-5">
                  Unable to reconnect automatically. The session is still active.
                </p>
                <button
                  onClick={handleRejoin}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow-lg transition-all"
                >
                  <Video className="h-4 w-4" />
                  Rejoin Call
                </button>
                <button
                  onClick={handleEnd}
                  className="block mx-auto mt-3 text-sm text-white/50 hover:text-white/80 transition"
                >
                  Leave Instead
                </button>
              </div>
            </div>
          )}

          {/* Waiting / connecting overlay */}
          {(!peerJoined || connState !== 'connected') && !disconnectedFatal && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
              <div className="text-center">
                <div className="relative mx-auto mb-5 h-24 w-24">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary-400/30" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 shadow-xl">
                    <Video className="h-10 w-10 text-white" />
                  </div>
                </div>
                <p className="font-display text-lg font-semibold">
                  {connState === 'reconnecting' ? 'Reconnecting\u2026' : `Waiting for ${doctorDisplay}`}
                </p>
                <p className="mt-1 text-sm text-white/50">
                  {connState === 'reconnecting'
                    ? 'Hang tight, we\u2019re restoring your connection.'
                    : 'They should join any moment now.'}
                </p>
              </div>
            </div>
          )}

          {/* Camera off overlay */}
          {peerJoined && !peerVideoOn && connState === 'connected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/85">
              <div className="text-center">
                <div className="mx-auto mb-3 w-20 h-20 rounded-full bg-white/10 ring-2 ring-white/15 flex items-center justify-center">
                  <CameraOff className="h-8 w-8 text-white/50" />
                </div>
                <p className="text-white/70 text-sm font-medium">{doctorDisplay}{'\u2019'}s camera is off</p>
                <p className="text-white/40 text-xs mt-1">Audio is still active</p>
              </div>
            </div>
          )}

          {/* Remote muted badge */}
          {peerJoined && !peerAudioOn && connState === 'connected' && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/80 text-white text-xs">
              <MicOff className="h-3.5 w-3.5" /> Muted
            </div>
          )}

          {/* Expiry banner */}
          {showExpiryBanner && (
            <div className="absolute top-16 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4">
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/95 px-3 py-2 text-white text-xs font-medium shadow-lg ring-1 ring-amber-300/30 backdrop-blur-md">
                <TimerReset className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Session ends in under 5 minutes.</span>
                {(session?.extensions || 0) < 2 && (
                  <button
                    type="button"
                    onClick={handleExtendSession}
                    disabled={extending}
                    className="flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50"
                  >
                    {extending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Extend 15 min
                  </button>
                )}
                <button type="button" onClick={() => setShowExpiryBanner(false)} className="text-white/80 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Local Video (PiP) */}
          <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-neutral-900">
            <video
              ref={attachLocalVideo}
              autoPlay playsInline muted
              className="w-full h-full object-cover"
            />
            {!videoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary-800">
                <CameraOff className="h-6 w-6 text-white/40" />
              </div>
            )}
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium">
              You
              {!audioOn && <MicOff className="h-2.5 w-2.5 text-rose-400" />}
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 bg-neutral-900/80">
          {/* Audio */}
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition ${audioOn ? 'bg-primary-800 hover:bg-primary-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
            title={audioOn ? 'Mute' : 'Unmute'}
          >
            {audioOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {/* Video */}
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition ${videoOn ? 'bg-primary-800 hover:bg-primary-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
            title={videoOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
          </button>

          {/* Chat */}
          <div className="relative">
            <button
              onClick={chatOpen ? handleChatClose : handleChatOpen}
              className={`p-3 rounded-full transition ${chatOpen ? 'bg-primary-500 text-white' : 'bg-primary-800 hover:bg-primary-700 text-white'}`}
              title="Toggle chat"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            {unreadChat > 0 && !chatOpen && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
              }
            }}
            className="p-3 rounded-full bg-primary-800 hover:bg-primary-700 text-white transition"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>

          {/* End Call */}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition ml-4"
            title="Leave consultation"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Chat Sidebar ────────────────────────────────────────── */}
      {chatOpen && (
        <div className="w-80 bg-white border-l border-neutral-200 flex flex-col h-full text-neutral-900">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <MessageSquare className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold text-neutral-900">In-call chat</h3>
            </div>
            <button onClick={handleChatClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat content */}
          <div className="flex-1 min-h-0">
            {sessionId && roomIdRef.current && (
              <SessionChatThread
                sessionId={sessionId}
                roomId={roomIdRef.current}
                currentUserId={user?.id || user?._id}
                currentUserRole="patient"
                api={chatApi}
                variant="drawer"
                accentClassName="bg-primary-600 text-white"
                emptyState={
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <MessageSquare className="h-8 w-8 text-neutral-300" />
                    <p className="text-sm font-medium text-neutral-600">
                      Say hi to {doctorDisplay}
                    </p>
                    <p className="text-xs text-neutral-400">
                      Messages are encrypted and saved to your record.
                    </p>
                  </div>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* End Call Confirmation */}
      {showEndConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-neutral-800 border border-neutral-700 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1">Leave this consultation?</h3>
            <p className="text-sm text-white/60 mb-4">Are you sure you want to end this video call with your doctor?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/70 bg-neutral-700 hover:bg-neutral-600 transition"
              >
                Stay
              </button>
              <button
                onClick={() => { setShowEndConfirm(false); handleEnd(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 transition"
              >
                Leave call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
