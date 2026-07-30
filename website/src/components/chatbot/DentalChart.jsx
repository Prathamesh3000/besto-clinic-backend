import React, { useMemo } from 'react';

// ── Tooth color mapping by observation type ──────────────
// Mirror of src/utils/dentalChartUtils.js — keep in sync
const TYPE_COLORS = {
  cavity:         '#ef4444',
  inflammation:   '#f97316',
  gum_recession:  '#f97316',
  plaque:         '#eab308',
  discoloration:  '#a855f7',
  misalignment:   '#3b82f6',
  other:          '#6b7280',
};
const DEFAULT_COLOR = '#e5e7eb';

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

// ── FDI quadrants (ISO 3950) ──────────────────────────────
const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; // Upper Right
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // Upper Left
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // Lower Left
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; // Lower Right
const ALL_FDI = [...Q1, ...Q2, ...Q3, ...Q4];

// US Universal → FDI lookup (for backward compat)
const US_TO_FDI = {
  1:18,2:17,3:16,4:15,5:14,6:13,7:12,8:11,
  9:21,10:22,11:23,12:24,13:25,14:26,15:27,16:28,
  17:38,18:37,19:36,20:35,21:34,22:33,23:32,24:31,
  25:41,26:42,27:43,28:44,29:45,30:46,31:47,32:48,
};

// ── Infer tooth numbers from area description (FDI) ────────
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

  // Gum-line descriptions without specific position — map to full arch if upper/lower known
  if (teeth.length === 0 && /gum|gingiv/i.test(a)) {
    if (isUpper) teeth = [...Q1, ...Q2];
    else if (isLower) teeth = [...Q3, ...Q4];
  }

  return teeth;
}

// Upper arch: FDI Q1 (UR) + Q2 (UL), Lower arch: FDI Q4 (LR) + Q3 (LL)
const UPPER_TEETH = [...Q1, ...Q2];
const LOWER_TEETH = [...Q4, ...Q3];

const TOOTH_W = 20;
const TOOTH_H = 24;
const GAP = 3;
const MARGIN_X = 14;
const ARCH_GAP = 18;

// Legend labels
const LEGEND_ITEMS = [
  { type: 'cavity', label: 'Cavity' },
  { type: 'inflammation', label: 'Inflammation' },
  { type: 'gum_recession', label: 'Gum Recession' },
  { type: 'plaque', label: 'Plaque' },
  { type: 'discoloration', label: 'Discoloration' },
  { type: 'misalignment', label: 'Misalignment' },
  { type: 'other', label: 'Other' },
];

// ── Backward compat: convert US Universal numbers to FDI ────
function maybeConvertToFDI(nums) {
  if (!nums || nums.length === 0) return nums;
  const allLegacy = nums.every(n => n >= 1 && n <= 32);
  if (!allLegacy) return nums;
  return nums.map(n => US_TO_FDI[n] || n);
}

// ── Build tooth map: toothNum → array of findings ──────────
function buildToothMap(observations) {
  const map = {}; // toothNum → [{ color, opacity, type }]
  if (!observations) return map;

  for (const obs of observations) {
    const color = TYPE_COLORS[obs.type] || TYPE_COLORS.other;
    const opacity = CONFIDENCE_OPACITY[obs.confidence] || 0.7;
    // Use explicit toothNumbers if available, otherwise infer from area description
    let teeth = (obs.toothNumbers && obs.toothNumbers.length > 0)
      ? maybeConvertToFDI(obs.toothNumbers)
      : inferTeethFromArea(obs.area);
    for (const num of teeth) {
      if (!map[num]) map[num] = [];
      // Avoid duplicate observation types on the same tooth
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

// ── Single tooth cell (handles multi-finding bands) ────────
function ToothCell({ num, x, y, entries }) {
  const hasFindings = entries && entries.length > 0;

  if (!hasFindings) {
    return (
      <g>
        <rect
          x={x} y={y} width={TOOTH_W} height={TOOTH_H}
          rx={4} ry={4} fill={DEFAULT_COLOR} stroke="#d1d5db" strokeWidth={0.5}
        />
        <text
          x={x + TOOTH_W / 2} y={y + TOOTH_H / 2 + 3.5}
          textAnchor="middle" fontSize="6" fill="#6b7280" fontWeight="400"
        >
          {num}
        </text>
      </g>
    );
  }

  const clipId = `tc-${num}`;
  const bandH = TOOTH_H / entries.length;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={TOOTH_W} height={TOOTH_H} rx={4} ry={4} />
        </clipPath>
      </defs>

      {/* Stacked color bands — clipped to rounded tooth rect */}
      {entries.map((e, j) => (
        <rect
          key={j}
          x={x} y={y + j * bandH}
          width={TOOTH_W} height={bandH}
          fill={e.color} opacity={e.opacity}
          clipPath={`url(#${clipId})`}
        />
      ))}

      {/* Border overlay */}
      <rect
        x={x} y={y} width={TOOTH_W} height={TOOTH_H}
        rx={4} ry={4} fill="none" stroke="#d1d5db" strokeWidth={0.5}
      />

      {/* Tooth number */}
      <text
        x={x + TOOTH_W / 2} y={y + TOOTH_H / 2 + 3.5}
        textAnchor="middle" fontSize="6" fill="#fff" fontWeight="600"
      >
        {num}
      </text>

      {/* Multi-finding count badge */}
      {entries.length > 1 && (
        <>
          <circle cx={x + TOOTH_W - 2} cy={y + 3} r={4} fill="#1e293b" opacity={0.9} />
          <text
            x={x + TOOTH_W - 2} y={y + 5}
            textAnchor="middle" fontSize="5" fill="#fff" fontWeight="700"
          >
            {entries.length}
          </text>
        </>
      )}
    </g>
  );
}

export default function DentalChart({ observations }) {
  const toothMap = useMemo(() => buildToothMap(observations), [observations]);

  const totalW = MARGIN_X * 2 + 16 * TOOTH_W + 15 * GAP;
  const midX = MARGIN_X + 8 * (TOOTH_W + GAP) - GAP / 2; // Midline between Q1-Q2 / Q4-Q3
  const upperY = 40; // Extra room for quadrant labels
  const lowerY = upperY + TOOTH_H + ARCH_GAP;
  const legendY = lowerY + TOOTH_H + 30; // Extra room for lower quadrant labels
  const legendRows = Math.ceil(LEGEND_ITEMS.length / 3);
  const totalH = legendY + legendRows * 14 + 20;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="w-full max-w-[420px]"
      role="img"
      aria-label="Dental chart showing tooth observations"
    >
      {/* Title */}
      <text x={totalW / 2} y={18} textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">
        Dental Overview
      </text>

      {/* Quadrant labels — above upper arch */}
      <text x={MARGIN_X + 3.5 * (TOOTH_W + GAP)} y={upperY - 5} textAnchor="middle" fontSize="7" fill="#9ca3af">Q1 (UR)</text>
      <text x={MARGIN_X + 11.5 * (TOOTH_W + GAP)} y={upperY - 5} textAnchor="middle" fontSize="7" fill="#9ca3af">Q2 (UL)</text>

      {/* Upper arch label */}
      <text x={6} y={upperY + TOOTH_H / 2 + 4} fontSize="7" fill="#9ca3af">U</text>

      {/* Upper teeth */}
      {UPPER_TEETH.map((num, i) => (
        <ToothCell
          key={`u-${num}`}
          num={num}
          x={MARGIN_X + i * (TOOTH_W + GAP)}
          y={upperY}
          entries={toothMap[num]}
        />
      ))}

      {/* Horizontal separator line */}
      <line
        x1={MARGIN_X}
        y1={upperY + TOOTH_H + ARCH_GAP / 2}
        x2={MARGIN_X + 16 * (TOOTH_W + GAP) - GAP}
        y2={upperY + TOOTH_H + ARCH_GAP / 2}
        stroke="#d1d5db"
        strokeWidth={0.5}
        strokeDasharray="3,3"
      />

      {/* Vertical midline separator */}
      <line
        x1={midX} y1={upperY - 2}
        x2={midX} y2={lowerY + TOOTH_H + 2}
        stroke="#14b8a6" strokeWidth={0.8} opacity={0.4}
      />

      {/* Lower quadrant labels */}
      <text x={MARGIN_X + 3.5 * (TOOTH_W + GAP)} y={lowerY + TOOTH_H + 14} textAnchor="middle" fontSize="7" fill="#9ca3af">Q4 (LR)</text>
      <text x={MARGIN_X + 11.5 * (TOOTH_W + GAP)} y={lowerY + TOOTH_H + 14} textAnchor="middle" fontSize="7" fill="#9ca3af">Q3 (LL)</text>

      {/* Lower arch label */}
      <text x={6} y={lowerY + TOOTH_H / 2 + 4} fontSize="7" fill="#9ca3af">L</text>

      {/* Lower teeth */}
      {LOWER_TEETH.map((num, i) => (
        <ToothCell
          key={`l-${num}`}
          num={num}
          x={MARGIN_X + i * (TOOTH_W + GAP)}
          y={lowerY}
          entries={toothMap[num]}
        />
      ))}

      {/* Legend */}
      {LEGEND_ITEMS.map((item, i) => {
        const cols = 3;
        const colW = totalW / cols;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const lx = col * colW + 16;
        const ly = legendY + row * 14;

        return (
          <g key={item.type}>
            <circle cx={lx} cy={ly + 4} r={4} fill={TYPE_COLORS[item.type]} />
            <text x={lx + 8} y={ly + 7} fontSize="7" fill="#6b7280">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
