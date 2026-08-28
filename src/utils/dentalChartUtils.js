'use strict';

/**
 * Shared dental chart logic — single source of truth for tooth color mapping,
 * area-to-tooth inference, and multi-finding tooth map building.
 *
 * Used by:
 *  - src/utils/dentalScanPdfGenerator.js (PDF report)
 *  - website/src/components/chatbot/DentalChart.jsx (frontend SVG — ES module copy)
 *
 * If you change anything here, update the frontend copy too.
 */

// ── Color mapping by observation type ──────────────────────
const OBS_COLORS = {
  cavity:         '#ef4444',
  inflammation:   '#f97316',
  gum_recession:  '#f97316',
  plaque:         '#eab308',
  discoloration:  '#a855f7',
  misalignment:   '#3b82f6',
  other:          '#6b7280',
};

const OBS_LABELS = {
  plaque: 'Plaque Buildup',
  inflammation: 'Gum Inflammation',
  discoloration: 'Tooth Discoloration',
  misalignment: 'Misalignment',
  cavity: 'Cavity / Decay',
  gum_recession: 'Gum Recession',
  other: 'Other Finding',
};

const DEFAULT_TOOTH_COLOR = '#e5e7eb';
const CONFIDENCE_OPACITY = { high: 1, medium: 0.7, low: 0.5 };

// Clinical severity priority — lower = more severe (rendered at top)
const TYPE_PRIORITY = {
  cavity: 1,
  inflammation: 2,
  gum_recession: 3,
  misalignment: 4,
  discoloration: 5,
  plaque: 6,
  other: 7,
};

// ── FDI quadrant definitions (ISO 3950) ───────────────────
// Q1 Upper Right: 18-11, Q2 Upper Left: 21-28, Q3 Lower Left: 31-38, Q4 Lower Right: 48-41
// Positions: 1-3 molars, 4-5 premolars, 6 canine, 7-8 incisors

const { usToFDI } = require('./fdiUtils');

const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; // Upper Right
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // Upper Left
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // Lower Left
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; // Lower Right
const ALL_FDI = [...Q1, ...Q2, ...Q3, ...Q4];

// ── Area-to-tooth inference (FDI) ─────────────────────────

function inferTeethFromArea(area) {
  if (!area) return [];
  const a = area.toLowerCase();

  const isUpper = /upper|maxill/i.test(a);
  const isLower = /lower|mandib/i.test(a);
  const isRight = /\bright\b/i.test(a);
  const isLeft = /\bleft\b/i.test(a);
  const isMolar = /\bmolar/i.test(a) && !/premolar/i.test(a);
  const isPremolar = /premolar|bicuspid/i.test(a);
  const isCanine = /canine|cuspid/i.test(a);
  const isIncisor = /\bincisor/i.test(a);
  const isAnterior = /anterior|front/i.test(a);

  let teeth = [];

  // Q1 — Upper Right
  if (isUpper && isRight) {
    if (isMolar) teeth = [18, 17, 16];
    else if (isPremolar) teeth = [15, 14];
    else if (isCanine) teeth = [13];
    else if (isIncisor) teeth = [12, 11];
    else if (isAnterior) teeth = [13, 12, 11];
    else teeth = [...Q1];
  // Q2 — Upper Left
  } else if (isUpper && isLeft) {
    if (isMolar) teeth = [26, 27, 28];
    else if (isPremolar) teeth = [24, 25];
    else if (isCanine) teeth = [23];
    else if (isIncisor) teeth = [21, 22];
    else if (isAnterior) teeth = [21, 22, 23];
    else teeth = [...Q2];
  // Q3 — Lower Left
  } else if (isLower && isLeft) {
    if (isMolar) teeth = [36, 37, 38];
    else if (isPremolar) teeth = [34, 35];
    else if (isCanine) teeth = [33];
    else if (isIncisor) teeth = [31, 32];
    else if (isAnterior) teeth = [31, 32, 33];
    else teeth = [...Q3];
  // Q4 — Lower Right
  } else if (isLower && isRight) {
    if (isMolar) teeth = [46, 47, 48];
    else if (isPremolar) teeth = [44, 45];
    else if (isCanine) teeth = [43];
    else if (isIncisor) teeth = [41, 42];
    else if (isAnterior) teeth = [41, 42, 43];
    else teeth = [...Q4];
  // Upper (both sides)
  } else if (isUpper) {
    if (isAnterior) teeth = [13, 12, 11, 21, 22, 23];
    else if (isMolar) teeth = [18, 17, 16, 26, 27, 28];
    else if (isPremolar) teeth = [15, 14, 24, 25];
    else teeth = [...Q1, ...Q2];
  // Lower (both sides)
  } else if (isLower) {
    if (isAnterior) teeth = [33, 32, 31, 41, 42, 43];
    else if (isMolar) teeth = [36, 37, 38, 46, 47, 48];
    else if (isPremolar) teeth = [34, 35, 44, 45];
    else teeth = [...Q3, ...Q4];
  // Anterior (upper + lower)
  } else if (isAnterior) {
    teeth = [13, 12, 11, 21, 22, 23, 33, 32, 31, 41, 42, 43];
  }

  if (teeth.length === 0 && /all|general|overall|entire|whole|both/i.test(a)) {
    teeth = [...ALL_FDI];
  }
  if (teeth.length === 0 && /gum|gingiv/i.test(a)) {
    if (isUpper) teeth = [...Q1, ...Q2];
    else if (isLower) teeth = [...Q3, ...Q4];
  }

  return teeth;
}

// ── Build tooth map: toothNum → array of findings ──────────

/**
 * Detect if tooth numbers are legacy US Universal (all <= 32).
 * If so, convert them to FDI on-the-fly.
 */
function _maybeConvertToFDI(toothNumbers) {
  if (!toothNumbers || toothNumbers.length === 0) return toothNumbers;
  const allLegacy = toothNumbers.every((n) => n >= 1 && n <= 32);
  if (allLegacy && toothNumbers.some((n) => n <= 32)) {
    // Could be legacy US — convert. FDI numbers are all >= 11
    const maxNum = Math.max(...toothNumbers);
    if (maxNum <= 32) {
      return toothNumbers.map((n) => usToFDI(n)).filter(Boolean);
    }
  }
  return toothNumbers;
}

function buildToothMap(observations) {
  const map = {}; // toothNum → [{ color, opacity, type }]
  if (!observations) return map;

  for (const obs of observations) {
    const color = OBS_COLORS[obs.type] || OBS_COLORS.other;
    const opacity = CONFIDENCE_OPACITY[obs.confidence] || 0.7;
    const teeth = (obs.toothNumbers && obs.toothNumbers.length > 0)
      ? _maybeConvertToFDI(obs.toothNumbers)
      : inferTeethFromArea(obs.area);
    for (const num of teeth) {
      if (!map[num]) map[num] = [];
      if (!map[num].some((e) => e.type === obs.type)) {
        map[num].push({ color, opacity, type: obs.type });
      }
    }
  }

  // Sort each tooth's entries by clinical severity (most severe at top)
  for (const num of Object.keys(map)) {
    map[num].sort((a, b) => (TYPE_PRIORITY[a.type] || 99) - (TYPE_PRIORITY[b.type] || 99));
  }

  return map;
}

module.exports = {
  OBS_COLORS,
  OBS_LABELS,
  DEFAULT_TOOTH_COLOR,
  CONFIDENCE_OPACITY,
  TYPE_PRIORITY,
  inferTeethFromArea,
  buildToothMap,
};
