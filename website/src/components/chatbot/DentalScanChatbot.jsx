import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ShieldCheck, Camera, Upload, CheckCircle, Check,
  Brain, AlertTriangle, Loader2, ChevronRight, Stethoscope,
  Info, Zap, Star, MapPin, Clock, UserCheck, Navigation,
  FileText, Lock, Volume2, VolumeX,
} from 'lucide-react';
import { useDentalScanChat, STEPS } from './useDentalScanChat';
import DentalChart from './DentalChart';
import HealthScoreCard from './HealthScoreCard';
import ImmersiveScannerCard from './scanner/ImmersiveScannerCard';
import EnhancedScannerCard from './scanner/EnhancedScannerCard';
import { SCAN_POSITIONS } from '../../constants/dentalScanGuide';
import { isVoiceSupported, speak as speakVoice, stopSpeaking } from '../../lib/voiceGuidance';

// ── Animation variants ────────────────────────────────────

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const panelVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  exit: { opacity: 0, y: 40, scale: 0.97, transition: { duration: 0.2 } },
};

const STEP_LABELS = {
  WELCOME: { num: 1, label: 'Welcome' },
  CONSENT: { num: 1, label: 'Consent' },
  SCANNING: { num: 2, label: 'Scanning' },
  LEAD_CAPTURE: { num: 3, label: 'Your Info' },
  ANALYZING: { num: 4, label: 'Analyzing' },
  RESULTS: { num: 5, label: 'Results' },
  DOCTOR_DISCOVERY: { num: 5, label: 'Doctors' },
  DONE: { num: 5, label: 'Done' },
  ERROR: { num: 0, label: 'Error' },
};

const msgVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ── Severity / confidence colors ──────────────────────────

const CONFIDENCE_STYLES = {
  high:   { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  low:    { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

const OBS_TYPE_LABELS = {
  plaque: 'Plaque Buildup',
  inflammation: 'Gum Inflammation',
  discoloration: 'Tooth Discoloration',
  misalignment: 'Misalignment',
  cavity: 'Cavity / Decay',
  gum_recession: 'Gum Recession',
  other: 'Other Finding',
};

// ── Scanner CSS (injected once) ───────────────────────────

const SCANNER_STYLES = `
@keyframes scanLine {
  0% { top: 0; }
  100% { top: 100%; }
}
@keyframes pulseCorners {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes scanComplete {
  0% { opacity: 0; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
`;

// ══════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────
// ══════════════════════════════════════════════════════════

export default function DentalScanChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const chat = useDentalScanChat();
  const scrollRef = useRef(null);

  // Inject scanner keyframe styles
  useEffect(() => {
    if (document.getElementById('dental-scanner-styles')) return;
    const style = document.createElement('style');
    style.id = 'dental-scanner-styles';
    style.textContent = SCANNER_STYLES;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Allow external components to open the chatbot via custom event
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-dental-scanner', handler);
    return () => window.removeEventListener('open-dental-scanner', handler);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages]);

  const stepInfo = STEP_LABELS[chat.step] || { num: 0, label: '' };

  const isScanInProgress = chat.step === STEPS.SCANNING || chat.step === STEPS.ANALYZING || chat.step === STEPS.LEAD_CAPTURE;

  const handleClose = useCallback(() => {
    if (isScanInProgress) {
      const confirmed = window.confirm('You have a scan in progress. Are you sure you want to close? Your progress will be lost.');
      if (!confirmed) return;
    }
    setIsOpen(false);
  }, [isScanInProgress]);

  return (
    <>
      {/* ── Floating trigger button ── */}
      {!isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-600/30 hover:shadow-xl hover:shadow-primary-600/40 flex items-center justify-center cursor-pointer"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          aria-label="Open dental scan chatbot"
        >
          <img src="/chatbot/dental chat bot .svg" alt="Dental Scan" className="w-8 h-8" />
        </motion.button>
      )}

      {/* ── Full-screen panel ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={handleClose}
            />

            {/* Panel */}
            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-4 sm:rounded-2xl sm:shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-neutral-200/80 bg-white shrink-0">
                <button
                  onClick={handleClose}
                  className="p-2 -ml-1 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                  <img src="/chatbot/dental chat bot .svg" alt="Dental Scan" className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-neutral-900 truncate">AI Dental Scanner</h3>
                </div>
                {stepInfo.num > 0 && (
                  <span className="px-2.5 py-1 text-[11px] font-medium bg-primary-50 text-primary-600 rounded-full shrink-0">
                    Step {stepInfo.num} of 5
                  </span>
                )}
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 shrink-0">
                  <Lock className="w-3 h-3" />
                  <span className="font-medium hidden sm:inline">Secure</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-neutral-100 shrink-0">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-r-full"
                  initial={false}
                  animate={{ width: `${chat.progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                />
              </div>

              {/* Messages area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
                <div className="max-w-2xl mx-auto space-y-3">
                  {chat.messages.map((message) => (
                    <motion.div key={message.id} variants={msgVariant} initial="hidden" animate="visible">
                      <MessageRenderer
                        message={message}
                        chat={chat}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Sticky CTA bar — shows last unconsumed bot_action */}
              <StickyActionBar messages={chat.messages} onAction={chat.handleAction} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// ─── MESSAGE RENDERER ───────────────────────────────────
// ══════════════════════════════════════════════════════════

function MessageRenderer({ message, chat }) {
  switch (message.type) {
    case 'bot_typing':
      return <TypingIndicator />;
    case 'bot_welcome_card':
      return <WelcomeCard />;
    case 'bot_text':
      return <BotTextBubble text={message.text} />;
    case 'bot_consent':
      return <ConsentCard onAccept={chat.acceptConsent} loading={chat.isLoading} consumed={message.consumed} />;
    case 'bot_scanner':
      if (message.consumed) return null;
      return (
        <ScannerCard
          onCapture={chat.uploadImage}
          photoCount={chat.photoCount}
          maxPhotos={chat.maxPhotos}
          loading={chat.isLoading}
        />
      );
    case 'bot_immersive_scanner':
      if (message.consumed) return null;
      return (
        <ImmersiveScannerCard
          sessionToken={chat.sessionToken}
          onAllCaptured={chat.handleAllCaptured}
          onUploadPhoto={chat.uploadImage}
        />
      );
    case 'bot_enhanced_scanner':
      if (message.consumed) return null;
      return (
        <EnhancedScannerCard
          sessionToken={chat.sessionToken}
          onUploadFrame={chat.uploadFrame}
          onFinalizePosition={chat.finalizePosition}
          onAllCaptured={chat.handleAllCaptured}
        />
      );
    case 'bot_upload_status':
      return <UploadStatusBubble text={message.text} done={message.done} />;
    case 'bot_lead_form':
      if (message.consumed) return null;
      return <LeadCaptureForm onSubmit={chat.submitLead} loading={chat.isLoading} />;
    case 'bot_analyzing':
      return <AnalyzingBubble text={message.text} />;
    case 'bot_photo_history':
      return <PhotoHistoryCard photos={message.photos} />;
    case 'bot_result_summary':
      return <ResultSummaryCard text={message.text} />;
    case 'bot_health_score':
      return <HealthScoreCardBubble healthScore={message.healthScore} />;
    case 'bot_dental_chart':
      return <DentalChartCard observations={message.observations} />;
    case 'bot_observation':
      return <ObservationCard observation={message.observation} />;
    case 'bot_location_card':
      return <LocationPermissionCard onAllow={() => chat.handleLocationPermission('allow')} onChooseCity={() => chat.handleLocationPermission('city')} consumed={message.consumed} />;
    case 'bot_location_confirmed':
      return <LocationConfirmedBubble city={message.city} />;
    case 'bot_city_picker':
      return <CityPickerCard cities={message.cities} onCitySelect={chat.handleCitySelect} consumed={message.consumed} />;
    case 'bot_specializations':
      return <SpecializationsCard specs={message.specs} onSpecClick={chat.selectSpecialization} consumed={message.consumed} source={message.source} />;
    case 'bot_doctors_loading':
      return <DoctorsLoadingBubble text={message.text} />;
    case 'bot_clinic_doctors':
      return <ClinicDoctorsCard clinic={message.clinic} onBook={chat.bookDoctor} />;
    case 'bot_no_doctors':
      return <NoDoctorsBubble spec={message.spec} onAction={chat.handleAction} />;
    case 'bot_disclaimer':
      return <DisclaimerBubble text={message.text} />;
    case 'bot_action':
      return <ActionCard text={message.text} actions={message.actions} onAction={chat.handleAction} consumed={message.consumed} />;
    case 'user_reply':
      return <UserReplyBubble text={message.text} />;
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════
// ─── SUB-COMPONENTS ─────────────────────────────────────
// ══════════════════════════════════════════════════════════

function BotAvatar() {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
      <img src="/chatbot/dental chat bot .svg" alt="Bot" className="w-7 h-7" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-4 py-3 border border-neutral-300/40">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-neutral-900/25 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
          <span className="w-2 h-2 bg-neutral-900/25 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
          <span className="w-2 h-2 bg-neutral-900/25 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
        </div>
      </div>
    </div>
  );
}

function WelcomeCard() {
  const features = [
    { Icon: Camera, label: 'AI Dental Scan', desc: 'Get instant AI-powered dental analysis' },
    { Icon: Stethoscope, label: 'Find Specialists', desc: 'Discover verified dentists near you' },
    { Icon: FileText, label: 'Free Report', desc: 'Receive a detailed PDF report by email' },
  ];
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src="/chatbot/dental chat bot .svg" alt="Dental Scan" className="w-8 h-8" />
          </div>
          <span className="text-sm font-semibold font-display text-neutral-900">Welcome to BestoClinic!</span>
        </div>
        <div className="space-y-2.5 mb-3">
          {features.map(({ Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-md bg-primary-50 flex items-center justify-center mt-0.5 shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-neutral-900 block">{label}</span>
                <p className="text-[10px] text-neutral-900/50">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-900/40 border-t border-neutral-300/40 pt-2.5">
          <Lock className="w-3 h-3" />
          <span>Your data is encrypted and private</span>
        </div>
      </div>
    </div>
  );
}

function LocationPermissionCard({ onAllow, onChooseCity, consumed }) {
  return (
    <div className={`flex gap-2 items-start ${consumed ? 'opacity-50 pointer-events-none' : ''}`}>
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-sm font-semibold text-neutral-900">Find Nearby Clinics</span>
        </div>
        <p className="text-xs text-neutral-900/60 mb-3">
          Allow location access to find dental clinics and specialists nearest to you.
        </p>
        <button
          onClick={onAllow}
          disabled={consumed}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:shadow-md transition cursor-pointer mb-2"
        >
          <Navigation className="w-3.5 h-3.5" />
          Use My Location
        </button>
        <button
          onClick={onChooseCity}
          disabled={consumed}
          className="w-full py-2 text-xs text-neutral-900/50 hover:text-primary-600 transition cursor-pointer font-medium"
        >
          Choose City Instead
        </button>
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-900/30 mt-2 justify-center">
          <Lock className="w-3 h-3" />
          <span>Location is only used for this search and never stored</span>
        </div>
      </div>
    </div>
  );
}

function LocationConfirmedBubble({ city }) {
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200/60 rounded-xl rounded-bl-sm px-3.5 py-2.5">
        <MapPin className="w-4 h-4 text-primary-600" />
        <span className="text-xs font-medium text-primary-700">Found you near {city}</span>
      </div>
    </div>
  );
}

function BotTextBubble({ text }) {
  return (
    <div className="flex gap-2 items-start pr-10">
      <BotAvatar />
      <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3.5 py-2.5 border border-neutral-300/40">
        <p className="text-sm text-neutral-900/80 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function UserReplyBubble({ text }) {
  return (
    <div className="flex justify-end pl-10">
      <div className="bg-primary-600 text-white rounded-xl rounded-br-sm px-3.5 py-2.5">
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}

function ConsentCard({ onAccept, loading, consumed }) {
  return (
    <div className={`flex gap-2 items-start ${consumed ? 'opacity-50 pointer-events-none' : ''}`}>
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-primary-600" />
          <span className="text-sm font-semibold text-neutral-900">Privacy & Consent</span>
        </div>
        <p className="text-xs text-neutral-900/60 mb-1">By proceeding, you agree that:</p>
        <ul className="text-xs text-neutral-900/60 space-y-1 mb-4 list-disc pl-4">
          <li>Your dental images will be analyzed by AI for preliminary observations only</li>
          <li>This is not a professional diagnosis — always consult a dentist</li>
          <li>Your images and contact info will be stored securely for 30 days</li>
        </ul>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            disabled={loading || consumed}
            className="flex-1 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {consumed ? 'Accepted' : loading ? 'Starting...' : 'I Consent — Start Scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ─── SCANNER CARD (the main new component) ──────────────
// ══════════════════════════════════════════════════════════

function ScannerCard({ onCapture, photoCount, maxPhotos, loading }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scanPhase, setScanPhase] = useState('live'); // 'live' | 'scanning' | 'complete'
  const [preview, setPreview] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Current scan position based on photo count
  const currentPosition = SCAN_POSITIONS[Math.min(photoCount, SCAN_POSITIONS.length - 1)];

  // Voice instruction when position changes
  useEffect(() => {
    if (voiceEnabled && currentPosition && scanPhase === 'live' && !preview) {
      // Small delay to ensure camera is ready
      const timer = setTimeout(() => {
        speakVoice(currentPosition.voiceInstruction);
      }, 500);
      return () => {
        clearTimeout(timer);
        stopSpeaking();
      };
    }
    return () => stopSpeaking();
  }, [photoCount, voiceEnabled, currentPosition, scanPhase, preview]);
  // ── Camera lifecycle ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch {
      setCameraError('Camera access denied or unavailable');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!cameraError && scanPhase === 'live' && !preview) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera not supported in this browser');
        return;
      }
      startCamera();
    }
    return () => stopCamera();
  }, [scanPhase, preview, cameraError, startCamera, stopCamera]);

  // ── Capture from webcam ──
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    // Stop voice during capture
    stopSpeaking();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreview(dataUrl);
    stopCamera();

    // Trigger scan animation
    setScanPhase('scanning');
    setTimeout(() => {
      setScanPhase('complete');
      setTimeout(() => {
        setScanPhase('live');
      }, 1200);
    }, 2500);
  }, [stopCamera]);

  // ── File upload ──
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      setScanPhase('scanning');
      setTimeout(() => {
        setScanPhase('complete');
        setTimeout(() => setScanPhase('live'), 1200);
      }, 2500);
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Confirm upload ──
  const confirmUpload = useCallback(async () => {
    if (!preview) return;
    const base64 = preview.split(',')[1];
    await onCapture(base64, 'image/jpeg');
    setPreview(null);
    setScanPhase('live');
  }, [preview, onCapture]);

  // ── Retake ──
  const retake = useCallback(() => {
    setPreview(null);
    setScanPhase('live');
  }, []);

  // Responsive guide frame — measured from scanner viewport
  const scannerRef = useRef(null);
  const [scannerSize, setScannerSize] = useState({ w: 0, h: 0 });
  const guideW = scannerSize.w ? Math.round(scannerSize.w * 0.65) : 220;
  const guideH = scannerSize.h ? Math.round(scannerSize.h * 0.50) : 150;

  useEffect(() => {
    if (!scannerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setScannerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(scannerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-3 space-y-2">
        {/* Scanner viewport */}
        <div ref={scannerRef} className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
          {/* ── Live camera / Preview ── */}
          {preview ? (
            <img src={preview} alt="Captured" className="w-full h-full object-cover" />
          ) : !cameraError ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
              <Camera className="w-8 h-8 text-white/30" />
              <span className="text-xs text-white/50">{cameraError}</span>
            </div>
          )}

          {/* ── Dark mask overlay with clear mouth cutout ── */}
          {(scanPhase === 'live' || scanPhase === 'scanning') && !preview && !cameraError && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Top mask */}
              <div className="absolute top-0 left-0 right-0 bg-black/50" style={{ height: `calc(50% - ${guideH / 2}px)` }} />
              {/* Bottom mask */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50" style={{ height: `calc(50% - ${guideH / 2}px)` }} />
              {/* Left mask */}
              <div
                className="absolute bg-black/50"
                style={{
                  top: `calc(50% - ${guideH / 2}px)`,
                  left: 0,
                  width: `calc(50% - ${guideW / 2}px)`,
                  height: `${guideH}px`,
                }}
              />
              {/* Right mask */}
              <div
                className="absolute bg-black/50"
                style={{
                  top: `calc(50% - ${guideH / 2}px)`,
                  right: 0,
                  width: `calc(50% - ${guideW / 2}px)`,
                  height: `${guideH}px`,
                }}
              />
            </div>
          )}

          {/* ── Corner brackets (pulsing) ── */}
          {scanPhase === 'live' && !preview && !cameraError && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: `calc(50% - ${guideH / 2}px)`,
                left: `calc(50% - ${guideW / 2}px)`,
                width: `${guideW}px`,
                height: `${guideH}px`,
                animation: 'pulseCorners 2s ease-in-out infinite',
              }}
            >
              {/* Top-left */}
              <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-lg drop-shadow-[0_0_4px_rgba(0,229,255,0.5)]" />
              {/* Top-right */}
              <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-lg drop-shadow-[0_0_4px_rgba(0,229,255,0.5)]" />
              {/* Bottom-left */}
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-lg drop-shadow-[0_0_4px_rgba(0,229,255,0.5)]" />
              {/* Bottom-right */}
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-lg drop-shadow-[0_0_4px_rgba(0,229,255,0.5)]" />
              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-8 h-[2px] bg-cyan-400/80 rounded-full shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
                <div className="w-[2px] h-8 bg-cyan-400/80 rounded-full shadow-[0_0_6px_rgba(0,229,255,0.4)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              {/* Guide label */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[9px] font-medium text-cyan-300/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Align teeth here</span>
              </div>
            </div>
          )}

          {/* ── Scan line animation ── */}
          {scanPhase === 'scanning' && (
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_rgba(0,229,255,0.6)]"
                style={{ animation: 'scanLine 2.5s ease-in-out infinite' }}
              />
              {/* Detecting label */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] text-cyan-300 font-medium">Detecting dental features...</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Scan Complete overlay ── */}
          {scanPhase === 'complete' && (
            <div
              className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none"
              style={{ animation: 'scanComplete 0.5s ease-out' }}
            >
              <CheckCircle className="w-10 h-10 text-emerald-400 drop-shadow-lg" />
              <span className="text-sm font-bold text-white mt-2 drop-shadow-lg">Scan Complete!</span>
            </div>
          )}

          {/* ── Position instruction overlay ── */}
          {scanPhase === 'live' && !preview && !cameraError && currentPosition && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 max-w-[90%]">
              <div className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-center">
                <span className="text-[11px] text-cyan-300 font-semibold">{currentPosition.label}</span>
              </div>
            </div>
          )}

          {/* ── Voice toggle ── */}
          {isVoiceSupported() && (
            <button
              onClick={() => { setVoiceEnabled(v => { if (v) stopSpeaking(); return !v; }); }}
              className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white/80 hover:bg-black/70 transition"
              title={voiceEnabled ? 'Mute voice' : 'Enable voice'}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* ── Position progress dots ── */}
        <div className="flex items-center justify-center gap-2 py-1.5">
          {SCAN_POSITIONS.map((pos, i) => (
            <div
              key={pos.id}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                i < photoCount
                  ? 'bg-emerald-100 text-emerald-700'
                  : i === photoCount
                    ? 'bg-primary-100 text-primary-700 ring-1.5 ring-primary-300'
                    : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {i < photoCount && <Check className="w-3 h-3" />}
              {pos.label}
            </div>
          ))}
        </div>

        {/* ── Instruction bar ── */}
        {!preview && currentPosition && (
          <div className="px-3 py-1.5 bg-neutral-50 border border-neutral-200/60 rounded-lg text-center">
            <p className="text-xs font-medium text-neutral-800">{currentPosition.label}</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">{currentPosition.voiceInstruction.split('.')[0]}</p>
          </div>
        )}

        {/* ── Controls ── */}
        {preview ? (
          /* Preview confirm/retake */
          <div className="flex gap-2">
            <button
              onClick={retake}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-neutral-900/60 bg-white border border-neutral-300/60 rounded-lg hover:bg-neutral-100 transition cursor-pointer"
            >
              Retake
            </button>
            <button
              onClick={confirmUpload}
              disabled={loading || scanPhase === 'scanning'}
              className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Uploading...
                </>
              ) : scanPhase !== 'live' ? (
                'Scanning...'
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        ) : !cameraError ? (
          /* Camera controls */
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 text-[10px] font-medium text-neutral-900/50 hover:text-neutral-900/70 bg-white border border-neutral-300/60 rounded-lg transition cursor-pointer flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              File
            </button>
            <button
              onClick={capturePhoto}
              disabled={!cameraReady}
              className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg hover:from-primary-600 hover:to-primary-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              Capture
            </button>
          </div>
        ) : (
          /* File upload fallback */
          <div className="space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-neutral-300 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition flex flex-col items-center gap-2 cursor-pointer"
            >
              <Upload className="w-6 h-6 text-neutral-900/30" />
              <span className="text-xs text-neutral-900/50">Click to upload a dental photo</span>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}

// ── Remaining sub-components (unchanged) ──────────────────

function UploadStatusBubble({ text, done }) {
  return (
    <div className="flex gap-2 items-start pr-10">
      <BotAvatar />
      <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3.5 py-2 border border-neutral-300/40 flex items-center gap-2">
        {done ? (
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        ) : (
          <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
        )}
        <span className={`text-xs ${done ? 'text-emerald-700' : 'text-neutral-900/60'}`}>{text}</span>
      </div>
    </div>
  );
}

function LeadCaptureForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [step, setStep] = useState(1); // 1=email, 2=name, 3=phone
  const [error, setError] = useState('');

  const STEPS = [
    { key: 'email', type: 'email', placeholder: 'Email Address', hint: "We'll send your detailed report here", validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Please enter a valid email' },
    { key: 'name', type: 'text', placeholder: 'Full Name', hint: 'So we can personalize your report', validate: (v) => v.trim().length >= 2 ? '' : 'Name is required' },
    { key: 'phone', type: 'tel', placeholder: 'Phone Number (optional)', hint: 'For appointment booking assistance', validate: () => '' },
  ];

  const current = STEPS[step - 1];

  const handleNext = (e) => {
    e?.preventDefault();
    const err = current.validate(form[current.key]);
    if (err) { setError(err); return; }
    setError('');
    if (step < 3) { setStep(step + 1); return; }
    onSubmit(form);
  };

  const handleSkip = () => {
    if (step === 3) { onSubmit(form); return; }
    setStep(step + 1);
  };

  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <form onSubmit={handleNext} className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-neutral-900">Almost there!</p>
          <span className="text-[10px] text-neutral-400">{step} of 3</span>
        </div>
        <p className="text-[11px] text-neutral-500">{current.hint}</p>
        <input
          key={current.key}
          type={current.type}
          placeholder={current.placeholder}
          value={form[current.key]}
          onChange={(e) => { setForm({ ...form, [current.key]: e.target.value }); setError(''); }}
          className="input-base text-xs"
          autoFocus
        />
        {error && <p className="text-[10px] text-red-600">{error}</p>}
        <div className="flex gap-2">
          {step === 3 && (
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 px-3 py-2 text-xs font-medium text-neutral-500 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition cursor-pointer"
            >
              Skip
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Processing...' : step < 3 ? 'Continue' : 'Get My Results'}
          </button>
        </div>
        {/* Step dots */}
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-1.5 h-1.5 rounded-full transition-all ${s === step ? 'bg-primary-500 w-4' : s < step ? 'bg-primary-300' : 'bg-neutral-300'}`} />
          ))}
        </div>
      </form>
    </div>
  );
}

function AnalyzingBubble({ text }) {
  return (
    <div className="flex gap-2 items-start pr-10">
      <BotAvatar />
      <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3.5 py-3 border border-neutral-300/40">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
          <span className="text-sm text-neutral-900/60">{text}</span>
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary-400 animate-pulse"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultSummaryCard({ text }) {
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-accent-600" />
          <span className="text-sm font-semibold font-display text-neutral-900">AI Analysis Summary</span>
        </div>
        <p className="text-sm text-neutral-900/70 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function ObservationCard({ observation }) {
  const obs = observation;
  const conf = CONFIDENCE_STYLES[obs.confidence] || CONFIDENCE_STYLES.low;
  const label = OBS_TYPE_LABELS[obs.type] || obs.type;
  const [expanded, setExpanded] = useState(obs.confidence === 'high');

  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-neutral-900">{label}</span>
            {obs.area && <span className="text-[10px] text-neutral-900/40 ml-1">({obs.area})</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${conf.bg} ${conf.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
              {obs.confidence}
            </span>
            <ChevronRight className={`w-3 h-3 text-neutral-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </div>
        </button>
        {expanded && (
          <div className="mt-2 pt-2 border-t border-neutral-200/60">
            {obs.toothNumbers?.length > 0 && (
              <p className="text-[11px] text-neutral-900/50 mb-1">Teeth: {obs.toothNumbers.join(', ')}</p>
            )}
            {obs.description && (
              <p className="text-xs text-neutral-900/60">{obs.description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CityPickerCard({ cities, onCitySelect, consumed }) {
  return (
    <div className={`flex gap-2 items-start ${consumed ? 'opacity-50 pointer-events-none' : ''}`}>
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-primary-600" />
          <span className="text-sm font-semibold text-neutral-900">Select Your City</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {cities?.map((city) => (
            <button
              key={city}
              onClick={() => onCitySelect(city)}
              disabled={consumed}
              className="px-3 py-2 text-xs font-medium bg-white border border-neutral-300/60 rounded-lg hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-all cursor-pointer text-neutral-900/70 flex items-center gap-1.5"
            >
              <Navigation className="w-3 h-3" />
              {city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpecializationsCard({ specs, onSpecClick, consumed, source }) {
  const isDiscovery = source === 'discovery';
  return (
    <div className={`flex gap-2 items-start ${consumed ? 'opacity-50 pointer-events-none' : ''}`}>
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Stethoscope className="w-4 h-4 text-primary-600" />
          <span className="text-xs font-semibold text-neutral-900">{isDiscovery ? 'Dental Specializations' : 'Recommended Specialists'}</span>
        </div>
        <p className="text-[10px] text-neutral-900/50 mb-2">
          {consumed ? 'Selection made' : (isDiscovery ? 'Select a specialization to find nearby doctors' : 'Click a specialization to find doctors')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {specs.map((spec) => (
            <button
              key={spec}
              onClick={() => onSpecClick(spec)}
              disabled={consumed}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all flex items-center gap-1 ${
                consumed
                  ? 'bg-neutral-200/60 text-neutral-900/40 border-neutral-300/40 cursor-default'
                  : 'bg-primary-50 text-primary-700 border-primary-100 hover:bg-primary-100 hover:border-primary-200 cursor-pointer'
              }`}
            >
              {spec}
              {!consumed && <ChevronRight className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DisclaimerBubble({ text }) {
  return (
    <div className="flex gap-2 items-start pr-6">
      <BotAvatar />
      <div className="bg-neutral-200/60 rounded-xl rounded-bl-sm px-3 py-2 border border-neutral-300/30">
        <div className="flex items-start gap-1.5">
          <Info className="w-3 h-3 text-neutral-900/30 mt-0.5 shrink-0" />
          <p className="text-[10px] text-neutral-900/40 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

function PhotoHistoryCard({ photos }) {
  if (!photos?.length) return null;
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Camera className="w-4 h-4 text-primary-600" />
          <span className="text-xs font-semibold text-neutral-900">Captured Photos</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
              <img
                src={p.preview.startsWith('data:') ? p.preview : `data:image/jpeg;base64,${p.preview}`}
                alt={`${p.angle} view`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[8px] px-1 py-0.5 rounded capitalize">
                {p.angle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HealthScoreCardBubble({ healthScore }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <HealthScoreCard healthScore={healthScore} isHero />
      </div>
    </div>
  );
}

function DentalChartCard({ observations }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
        <DentalChart observations={observations} />
      </div>
    </div>
  );
}

function DoctorsLoadingBubble({ text }) {
  return (
    <div className="flex gap-2 items-start pr-10">
      <BotAvatar />
      <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3.5 py-3 border border-neutral-300/40">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
          <span className="text-xs text-neutral-900/60">{text}</span>
        </div>
      </div>
    </div>
  );
}

function DoctorMiniCard({ doctor, onBook }) {
  const initials = doctor.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  return (
    <div className="bg-white rounded-lg border border-neutral-300/60 p-2.5 space-y-2">
      <div className="flex gap-2">
        {/* Avatar */}
        {doctor.avatar ? (
          <img src={doctor.avatar} alt={doctor.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary-700">{initials}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-neutral-900 truncate">{doctor.name}</p>
          {doctor.specializations?.length > 0 && (
            <p className="text-[10px] text-neutral-900/50 truncate">{doctor.specializations.join(', ')}</p>
          )}
        </div>
        {/* Rating */}
        {doctor.averageRating > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] font-semibold text-neutral-900">{doctor.averageRating}</span>
            <span className="text-[9px] text-neutral-900/40">({doctor.totalReviews})</span>
          </div>
        )}
      </div>

      {/* Details row */}
      <div className="flex items-center gap-3 text-[10px] text-neutral-900/50">
        {doctor.experienceYears > 0 && (
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {doctor.experienceYears}y exp
          </span>
        )}
        {doctor.acceptingNewPatients && (
          <span className="flex items-center gap-0.5 text-emerald-600">
            <UserCheck className="w-2.5 h-2.5" />
            Open
          </span>
        )}
      </div>

      {/* Fee + Book button */}
      <div className="flex items-center justify-between">
        {doctor.consultationFee > 0 && (
          <span className="text-[10px] font-medium text-neutral-900/60">
            &#8377;{doctor.consultationFee}
          </span>
        )}
        <button
          onClick={() => onBook(doctor)}
          className="ml-auto px-3 py-1 text-[10px] font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition cursor-pointer flex items-center gap-1"
        >
          Book Appointment
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

function ClinicDoctorsCard({ clinic, onBook }) {
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-2.5 space-y-2">
        {/* Clinic header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <div>
              <span className="text-xs font-semibold text-neutral-900 block">{clinic.clinicName}</span>
              {clinic.clinicCity && (
                <span className="text-[10px] text-neutral-900/50">{clinic.clinicCity}</span>
              )}
            </div>
          </div>
          {clinic.distanceKm != null && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              <Navigation className="w-2.5 h-2.5" />
              {clinic.distanceKm} km
            </span>
          )}
        </div>
        {/* Doctors at this clinic */}
        {clinic.doctors.map((doc) => (
          <DoctorMiniCard key={doc._id} doctor={doc} onBook={onBook} />
        ))}
      </div>
    </div>
  );
}

function NoDoctorsBubble({ spec, onAction }) {
  return (
    <div className="flex gap-2 items-start">
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-4">
        <div className="text-center mb-3">
          <div className="w-10 h-10 rounded-full bg-neutral-200/80 flex items-center justify-center mx-auto mb-2">
            <MapPin className="w-5 h-5 text-neutral-900/30" />
          </div>
          <p className="text-xs font-medium text-neutral-900/70 mb-1">
            No {spec} specialists found nearby
          </p>
        </div>
        <div className="space-y-1.5">
          <button
            onClick={() => onAction?.('find_doctors')}
            className="w-full px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:from-primary-600 hover:to-primary-700 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            Try Different Specialization
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => onAction?.('try_another_city')}
            className="w-full px-3 py-1.5 text-xs font-medium text-neutral-600 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition cursor-pointer"
          >
            Search in Another City
          </button>
          <button
            onClick={() => onAction?.('send_report')}
            className="w-full px-3 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-600 transition cursor-pointer"
          >
            Get Report by Email Instead
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ text, actions, onAction, consumed }) {
  return (
    <div className={`flex gap-2 items-start ${consumed ? 'opacity-50 pointer-events-none' : ''}`}>
      <BotAvatar />
      <div className="flex-1 bg-neutral-100 rounded-xl rounded-bl-sm border border-neutral-300/40 p-3 space-y-2">
        {text && <p className="text-xs text-neutral-900/60">{text}</p>}
        {actions?.map((a) => (
          <button
            key={a.action}
            onClick={() => onAction(a.action)}
            disabled={consumed}
            className={`w-full px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              consumed
                ? 'bg-neutral-200/60 text-neutral-900/30 border border-neutral-300/40 cursor-default'
                : a.variant === 'primary'
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-sm shadow-primary-600/20 cursor-pointer'
                  : 'bg-white border border-neutral-300/60 text-neutral-900/60 hover:bg-neutral-100 hover:text-neutral-900/80 cursor-pointer'
            }`}
          >
            {a.label}
            {!consumed && <ChevronRight className="w-3 h-3" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function StickyActionBar({ messages, onAction }) {
  // Find last unconsumed bot_action message
  const lastAction = [...messages].reverse().find(m => m.type === 'bot_action' && !m.consumed);
  if (!lastAction?.actions?.length) return null;

  return (
    <div className="border-t border-neutral-100 bg-white px-4 py-3 shrink-0">
      <div className="max-w-2xl mx-auto flex gap-2">
        {lastAction.actions.map((a) => (
          <button
            key={a.action}
            onClick={() => onAction(a.action)}
            className={`flex-1 px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              a.variant === 'primary'
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-sm shadow-primary-600/20'
                : 'bg-white border border-neutral-300/60 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {a.label}
            <ChevronRight className="w-3 h-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
