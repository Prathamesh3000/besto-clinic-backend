/**
 * DentalChart Visualization Component
 * Professional dental chart showing tooth positions with multi-finding support.
 * Highlights teeth with findings (cavity, discoloration, gum issue, etc.)
 * Matches PDF and mobile chart colors. Infers tooth numbers from area descriptions.
 * FDI tooth numbering system (11-48)
 */

import React, { useMemo } from 'react';
import '../../../styles/chatbotDesignSystem.css';

// ── Color mapping by observation type — matches PDF + mobile ──
const TYPE_COLORS = {
  cavity:        'var(--chatbot-error)',   // Red
  inflammation:  'var(--chatbot-warning)', // Orange
  gum_recession: 'var(--chatbot-warning)', // Orange
  gum_disease:   'var(--chatbot-warning)', // Orange
  plaque:        '#eab308',               // Yellow
  discoloration: '#a855f7',               // Purple
  misalignment:  'var(--chatbot-info)',    // Blue
  other:         'var(--chatbot-text-tertiary)',
};

// Clinical severity priority — lower = more severe (shown as primary color)
const TYPE_PRIORITY = {
  cavity: 1,
  inflammation: 2,
  gum_recession: 3,
  misalignment: 4,
  discoloration: 5,
  plaque: 6,
  other: 7,
};

// ── FDI quadrants (ISO 3950) ──
const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; // Upper Right
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // Upper Left
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // Lower Left
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; // Lower Right
const ALL_FDI = [...Q1, ...Q2, ...Q3, ...Q4];

const UPPER_RIGHT = Q1;
const UPPER_LEFT = Q2;
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

// US Universal → FDI lookup (backward compat)
const US_TO_FDI = {
  1:18,2:17,3:16,4:15,5:14,6:13,7:12,8:11,
  9:21,10:22,11:23,12:24,13:25,14:26,15:27,16:28,
  17:38,18:37,19:36,20:35,21:34,22:33,23:32,24:31,
  25:41,26:42,27:43,28:44,29:45,30:46,31:47,32:48,
};

// ── Infer tooth numbers from area description (FDI) ──
// Ported from v1 DentalChart — ensures area-only findings appear on chart
function inferTeethFromArea(area) {
  if (!area) return [];
  const a = area.toLowerCase();

  // Skip tongue/soft tissue — not tooth-related
  if (/tongue|soft tissue/i.test(a)) return [];

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

  if (isUpper && isRight) {
    if (isMolar) teeth = [18, 17, 16];
    else if (isPremolar) teeth = [15, 14];
    else if (isCanine) teeth = [13];
    else if (isIncisor) teeth = [12, 11];
    else if (isAnterior) teeth = [13, 12, 11];
    else teeth = [...Q1];
  } else if (isUpper && isLeft) {
    if (isMolar) teeth = [26, 27, 28];
    else if (isPremolar) teeth = [24, 25];
    else if (isCanine) teeth = [23];
    else if (isIncisor) teeth = [21, 22];
    else if (isAnterior) teeth = [21, 22, 23];
    else teeth = [...Q2];
  } else if (isLower && isLeft) {
    if (isMolar) teeth = [36, 37, 38];
    else if (isPremolar) teeth = [34, 35];
    else if (isCanine) teeth = [33];
    else if (isIncisor) teeth = [31, 32];
    else if (isAnterior) teeth = [31, 32, 33];
    else teeth = [...Q3];
  } else if (isLower && isRight) {
    if (isMolar) teeth = [46, 47, 48];
    else if (isPremolar) teeth = [44, 45];
    else if (isCanine) teeth = [43];
    else if (isIncisor) teeth = [41, 42];
    else if (isAnterior) teeth = [41, 42, 43];
    else teeth = [...Q4];
  } else if (isUpper) {
    if (isAnterior) teeth = [13, 12, 11, 21, 22, 23];
    else if (isMolar) teeth = [18, 17, 16, 26, 27, 28];
    else if (isPremolar) teeth = [15, 14, 24, 25];
    else teeth = [...Q1, ...Q2];
  } else if (isLower) {
    if (isAnterior) teeth = [33, 32, 31, 41, 42, 43];
    else if (isMolar) teeth = [36, 37, 38, 46, 47, 48];
    else if (isPremolar) teeth = [34, 35, 44, 45];
    else teeth = [...Q3, ...Q4];
  } else if (isAnterior) {
    teeth = [13, 12, 11, 21, 22, 23, 33, 32, 31, 41, 42, 43];
  }

  // Fallback: general/whole mouth terms
  if (teeth.length === 0 && /all|general|overall|entire|whole|both/i.test(a)) {
    teeth = [...ALL_FDI];
  }

  // Gum-line descriptions without specific position
  if (teeth.length === 0 && /gum|gingiv/i.test(a)) {
    if (isUpper) teeth = [...Q1, ...Q2];
    else if (isLower) teeth = [...Q3, ...Q4];
  }

  return teeth;
}

// ── Convert legacy US Universal numbers to FDI ──
function maybeConvertToFDI(nums) {
  if (!nums || nums.length === 0) return nums;
  const allLegacy = nums.every((n) => n >= 1 && n <= 32);
  if (!allLegacy) return nums;
  return nums.map((n) => US_TO_FDI[n] || n);
}

// ── Build tooth map: toothNum → [{ color, type }] ──
// Collects ALL findings per tooth, sorted by clinical severity
function buildToothMap(observations) {
  const map = {}; // toothNum → [{ color, type }]
  if (!observations) return map;

  for (const obs of observations) {
    const color = TYPE_COLORS[obs.type] || TYPE_COLORS.other;
    // Use explicit toothNumbers if available, otherwise infer from area
    const teeth = (obs.toothNumbers && obs.toothNumbers.length > 0)
      ? maybeConvertToFDI(obs.toothNumbers)
      : inferTeethFromArea(obs.area);
    for (const num of teeth) {
      if (!map[num]) map[num] = [];
      // Avoid duplicate observation types on the same tooth
      if (!map[num].some((e) => e.type === obs.type)) {
        map[num].push({ color, type: obs.type });
      }
    }
  }

  // Sort each tooth's entries by clinical severity (most severe first)
  for (const num of Object.keys(map)) {
    map[num].sort((a, b) => (TYPE_PRIORITY[a.type] || 99) - (TYPE_PRIORITY[b.type] || 99));
  }

  return map;
}

// ── Legend items ──
const LEGEND_ITEMS = [
  { color: 'var(--chatbot-error)',   label: 'Cavity' },
  { color: 'var(--chatbot-warning)', label: 'Gum / Inflammation' },
  { color: '#a855f7',               label: 'Discoloration' },
  { color: '#eab308',               label: 'Plaque' },
  { color: 'var(--chatbot-info)',    label: 'Alignment' },
];

export default function DentalChart({ findings = [] }) {
  const toothMap = useMemo(() => buildToothMap(findings), [findings]);

  /**
   * Render a single tooth cell with multi-finding support
   */
  const renderTooth = (toothNumber) => {
    const entries = toothMap[toothNumber];
    const hasFinding = entries && entries.length > 0;
    const primaryColor = hasFinding ? entries[0].color : 'var(--chatbot-border)';
    const hasMultiple = entries && entries.length > 1;

    return (
      <div
        key={toothNumber}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {/* Tooth visual */}
        <div
          style={{
            width: '28px',
            height: '36px',
            background: hasFinding ? primaryColor : 'var(--chatbot-bg-card)',
            border: `2px solid ${primaryColor}`,
            borderRadius: '8px 8px 4px 4px',
            position: 'relative',
            transition: 'all 0.3s ease',
            cursor: hasFinding ? 'pointer' : 'default',
            boxShadow: hasFinding ? `0 0 8px ${primaryColor}40` : 'none',
            overflow: 'hidden',
          }}
          title={
            hasFinding
              ? `Tooth ${toothNumber} — ${entries.map((e) => e.type.replace(/_/g, ' ')).join(', ')}`
              : `Tooth ${toothNumber}`
          }
        >
          {/* Secondary finding band (bottom strip for multi-finding teeth) */}
          {hasMultiple && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '8px',
                background: entries[1].color,
              }}
            />
          )}

          {/* Multi-finding count badge */}
          {hasMultiple && (
            <div
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '10px',
                height: '10px',
                background: '#1e293b',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '6px',
                fontWeight: '700',
                color: '#fff',
                lineHeight: 1,
              }}
            >
              {entries.length}
            </div>
          )}

          {/* Single-finding indicator dot */}
          {hasFinding && !hasMultiple && (
            <div
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '6px',
                height: '6px',
                background: 'white',
                borderRadius: '50%',
              }}
            />
          )}
        </div>

        {/* Tooth number */}
        <span
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: '10px',
            color: hasFinding ? 'var(--chatbot-text-primary)' : 'var(--chatbot-text-tertiary)',
            fontWeight: hasFinding ? 'var(--chatbot-weight-semibold)' : 'var(--chatbot-weight-normal)',
          }}
        >
          {toothNumber}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        background: 'var(--chatbot-bg-card)',
        borderRadius: 'var(--chatbot-radius-lg)',
        padding: '24px',
        border: '1px solid var(--chatbot-border)',
      }}
    >
      {/* Title */}
      <h3
        style={{
          fontFamily: 'var(--chatbot-font-heading)',
          fontSize: 'var(--chatbot-text-lg)',
          fontWeight: 'var(--chatbot-weight-semibold)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '16px',
          textAlign: 'center',
        }}
      >
        Dental Chart
      </h3>

      {/* Upper teeth */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          {/* Upper Right (Quadrant 1) */}
          {UPPER_RIGHT.map((tooth) => renderTooth(tooth))}

          {/* Divider */}
          <div style={{ width: '2px', background: 'var(--chatbot-border)', margin: '0 4px' }} />

          {/* Upper Left (Quadrant 2) */}
          {UPPER_LEFT.map((tooth) => renderTooth(tooth))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-xs)',
              color: 'var(--chatbot-text-tertiary)',
            }}
          >
            Upper Jaw
          </span>
        </div>
      </div>

      {/* Lower teeth */}
      <div>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-xs)',
              color: 'var(--chatbot-text-tertiary)',
            }}
          >
            Lower Jaw
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {/* Lower Right (Quadrant 4) */}
          {LOWER_RIGHT.map((tooth) => renderTooth(tooth))}

          {/* Divider */}
          <div style={{ width: '2px', background: 'var(--chatbot-border)', margin: '0 4px' }} />

          {/* Lower Left (Quadrant 3) */}
          {LOWER_LEFT.map((tooth) => renderTooth(tooth))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid var(--chatbot-border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'center',
        }}
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                background: item.color,
                borderRadius: '4px',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-xs)',
                color: 'var(--chatbot-text-secondary)',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
