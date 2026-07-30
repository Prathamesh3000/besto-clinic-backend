/**
 * Enhanced Dental Scan Positions — 3 Core positions for essential coverage.
 *
 * Features:
 * - Multi-frame capture (3-5 frames per position)
 * - Target pose specifications (yaw, pitch, mouth opening)
 * - Quality validation thresholds
 * - Voice coaching scripts
 * - Video guide references
 * - FDI tooth coverage mapping
 *
 * @version 2.0
 * @date April 2026
 */

/**
 * @typedef {Object} TargetPose
 * @property {Object} yaw - Head rotation (left/right) in degrees
 * @property {number} yaw.min - Minimum yaw angle
 * @property {number} yaw.max - Maximum yaw angle
 * @property {Object} pitch - Head tilt (up/down) in degrees
 * @property {number} pitch.min - Minimum pitch angle
 * @property {number} pitch.max - Maximum pitch angle
 * @property {Object} mouthOpen - Mouth opening ratio (0-1 from MediaPipe)
 * @property {number} mouthOpen.min - Minimum mouth opening
 * @property {number} mouthOpen.max - Maximum mouth opening
 */

/**
 * @typedef {Object} Animation
 * @property {string} modelFile - Path to 3D model GLTF/GLB file
 * @property {string} animationClip - Animation clip name in model
 * @property {number} duration - Animation duration in milliseconds
 * @property {Object} cameraAngle - Camera position for 3D view
 * @property {number} cameraAngle.rotation - Camera rotation in degrees
 * @property {number} cameraAngle.tilt - Camera tilt in degrees
 * @property {number} cameraAngle.zoom - Camera zoom level (1.0 = default)
 */

/**
 * @typedef {Object} Coaching
 * @property {string} intro - Initial instruction when position starts
 * @property {string} positioning - Guidance while user is positioning
 * @property {string} holding - Message when position detected, holding steady
 * @property {string} success - Celebration message on successful capture
 * @property {string} retry - Encouragement message on retry
 */

/**
 * @typedef {Object} QualityRequirements
 * @property {number} minScore - Minimum overall quality score (0-1)
 * @property {number} minTeethVisible - Minimum number of teeth to detect
 * @property {number} minBrightness - Minimum brightness (0-1)
 * @property {number} maxBlur - Maximum blur score (lower = sharper)
 * @property {number} minContrast - Minimum contrast (0-1)
 */

/**
 * @typedef {Object} Coverage
 * @property {string[]} quadrants - FDI quadrants (Q1, Q2, Q3, Q4)
 * @property {number[]} teeth - FDI tooth numbers covered
 * @property {string[]} regions - Anatomical regions (incisors, canines, premolars, molars, gums)
 */

/**
 * @typedef {Object} CameraSettings
 * @property {number} stabilityMs - Time face must stay in range (ms)
 * @property {number} countdownMs - Countdown duration once stable (ms)
 * @property {number} captureInterval - Interval between frames (ms)
 * @property {number} minFrameQuality - Minimum quality to accept frame (0-1)
 */

/**
 * @typedef {Object} EnhancedScanPosition
 * @property {string} id - Unique position identifier
 * @property {number} tier - Position tier (1 = essential, 2 = optional)
 * @property {string} label - Display name
 * @property {string} description - Detailed description
 * @property {number} duration - Expected hold duration (ms)
 * @property {number} frameCount - Number of frames to capture
 * @property {TargetPose} targetPose - Target face pose specifications
 * @property {Animation} animation - 3D model animation config
 * @property {Coaching} coaching - Voice coaching scripts
 * @property {QualityRequirements} quality - Quality validation thresholds
 * @property {Coverage} coverage - Dental coverage mapping
 * @property {CameraSettings} camera - Camera capture settings
 * @property {string} icon - Icon identifier (for UI)
 */

/**
 * Enhanced scan positions - 3 core positions with multi-frame capture
 * Left side, Right side, and Front teeth
 *
 * @type {EnhancedScanPosition[]}
 */
export const SCAN_POSITIONS_ENHANCED = [
  // ── Position 1: Front Smile ──────────────────────────────────
  {
    id: 'front_smile',
    tier: 1,
    label: 'Front Smile',
    description: 'Wide smile showing all front teeth - incisors and canines',
    duration: 5000,
    frameCount: 5,

    targetPose: {
      yaw: { min: -10, max: 10 },      // Face forward
      pitch: { min: -5, max: 5 },       // Level head
      mouthOpen: { min: 0.12, max: 0.25 } // Wide smile, not gaping
    },

    animation: {
      modelFile: '/models/jaw-guide.glb',
      animationClip: 'to_front_smile',
      duration: 800,
      cameraAngle: {
        rotation: 0,   // Front view
        tilt: 0,
        zoom: 1.2
      }
    },

    coaching: {
      intro: 'Let\'s start with a big smile! Show me your front teeth.',
      positioning: 'Face the camera directly and smile wide, showing your teeth.',
      holding: 'Perfect! Hold that smile steady. Capturing now.',
      success: 'Excellent! Your front teeth look great.',
      retry: 'Almost there! Try smiling a bit wider and face the camera directly.'
    },

    quality: {
      minScore: 0.7,
      minTeethVisible: 8,    // Front incisors + canines
      minBrightness: 0.4,
      maxBlur: 0.15,
      minContrast: 0.6
    },

    coverage: {
      quadrants: ['Q1', 'Q2', 'Q3', 'Q4'],
      teeth: [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43], // All incisors + canines
      regions: ['incisors', 'canines']
    },

    camera: {
      stabilityMs: 1500,
      countdownMs: 3000,
      captureInterval: 1000,   // 1 frame per second
      minFrameQuality: 0.6
    },

    icon: 'Smile'
  },

  // ── Position 2: Left Lateral ─────────────────────────────────
  {
    id: 'left_lateral',
    tier: 1,
    label: 'Left Side',
    description: 'Turn right to show left side teeth - molars and premolars',
    duration: 5000,
    frameCount: 5,

    targetPose: {
      yaw: { min: 30, max: 55 },        // Turn right (left teeth visible)
      pitch: { min: -5, max: 5 },
      mouthOpen: { min: 0.15, max: 0.3 } // Wide open for side view
    },

    animation: {
      modelFile: '/models/jaw-guide.glb',
      animationClip: 'to_left_lateral',
      duration: 900,
      cameraAngle: {
        rotation: 45,   // Angle view
        tilt: 0,
        zoom: 1.3
      }
    },

    coaching: {
      intro: 'Now let\'s see your left side teeth.',
      positioning: 'Turn your head to the right and open wide. Show your left side teeth.',
      holding: 'Great positioning! Hold steady while we capture.',
      success: 'Perfect! Your left side teeth are clearly visible.',
      retry: 'Turn a bit more to the right and open wider. You\'re almost there!'
    },

    quality: {
      minScore: 0.7,
      minTeethVisible: 6,    // Left side molars + premolars
      minBrightness: 0.4,
      maxBlur: 0.15,
      minContrast: 0.6
    },

    coverage: {
      quadrants: ['Q2', 'Q3'],
      teeth: [24, 25, 26, 27, 28, 34, 35, 36, 37, 38], // Left premolars + molars
      regions: ['premolars', 'molars']
    },

    camera: {
      stabilityMs: 1500,
      countdownMs: 3000,
      captureInterval: 1000,
      minFrameQuality: 0.6
    },

    icon: 'ArrowLeftCircle'
  },

  // ── Position 3: Right Lateral ────────────────────────────────
  {
    id: 'right_lateral',
    tier: 1,
    label: 'Right Side',
    description: 'Turn left to show right side teeth - molars and premolars',
    duration: 5000,
    frameCount: 5,

    targetPose: {
      yaw: { min: -55, max: -30 },      // Turn left (right teeth visible)
      pitch: { min: -5, max: 5 },
      mouthOpen: { min: 0.15, max: 0.3 }
    },

    animation: {
      modelFile: '/models/jaw-guide.glb',
      animationClip: 'to_right_lateral',
      duration: 900,
      cameraAngle: {
        rotation: -45,  // Angle view (opposite side)
        tilt: 0,
        zoom: 1.3
      }
    },

    coaching: {
      intro: 'Excellent! Now let\'s capture your right side.',
      positioning: 'Turn your head to the left and open wide. Show your right side teeth.',
      holding: 'Perfect angle! Stay still for the capture.',
      success: 'Wonderful! Your right side teeth look clear.',
      retry: 'Turn a bit more to the left and keep your mouth open wide.'
    },

    quality: {
      minScore: 0.7,
      minTeethVisible: 6,
      minBrightness: 0.4,
      maxBlur: 0.15,
      minContrast: 0.6
    },

    coverage: {
      quadrants: ['Q1', 'Q4'],
      teeth: [14, 15, 16, 17, 18, 44, 45, 46, 47, 48], // Right premolars + molars
      regions: ['premolars', 'molars']
    },

    camera: {
      stabilityMs: 1500,
      countdownMs: 3000,
      captureInterval: 1000,
      minFrameQuality: 0.6
    },

    icon: 'ArrowRightCircle'
  }
];

// ── Tier 2 Positions (Optional - Phase 2) ────────────────────

/**
 * Tier 2 positions for enhanced coverage (Phase 2 implementation)
 * These provide 95%+ → 98%+ coverage with detailed close-ups
 */
export const SCAN_POSITIONS_TIER2 = [
  {
    id: 'left_canine_closeup',
    tier: 2,
    label: 'Left Canine Detail',
    description: 'Close-up of left canine and surrounding teeth',
    // ... (will be implemented in Phase 2)
  },
  {
    id: 'right_canine_closeup',
    tier: 2,
    label: 'Right Canine Detail',
    description: 'Close-up of right canine and surrounding teeth',
    // ... (will be implemented in Phase 2)
  },
  {
    id: 'lower_incisors_detail',
    tier: 2,
    label: 'Lower Front Detail',
    description: 'Detailed view of lower incisors',
    // ... (will be implemented in Phase 2)
  },
  {
    id: 'gumline_scan',
    tier: 2,
    label: 'Gum Health',
    description: 'Gumline inspection for health assessment',
    // ... (will be implemented in Phase 2)
  }
];

// ── Constants ─────────────────────────────────────────────────

export const SCAN_MODE_ENHANCED = 'enhanced_3pos';
export const MAX_SCAN_POSITIONS = SCAN_POSITIONS_ENHANCED.length; // 3
export const MAX_RETRIES_PER_POSITION = 3;
export const POSITIONING_TIMEOUT_MS = 20000;  // 20s per position

/**
 * Total expected scan duration (all 3 positions)
 * 3 positions × 5s hold + 3 × 3s transitions = 24s (~30 seconds)
 */
export const ESTIMATED_SCAN_DURATION_MS = 30000;

/**
 * Adaptive quality thresholds - lower quality requirements on retry
 * After each failed capture, quality threshold drops by 10%
 */
export const ADAPTIVE_QUALITY_REDUCTION = 0.1;

/**
 * FDI tooth numbering system mapping for coverage analysis
 */
export const FDI_QUADRANTS = {
  Q1: { label: 'Upper Right', teeth: [11, 12, 13, 14, 15, 16, 17, 18] },
  Q2: { label: 'Upper Left', teeth: [21, 22, 23, 24, 25, 26, 27, 28] },
  Q3: { label: 'Lower Left', teeth: [31, 32, 33, 34, 35, 36, 37, 38] },
  Q4: { label: 'Lower Right', teeth: [41, 42, 43, 44, 45, 46, 47, 48] }
};

/**
 * Calculate total tooth coverage from scan positions
 * @param {EnhancedScanPosition[]} positions
 * @returns {number} Percentage of teeth covered (0-100)
 */
export function calculateCoverage(positions) {
  const allTeeth = new Set(
    Object.values(FDI_QUADRANTS).flatMap(q => q.teeth)
  );
  const coveredTeeth = new Set(
    positions.flatMap(pos => pos.coverage.teeth)
  );
  return (coveredTeeth.size / allTeeth.size) * 100;
}

/**
 * Get next position after current index
 * @param {number} currentIndex
 * @returns {EnhancedScanPosition | null}
 */
export function getNextPosition(currentIndex) {
  if (currentIndex < 0 || currentIndex >= SCAN_POSITIONS_ENHANCED.length - 1) {
    return null;
  }
  return SCAN_POSITIONS_ENHANCED[currentIndex + 1];
}

/**
 * Get position by ID
 * @param {string} positionId
 * @returns {EnhancedScanPosition | undefined}
 */
export function getPositionById(positionId) {
  return SCAN_POSITIONS_ENHANCED.find(pos => pos.id === positionId);
}

/**
 * Calculate adaptive quality threshold based on retry count
 * @param {number} baseQuality - Original quality requirement (0-1)
 * @param {number} retryCount - Number of failed attempts
 * @returns {number} Adjusted quality threshold
 */
export function getAdaptiveQuality(baseQuality, retryCount) {
  const reduction = Math.min(retryCount * ADAPTIVE_QUALITY_REDUCTION, 0.3); // Max 30% reduction
  return Math.max(baseQuality - reduction, 0.4); // Never go below 0.4
}
