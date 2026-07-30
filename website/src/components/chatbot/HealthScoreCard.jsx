import React from 'react';
import { CircleDot, Droplets, ArrowLeftRight, Sparkles } from 'lucide-react';

// ── Score color by range ──────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return '#10b981'; // emerald
  if (score >= 75) return '#3b82f6'; // blue
  if (score >= 60) return '#f59e0b'; // amber
  if (score >= 40) return '#f97316'; // orange
  return '#ef4444';                  // red
}

function scoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Attention';
  return 'Urgent Care';
}

const SUB_SCORES = [
  { key: 'teeth', label: 'Teeth', Icon: CircleDot },
  { key: 'gums', label: 'Gums', Icon: Droplets },
  { key: 'alignment', label: 'Alignment', Icon: ArrowLeftRight },
  { key: 'hygiene', label: 'Hygiene', Icon: Sparkles },
];

const SIZE = 90;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HealthScoreCard({ healthScore, isHero = false }) {
  if (!healthScore || healthScore.overall == null) return null;

  const overall = Math.round(healthScore.overall);
  const color = scoreColor(overall);
  const label = healthScore.label || scoreLabel(overall);

  const sz = isHero ? 140 : SIZE;
  const st = isHero ? 10 : STROKE;
  const r = (sz - st) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - overall / 100);

  return (
    <div className={isHero ? 'space-y-4' : 'space-y-3'}>
      {/* Circular gauge + label */}
      <div className="flex items-center gap-4">
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="shrink-0">
          <circle
            cx={sz / 2} cy={sz / 2} r={r}
            fill="none" stroke="#e5e7eb" strokeWidth={st}
          />
          <circle
            cx={sz / 2} cy={sz / 2} r={r}
            fill="none" stroke={color} strokeWidth={st}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${sz / 2} ${sz / 2})`}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
          <text
            x={sz / 2} y={sz / 2 - (isHero ? 6 : 4)}
            textAnchor="middle" fontSize={isHero ? 28 : 22} fontWeight="700" fill={color}
          >
            {overall}
          </text>
          <text
            x={sz / 2} y={sz / 2 + (isHero ? 14 : 10)}
            textAnchor="middle" fontSize={isHero ? 10 : 8} fill="#9ca3af"
          >
            / 100
          </text>
        </svg>

        <div>
          <p className={`${isHero ? 'text-lg' : 'text-sm'} font-semibold`} style={{ color }}>
            {label}
          </p>
          <p className={`${isHero ? 'text-xs' : 'text-[11px]'} text-neutral-500 mt-0.5`}>
            Oral Health Score
          </p>
        </div>
      </div>

      {/* Sub-score bars */}
      <div className={isHero ? 'space-y-3' : 'space-y-2'}>
        {SUB_SCORES.map(({ key, label: subLabel, Icon }) => {
          const value = Math.round(healthScore[key] ?? 0);
          const barColor = scoreColor(value);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={`${isHero ? 'text-xs' : 'text-[10px]'} text-neutral-600 flex items-center gap-1.5`}>
                  <Icon className={`${isHero ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} style={{ color: barColor }} />
                  {subLabel}
                </span>
                <span className={`${isHero ? 'text-xs' : 'text-[10px]'} font-semibold`} style={{ color: barColor }}>
                  {value}
                </span>
              </div>
              <div className={`${isHero ? 'h-2' : 'h-1.5'} bg-gray-100 rounded-full overflow-hidden`}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${value}%`,
                    backgroundColor: barColor,
                    transition: 'width 0.6s ease-out',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
