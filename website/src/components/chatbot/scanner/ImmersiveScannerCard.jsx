/**
 * ImmersiveScannerCard — Full immersive scanner replacing the manual ScannerCard.
 * Combines camera, MediaPipe face detection, auto-capture, and all visual overlays.
 *
 * Flow: Intro → Position guide + auto-capture → Transition → Complete
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Loader2, Upload } from 'lucide-react';
import { isVoiceSupported, speak as speakVoice, stopSpeaking } from '../../../lib/voiceGuidance';
import { uploadGuestScanImage, validateGuestFrame } from '../../../api/publicApi';
import { SCAN_POSITIONS } from '../../../constants/dentalScanGuide';
import useFaceDetection from './useFaceDetection';
import useAutoCapture from './useAutoCapture';
import { SCANNER_STATES } from './ScannerStateMachine';
import ScanIntroOverlay from './ScanIntroOverlay';
import PositionSilhouette from './PositionSilhouette';
import AngleMeter from './AngleMeter';
import CountdownRing from './CountdownRing';
import ProgressRail from './ProgressRail';
import CaptureTransition from './CaptureTransition';
import ScanCelebration from './ScanCelebration';

export default function ImmersiveScannerCard({
  sessionToken,
  onAllCaptured,
  onUploadPhoto,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const lastVoiceKeyRef = useRef(null);

  // Face detection (only active during positioning/countdown states)
  const { faceData, isReady: faceReady, hasFailed: faceFailed } = useFaceDetection(
    videoRef,
    cameraReady
  );

  // Capture from webcam
  const captureFromWebcam = useCallback(async (position) => {
    if (!videoRef.current || !canvasRef.current) throw new Error('Camera not ready');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];

    // Upload to server
    if (sessionToken && onUploadPhoto) {
      await onUploadPhoto(base64, 'image/jpeg');
    }

    return {
      base64,
      thumbnailUri: dataUrl,
    };
  }, [sessionToken, onUploadPhoto]);

  // Auto-capture hook
  const {
    scanner,
    currentPosition,
    countdownValue,
    countdownProgress,
    startScan,
    skipIntro,
    introDone,
    reset,
  } = useAutoCapture({
    faceData,
    faceDetectionReady: faceReady,
    faceDetectionFailed: faceFailed,
    onCapture: captureFromWebcam,
    onAllCaptured,
  });

  // ── Camera lifecycle ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch {
      stopSpeaking();
      stopCamera();
      setCameraError('Camera access denied or unavailable');
    }
  }, [stopCamera]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start camera when entering scan flow (after intro)
  useEffect(() => {
    const shouldCamera =
      scanner.state !== SCANNER_STATES.IDLE &&
      scanner.state !== SCANNER_STATES.COMPLETE &&
      !cameraError;

    if (shouldCamera && !streamRef.current) {
      if (navigator.mediaDevices?.getUserMedia) {
        startCamera();
      } else {
        setCameraError('Camera not supported in this browser');
      }
    }

    return () => {
      if (scanner.state === SCANNER_STATES.COMPLETE || scanner.state === SCANNER_STATES.IDLE) {
        stopCamera();
      }
    };
  }, [scanner.state, cameraError, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── Voice coaching (deduped by voiceKey, always stops previous before new) ──
  // Key principle: if the user advances faster than the voice, cancel current
  // voice immediately and play the new instruction without overlap.
  useEffect(() => {
    if (!voiceEnabled || !currentPosition) {
      stopSpeaking();
      return;
    }

    // Build a unique key for what should be spoken in this state
    let voiceKey = null;
    let voiceText = null;

    if (scanner.state === SCANNER_STATES.POSITIONING) {
      voiceKey = `positioning-${scanner.currentPosition}`;
      voiceText = currentPosition.voiceInstruction;
    } else if (scanner.state === SCANNER_STATES.COUNTDOWN) {
      // Don't speak during countdown — let the visual ring do the work.
      // This prevents "Three Two One" from overlapping with positioning voice.
      voiceKey = null;
    } else if (scanner.state === SCANNER_STATES.CAPTURED_OK) {
      voiceKey = `ok-${scanner.currentPosition}`;
      voiceText = currentPosition.voiceSuccess || 'Great shot!';
    } else if (scanner.state === SCANNER_STATES.TRANSITIONING) {
      voiceKey = `transition-${scanner.currentPosition}`;
      voiceText = currentPosition.voiceTransition;
    } else if (scanner.state === SCANNER_STATES.CAPTURED_FAIL && scanner.validationFeedback) {
      voiceKey = `fail-${scanner.currentPosition}-${scanner.retryCount}`;
      voiceText = scanner.validationFeedback;
    } else if (scanner.state === SCANNER_STATES.COMPLETE) {
      voiceKey = 'complete';
      voiceText = 'Excellent! All positions captured. Analyzing your dental health now.';
    }

    if (!voiceKey || !voiceText || voiceKey === lastVoiceKeyRef.current) return;

    // Always stop any in-progress speech before starting new
    stopSpeaking();
    lastVoiceKeyRef.current = voiceKey;

    // Small delay to let the stop() complete before new speech starts
    const timer = setTimeout(() => {
      speakVoice(voiceText);
    }, 150);

    return () => {
      clearTimeout(timer);
      stopSpeaking();
    };
  }, [scanner.state, scanner.currentPosition, scanner.validationFeedback, scanner.retryCount, voiceEnabled, currentPosition]);

  // Auto-start scan immediately
  useEffect(() => {
    if (scanner.state === SCANNER_STATES.IDLE) {
      startScan();
    }
  }, [scanner.state, startScan]);

  // ── File upload fallback ──
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file || !currentPosition) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      if (sessionToken && onUploadPhoto) {
        await onUploadPhoto(base64, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  }, [currentPosition, sessionToken, onUploadPhoto]);

  const isScanning = scanner.state !== SCANNER_STATES.IDLE && scanner.state !== SCANNER_STATES.COMPLETE;

  return (
    <div className="flex-1 flex flex-col" role="region" aria-label="Dental scanner">
      {/* Progress Rail */}
      <ProgressRail
        currentPosition={scanner.currentPosition}
        captures={scanner.captures}
      />

      {/* Scanner Viewport */}
      <div className="relative flex-1 bg-black overflow-hidden" style={{ minHeight: 320, aspectRatio: '4/3' }}>
        {/* Camera feed */}
        {!cameraError ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!cameraReady && isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
            <Camera className="w-8 h-8 text-white/30" />
            <span className="text-xs text-white/50">{cameraError}</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-4 py-2 text-xs font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload Photos Instead
            </button>
          </div>
        )}

        {/* ── Intro overlay ── */}
        <ScanIntroOverlay
          visible={scanner.state === SCANNER_STATES.INTRO}
          onDone={introDone}
          onSkip={skipIntro}
        />

        {/* ── Position silhouette overlay ── */}
        {(scanner.state === SCANNER_STATES.POSITIONING || scanner.state === SCANNER_STATES.COUNTDOWN) && currentPosition && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <PositionSilhouette position={currentPosition.id} size={200} />
          </div>
        )}

        {/* ── Angle meter (website only, when face detection works; hidden for timer-only) ── */}
        {!faceFailed && currentPosition && !currentPosition.timerOnlyCapture && (
          <AngleMeter
            yaw={faceData.yaw}
            targetYaw={currentPosition.targetYaw}
            facePresent={faceData.facePresent}
            visible={scanner.state === SCANNER_STATES.POSITIONING || scanner.state === SCANNER_STATES.COUNTDOWN}
          />
        )}

        {/* ── Countdown ring ── */}
        <CountdownRing
          seconds={countdownValue}
          progress={countdownProgress}
          visible={scanner.state === SCANNER_STATES.COUNTDOWN}
        />

        {/* ── Captured OK flash ── */}
        <AnimatePresence>
          {scanner.state === SCANNER_STATES.CAPTURED_OK && (
            <motion.div
              className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Capture transition ── */}
        <CaptureTransition
          visible={scanner.state === SCANNER_STATES.TRANSITIONING}
          nextPosition={scanner.currentPosition + 1}
        />

        {/* ── Validation failure feedback ── */}
        <AnimatePresence>
          {scanner.state === SCANNER_STATES.CAPTURED_FAIL && (
            <motion.div
              className="absolute bottom-4 left-4 right-4 z-20"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <div className="bg-amber-900/80 backdrop-blur-sm rounded-xl px-4 py-3 text-center" role="alert" aria-live="assertive">
                <p className="text-amber-200 text-xs font-medium">
                  {scanner.validationFeedback || 'Please adjust your position'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* ── Scan celebration ── */}
        <ScanCelebration visible={scanner.state === SCANNER_STATES.COMPLETE} />

        {/* ── Voice toggle ── */}
        {isVoiceSupported() && (
          <button
            onClick={() => {
              setVoiceEnabled((v) => {
                if (v) stopSpeaking();
                return !v;
              });
            }}
            aria-label={voiceEnabled ? 'Disable voice guidance' : 'Enable voice guidance'}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white/80 hover:bg-black/70 transition z-30 cursor-pointer"
          >
            {voiceEnabled ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            )}
          </button>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Status bar below scanner */}
      {scanner.state === SCANNER_STATES.POSITIONING && currentPosition && (
        <motion.div
          className="bg-neutral-900 px-4 py-3 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-cyan-400 text-sm font-semibold" aria-live="polite">{currentPosition.label}</p>
          <p className="text-white/50 text-xs mt-0.5">{currentPosition.voiceInstruction.split('.')[0]}</p>
          {!faceFailed && faceData.facePresent && (
            <p className="text-emerald-400 text-[10px] mt-1 font-medium">Face detected — hold steady</p>
          )}
        </motion.div>
      )}

      {scanner.state === SCANNER_STATES.VALIDATING && (
        <div className="bg-neutral-900 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            <span className="text-cyan-400 text-xs font-medium">Validating capture...</span>
          </div>
        </div>
      )}
    </div>
  );
}
