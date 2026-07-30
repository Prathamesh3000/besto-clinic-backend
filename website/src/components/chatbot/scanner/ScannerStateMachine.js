/**
 * Scanner State Machine — manages the immersive scanning flow.
 * Pure reducer pattern (no external dependencies).
 *
 * States: idle → intro → positioning → countdown → capturing → captured_ok → transitioning → complete
 * Mobile adds: validating, captured_fail
 */

import { SCAN_POSITIONS, MAX_RETRIES_PER_POSITION } from '../../../constants/dentalScanGuide';

// ── States ──────────────────────────────────────────
export const SCANNER_STATES = {
  IDLE: 'idle',
  INTRO: 'intro',
  POSITIONING: 'positioning',
  COUNTDOWN: 'countdown',
  CAPTURING: 'capturing',
  VALIDATING: 'validating',         // mobile only
  CAPTURED_OK: 'captured_ok',
  CAPTURED_FAIL: 'captured_fail',   // mobile only
  TRANSITIONING: 'transitioning',
  COMPLETE: 'complete',
};

// ── Events ──────────────────────────────────────────
export const SCANNER_EVENTS = {
  START_SCAN: 'START_SCAN',
  SKIP_INTRO: 'SKIP_INTRO',
  INTRO_DONE: 'INTRO_DONE',
  ANGLE_DETECTED: 'ANGLE_DETECTED',
  ANGLE_LOST: 'ANGLE_LOST',
  COUNTDOWN_DONE: 'COUNTDOWN_DONE',
  CAPTURE_SUCCESS: 'CAPTURE_SUCCESS',
  VALIDATION_OK: 'VALIDATION_OK',
  VALIDATION_FAIL: 'VALIDATION_FAIL',
  RETRY: 'RETRY',
  NEXT_POSITION: 'NEXT_POSITION',
  TRANSITION_DONE: 'TRANSITION_DONE',
  ALL_CAPTURED: 'ALL_CAPTURED',
  MANUAL_CAPTURE: 'MANUAL_CAPTURE',
  RESET: 'RESET',
};

// ── Initial state ───────────────────────────────────
export function createInitialState() {
  return {
    state: SCANNER_STATES.IDLE,
    currentPosition: 0,
    captures: [],            // [{ angle, base64, thumbnailUri, validated }]
    retryCount: 0,
    faceDetection: {
      yaw: 0,
      pitch: 0,
      mouthOpen: false,
      stable: false,
      facePresent: false,
    },
    validationFeedback: null,
    manualFallback: false,   // true when retry limit exceeded
  };
}

// ── Reducer ─────────────────────────────────────────
export function scannerReducer(ctx, event) {
  const { type, payload } = event;

  switch (type) {
    case SCANNER_EVENTS.START_SCAN:
      return { ...ctx, state: SCANNER_STATES.INTRO };

    case SCANNER_EVENTS.SKIP_INTRO:
    case SCANNER_EVENTS.INTRO_DONE:
      return {
        ...ctx,
        state: SCANNER_STATES.POSITIONING,
        currentPosition: 0,
        retryCount: 0,
        validationFeedback: null,
        manualFallback: false,
      };

    case SCANNER_EVENTS.ANGLE_DETECTED:
      if (ctx.state !== SCANNER_STATES.POSITIONING) return ctx;
      return {
        ...ctx,
        state: SCANNER_STATES.COUNTDOWN,
        faceDetection: { ...ctx.faceDetection, ...payload },
      };

    case SCANNER_EVENTS.ANGLE_LOST:
      if (ctx.state !== SCANNER_STATES.COUNTDOWN) return ctx;
      return { ...ctx, state: SCANNER_STATES.POSITIONING };

    case SCANNER_EVENTS.COUNTDOWN_DONE:
      if (ctx.state !== SCANNER_STATES.COUNTDOWN) return ctx;
      return { ...ctx, state: SCANNER_STATES.CAPTURING };

    case SCANNER_EVENTS.MANUAL_CAPTURE:
      return ctx; // No-op: auto-capture only

    case SCANNER_EVENTS.CAPTURE_SUCCESS: {
      const position = SCAN_POSITIONS[ctx.currentPosition];
      const newCapture = {
        angle: position.id,
        base64: payload?.base64 || null,
        thumbnailUri: payload?.thumbnailUri || null,
        validated: payload?.validated ?? true,
      };
      const captures = [...ctx.captures, newCapture];
      const isLast = ctx.currentPosition >= SCAN_POSITIONS.length - 1;

      if (isLast) {
        return { ...ctx, state: SCANNER_STATES.COMPLETE, captures };
      }
      return { ...ctx, state: SCANNER_STATES.CAPTURED_OK, captures };
    }

    case SCANNER_EVENTS.VALIDATION_OK: {
      const position = SCAN_POSITIONS[ctx.currentPosition];
      const newCapture = {
        angle: position.id,
        base64: payload?.base64 || null,
        thumbnailUri: payload?.thumbnailUri || null,
        validated: true,
      };
      const captures = [...ctx.captures, newCapture];
      const isLast = ctx.currentPosition >= SCAN_POSITIONS.length - 1;

      if (isLast) {
        return { ...ctx, state: SCANNER_STATES.COMPLETE, captures };
      }
      return { ...ctx, state: SCANNER_STATES.CAPTURED_OK, captures };
    }

    case SCANNER_EVENTS.VALIDATION_FAIL: {
      // Guard: only process from CAPTURING or VALIDATING states
      if (ctx.state !== SCANNER_STATES.CAPTURING && ctx.state !== SCANNER_STATES.VALIDATING) return ctx;
      const newRetry = ctx.retryCount + 1;
      // Never auto-accept a bad shot — keep retrying with clearer feedback.
      // After max retries, reset counter and give the user explicit guidance.
      const atLimit = newRetry >= MAX_RETRIES_PER_POSITION;
      return {
        ...ctx,
        state: SCANNER_STATES.CAPTURED_FAIL,
        retryCount: atLimit ? 0 : newRetry,
        validationFeedback: atLimit
          ? 'Let\u2019s try once more. Adjust your lighting and angle, then hold steady.'
          : (payload?.feedback || 'Adjusting\u2026 trying again automatically.'),
      };
    }

    case SCANNER_EVENTS.RETRY:
      if (ctx.state !== SCANNER_STATES.CAPTURED_FAIL) return ctx;
      return {
        ...ctx,
        state: SCANNER_STATES.POSITIONING,
        validationFeedback: null,
      };

    case SCANNER_EVENTS.NEXT_POSITION:
      if (ctx.state !== SCANNER_STATES.CAPTURED_OK) return ctx;
      return { ...ctx, state: SCANNER_STATES.TRANSITIONING };

    case SCANNER_EVENTS.TRANSITION_DONE:
      if (ctx.state !== SCANNER_STATES.TRANSITIONING) return ctx;
      return {
        ...ctx,
        state: SCANNER_STATES.POSITIONING,
        currentPosition: ctx.currentPosition + 1,
        retryCount: 0,
        validationFeedback: null,
        manualFallback: false,
      };

    case SCANNER_EVENTS.RESET:
      return createInitialState();

    default:
      return ctx;
  }
}
