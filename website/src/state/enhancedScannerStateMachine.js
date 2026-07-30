/**
 * Enhanced Scanner State Machine — Manages immersive multi-frame scanning flow.
 *
 * States: 15 total
 * - IDLE → WELCOME → CAMERA_SETUP → INTRO → POSITIONING
 * → DETECTING → COUNTDOWN → MULTI_CAPTURE → VALIDATING
 * → VALIDATION_SUCCESS / VALIDATION_RETRY → TRANSITION → COMPLETE / ERROR
 *
 * Features:
 * - Multi-frame capture per position
 * - Real-time quality validation
 * - Adaptive retry logic
 * - Position progression tracking
 * - Face detection integration
 *
 * @version 2.0
 * @date April 2026
 */

import {
  SCAN_POSITIONS_ENHANCED,
  MAX_RETRIES_PER_POSITION,
  getAdaptiveQuality,
  getNextPosition,
} from '../constants/enhancedScanPositions';

// ── States ──────────────────────────────────────────────────────

export const SCANNER_STATES = {
  // Initialization
  IDLE: 'idle',
  WELCOME: 'welcome',
  CAMERA_SETUP: 'camera_setup',
  INTRO: 'intro',

  // Capture flow
  POSITIONING: 'positioning',
  DETECTING: 'detecting',
  COUNTDOWN: 'countdown',
  MULTI_CAPTURE: 'multi_capture',

  // Validation
  VALIDATING: 'validating',
  VALIDATION_SUCCESS: 'validation_success',
  VALIDATION_RETRY: 'validation_retry',

  // Progression
  TRANSITION: 'transition',
  COMPLETE: 'complete',

  // Error states
  ERROR: 'error',
  TIMEOUT: 'timeout',
};

// ── Events ──────────────────────────────────────────────────────

export const SCANNER_EVENTS = {
  // Initialization
  START_SCAN: 'START_SCAN',
  CAMERA_READY: 'CAMERA_READY',
  CAMERA_ERROR: 'CAMERA_ERROR',
  SKIP_WELCOME: 'SKIP_WELCOME',
  SKIP_INTRO: 'SKIP_INTRO',
  WELCOME_DONE: 'WELCOME_DONE',
  INTRO_DONE: 'INTRO_DONE',

  // Face detection
  FACE_DETECTED: 'FACE_DETECTED',
  FACE_LOST: 'FACE_LOST',
  ANGLE_MATCHED: 'ANGLE_MATCHED',
  ANGLE_LOST: 'ANGLE_LOST',

  // Capture
  COUNTDOWN_DONE: 'COUNTDOWN_DONE',
  FRAME_CAPTURED: 'FRAME_CAPTURED',
  MULTI_CAPTURE_COMPLETE: 'MULTI_CAPTURE_COMPLETE',

  // Validation
  VALIDATION_START: 'VALIDATION_START',
  VALIDATION_PASS: 'VALIDATION_PASS',
  VALIDATION_FAIL: 'VALIDATION_FAIL',
  RETRY_CAPTURE: 'RETRY_CAPTURE',
  FORCE_ACCEPT: 'FORCE_ACCEPT',

  // Progression
  NEXT_POSITION: 'NEXT_POSITION',
  TRANSITION_DONE: 'TRANSITION_DONE',
  ALL_POSITIONS_COMPLETE: 'ALL_POSITIONS_COMPLETE',

  // Control
  TIMEOUT_REACHED: 'TIMEOUT_REACHED',
  RESET: 'RESET',
  CANCEL: 'CANCEL',
};

// ── Initial Context ─────────────────────────────────────────────

export function createInitialContext() {
  return {
    state: SCANNER_STATES.IDLE,

    // Position tracking
    currentPositionIndex: 0,
    completedPositions: [], // [{ positionId, frames, selectedFrame, quality }]

    // Current position state
    retryCount: 0,
    capturedFrames: [], // Multi-frame buffer
    captureProgress: 0, // 0-100

    // Face detection
    faceDetection: {
      facePresent: false,
      yaw: 0,
      pitch: 0,
      mouthOpen: 0,
      angleMatched: false,
      stable: false,
      stabilityTime: 0, // ms stable
    },

    // Quality validation
    currentQuality: null, // QualityMetrics
    validationFeedback: null,
    adaptiveThreshold: null, // Calculated based on retry count

    // Flags
    manualFallback: false, // True when max retries exceeded
    skipWelcome: false,
    skipIntro: false,

    // Timestamps
    scanStartTime: null,
    positionStartTime: null,
    lastEventTime: Date.now(),

    // Error state
    error: null,
  };
}

// ── Reducer ─────────────────────────────────────────────────────

export function enhancedScannerReducer(ctx, event) {
  const { type, payload } = event;

  // Update last event time
  const newCtx = { ...ctx, lastEventTime: Date.now() };

  switch (type) {
    // ── Initialization ──────────────────────────────────────────

    case SCANNER_EVENTS.START_SCAN:
      return {
        ...newCtx,
        state: ctx.skipWelcome ? SCANNER_STATES.CAMERA_SETUP : SCANNER_STATES.WELCOME,
        scanStartTime: Date.now(),
      };

    case SCANNER_EVENTS.SKIP_WELCOME:
      return {
        ...newCtx,
        skipWelcome: true,
        state: SCANNER_STATES.CAMERA_SETUP,
      };

    case SCANNER_EVENTS.WELCOME_DONE:
      return {
        ...newCtx,
        state: SCANNER_STATES.CAMERA_SETUP,
      };

    case SCANNER_EVENTS.CAMERA_READY:
      if (ctx.state !== SCANNER_STATES.CAMERA_SETUP) return newCtx;
      return {
        ...newCtx,
        state: ctx.skipIntro ? SCANNER_STATES.POSITIONING : SCANNER_STATES.INTRO,
      };

    case SCANNER_EVENTS.CAMERA_ERROR:
      return {
        ...newCtx,
        state: SCANNER_STATES.ERROR,
        error: payload?.error || 'Camera initialization failed',
      };

    case SCANNER_EVENTS.SKIP_INTRO:
      return {
        ...newCtx,
        skipIntro: true,
        state: SCANNER_STATES.POSITIONING,
        positionStartTime: Date.now(),
      };

    case SCANNER_EVENTS.INTRO_DONE:
      return {
        ...newCtx,
        state: SCANNER_STATES.POSITIONING,
        positionStartTime: Date.now(),
      };

    // ── Face Detection ──────────────────────────────────────────

    case SCANNER_EVENTS.FACE_DETECTED:
      if (ctx.state !== SCANNER_STATES.POSITIONING) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.DETECTING,
        faceDetection: {
          ...ctx.faceDetection,
          facePresent: true,
          ...payload,
        },
      };

    case SCANNER_EVENTS.FACE_LOST:
      if (ctx.state === SCANNER_STATES.COUNTDOWN || ctx.state === SCANNER_STATES.MULTI_CAPTURE) {
        // Lost face during critical phase - go back to positioning
        return {
          ...newCtx,
          state: SCANNER_STATES.POSITIONING,
          faceDetection: {
            ...ctx.faceDetection,
            facePresent: false,
            angleMatched: false,
            stable: false,
          },
        };
      }
      return {
        ...newCtx,
        faceDetection: {
          ...ctx.faceDetection,
          facePresent: false,
        },
      };

    case SCANNER_EVENTS.ANGLE_MATCHED:
      if (ctx.state !== SCANNER_STATES.DETECTING) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.COUNTDOWN,
        faceDetection: {
          ...ctx.faceDetection,
          angleMatched: true,
          stable: true,
          stabilityTime: payload?.stabilityTime || 0,
        },
      };

    case SCANNER_EVENTS.ANGLE_LOST:
      if (ctx.state !== SCANNER_STATES.COUNTDOWN) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.DETECTING,
        faceDetection: {
          ...ctx.faceDetection,
          angleMatched: false,
          stable: false,
        },
      };

    // ── Capture ─────────────────────────────────────────────────

    case SCANNER_EVENTS.COUNTDOWN_DONE:
      if (ctx.state !== SCANNER_STATES.COUNTDOWN) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.MULTI_CAPTURE,
        capturedFrames: [],
        captureProgress: 0,
      };

    case SCANNER_EVENTS.FRAME_CAPTURED: {
      if (ctx.state !== SCANNER_STATES.MULTI_CAPTURE) return newCtx;

      const frames = [...ctx.capturedFrames, payload.frame];
      const position = SCAN_POSITIONS_ENHANCED[ctx.currentPositionIndex];
      const progress = (frames.length / position.frameCount) * 100;

      return {
        ...newCtx,
        capturedFrames: frames,
        captureProgress: progress,
      };
    }

    case SCANNER_EVENTS.MULTI_CAPTURE_COMPLETE:
      if (ctx.state !== SCANNER_STATES.MULTI_CAPTURE) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.VALIDATING,
        captureProgress: 100,
      };

    // ── Validation ──────────────────────────────────────────────

    case SCANNER_EVENTS.VALIDATION_START:
      if (ctx.state !== SCANNER_STATES.VALIDATING) return newCtx;
      return newCtx; // Stay in validating state

    case SCANNER_EVENTS.VALIDATION_PASS: {
      if (ctx.state !== SCANNER_STATES.VALIDATING) return newCtx;

      const position = SCAN_POSITIONS_ENHANCED[ctx.currentPositionIndex];
      const completedPosition = {
        positionId: position.id,
        positionIndex: ctx.currentPositionIndex,
        frames: ctx.capturedFrames,
        selectedFrame: payload?.selectedFrame,
        quality: payload?.quality,
        timestamp: Date.now(),
      };

      const completedPositions = [...ctx.completedPositions, completedPosition];
      const isLastPosition = ctx.currentPositionIndex >= SCAN_POSITIONS_ENHANCED.length - 1;

      if (isLastPosition) {
        return {
          ...newCtx,
          state: SCANNER_STATES.COMPLETE,
          completedPositions,
          capturedFrames: [],
        };
      }

      return {
        ...newCtx,
        state: SCANNER_STATES.VALIDATION_SUCCESS,
        completedPositions,
        retryCount: 0, // Reset retry count for next position
        currentQuality: payload?.quality,
        validationFeedback: null,
      };
    }

    case SCANNER_EVENTS.VALIDATION_FAIL: {
      if (ctx.state !== SCANNER_STATES.VALIDATING) return newCtx;

      const newRetryCount = ctx.retryCount + 1;
      const position = SCAN_POSITIONS_ENHANCED[ctx.currentPositionIndex];

      // Calculate adaptive threshold for next attempt
      const adaptiveThreshold = getAdaptiveQuality(
        position.quality.minScore,
        newRetryCount
      );

      // Max retries exceeded - enable manual fallback
      if (newRetryCount >= MAX_RETRIES_PER_POSITION) {
        return {
          ...newCtx,
          state: SCANNER_STATES.POSITIONING,
          retryCount: newRetryCount,
          capturedFrames: [],
          manualFallback: true,
          adaptiveThreshold,
          validationFeedback: payload?.feedback || 'Maximum retries reached. Please try manual capture.',
        };
      }

      return {
        ...newCtx,
        state: SCANNER_STATES.VALIDATION_RETRY,
        retryCount: newRetryCount,
        capturedFrames: [],
        adaptiveThreshold,
        validationFeedback: payload?.feedback || 'Quality not sufficient. Please try again.',
      };
    }

    case SCANNER_EVENTS.RETRY_CAPTURE:
      if (ctx.state !== SCANNER_STATES.VALIDATION_RETRY) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.POSITIONING,
        capturedFrames: [],
        validationFeedback: null,
      };

    case SCANNER_EVENTS.FORCE_ACCEPT: {
      // Force accept current capture (manual override)
      const position = SCAN_POSITIONS_ENHANCED[ctx.currentPositionIndex];
      const completedPosition = {
        positionId: position.id,
        positionIndex: ctx.currentPositionIndex,
        frames: ctx.capturedFrames,
        selectedFrame: payload?.selectedFrame || ctx.capturedFrames[0],
        quality: payload?.quality || { overall: 0.5 },
        forced: true,
        timestamp: Date.now(),
      };

      const completedPositions = [...ctx.completedPositions, completedPosition];
      const isLastPosition = ctx.currentPositionIndex >= SCAN_POSITIONS_ENHANCED.length - 1;

      if (isLastPosition) {
        return {
          ...newCtx,
          state: SCANNER_STATES.COMPLETE,
          completedPositions,
          capturedFrames: [],
        };
      }

      return {
        ...newCtx,
        state: SCANNER_STATES.VALIDATION_SUCCESS,
        completedPositions,
        retryCount: 0,
        capturedFrames: [],
        manualFallback: false,
      };
    }

    // ── Progression ─────────────────────────────────────────────

    case SCANNER_EVENTS.NEXT_POSITION:
      if (ctx.state !== SCANNER_STATES.VALIDATION_SUCCESS) return newCtx;
      return {
        ...newCtx,
        state: SCANNER_STATES.TRANSITION,
      };

    case SCANNER_EVENTS.TRANSITION_DONE:
      if (ctx.state !== SCANNER_STATES.TRANSITION) return newCtx;

      const nextIndex = ctx.currentPositionIndex + 1;
      if (nextIndex >= SCAN_POSITIONS_ENHANCED.length) {
        return {
          ...newCtx,
          state: SCANNER_STATES.COMPLETE,
        };
      }

      return {
        ...newCtx,
        state: SCANNER_STATES.POSITIONING,
        currentPositionIndex: nextIndex,
        retryCount: 0,
        capturedFrames: [],
        captureProgress: 0,
        manualFallback: false,
        adaptiveThreshold: null,
        validationFeedback: null,
        positionStartTime: Date.now(),
      };

    case SCANNER_EVENTS.ALL_POSITIONS_COMPLETE:
      return {
        ...newCtx,
        state: SCANNER_STATES.COMPLETE,
      };

    // ── Control ─────────────────────────────────────────────────

    case SCANNER_EVENTS.TIMEOUT_REACHED:
      return {
        ...newCtx,
        state: SCANNER_STATES.TIMEOUT,
        error: 'Positioning timeout reached',
      };

    case SCANNER_EVENTS.RESET:
      return createInitialContext();

    case SCANNER_EVENTS.CANCEL:
      return {
        ...createInitialContext(),
        state: SCANNER_STATES.IDLE,
      };

    default:
      return newCtx;
  }
}

// ── Selectors ───────────────────────────────────────────────────

/**
 * Get current position definition
 * @param {Object} ctx - State machine context
 * @returns {Object|null} - Current position or null
 */
export function getCurrentPosition(ctx) {
  if (ctx.currentPositionIndex >= SCAN_POSITIONS_ENHANCED.length) {
    return null;
  }
  return SCAN_POSITIONS_ENHANCED[ctx.currentPositionIndex];
}

/**
 * Get progress percentage (0-100)
 * @param {Object} ctx - State machine context
 * @returns {number} - Progress percentage
 */
export function getScanProgress(ctx) {
  const totalPositions = SCAN_POSITIONS_ENHANCED.length;
  const completedPositions = ctx.completedPositions.length;
  const currentPositionProgress = ctx.captureProgress / 100;

  return ((completedPositions + currentPositionProgress) / totalPositions) * 100;
}

/**
 * Check if can proceed to next position
 * @param {Object} ctx - State machine context
 * @returns {boolean}
 */
export function canProceedNext(ctx) {
  return (
    ctx.state === SCANNER_STATES.VALIDATION_SUCCESS &&
    ctx.currentPositionIndex < SCAN_POSITIONS_ENHANCED.length - 1
  );
}

/**
 * Check if scan is complete
 * @param {Object} ctx - State machine context
 * @returns {boolean}
 */
export function isScanComplete(ctx) {
  return (
    ctx.state === SCANNER_STATES.COMPLETE &&
    ctx.completedPositions.length === SCAN_POSITIONS_ENHANCED.length
  );
}

/**
 * Get estimated time remaining (ms)
 * @param {Object} ctx - State machine context
 * @returns {number}
 */
export function getEstimatedTimeRemaining(ctx) {
  const remainingPositions = SCAN_POSITIONS_ENHANCED.length - ctx.completedPositions.length;
  const avgPositionTime = 8000; // 8s per position (hold + capture + transition)
  return remainingPositions * avgPositionTime;
}

/**
 * Check if should show manual capture button
 * @param {Object} ctx - State machine context
 * @returns {boolean}
 */
export function shouldShowManualCapture(ctx) {
  return ctx.manualFallback && ctx.state === SCANNER_STATES.POSITIONING;
}

/**
 * Get quality threshold for current attempt
 * @param {Object} ctx - State machine context
 * @returns {number}
 */
export function getCurrentQualityThreshold(ctx) {
  const position = getCurrentPosition(ctx);
  if (!position) return 0.5;

  if (ctx.adaptiveThreshold !== null) {
    return ctx.adaptiveThreshold;
  }

  return position.quality.minScore;
}

// ── Guards ──────────────────────────────────────────────────────

/**
 * Check if face angle matches target pose
 * @param {Object} faceDetection - Face detection data
 * @param {Object} targetPose - Target pose specification
 * @returns {boolean}
 */
export function isAngleMatched(faceDetection, targetPose) {
  const { yaw, pitch, mouthOpen } = faceDetection;

  const yawMatch = yaw >= targetPose.yaw.min && yaw <= targetPose.yaw.max;
  const pitchMatch = pitch >= targetPose.pitch.min && pitch <= targetPose.pitch.max;
  const mouthMatch = mouthOpen >= targetPose.mouthOpen.min && mouthOpen <= targetPose.mouthOpen.max;

  return yawMatch && pitchMatch && mouthMatch;
}

/**
 * Check if quality meets threshold
 * @param {Object} quality - Quality metrics
 * @param {number} threshold - Minimum threshold (0-1)
 * @returns {boolean}
 */
export function meetsQualityThreshold(quality, threshold) {
  return quality.overall >= threshold;
}
