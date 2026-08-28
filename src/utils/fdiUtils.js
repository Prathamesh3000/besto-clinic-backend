'use strict';

/**
 * FDI Tooth Numbering Utilities
 *
 * FDI (Fédération Dentaire Internationale) notation — ISO 3950.
 * Format: [Quadrant digit][Tooth position 1-8]
 *
 *   Q1 (Upper Right): 11-18    Q2 (Upper Left): 21-28
 *   Q3 (Lower Left):  31-38    Q4 (Lower Right): 41-48
 *
 * Used by: workers, chart utils, PDF generator, frontend charts.
 */

// ── US Universal → FDI lookup ────────────────────────────

const US_TO_FDI = Object.freeze({
  // Upper Right: US 1→FDI 18, US 2→FDI 17 … US 8→FDI 11
  1: 18, 2: 17, 3: 16, 4: 15, 5: 14, 6: 13, 7: 12, 8: 11,
  // Upper Left: US 9→FDI 21, US 10→FDI 22 … US 16→FDI 28
  9: 21, 10: 22, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
  // Lower Left: US 17→FDI 38, US 18→FDI 37 … US 24→FDI 31
  17: 38, 18: 37, 19: 36, 20: 35, 21: 34, 22: 33, 23: 32, 24: 31,
  // Lower Right: US 25→FDI 41, US 26→FDI 42 … US 32→FDI 48
  25: 41, 26: 42, 27: 43, 28: 44, 29: 45, 30: 46, 31: 47, 32: 48,
});

// ── Validation ───────────────────────────────────────────

/** Check if a number is a valid FDI tooth number (11-18, 21-28, 31-38, 41-48) */
function isValidFDI(n) {
  if (!Number.isInteger(n)) return false;
  const quadrant = Math.floor(n / 10);
  const tooth = n % 10;
  return quadrant >= 1 && quadrant <= 4 && tooth >= 1 && tooth <= 8;
}

/** Check if a number is a valid US Universal tooth number (1-32) */
function isValidUS(n) {
  return Number.isInteger(n) && n >= 1 && n <= 32;
}

// ── Conversion ───────────────────────────────────────────

/** Convert a single US Universal number to FDI. Returns null if invalid. */
function usToFDI(n) {
  return US_TO_FDI[n] || null;
}

/**
 * Normalize an array of tooth numbers to FDI.
 * Accepts both US Universal (1-32) and FDI (11-48) numbers.
 * Invalid numbers are silently dropped.
 */
function normalizeToothNumbersToFDI(toothNumbers) {
  if (!Array.isArray(toothNumbers)) return [];
  return toothNumbers
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n))
    .map((n) => {
      if (isValidFDI(n)) return n;
      if (isValidUS(n)) return usToFDI(n);
      return null;
    })
    .filter(Boolean);
}

module.exports = {
  US_TO_FDI,
  isValidFDI,
  isValidUS,
  usToFDI,
  normalizeToothNumbersToFDI,
};
