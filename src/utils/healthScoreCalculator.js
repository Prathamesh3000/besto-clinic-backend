'use strict';

/**
 * Oral Health Score Calculator
 *
 * Computes a composite health score (0-100) from AI dental scan observations.
 * Used by both patient dental scans and guest scans.
 *
 * Sub-scores: teeth (35%), gums (30%), alignment (15%), hygiene (20%)
 */

// ── Deduction bases per observation type ────────────────────
const BASE_DEDUCTION = {
  cavity:        15,
  inflammation:  12,
  gum_recession: 10,
  misalignment:   8,
  plaque:         6,
  discoloration:  5,
  other:          4,
};

// ── Confidence multipliers ──────────────────────────────────
const CONFIDENCE_MULTIPLIER = {
  high:   1.0,
  medium: 0.7,
  low:    0.4,
};

// ── Spread factor: more teeth affected = larger deduction ───
function _getSpreadFactor(toothCount) {
  if (toothCount <= 1) return 1.0;
  if (toothCount <= 4) return 1.2;
  return 1.5;
}

// ── Map observation types to sub-score categories ───────────
const CATEGORY_MAP = {
  cavity:        ['teeth'],
  discoloration: ['teeth'],
  inflammation:  ['gums'],
  gum_recession: ['gums'],
  misalignment:  ['alignment'],
  plaque:        ['hygiene'],
  other:         ['teeth', 'gums', 'alignment', 'hygiene'], // spread equally
};

// ── Score label thresholds ──────────────────────────────────
function _getLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Attention';
  return 'Urgent Care';
}

// ── Main calculator ─────────────────────────────────────────

/**
 * Compute an oral health score from scan observations.
 *
 * @param {Array<{ type: string, confidence: string, toothNumbers?: number[], area?: string }>} observations
 * @returns {{ overall: number, teeth: number, gums: number, alignment: number, hygiene: number, label: string }}
 */
function computeHealthScore(observations) {
  const scores = { teeth: 100, gums: 100, alignment: 100, hygiene: 100 };

  if (!observations || observations.length === 0) {
    return {
      overall: 100,
      ...scores,
      label: _getLabel(100),
    };
  }

  for (const obs of observations) {
    const base = BASE_DEDUCTION[obs.type] || BASE_DEDUCTION.other;
    const confMult = CONFIDENCE_MULTIPLIER[obs.confidence] || CONFIDENCE_MULTIPLIER.medium;
    const toothCount = (obs.toothNumbers && obs.toothNumbers.length) || 1;
    const spreadFactor = _getSpreadFactor(toothCount);

    const deduction = base * confMult * spreadFactor;
    const categories = CATEGORY_MAP[obs.type] || CATEGORY_MAP.other;

    // For 'other' type, distribute deduction equally across all 4 categories
    const perCategoryDeduction = deduction / categories.length;

    for (const cat of categories) {
      scores[cat] = Math.max(0, scores[cat] - perCategoryDeduction);
    }
  }

  // Round sub-scores
  scores.teeth = Math.round(scores.teeth);
  scores.gums = Math.round(scores.gums);
  scores.alignment = Math.round(scores.alignment);
  scores.hygiene = Math.round(scores.hygiene);

  // Weighted overall
  const overall = Math.round(
    scores.teeth * 0.35 +
    scores.gums * 0.30 +
    scores.alignment * 0.15 +
    scores.hygiene * 0.20,
  );

  return {
    overall,
    ...scores,
    label: _getLabel(overall),
  };
}

module.exports = { computeHealthScore };
