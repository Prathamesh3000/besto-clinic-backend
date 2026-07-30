/**
 * useAutoCapture (Website) — Consumes face detection data + scanner state machine.
 * Triggers countdown when angle is in range, auto-captures on completion.
 * Falls back to timer-based capture if MediaPipe is unavailable.
 */

import { useReducer, useRef, useState, useCallback, useEffect } from 'react';
import {
  scannerReducer,
  createInitialState,
  SCANNER_STATES,
  SCANNER_EVENTS,
} from './ScannerStateMachine';
import { SCAN_POSITIONS, POSITIONING_TIMEOUT_MS } from '../../../constants/dentalScanGuide';

export default function useAutoCapture({ faceData, faceDetectionReady, faceDetectionFailed, onCapture, onAllCaptured }) {
  const [scanner, dispatch] = useReducer(scannerReducer, null, createInitialState);
  const countdownRef = useRef(null);
  const positioningTimerRef = useRef(null);
  const countdownStartRef = useRef(null);
  const [countdownValue, setCountdownValue] = useState(0);

  const currentPosition = SCAN_POSITIONS[scanner.currentPosition];

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (positioningTimerRef.current) {
      clearTimeout(positioningTimerRef.current);
      positioningTimerRef.current = null;
    }
  }, []);

  // Start the scan flow
  const startScan = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.START_SCAN });
  }, []);

  const skipIntro = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.SKIP_INTRO });
  }, []);

  const introDone = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.INTRO_DONE });
  }, []);


  const reset = useCallback(() => {
    clearTimers();
    dispatch({ type: SCANNER_EVENTS.RESET });
  }, [clearTimers]);

  // Check if face angle matches target for current position
  const isAngleInRange = useCallback(() => {
    if (!currentPosition || !faceData.facePresent) return false;
    const { targetYaw, mouthOpenThreshold } = currentPosition;
    if (!targetYaw) return false;

    const yawOk = faceData.yaw >= targetYaw.min && faceData.yaw <= targetYaw.max;
    const mouthOk = faceData.mouthOpenRatio >= (mouthOpenThreshold || 0.12);
    return yawOk && mouthOk;
  }, [currentPosition, faceData]);

  // ── POSITIONING state: check angle and start countdown ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.POSITIONING) return;

    // Timer-only positions (tongue): skip face detection, auto-start countdown
    if (currentPosition?.timerOnlyCapture) {
      const timer = setTimeout(() => {
        dispatch({ type: SCANNER_EVENTS.ANGLE_DETECTED });
      }, 1500); // Brief pause to show position guide
      return () => clearTimeout(timer);
    }

    // If MediaPipe failed, DON'T immediately start countdown.
    // Give user time to self-position with a longer hold period.
    if (faceDetectionFailed) {
      const timer = setTimeout(() => {
        dispatch({ type: SCANNER_EVENTS.ANGLE_DETECTED });
      }, 6000); // 6s hold so user can read instruction and self-position
      return () => clearTimeout(timer);
    }

    // Positioning timeout — only triggers as a last resort after a long wait.
    // User should normally be captured by angle detection below.
    positioningTimerRef.current = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.ANGLE_DETECTED });
    }, POSITIONING_TIMEOUT_MS);

    return () => {
      if (positioningTimerRef.current) {
        clearTimeout(positioningTimerRef.current);
        positioningTimerRef.current = null;
      }
    };
  }, [scanner.state, faceDetectionFailed, currentPosition]);

  // ── Check angle match during POSITIONING ──
  // Require face present + angle in range + mouth open + stable before triggering countdown.
  // This is the quality gate — don't proceed without a proper detection.
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.POSITIONING) return;
    if (currentPosition?.timerOnlyCapture) return; // Timer-only positions skip angle check
    if (faceDetectionFailed) return;
    if (!faceDetectionReady) return;

    if (faceData.facePresent && isAngleInRange() && faceData.stable) {
      // Clear positioning timeout since we got a genuine detection
      if (positioningTimerRef.current) {
        clearTimeout(positioningTimerRef.current);
        positioningTimerRef.current = null;
      }
      dispatch({ type: SCANNER_EVENTS.ANGLE_DETECTED });
    }
  }, [scanner.state, faceData, faceDetectionReady, faceDetectionFailed, isAngleInRange, currentPosition]);

  // ── COUNTDOWN state: run countdown timer ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.COUNTDOWN) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    const duration = currentPosition?.countdownDurationMs || 3000;
    const totalSeconds = Math.ceil(duration / 1000);
    countdownStartRef.current = Date.now();

    // Update countdown display every 100ms for smooth ring animation
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - countdownStartRef.current;
      const remaining = Math.max(0, duration - elapsed);
      const secondsLeft = Math.ceil(remaining / 1000);

      // Store for external reads
      setCountdownValue(secondsLeft);

      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        dispatch({ type: SCANNER_EVENTS.COUNTDOWN_DONE });
      }
    }, 100);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [scanner.state, currentPosition]);

  // ── Check angle still valid during countdown (website only) ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.COUNTDOWN) return;
    if (faceDetectionFailed) return; // timer mode — don't interrupt
    if (currentPosition?.timerOnlyCapture) return; // timer-only — don't interrupt

    if (!isAngleInRange()) {
      clearTimers();
      dispatch({ type: SCANNER_EVENTS.ANGLE_LOST });
    }
  }, [scanner.state, faceData, faceDetectionFailed, isAngleInRange, clearTimers, currentPosition]);

  // ── CAPTURING state: take photo ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.CAPTURING) return;

    // Notify parent to capture
    if (onCapture) {
      onCapture(currentPosition)
        .then(({ base64, thumbnailUri }) => {
          dispatch({
            type: SCANNER_EVENTS.CAPTURE_SUCCESS,
            payload: { base64, thumbnailUri, validated: true },
          });
        })
        .catch(() => {
          // Capture failed — go to CAPTURED_FAIL so user sees feedback
          dispatch({
            type: SCANNER_EVENTS.VALIDATION_FAIL,
            payload: { feedback: 'Capture failed. Please hold steady and try again.' },
          });
        });
    }
  }, [scanner.state, onCapture, currentPosition]);

  // ── CAPTURED_OK: auto-advance to next position ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.CAPTURED_OK) return;

    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.NEXT_POSITION });
    }, 1200); // show green checkmark for 1.2s

    return () => clearTimeout(timer);
  }, [scanner.state]);

  // ── TRANSITIONING: auto-complete transition ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.TRANSITIONING) return;

    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.TRANSITION_DONE });
    }, 800); // transition animation duration

    return () => clearTimeout(timer);
  }, [scanner.state]);

  // ── CAPTURED_FAIL: auto-retry after showing feedback ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.CAPTURED_FAIL) return;

    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.RETRY });
    }, 2000); // show feedback for 2s then retry

    return () => clearTimeout(timer);
  }, [scanner.state]);

  // ── COMPLETE: notify parent ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.COMPLETE) return;
    if (onAllCaptured) {
      onAllCaptured(scanner.captures);
    }
  }, [scanner.state, scanner.captures, onAllCaptured]);

  // Countdown progress (0 to 1)
  const countdownProgress = (() => {
    if (scanner.state !== SCANNER_STATES.COUNTDOWN || !countdownStartRef.current) return 0;
    const duration = currentPosition?.countdownDurationMs || 3000;
    const elapsed = Date.now() - countdownStartRef.current;
    return Math.min(1, elapsed / duration);
  })();

  return {
    scanner,
    dispatch,
    currentPosition,
    countdownValue,
    countdownProgress,
    startScan,
    skipIntro,
    introDone,
    reset,
    SCANNER_STATES,
    SCANNER_EVENTS,
  };
}
