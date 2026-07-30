/**
 * DentalScanExperience - Main immersive scanner entry point
 * Orchestrates the complete dental scan flow from splash to results
 * Replaces DentalScanChatbot.jsx with voice-first immersive experience
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useScannerFlow, SCANNER_PHASES } from './hooks/useScannerFlow';
import { useVoiceCoach } from './hooks/useVoiceCoach';
import { soundManager, SCANNER_SOUNDS } from '../../lib/scanner/sounds';

// Flow screens
import SplashScreen from './flows/SplashScreen';
import ConsentScreen from './flows/ConsentScreen';
import ScannerShell from './shell/ScannerShell';

// API (assuming these exist or need to be created)
import { guestScanApi } from '../../api/guestScanApi';

/**
 * Scan position definitions
 */
const SCAN_POSITIONS = [
  {
    id: 'left',
    label: 'Left Side',
    voiceInstruction: "Please turn your head to face your right shoulder and smile. Hold this position steady.",
    voiceSuccess: "Left side captured successfully.",
    voiceTransition: "Moving to front view.",
    quadrants: ['Q2', 'Q3'],
  },
  {
    id: 'front',
    label: 'Front View',
    voiceInstruction: "Face the camera directly and smile. Keep your head level.",
    voiceSuccess: "Front view captured successfully.",
    voiceTransition: "Moving to right side view.",
    quadrants: ['Q1', 'Q2', 'Q3', 'Q4'],
  },
  {
    id: 'right',
    label: 'Right Side',
    voiceInstruction: "Please turn your head to face your left shoulder and smile. Hold this position steady.",
    voiceSuccess: "Right side captured successfully. Processing scan results.",
    voiceTransition: null,
    quadrants: ['Q1', 'Q4'],
  },
];

/**
 * DentalScanExperience Component
 */
export default function DentalScanExperience({
  clinicSlug,
  clinicName = 'BestoClinic',
  onComplete,
  onClose,
}) {
  // Initialize sound manager on mount
  useEffect(() => {
    soundManager.init();
  }, []);

  // Voice coach hook
  const {
    isPlaying: voiceActive,
    currentMessage: voiceMessage,
    isSupported: voiceSupported,
    speak,
    speakNatural,
    stop: stopVoice,
  } = useVoiceCoach(true);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Scanner flow hook
  const {
    phase,
    scanState,
    currentPositionIndex,
    capturedFrames,
    progress,
    sessionToken,
    validationState,
    showFlash,
    showTransition,
    handleSplashComplete,
    handleConsentAccept,
    startCountdown,
    capturePhoto,
    handleValidationSuccess,
    handleValidationFailure,
    manualCapture,
    retryCapture,
    nextPosition,
    analyzeScans,
    showResults,
  } = useScannerFlow(SCAN_POSITIONS);

  const currentPosition = SCAN_POSITIONS[currentPositionIndex];

  // Camera state
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  // Track last spoken state to prevent duplicates (React StrictMode causes double renders)
  const lastSpokenStateRef = useRef(null);

  /**
   * Voice guidance based on scan state
   */
  useEffect(() => {
    if (!voiceEnabled || !voiceSupported) return;

    // Prevent duplicate voice calls (React StrictMode double-invokes effects)
    const stateKey = `${scanState}-${currentPositionIndex}`;
    if (lastSpokenStateRef.current === stateKey) {
      return;
    }
    lastSpokenStateRef.current = stateKey;

    switch (scanState) {
      case 'intro':
        if (currentPosition) {
          speak(currentPosition.voiceInstruction);
        }
        break;

      case 'captured_ok':
        if (currentPosition) {
          soundManager.play(SCANNER_SOUNDS.SUCCESS);
          speak(currentPosition.voiceSuccess);
        }
        break;

      case 'transitioning':
        if (currentPosition?.voiceTransition) {
          soundManager.play(SCANNER_SOUNDS.TRANSITION);
          speak(currentPosition.voiceTransition);
        }
        break;

      case 'countdown':
        // Countdown ticks handled by CountdownOverlay
        break;

      default:
        break;
    }
  }, [scanState, currentPosition, currentPositionIndex, voiceEnabled, voiceSupported, speak]);

  /**
   * Handle consent acceptance
   */
  const onConsentAccepted = useCallback(() => {
    handleConsentAccept();
    // Voice will be handled by useEffect when scanState changes to 'intro'
  }, [handleConsentAccept]);

  /**
   * Handle consent decline
   */
  const onConsentDeclined = useCallback(() => {
    if (voiceEnabled) {
      speak("Scan cancelled. You may restart when ready.");
    }
    setTimeout(() => onClose?.(), 1500);
  }, [speak, voiceEnabled, onClose]);

  /**
   * Handle camera ready
   */
  const onCameraReady = useCallback((stream) => {
    setCameraStream(stream);
    setCameraError(null);
  }, []);

  /**
   * Handle camera error
   */
  const onCameraError = useCallback((error) => {
    setCameraError(error);
    if (voiceEnabled) {
      speak("Camera access is required to continue. Please enable camera permissions.");
    }
  }, [speak, voiceEnabled]);

  /**
   * Handle photo capture
   */
  const onCapture = useCallback(
    async (imageData) => {
      try {
        soundManager.play(SCANNER_SOUNDS.CAPTURE);

        // Validate frame with backend
        const validation = await guestScanApi.validateFrame(sessionToken, {
          imageData,
          expectedAngle: currentPosition.id,
          mimeType: 'image/jpeg',
        });

        if (validation.valid && validation.confidence > 0.7) {
          // Success - detect teeth
          const detection = await guestScanApi.detectTeeth(sessionToken, {
            imageData,
            angle: currentPosition.id,
            mimeType: 'image/jpeg',
          });

          handleValidationSuccess({
            imageData,
            detectedTeeth: detection.teethVisible,
            detectedQuadrants: detection.quadrants,
            confidence: detection.confidence,
          });
        } else {
          // Failure - provide feedback
          handleValidationFailure({
            feedback: validation.feedback || 'Position not optimal. Please adjust.',
            confidence: validation.confidence,
          });

          if (voiceEnabled) {
            speak(validation.feedback || 'Position not optimal. Please adjust and hold steady.');
          }
        }
      } catch (error) {
        console.error('[DentalScanExperience] Capture error:', error);
        handleValidationFailure({
          feedback: 'Connection error. Trying again...',
          confidence: 0,
        });
      }
    },
    [sessionToken, currentPosition, handleValidationSuccess, handleValidationFailure, voiceEnabled, speak]
  );

  /**
   * Toggle voice guidance
   */
  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled(prev => !prev);
    if (voiceEnabled) {
      stopVoice();
    }
  }, [voiceEnabled, stopVoice]);

  /**
   * Handle scan completion
   */
  const onScanComplete = useCallback(
    async (results) => {
      if (voiceEnabled) {
        speak("Scan analysis complete. Results are now available.");
      }
      soundManager.play(SCANNER_SOUNDS.COMPLETE);
      onComplete?.(results);
    },
    [speak, voiceEnabled, onComplete]
  );

  /**
   * Render current phase
   */
  return (
    <AnimatePresence mode="wait">
      {phase === SCANNER_PHASES.SPLASH && (
        <SplashScreen key="splash" clinicName={clinicName} onComplete={handleSplashComplete} />
      )}

      {phase === SCANNER_PHASES.CONSENT && (
        <ConsentScreen
          key="consent"
          clinicName={clinicName}
          onConsent={onConsentAccepted}
          onDecline={onConsentDeclined}
        />
      )}

      {phase === SCANNER_PHASES.SCANNING && (
        <ScannerShell
          key="scanner"
          // Flow state
          phase={phase}
          scanState={scanState}
          currentPosition={currentPosition}
          positions={SCAN_POSITIONS}
          progress={progress}
          // Voice state
          voiceActive={voiceActive}
          voiceMessage={voiceMessage}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
          // Camera
          cameraStream={cameraStream}
          cameraError={cameraError}
          onCameraReady={onCameraReady}
          onCameraError={onCameraError}
          // Actions
          onClose={onClose}
          onCapture={onCapture}
          onManualCapture={onCapture}
          // Visual feedback
          showFlash={showFlash}
          showTransition={showTransition}
          validationState={validationState}
        />
      )}

      {phase === SCANNER_PHASES.ANALYZING && (
        <div key="analyzing" className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Analyzing Your Dental Health</h2>
            <p className="text-gray-400">Our AI is reviewing your scans...</p>
          </div>
        </div>
      )}

      {phase === SCANNER_PHASES.RESULTS && (
        <div key="results" className="fixed inset-0 z-50 bg-gray-900 flex items-center justify-center">
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Results Ready!</h2>
            <p className="text-gray-300 mb-6">Your dental scan analysis is complete.</p>
            <button
              onClick={() => onScanComplete(capturedFrames)}
              className="px-8 py-4 bg-cyan-500 text-white rounded-xl font-semibold hover:bg-cyan-600 transition"
            >
              View Results
            </button>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
