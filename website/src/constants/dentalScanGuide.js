/**
 * Dental Scan Guide — Voice-guided 4-position scanning constants (Website).
 *
 * Mirrors mobile `BestoClinicMobile/src/constants/dentalScanGuide.ts`.
 * Shared by: useDentalScanChat, DentalScanChatbot, ImmersiveScannerCard.
 */

export const SCAN_POSITIONS = [
  {
    id: 'left',
    label: 'Left Side',
    voiceInstruction:
      'Turn your head slightly to the right, open wide, and hold steady. We will capture your left side teeth.',
    voiceSuccess: 'Awesome! Your left side looks great.',
    voiceTransition: "Now let's get your front teeth.",
    icon: 'ArrowLeftCircle',
    quadrants: ['Q2', 'Q3'],
    /** Target face yaw range in degrees (positive = turned right from camera POV) */
    targetYaw: { min: 25, max: 50 },
    /** Mouth-open threshold (0-1, MediaPipe lip distance ratio) */
    mouthOpenThreshold: 0.15,
    /** How long face must stay in range before auto-capture (ms) */
    stabilityDurationMs: 1500,
    /** Countdown ring duration once stable (ms) */
    countdownDurationMs: 3000,
  },
  {
    id: 'front',
    label: 'Front',
    voiceInstruction:
      'Face the camera directly and give a big smile showing your front teeth. Hold steady.',
    voiceSuccess: 'Beautiful! Your smile is looking good.',
    voiceTransition: 'Almost done! One more position \u2014 your right side.',
    icon: 'Smile',
    quadrants: ['Q1', 'Q2', 'Q3', 'Q4'],
    targetYaw: { min: -15, max: 15 },
    mouthOpenThreshold: 0.12,
    stabilityDurationMs: 1500,
    countdownDurationMs: 3000,
  },
  {
    id: 'right',
    label: 'Right Side',
    voiceInstruction:
      'Turn your head slightly to the left, open wide, and hold steady. We will capture your right side teeth.',
    voiceSuccess: 'Right side captured nicely!',
    voiceTransition: "Great! One more \u2014 let's check your tongue.",
    icon: 'ArrowRightCircle',
    quadrants: ['Q1', 'Q4'],
    targetYaw: { min: -50, max: -25 },
    mouthOpenThreshold: 0.15,
    stabilityDurationMs: 1500,
    countdownDurationMs: 3000,
  },
  {
    id: 'tongue',
    label: 'Tongue',
    voiceInstruction:
      'Stick your tongue out as far as you can toward the camera and hold steady.',
    voiceSuccess: "Perfect! All done. Now let's analyze your dental health.",
    voiceTransition: null,
    icon: 'Tongue',
    quadrants: [],
    targetYaw: null,
    mouthOpenThreshold: 0,
    stabilityDurationMs: 0,
    countdownDurationMs: 3000,
    timerOnlyCapture: true,
    skipTeethDetection: true,
    validationEnabled: false,
  },
];

export const MAX_SCAN_PHOTOS = SCAN_POSITIONS.length; // 4

export const SCAN_MODE = 'guided_3pos';

/** Maximum retries per position before auto-accept fallback */
export const MAX_RETRIES_PER_POSITION = 3;

/** Timeout before auto-accept fallback (ms) */
export const POSITIONING_TIMEOUT_MS = 15000;
