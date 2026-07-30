/**
 * VideoCallPanel (v2 — Wave 3.6 redesign)
 *
 * Embeddable doctor-side video consultation UI. Preserves the original WebRTC
 * core (RTCPeerConnection + signaling via Socket.IO) but layers on:
 *
 *   ▸ Pre-join preflight: live mic VU meter + camera preview + consent
 *   ▸ Glassy top HUD: patient chip, status, duration, connection-quality bars
 *   ▸ Immersive video canvas: remote full-bleed, local PiP, rich overlays
 *   ▸ Unified real-time chat drawer (SessionChatThread, not polling)
 *   ▸ Patient context drawer (vitals / allergies / medications / recent visits)
 *   ▸ SOAP note drawer with 2-second debounced autosave → Consultation record
 *   ▸ Prescription quick-add (stays inside the call)
 *   ▸ 5-minute expiry warning toast
 *   ▸ callStore registration so ActiveCallPill can float on other routes
 *   ▸ Preserved minimized (PiP) mode
 *
 * The WebRTC handshake, ICE handling, media toggles and screen share are
 * lifted verbatim from the original implementation and wrapped in the new
 * chrome — the media plumbing is solid and untouched.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Video, Mic, MicOff, PhoneOff, MessageSquare, X, Clock,
  Wifi, WifiOff, Minimize as MinimizeIcon, Camera, CameraOff, MonitorUp,
  Shield, UserCircle, Stethoscope, Pill, Plus,
  AlertCircle, Save, Loader2, Heart, Syringe,
  CalendarClock, ClipboardList, Pause, Play, ChevronDown, FileText,
  TimerReset,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getVideoSession, joinVideoSession, endVideoSession,
  sendVideoMessage, getVideoMessages, markVideoMessageRead, shareVideoFile,
  updateVideoConsent, logVideoEvent, extendVideoSession,
  getPatient,
  listDoctorConsultations, startConsultation, updateConsultation,
  createPrescription, listPrescriptions,
} from '../api';
import {
  initSocket, joinVideoRoom, leaveVideoRoom,
  sendVideoOffer, sendVideoAnswer, sendIceCandidate,
  sendMediaToggle, onVideoEvent, offVideoEvent,
  callLife,
} from '../../lib/socket';
import { setActiveCall, clearActiveCall } from '../../lib/telemedicine/callStore';
import SessionChatThread from '../../lib/telemedicine/SessionChatThread';
import { stripDrPrefix } from '../../utils/doctorName';

/* ── Config ────────────────────────────────────────────────── */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const SOAP_DEBOUNCE_MS = 15000;
const EXPIRY_WARN_MS = 5 * 60 * 1000;
/**
 * How long to keep showing "reconnecting" after the peer's socket drops before
 * declaring them gone. A closed tab and a flaky network both arrive as
 * reason:'disconnect', so without this bound the doctor sits on "reconnecting"
 * indefinitely for a patient who has actually left.
 */
const PEER_REJOIN_GRACE_MS = 30000;

/* ──────────────────────────────────────────────────────────── */
/*                        DURATION TIMER                         */
/* ──────────────────────────────────────────────────────────── */
function DurationTimer({ startedAt, isActive }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt || !isActive) return;
    const start = new Date(startedAt).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, isActive]);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/85 tabular-nums">
      <Clock className="h-3.5 w-3.5" />
      <span>{m}:{s}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                    CONNECTION QUALITY BARS                    */
/* ──────────────────────────────────────────────────────────── */
function QualityBars({ bars = 0, label = 'idle' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70">
      <span className="inline-flex items-end gap-[2px] h-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm transition-colors ${
              i < bars ? 'bg-emerald-400' : 'bg-white/20'
            }`}
            style={{ height: `${(i + 1) * 25}%` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                     AUDIO VU METER (preflight)                */
/* ──────────────────────────────────────────────────────────── */
function AudioMeter({ stream }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    let ctx, src, analyser, raf;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 128));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* swallow — autoplay rules or unsupported */
    }
    return () => {
      cancelAnimationFrame(raf);
      try { ctx?.close(); } catch { /* ignore */ }
    };
  }, [stream]);
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-75"
        style={{ width: `${Math.min(100, level * 110)}%` }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                        TOASTS                                 */
/* ──────────────────────────────────────────────────────────── */
function Toast({ kind = 'info', children, onDismiss }) {
  const tones = {
    info:    'bg-sky-500/95 ring-sky-300/30',
    warn:    'bg-amber-500/95 ring-amber-300/30',
    success: 'bg-emerald-500/95 ring-emerald-300/30',
    error:   'bg-rose-500/95 ring-rose-300/30',
  };
  return (
    <div className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-xl text-white text-xs ring-1 ${tones[kind]} shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)] animate-[fadeUp_0.25s_ease-out_both]`}>
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-white/80 hover:text-white">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                  PATIENT CONTEXT DRAWER                       */
/* ──────────────────────────────────────────────────────────── */
function PatientContextDrawer({ patientId, onClose }) {
  const [tab, setTab] = useState('vitals');
  const [patient, setPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, rx] = await Promise.all([
          getPatient(patientId).catch(() => null),
          listPrescriptions({ patient: patientId, limit: 10 }).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setPatient(p?.data || p || null);
        setPrescriptions(rx?.data?.items || rx?.data || rx?.items || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const TABS = [
    { key: 'vitals',    label: 'Vitals',       icon: Heart },
    { key: 'allergies', label: 'Allergies',    icon: AlertCircle },
    { key: 'meds',      label: 'Medications',  icon: Syringe },
    { key: 'visits',    label: 'Recent',       icon: CalendarClock },
  ];

  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full md:w-96 bg-white border-l border-neutral-200 shadow-[-12px_0_30px_-12px_rgba(15,23,42,0.25)] flex flex-col animate-[slideInRight_0.3s_ease-out_both]">
      <header className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
          <UserCircle className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-900 truncate">
            {patient?.name || 'Patient context'}
          </h3>
          <p className="text-[11px] text-neutral-500">{patient?.phone || 'Live reference'}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-500">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-neutral-100">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-primary-50 text-primary-700'
                : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : !patient ? (
          <p className="text-xs text-neutral-400">No patient record available.</p>
        ) : tab === 'vitals' ? (
          <VitalsList patient={patient} />
        ) : tab === 'allergies' ? (
          <ChipList items={patient.allergies} empty="No known allergies." tone="rose" />
        ) : tab === 'meds' ? (
          <MedicationList prescriptions={prescriptions} />
        ) : (
          <RecentVisits patient={patient} />
        )}
      </div>
    </aside>
  );
}

function VitalsList({ patient }) {
  const v = patient?.vitals || patient?.latestVitals || {};
  const items = [
    { label: 'Blood pressure', value: v.bloodPressure || v.bp, unit: 'mmHg', tone: 'text-rose-600' },
    { label: 'Heart rate',     value: v.heartRate,             unit: 'bpm',  tone: 'text-primary-600' },
    { label: 'Temperature',    value: v.temperature,           unit: '°C',   tone: 'text-amber-600' },
    { label: 'SpO₂',           value: v.spo2 || v.oxygenSaturation, unit: '%', tone: 'text-emerald-600' },
    { label: 'Weight',         value: v.weight,                unit: 'kg',   tone: 'text-neutral-700' },
    { label: 'Height',         value: v.height,                unit: 'cm',   tone: 'text-neutral-700' },
  ].filter((x) => x.value != null && x.value !== '');
  if (items.length === 0) return <p className="text-xs text-neutral-400">No vitals on record.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-neutral-200 p-2.5 bg-neutral-50/60">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{it.label}</p>
          <p className={`mt-0.5 text-base font-semibold tabular-nums ${it.tone}`}>
            {it.value} <span className="text-xs text-neutral-400 font-normal">{it.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function ChipList({ items, empty, tone = 'primary' }) {
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  if (arr.length === 0) return <p className="text-xs text-neutral-400">{empty}</p>;
  const toneMap = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    primary: 'bg-primary-50 text-primary-700 border-primary-200',
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {arr.map((it, i) => (
        <span key={i} className={`inline-flex items-center text-[11px] px-2 py-1 rounded-full border ${toneMap[tone]}`}>
          {typeof it === 'string' ? it : (it.name || JSON.stringify(it))}
        </span>
      ))}
    </div>
  );
}

function MedicationList({ prescriptions }) {
  if (!prescriptions?.length) return <p className="text-xs text-neutral-400">No prescriptions on file.</p>;
  return (
    <ul className="space-y-1.5">
      {prescriptions.slice(0, 10).map((rx) => (
        <li key={rx._id} className="rounded-xl border border-neutral-200 p-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-6 h-6 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <Pill className="w-3 h-3" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {rx.medications?.[0]?.name || rx.name || 'Prescription'}
              </p>
              <p className="text-[11px] text-neutral-500">
                {(rx.medications || []).slice(0, 2).map((m) => m.dosage || m.name).filter(Boolean).join(' · ') ||
                  (rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '')}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentVisits({ patient }) {
  const visits = patient?.recentVisits || patient?.visits || [];
  if (!visits.length) return <p className="text-xs text-neutral-400">No prior visits linked.</p>;
  return (
    <ul className="space-y-1.5">
      {visits.slice(0, 6).map((v, i) => (
        <li key={v._id || i} className="rounded-xl border border-neutral-200 p-2.5">
          <p className="text-sm font-medium text-neutral-900">
            {v.reason || v.type || 'Visit'}
          </p>
          <p className="text-[11px] text-neutral-500">
            {v.date ? new Date(v.date).toLocaleDateString() : ''}
            {v.doctor?.name ? ` · Dr. ${stripDrPrefix(v.doctor.name)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                       SOAP DRAWER                             */
/* ──────────────────────────────────────────────────────────── */
function SoapDrawer({ sessionId, patientId, doctorId, onClose }) {
  const [consultation, setConsultation] = useState(null);
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [rxOpen, setRxOpen] = useState(false);
  const [rxDraft, setRxDraft] = useState({ name: '', dosage: '', frequency: '', duration: '' });
  const [rxSaving, setRxSaving] = useState(false);
  const [rxError, setRxError] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);
  const debounceRef = useRef(null);

  // ── Bootstrap consultation: try to find existing, else create one ──
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await listDoctorConsultations({ patient: patientId, status: 'active', limit: 1 })
          .catch(() => ({ data: [] }));
        const list = existing?.data?.items || existing?.data || existing?.items || [];
        let doc = list[0];
        if (!doc) {
          const created = await startConsultation({
            patient: patientId,
            type: 'teleconsult',
            linkedVideoSession: sessionId,
          }).catch(() => null);
          doc = created?.data || created || null;
        }
        if (cancelled || !doc) return;
        setConsultation(doc);
        setSoap({
          subjective: doc.subjective || '',
          objective:  doc.objective  || '',
          assessment: doc.assessment || '',
          plan:       doc.plan       || '',
        });
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, sessionId]);

  // ── Debounced autosave ──
  const scheduleSave = useCallback((next) => {
    if (!consultation?._id) return;
    clearTimeout(debounceRef.current);
    setSaveState('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        await updateConsultation(consultation._id, next);
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch {
        setSaveState('error');
      }
    }, SOAP_DEBOUNCE_MS);
  }, [consultation?._id]);

  const onField = (field) => (e) => {
    const next = { ...soap, [field]: e.target.value };
    setSoap(next);
    scheduleSave(next);
  };

  // ── Prescription quick-add ──
  const submitRx = async () => {
    if (!rxDraft.name.trim() || !patientId) return;
    setRxSaving(true);
    setRxError('');
    try {
      await createPrescription({
        patient: patientId,
        doctor: doctorId,
        medications: [{
          name:      rxDraft.name.trim(),
          dosage:    rxDraft.dosage.trim(),
          frequency: rxDraft.frequency.trim(),
          duration:  rxDraft.duration.trim(),
        }],
        linkedConsultation: consultation?._id,
        linkedVideoSession: sessionId,
      });
      setRxDraft({ name: '', dosage: '', frequency: '', duration: '' });
      setRxOpen(false);
    } catch (err) {
      setRxError(err.message || 'Could not save prescription.');
    } finally {
      setRxSaving(false);
    }
  };

  const FIELDS = [
    { key: 'subjective', label: 'Subjective',  hint: "Patient's narrative, symptoms, HPI" },
    { key: 'objective',  label: 'Objective',   hint: 'Exam findings, observations' },
    { key: 'assessment', label: 'Assessment',  hint: 'Impression, differential, Dx' },
    { key: 'plan',       label: 'Plan',        hint: 'Treatment, follow-up, instructions' },
  ];

  const saveChip = {
    idle:   { icon: Save,    label: 'Autosaved',  tone: 'text-neutral-400' },
    saving: { icon: Loader2, label: 'Saving…',    tone: 'text-primary-600 animate-pulse' },
    saved:  { icon: Save,    label: 'Saved',      tone: 'text-emerald-600' },
    error:  { icon: AlertCircle, label: 'Offline', tone: 'text-rose-600' },
  }[saveState];
  const SaveIcon = saveChip.icon;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full md:w-[420px] bg-white border-l border-neutral-200 shadow-[-12px_0_30px_-12px_rgba(15,23,42,0.25)] flex flex-col animate-[slideInRight_0.3s_ease-out_both]">
      <header className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <ClipboardList className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">SOAP note</h3>
          <div className="flex items-center gap-1.5 text-[11px]">
            <SaveIcon className={`w-3 h-3 ${saveChip.tone}`} />
            <span className={saveChip.tone}>{saveChip.label}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-500">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!bootstrapped ? (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing consultation…
          </div>
        ) : !consultation ? (
          <p className="text-xs text-neutral-400">Could not initialize consultation record.</p>
        ) : (
          <>
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
                  {label}
                </label>
                <textarea
                  value={soap[key]}
                  onChange={onField(key)}
                  placeholder={hint}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm placeholder-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
            ))}

            {/* Prescription quick-add */}
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center">
                    <Pill className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-primary-900">Prescription</p>
                    <p className="text-[11px] text-primary-700/80">Quick add without leaving the call</p>
                  </div>
                </div>
                {!rxOpen && (
                  <button
                    onClick={() => setRxOpen(true)}
                    disabled={!patientId}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800 disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              {rxOpen && (
                <div className="mt-3 space-y-2">
                  <input
                    value={rxDraft.name}
                    onChange={(e) => setRxDraft({ ...rxDraft, name: e.target.value })}
                    placeholder="Medication name"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={rxDraft.dosage}
                      onChange={(e) => setRxDraft({ ...rxDraft, dosage: e.target.value })}
                      placeholder="Dosage"
                      className="rounded-lg border border-neutral-200 px-2.5 py-2 text-xs focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                    />
                    <input
                      value={rxDraft.frequency}
                      onChange={(e) => setRxDraft({ ...rxDraft, frequency: e.target.value })}
                      placeholder="Frequency"
                      className="rounded-lg border border-neutral-200 px-2.5 py-2 text-xs focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                    />
                    <input
                      value={rxDraft.duration}
                      onChange={(e) => setRxDraft({ ...rxDraft, duration: e.target.value })}
                      placeholder="Duration"
                      className="rounded-lg border border-neutral-200 px-2.5 py-2 text-xs focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                    />
                  </div>
                  {rxError && (
                    <p className="text-[11px] text-rose-600">{rxError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setRxOpen(false); setRxDraft({ name: '', dosage: '', frequency: '', duration: '' }); setRxError(''); }}
                      className="text-xs text-neutral-500 hover:text-neutral-700 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitRx}
                      disabled={rxSaving || !rxDraft.name.trim()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg"
                    >
                      {rxSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Save Rx
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                   CHAT DRAWER (wrapper)                       */
/* ──────────────────────────────────────────────────────────── */
function ChatDrawer({ sessionId, roomId, currentUserId, onClose }) {
  const api = useMemo(() => ({
    list:      (id, params) => getVideoMessages(id, params),
    send:      (id, data)   => sendVideoMessage(id, data),
    markRead:  (id, mId)    => markVideoMessageRead(id, mId),
    shareFile: (id, data)   => shareVideoFile(id, data),
  }), []);
  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full md:w-96 bg-white border-l border-neutral-200 shadow-[-12px_0_30px_-12px_rgba(15,23,42,0.25)] flex flex-col animate-[slideInRight_0.3s_ease-out_both]">
      <header className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
          <MessageSquare className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-neutral-900">In-call chat</h3>
          <p className="text-[11px] text-neutral-500">Real-time · encrypted at rest</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-500">
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <SessionChatThread
          sessionId={sessionId}
          roomId={roomId}
          currentUserId={currentUserId}
          currentUserRole="doctor"
          api={api}
          variant="drawer"
          accentClassName="bg-primary-600"
        />
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                          MAIN                                 */
/* ──────────────────────────────────────────────────────────── */
export default function VideoCallPanel({
  sessionId, onEnd, onMinimize, minimized = false, className = '',
}) {
  const { user } = useTenantAuth();

  /**
   * Own user id in a ref — the socket listener below does not re-subscribe when
   * `user` changes, and TenantAuthContext populates `user` asynchronously, so
   * closing over it directly left the own-echo guard comparing against
   * undefined and applying our own mute/camera state to the remote peer.
   */
  const selfIdRef = useRef(null);
  useEffect(() => { selfIdRef.current = user?._id || user?.id || null; }, [user]);

  /** Bumped whenever localStreamRef is reassigned — see the sync effect below. */
  const [localStreamVersion, setLocalStreamVersion] = useState(0);

  // ── Session + WebRTC state ──
  const [session, setSession]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [roomData, setRoomData]         = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [screenSharing, setScreenSharing]   = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [peerInRoom, setPeerInRoom] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);

  // ── Preflight state ──
  const [preflightStream, setPreflightStream] = useState(null);
  const [recordingConsent, setRecordingConsent] = useState(false);

  // ── UI state ──
  const [drawer, setDrawer] = useState(null); // null | 'chat' | 'patient' | 'soap'
  const [toasts, setToasts] = useState([]);   // [{id, kind, msg}]
  const [qualityBars, setQualityBars] = useState(0);
  const [qualityLabel, setQualityLabel] = useState('idle');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const [extending, setExtending] = useState(false);

  // ── Refs ──
  const localVideoRef     = useRef(null);
  const remoteVideoRef    = useRef(null);
  const preflightVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef    = useRef(null);
  const remoteStreamRef   = useRef(null);
  const screenStreamRef   = useRef(null);
  const reconnectTimerRef = useRef(null);
  const videoListenerRef  = useRef(null);
  const roomIdRef         = useRef(null);
  const statsTimerRef     = useRef(null);
  const expiryWarnedRef   = useRef(false);
  const endedRef          = useRef(false);
  const peerRejoinTimerRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const pushToast = useCallback((kind, msg) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  /* ── Fetch session ─────────────────────────────────────── */
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await getVideoSession(sessionId);
        if (!cancelled) setSession(res?.data || res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  /* ── Preflight media (before joining) ───────────────────── */
  useEffect(() => {
    if (roomData || !session) return;
    let cancelled = false;
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setPreflightStream(stream);
        // Note: preflightVideoRef.current is null here because the <video> is
        // conditionally rendered on preflightStream. A separate useEffect below
        // handles connecting srcObject after React re-renders the element.
        // Enumerate devices for picker
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices({
            cameras: devs.filter((d) => d.kind === 'videoinput'),
            mics: devs.filter((d) => d.kind === 'audioinput'),
          });
        } catch { /* best-effort */ }
      } catch {
        if (!cancelled) setError('Camera / microphone permission required.');
      }
    })();
    return () => {
      cancelled = true;
      // Only stop tracks if the stream was NOT handed off to the live call
      if (stream && stream !== localStreamRef.current) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [session, roomData]);

  // Sync preflightStream to the video element after React renders the conditional <video>
  useEffect(() => {
    if (preflightVideoRef.current && preflightStream) {
      preflightVideoRef.current.srcObject = preflightStream;
    }
  }, [preflightStream]);

  /* ── Join call ──────────────────────────────────────────── */
  const handleJoin = async () => {
    try {
      setError(null);
      // Claim the preflight stream BEFORE any state updates so the
      // preflight-effect cleanup won't kill tracks on the React flush.
      if (preflightStream && !localStreamRef.current) {
        localStreamRef.current = preflightStream;
      }
      const res = await joinVideoSession(sessionId);
      const data = res?.data || res;
      setRoomData(data);
      setSession((prev) => ({ ...prev, ...data.session, status: data.session?.status || 'active' }));
      await startLocalMedia();
      setConnectionState('connecting');
      setupPeerConnection(data);
      roomIdRef.current = data.roomId;
      initSocket();
      joinVideoRoom(data.roomId, data.token, data.iv);

      // Register with callStore so ActiveCallPill floats on other routes
      setActiveCall({
        sessionId,
        roomId: data.roomId,
        peerName: data.session?.patient?.name || session?.patient?.name || 'Patient',
        peerRole: 'patient',
        startedAt: Date.now(),
        type: data.session?.type || session?.type || 'video',
        routePath: `/clinic/telemedicine/${sessionId}`,
      });
    } catch (err) {
      setError(err.message || 'Could not join the session');
    }
  };

  const startLocalMedia = async () => {
    try {
      // Prefer the preflight stream so permissions aren't re-prompted
      let stream = preflightStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
      localStreamRef.current = stream;
      setPreflightStream(null);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // Signal the sync effect below — localStreamRef is a ref, so without this
      // a self-view that mounted before the stream resolved stays black.
      setLocalStreamVersion((v) => v + 1);
    } catch {
      setError('Camera/microphone access denied.');
    }
  };

  /* ── WebRTC peer connection + signaling ─────────────────── */
  const setupPeerConnection = (data) => {
    const iceConfig = data.iceServers?.length ? { iceServers: data.iceServers } : ICE_CONFIG;
    const pc = new RTCPeerConnection(iceConfig);
    peerConnectionRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) return;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        // Browsers may block autoplay audio without a user gesture — force play.
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        sendIceCandidate(roomIdRef.current, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      logVideoEvent(sessionId, {
        event: pc.connectionState === 'connected' ? 'reconnected' : 'disconnected',
        metadata: { state: pc.connectionState },
      }).catch(() => {});
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') scheduleReconnect();
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') setConnectionState('connected');
    };

    // Register signaling event listener
    if (videoListenerRef.current) offVideoEvent(videoListenerRef.current);
    const listener = async (eventName, payload) => {
      const currentPc = peerConnectionRef.current;
      if (!currentPc) return;
      const roomId = roomIdRef.current;
      switch (eventName) {
        case 'video:user-joined':
        case 'video:peer-joined': {
          setPeerInRoom(true);
          if (eventName === 'video:peer-joined') break; // peer-joined is informational only
          // Guard: skip if we already have a pending local description (glare prevention).
          try {
            if (currentPc.signalingState !== 'stable') {
              console.warn('[WebRTC] Skipping offer — signalingState:', currentPc.signalingState);
              break;
            }
            const offer = await currentPc.createOffer();
            await currentPc.setLocalDescription(offer);
            sendVideoOffer(roomId, offer);
            pushToast('success', 'Patient joined the call.');
          } catch (err) {
            console.error('[WebRTC] createOffer failed:', err);
          }
          break;
        }
        case 'video:offer': {
          try {
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await currentPc.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            sendVideoAnswer(roomId, answer);
          } catch (err) {
            console.error('[WebRTC] handleOffer failed:', err);
          }
          break;
        }
        case 'video:answer': {
          try {
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await currentPc.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
          } catch (err) {
            console.error('[WebRTC] handleAnswer failed:', err);
          }
          break;
        }
        case 'video:ice-candidate': {
          try {
            if (payload.candidate) {
              const candidate = new RTCIceCandidate(payload.candidate);
              if (!currentPc.remoteDescription) {
                pendingCandidatesRef.current.push(candidate);
              } else {
                await currentPc.addIceCandidate(candidate);
              }
            }
          } catch (err) {
            console.error('[WebRTC] addIceCandidate failed:', err);
          }
          break;
        }
        case 'video:user-left':
        case 'video:peer-left': {
          // Transient socket disconnects (reason === 'disconnect') mean the peer's
          // socket dropped momentarily — they will auto-rejoin.  Don't nuke the
          // remote video or the WebRTC peer connection in that case; just show a
          // "reconnecting" indicator and let the auto-rejoin restore the room.
          const isTransient = payload?.reason === 'disconnect';
          if (isTransient) {
            setPeerInRoom(false);
            setConnectionState('reconnecting');
            pushToast('warn', 'Patient temporarily disconnected — reconnecting…');
            // Bound the wait: a closed tab looks identical to a network blip, so
            // give them PEER_REJOIN_GRACE_MS to come back, then treat it as a
            // real departure rather than showing "reconnecting" forever.
            clearTimeout(peerRejoinTimerRef.current);
            peerRejoinTimerRef.current = setTimeout(() => {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              remoteStreamRef.current = null;
              setPeerInRoom(false);
              setConnectionState('disconnected');
              pushToast('warn', 'Patient left the call.');
            }, PEER_REJOIN_GRACE_MS);
          } else {
            clearTimeout(peerRejoinTimerRef.current);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            remoteStreamRef.current = null;
            setPeerInRoom(false);
            setConnectionState('disconnected');
            pushToast('warn', 'Patient left the call.');
          }
          break;
        }
        case 'video:toggle-media':
        case 'video:media-state': {
          // Guard: ignore own media-state echo (io.to sends to everyone including sender)
          if (payload.userId && String(payload.userId) === String(selfIdRef.current)) break;
          if (payload.mediaType === 'audio') setRemoteAudioEnabled(payload.enabled);
          if (payload.mediaType === 'video') setRemoteVideoEnabled(payload.enabled);
          // Also handle the normalized form from video:media-state
          if (payload.audio != null) setRemoteAudioEnabled(!!payload.audio);
          if (payload.video != null) setRemoteVideoEnabled(!!payload.video);
          break;
        }
        case 'video:call-ended': {
          if (!endedRef.current) {
            endedRef.current = true;
            pushToast('info', 'Call ended.');
            cleanup();
            clearActiveCall();
            onEnd?.();
          }
          break;
        }
        case 'video:session-extended': {
          setSession((prev) => prev ? { ...prev, expiresAt: payload.expiresAt, maxDuration: payload.maxDuration, extensions: payload.extensionsUsed } : prev);
          expiryWarnedRef.current = false;
          setShowExpiryBanner(false);
          pushToast('success', `Session extended — ${payload.maxExtensions - payload.extensionsUsed} extension(s) remaining.`);
          break;
        }
        case 'video:error': {
          setError(payload.message || 'Signaling error');
          break;
        }
      }
    };
    videoListenerRef.current = listener;
    onVideoEvent(listener);
  };

  /* ── Stats poll (connection-quality bars) ───────────────── */
  useEffect(() => {
    if (!peerConnectionRef.current || !roomData) return undefined;
    statsTimerRef.current = setInterval(async () => {
      const pc = peerConnectionRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        let lossRate = null;
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime * 1000;
          }
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            if (r.packetsLost != null && r.packetsReceived != null && r.packetsReceived > 0) {
              lossRate = r.packetsLost / (r.packetsLost + r.packetsReceived);
            }
          }
        });
        // Score: 4 bars ≤80ms & <1% loss; 3 ≤180ms & <3%; 2 ≤350ms & <6%; 1 otherwise
        let bars = 0;
        let label = 'idle';
        if (rtt != null) {
          if (rtt <= 80 && (lossRate == null || lossRate < 0.01)) { bars = 4; label = 'excellent'; }
          else if (rtt <= 180 && (lossRate == null || lossRate < 0.03)) { bars = 3; label = 'good'; }
          else if (rtt <= 350 && (lossRate == null || lossRate < 0.06)) { bars = 2; label = 'fair'; }
          else { bars = 1; label = 'poor'; }
        }
        setQualityBars(bars);
        setQualityLabel(label);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(statsTimerRef.current);
  }, [roomData]);

  // Sync local stream to the PiP video element once it mounts after joining.
  // Keyed on localStreamVersion too, so a stream that resolves after the joined
  // UI has rendered still gets bound (a roomData-only effect fires once).
  useEffect(() => {
    if (roomData && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [roomData, localStreamVersion]);

  /** Callback ref — binds the stream the moment the node mounts, so the
   *  mount-vs-stream ordering cannot leave the self-view black. */
  const attachLocalVideo = useCallback((node) => {
    localVideoRef.current = node;
    if (node && localStreamRef.current && node.srcObject !== localStreamRef.current) {
      node.srcObject = localStreamRef.current;
    }
  }, []);

  // Sync remote stream to the remote video element — covers the case where
  // pc.ontrack fires before React renders the <video> element.
  useEffect(() => {
    if (roomData && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [roomData]);

  /* ── Peer-lifecycle socket echoes (separate from signaling) ── */
  useEffect(() => {
    if (!roomData) return undefined;
    const off = callLife.on((event, payload) => {
      if (!payload || payload.roomId !== roomData.roomId) return;
      if (event === 'video:call-ended' && !endedRef.current) {
        endedRef.current = true;
        pushToast('info', 'Call ended by the other party.');
        setTimeout(() => {
          cleanup();
          clearActiveCall();
          onEnd?.();
        }, 500);
      }
      // Peer rejoined after a transient disconnect — restore the connected state
      if (event === 'video:peer-joined') {
        clearTimeout(peerRejoinTimerRef.current);
        setPeerInRoom(true);
        if (connectionState === 'reconnecting' || connectionState === 'disconnected') {
          setConnectionState('connected');
          pushToast('success', 'Patient reconnected.');
        }
      }
    });
    return off;
  }, [roomData, onEnd, pushToast]);

  /* ── Expiry warning ─────────────────────────────────────── */
  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const expires = new Date(session.expiresAt).getTime();
    const t = setInterval(() => {
      const remaining = expires - Date.now();
      if (remaining > 0 && remaining <= EXPIRY_WARN_MS && !expiryWarnedRef.current) {
        expiryWarnedRef.current = true;
        setShowExpiryBanner(true);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [session?.expiresAt]);

  const handleExtendSession = async () => {
    if (!session?._id && !session?.id) return;
    setExtending(true);
    try {
      await extendVideoSession(session._id || session.id);
      pushToast('success', 'Session extended by 15 minutes.');
      setShowExpiryBanner(false);
      expiryWarnedRef.current = false;
      setSession((prev) => prev ? { ...prev, extensions: (prev.extensions || 0) + 1 } : prev);
    } catch (err) {
      pushToast('error', err?.message || 'Failed to extend session.');
    } finally {
      setExtending(false);
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimerRef.current) return;
    pushToast('warn', 'Reconnecting…');
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      try { await handleJoin(); } catch { /* ignore */ }
    }, 3000);
  };

  /* ── Media toggles ──────────────────────────────────────── */
  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const tracks = localStreamRef.current.getVideoTracks();
    if (!tracks.length) { pushToast('error', 'No camera track available — check permissions'); return; }
    const next = !videoEnabled;
    tracks.forEach((t) => { t.enabled = next; });
    setVideoEnabled(next);
    if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'video', next);
  };
  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    const tracks = localStreamRef.current.getAudioTracks();
    if (!tracks.length) { pushToast('error', 'No microphone track available — check permissions'); return; }
    const next = !audioEnabled;
    tracks.forEach((t) => { t.enabled = next; });
    setAudioEnabled(next);
    if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'audio', next);
  };
  const toggleScreenShare = async () => {
    if (screenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (peerConnectionRef.current && localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && videoTrack) sender.replaceTrack(videoTrack);
      }
      if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => toggleScreenShare();
        setScreenSharing(true);
      } catch { /* user cancelled */ }
    }
  };

  // ── Hold / Resume ─────────────────────────────
  const toggleHold = () => {
    if (!localStreamRef.current) return;
    const next = !isOnHold;
    localStreamRef.current.getTracks().forEach((t) => { t.enabled = !next; });
    setIsOnHold(next);
    setAudioEnabled(!next);
    setVideoEnabled(!next);
    if (roomIdRef.current) {
      sendMediaToggle(roomIdRef.current, 'audio', !next);
      sendMediaToggle(roomIdRef.current, 'video', !next);
    }
    pushToast(next ? 'warn' : 'success', next ? 'Call on hold' : 'Call resumed');
  };

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
      const stream = localStreamRef.current || preflightStream;
      if (!stream) { newTrack.stop(); return; }
      const oldTrack = stream.getTracks().find((t) => t.kind === newTrack.kind);
      if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
      stream.addTrack(newTrack);
      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === newTrack.kind);
        if (sender) sender.replaceTrack(newTrack);
      }
      if (kind === 'videoinput') {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        if (preflightVideoRef.current) preflightVideoRef.current.srcObject = stream;
      }
    } catch { /* device switch failed */ }
  };

  const handleEndCall = async () => {
    // Always tear down locally first so the doctor is never stuck in the call.
    // The API call is best-effort — even if it fails, the local side is cleaned up.
    endedRef.current = true;
    cleanup();
    clearActiveCall();
    onEnd?.();
    try {
      await endVideoSession(sessionId, {});
    } catch (err) {
      console.warn('End session API failed (local teardown already done):', err.message || err);
    }
  };

  const cleanup = () => {
    if (roomIdRef.current) { leaveVideoRoom(roomIdRef.current); roomIdRef.current = null; }
    if (videoListenerRef.current) { offVideoEvent(videoListenerRef.current); videoListenerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    remoteStreamRef.current = null;
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null; }
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (peerRejoinTimerRef.current) { clearTimeout(peerRejoinTimerRef.current); peerRejoinTimerRef.current = null; }
    if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
    if (preflightStream) {
      preflightStream.getTracks().forEach((t) => t.stop());
      setPreflightStream(null);
    }
  };

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConsentToggle = () => {
    const next = !recordingConsent;
    setRecordingConsent(next);
    updateVideoConsent(sessionId, { consent: next }).catch(() => {});
  };

  const isActive  = session?.status === 'active' || session?.status === 'waiting';
  const canJoin   = ['requested', 'scheduled', 'waiting', 'active'].includes(session?.status);
  const hasJoined = Boolean(roomData);
  const patientId = session?.patient?._id || session?.patient;
  const doctorId  = user?.id || user?._id;
  const patientName = session?.patient?.name || 'Patient';

  const connPill = useMemo(() => {
    if (!hasJoined) return null;
    if (connectionState === 'connected') return { icon: Wifi, tone: 'text-emerald-300', label: 'Connected' };
    if (connectionState === 'connecting') return { icon: Wifi, tone: 'text-amber-300 animate-pulse', label: 'Connecting' };
    return { icon: WifiOff, tone: 'text-rose-300', label: 'Offline' };
  }, [hasJoined, connectionState]);

  /* ── Minimized (PiP) ────────────────────────────────────── */
  if (minimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 w-72 h-48 rounded-2xl overflow-hidden border border-white/20 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)] bg-neutral-950 cursor-pointer group"
        onClick={onMinimize}
      >
        {hasJoined ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
              {isActive && session?.startedAt && <DurationTimer startedAt={session.startedAt} isActive={isActive} />}
              {connPill && <connPill.icon className={`h-3.5 w-3.5 ${connPill.tone}`} />}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Video className="h-8 w-8 text-white/30" />
          </div>
        )}
      </div>
    );
  }

  /* ── Loading ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-neutral-950 rounded-2xl ${className}`} style={{ minHeight: 460 }}>
        <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div
      className={`relative flex flex-col bg-gradient-to-b from-neutral-950 to-neutral-900 rounded-3xl overflow-hidden border border-neutral-800/60 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] ${className}`}
      style={{ minHeight: 560 }}
    >
      {/* Toast stack */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-3 space-y-1.5 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} kind={t.kind} onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
            {t.msg}
          </Toast>
        ))}
      </div>

      {/* ── Expiry banner ──────────────────────────────── */}
      {showExpiryBanner && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-3 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-xl bg-amber-500/95 px-3 py-2 text-white text-xs font-medium shadow-lg ring-1 ring-amber-300/30 backdrop-blur-md">
            <TimerReset className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Session ends in under 5 minutes.</span>
            {(session?.extensions || 0) < 2 && (
              <button
                type="button"
                onClick={handleExtendSession}
                disabled={extending}
                className="flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50"
              >
                {extending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Extend 15 min
              </button>
            )}
            <button type="button" onClick={() => setShowExpiryBanner(false)} className="text-white/80 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Top HUD ──────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 text-white">
            <UserCircle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">
              {patientName}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/10 text-white/60'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`} />
                {session?.status || 'idle'}
              </span>
              {session?.type && (
                <span className="text-[10px] uppercase tracking-wider text-white/50">
                  {session.type}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasJoined && <QualityBars bars={qualityBars} label={qualityLabel} />}
          {isActive && session?.startedAt && <DurationTimer startedAt={session.startedAt} isActive={isActive} />}
          {connPill && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/70">
              <connPill.icon className={`w-3.5 h-3.5 ${connPill.tone}`} />
              <span>{connPill.label}</span>
            </span>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 transition"
              title="Minimize"
            >
              <MinimizeIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ── Video Stage ──────────────────────────────────── */}
      <div className="relative flex-1 flex items-stretch">
        <div className="relative flex-1 min-h-[360px]">
          {hasJoined ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />

              {/* Remote overlays */}
              {connectionState === 'connected' && !remoteVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/85">
                  <div className="text-center">
                    <div className="mx-auto mb-2 w-16 h-16 rounded-full bg-white/10 ring-2 ring-white/15 flex items-center justify-center">
                      <CameraOff className="h-6 w-6 text-white/60" />
                    </div>
                    <p className="text-white/70 text-sm font-medium">Patient camera is off</p>
                  </div>
                </div>
              )}
              {connectionState === 'connected' && !remoteAudioEnabled && (
                <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/90 ring-1 ring-rose-300/30 text-white text-[11px] font-medium">
                  <MicOff className="w-3 h-3" /> Patient muted
                </div>
              )}
              {connectionState !== 'connected' && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80">
                  <div className="text-center">
                    <div className="relative mx-auto mb-3 w-20 h-20">
                      <span className="absolute inset-0 rounded-full bg-primary-500/30 animate-ping" />
                      <div className="relative w-20 h-20 rounded-full bg-primary-600 flex items-center justify-center shadow-lg">
                        <Video className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <p className="text-white text-sm font-semibold">
                      {peerInRoom ? 'Connecting…' : 'Waiting for patient…'}
                    </p>
                    <p className="text-white/60 text-xs mt-1">
                      {peerInRoom
                        ? 'Patient joined · establishing secure connection'
                        : "Ringing securely \u00b7 they\u2019ll join shortly"}
                    </p>
                  </div>
                </div>
              )}

              {/* Local PiP — fixed dimensions, isolated stacking context */}
              <div className={`absolute z-20 w-36 h-[102px] md:w-44 md:h-[124px] rounded-2xl overflow-hidden border border-white/25 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] bg-neutral-900 transition-all duration-300 ${
                drawer ? 'bottom-4 right-[calc(24rem+1rem)] md:right-[calc(24rem+1rem)]' : 'bottom-4 right-4'
              }`} style={{ isolation: 'isolate' }}>
                <video ref={attachLocalVideo} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                {!videoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <CameraOff className="h-6 w-6 text-white/40" />
                  </div>
                )}
                <div className="absolute bottom-1 left-1.5 text-[10px] font-medium text-white/90 bg-black/40 rounded px-1.5 py-0.5">
                  You
                </div>
              </div>
            </>
          ) : (
            /* ── Pre-Join: Preflight ─────────────────────── */
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-lg">
                <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md p-5 md:p-6">
                  <div className="text-center mb-4">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-[0_12px_28px_-8px_rgba(37,99,235,0.5)]">
                      <Stethoscope className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="mt-3 font-display text-xl font-semibold text-white">
                      Ready to see {patientName}?
                    </h3>
                    <p className="mt-0.5 text-white/60 text-xs">
                      Check your camera and mic. You're on <span className="text-white/80">doctor side</span>.
                    </p>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-white/15 bg-neutral-950 aspect-video mb-3 relative">
                    {preflightStream ? (
                      <video
                        ref={preflightVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 right-2">
                      <AudioMeter stream={preflightStream} />
                    </div>
                  </div>

                  {/* Device selectors */}
                  {(devices.cameras.length > 1 || devices.mics.length > 1) && (
                    <div className="space-y-1.5 mb-3">
                      {devices.cameras.length > 1 && (
                        <div className="flex items-center gap-2">
                          <Camera className="h-3.5 w-3.5 text-white/40 shrink-0" />
                          <div className="relative flex-1">
                            <select
                              value={selectedCamera}
                              onChange={(e) => switchDevice('videoinput', e.target.value)}
                              className="w-full appearance-none bg-white/5 ring-1 ring-white/10 text-white/80 text-[11px] rounded-lg px-2.5 py-1.5 pr-7 focus:ring-primary-500"
                            >
                              {devices.cameras.map((d, i) => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
                          </div>
                        </div>
                      )}
                      {devices.mics.length > 1 && (
                        <div className="flex items-center gap-2">
                          <Mic className="h-3.5 w-3.5 text-white/40 shrink-0" />
                          <div className="relative flex-1">
                            <select
                              value={selectedMic}
                              onChange={(e) => switchDevice('audioinput', e.target.value)}
                              className="w-full appearance-none bg-white/5 ring-1 ring-white/10 text-white/80 text-[11px] rounded-lg px-2.5 py-1.5 pr-7 focus:ring-primary-500"
                            >
                              {devices.mics.map((d, i) => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recordingConsent}
                      onChange={handleConsentToggle}
                      className="mt-0.5 rounded border-white/30 bg-transparent text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                    />
                    <div className="flex-1">
                      <p className="text-xs text-white flex items-center gap-1.5">
                        <Shield className="w-3 h-3" />
                        I confirm the patient consents to recording (if enabled).
                      </p>
                      <p className="text-[10px] text-white/50 mt-0.5">
                        Calls are encrypted. Recordings are never started without explicit consent.
                      </p>
                    </div>
                  </label>

                  {canJoin ? (
                    <button
                      type="button"
                      onClick={handleJoin}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-600 text-white font-semibold py-3 text-sm shadow-[0_12px_28px_-10px_rgba(16,185,129,0.55)] transition-all active:scale-[0.98]"
                    >
                      <Video className="w-4 h-4" />
                      Join session
                    </button>
                  ) : (
                    <div className="rounded-xl bg-white/5 text-white/70 text-xs text-center py-3">
                      Session is <span className="text-white font-medium">{session?.status}</span>. Nothing to join.
                    </div>
                  )}

                  {error && (
                    <p className="mt-3 text-xs text-rose-300 flex items-center gap-1.5 justify-center">
                      <AlertCircle className="w-3.5 h-3.5" /> {error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawers */}
        {drawer === 'chat' && hasJoined && (
          <ChatDrawer
            sessionId={sessionId}
            roomId={roomData?.roomId}
            currentUserId={doctorId}
            onClose={() => setDrawer(null)}
          />
        )}
        {drawer === 'patient' && (
          <PatientContextDrawer patientId={patientId} onClose={() => setDrawer(null)} />
        )}
        {drawer === 'soap' && (
          <SoapDrawer
            sessionId={sessionId}
            patientId={patientId}
            doctorId={doctorId}
            onClose={() => setDrawer(null)}
          />
        )}
      </div>

      {/* ── Control Bar ─────────────────────────────────── */}
      {hasJoined && (
        <footer className="relative z-10 px-4 py-3 bg-gradient-to-t from-black/70 to-black/30 backdrop-blur-sm border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ControlButton
                onClick={toggleAudio}
                active={audioEnabled}
                activeIcon={Mic}
                inactiveIcon={MicOff}
                title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                danger={!audioEnabled}
              />
              <ControlButton
                onClick={toggleVideo}
                active={videoEnabled}
                activeIcon={Camera}
                inactiveIcon={CameraOff}
                title={videoEnabled ? 'Camera off' : 'Camera on'}
                danger={!videoEnabled}
              />
              <ControlButton
                onClick={toggleScreenShare}
                active={screenSharing}
                activeIcon={MonitorUp}
                inactiveIcon={MonitorUp}
                title="Share screen"
                accent={screenSharing}
              />
              <ControlButton
                onClick={toggleHold}
                active={!isOnHold}
                activeIcon={Pause}
                inactiveIcon={Play}
                title={isOnHold ? 'Resume call' : 'Hold call'}
                accent={isOnHold}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <DrawerButton
                active={drawer === 'chat'}
                icon={MessageSquare}
                label="Chat"
                onClick={() => setDrawer((d) => (d === 'chat' ? null : 'chat'))}
              />
              <DrawerButton
                active={drawer === 'patient'}
                icon={UserCircle}
                label="Patient"
                onClick={() => setDrawer((d) => (d === 'patient' ? null : 'patient'))}
              />
              <DrawerButton
                active={drawer === 'soap'}
                icon={ClipboardList}
                label="SOAP"
                onClick={() => setDrawer((d) => (d === 'soap' ? null : 'soap'))}
              />
              <button
                onClick={() => setShowEndConfirm(true)}
                title="End call"
                className="ml-1.5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-600 text-white text-xs font-semibold px-4 py-2.5 shadow-[0_8px_20px_-4px_rgba(244,63,94,0.5)] active:scale-95 transition-all"
              >
                <PhoneOff className="w-4 h-4" />
                End
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Hold overlay — covers video area only, leaves footer controls visible */}
      {isOnHold && hasJoined && (
        <div className="absolute inset-0 bottom-auto z-30 flex items-center justify-center pointer-events-none" style={{ height: 'calc(100% - 52px)' }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative text-center pointer-events-auto">
            <div className="mx-auto mb-3 w-16 h-16 rounded-full bg-amber-500/20 ring-2 ring-amber-400/30 flex items-center justify-center">
              <Pause className="h-7 w-7 text-amber-400 animate-pulse" />
            </div>
            <p className="text-white text-sm font-semibold">Call on hold</p>
            <p className="text-white/50 text-xs mt-2 mb-3">The call is paused</p>
            <button
              onClick={toggleHold}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-lg transition-all"
            >
              <Play className="h-3.5 w-3.5" />
              Resume Call
            </button>
          </div>
        </div>
      )}

      {/* End Call Confirmation */}
      {showEndConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-neutral-800 border border-neutral-700 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">End this consultation?</h3>
            <p className="text-xs text-white/60 mb-3">Review before ending:</p>
            <ul className="space-y-2 mb-4">
              <li className="flex items-center gap-2 text-xs text-white/80">
                <ClipboardList className="h-3.5 w-3.5 text-white/40 shrink-0" />
                SOAP notes documented
              </li>
              <li className="flex items-center gap-2 text-xs text-white/80">
                <FileText className="h-3.5 w-3.5 text-white/40 shrink-0" />
                Prescription added (if needed)
              </li>
              <li className="flex items-center gap-2 text-xs text-white/80">
                <Clock className="h-3.5 w-3.5 text-white/40 shrink-0" />
                Follow-up scheduled (if needed)
              </li>
            </ul>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-medium text-white/70 bg-neutral-700 hover:bg-neutral-600 transition"
              >
                Continue call
              </button>
              <button
                onClick={() => { setShowEndConfirm(false); handleEndCall(); }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 transition"
              >
                End call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyframes scoped to this component */}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*                    CONTROL BUTTONS                            */
/* ──────────────────────────────────────────────────────────── */
function ControlButton({ onClick, activeIcon: AIcon, inactiveIcon: IIcon, active, title, danger, accent }) {
  const Icon = active ? AIcon : IIcon;
  const base = 'inline-flex items-center justify-center w-11 h-11 rounded-full transition-all active:scale-95 ring-1';
  const tone = danger
    ? 'bg-rose-500 hover:bg-rose-600 text-white ring-rose-300/30'
    : accent
      ? 'bg-primary-500 hover:bg-primary-400 text-white ring-primary-300/30'
      : 'bg-white/10 hover:bg-white/20 text-white ring-white/15';
  return (
    <button type="button" onClick={onClick} title={title} className={`${base} ${tone}`}>
      <Icon className="w-[18px] h-[18px]" />
    </button>
  );
}

function DrawerButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium transition-all ring-1 ${
        active
          ? 'bg-primary-500 text-white ring-primary-300/30 shadow-[0_6px_16px_-6px_rgba(37,99,235,0.5)]'
          : 'bg-white/10 text-white hover:bg-white/20 ring-white/15'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
