/**
 * useScannerFlow Hook - Simple, working scanner flow
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Scanner phases
export const SCANNER_PHASES = {
  SPLASH: 'splash',
  CONSENT: 'consent',
  SCANNING: 'scanning',
  ANALYZING: 'analyzing',
  RESULTS: 'results',
};

// Scanning substates
const SCAN_STATES = {
  INTRO: 'intro',
  POSITIONING: 'positioning',
  COUNTDOWN: 'countdown',
  CAPTURING: 'capturing',
  VALIDATING: 'validating',
  CAPTURED_OK: 'captured_ok',
  TRANSITIONING: 'transitioning',
};

export function useScannerFlow(positions) {
  const [phase, setPhase] = useState(SCANNER_PHASES.SPLASH);
  const [scanState, setScanState] = useState(SCAN_STATES.INTRO);
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState([]);
  const [sessionToken, setSessionToken] = useState(null);
  const [validationState, setValidationState] = useState(null);
  const [showFlash, setShowFlash] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  const timerRef = useRef(null);

  // Calculate progress
  const progress = (capturedFrames.length / positions.length) * 100;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Handle splash complete - advance to consent
  const handleSplashComplete = useCallback(() => {
    setPhase(SCANNER_PHASES.CONSENT);
  }, []);

  // Handle consent accept - advance to scanning
  const handleConsentAccept = useCallback(() => {
    setPhase(SCANNER_PHASES.SCANNING);
    setScanState(SCAN_STATES.INTRO);
  }, []);

  // Start countdown
  const startCountdown = useCallback(() => {
    setScanState(SCAN_STATES.COUNTDOWN);
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    setScanState(SCAN_STATES.CAPTURING);
  }, []);

  // Handle validation success
  const handleValidationSuccess = useCallback((data) => {
    const frame = {
      angle: positions[currentPositionIndex].id,
      imageData: data.imageData,
      detectedTeeth: data.detectedTeeth,
      detectedQuadrants: data.detectedQuadrants,
      confidence: data.confidence,
    };

    setCapturedFrames(prev => [...prev, frame]);
    setScanState(SCAN_STATES.CAPTURED_OK);
    setShowFlash(true);

    setTimeout(() => setShowFlash(false), 300);

    // Auto-advance
    timerRef.current = setTimeout(() => {
      if (currentPositionIndex < positions.length - 1) {
        setShowTransition(true);
        setScanState(SCAN_STATES.TRANSITIONING);
        setTimeout(() => {
          setShowTransition(false);
          setCurrentPositionIndex(prev => prev + 1);
          setScanState(SCAN_STATES.INTRO);
        }, 1200);
      } else {
        setPhase(SCANNER_PHASES.ANALYZING);
      }
    }, 800);
  }, [currentPositionIndex, positions]);

  // Handle validation failure
  const handleValidationFailure = useCallback((data) => {
    setValidationState({
      state: 'failure',
      message: data.feedback,
      confidence: data.confidence,
    });

    setTimeout(() => {
      setScanState(SCAN_STATES.POSITIONING);
      setValidationState(null);
    }, 2000);
  }, []);

  // Manual capture
  const manualCapture = useCallback(() => {
    setScanState(SCAN_STATES.CAPTURING);
  }, []);

  // Retry capture
  const retryCapture = useCallback(() => {
    setScanState(SCAN_STATES.POSITIONING);
    setValidationState(null);
  }, []);

  // Next position
  const nextPosition = useCallback(() => {
    if (currentPositionIndex < positions.length - 1) {
      setCurrentPositionIndex(prev => prev + 1);
      setScanState(SCAN_STATES.INTRO);
    }
  }, [currentPositionIndex, positions]);

  // Analyze scans
  const analyzeScans = useCallback(() => {
    setPhase(SCANNER_PHASES.ANALYZING);
  }, []);

  // Show results
  const showResults = useCallback(() => {
    setPhase(SCANNER_PHASES.RESULTS);
  }, []);

  return {
    // State
    phase,
    scanState,
    currentPositionIndex,
    capturedFrames,
    progress,
    sessionToken,
    validationState,
    showFlash,
    showTransition,

    // Actions
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
    setSessionToken,
  };
}
