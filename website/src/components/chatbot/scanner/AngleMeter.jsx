/**
 * AngleMeter (Website only) — Curved arc overlay showing face yaw vs target range.
 * Gray out-of-range, yellow close, green in-range.
 */

import React from 'react';
import { motion } from 'framer-motion';

const ARC_WIDTH = 240;
const ARC_HEIGHT = 40;

export default function AngleMeter({ yaw = 0, targetYaw = { min: -15, max: 15 }, facePresent = false, visible = true }) {
  if (!visible) return null;

  // Map yaw (-90 to +90) to arc position (0 to 1)
  const normalizedYaw = (yaw + 90) / 180;
  const normalizedMin = (targetYaw.min + 90) / 180;
  const normalizedMax = (targetYaw.max + 90) / 180;

  // Is yaw close to target (within 10 degrees)?
  const inRange = yaw >= targetYaw.min && yaw <= targetYaw.max;
  const close = !inRange && yaw >= targetYaw.min - 10 && yaw <= targetYaw.max + 10;

  const dotColor = inRange ? '#10b981' : close ? '#f59e0b' : '#6b7280';
  const statusText = !facePresent
    ? 'Position your face'
    : inRange
      ? 'Hold steady!'
      : close
        ? 'Almost there...'
        : yaw > targetYaw.max
          ? 'Turn a bit less'
          : 'Turn a bit more';

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
      <svg width={ARC_WIDTH} height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`}>
        {/* Background arc */}
        <path
          d={`M 20,${ARC_HEIGHT - 5} Q ${ARC_WIDTH / 2},5 ${ARC_WIDTH - 20},${ARC_HEIGHT - 5}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Target zone highlight */}
        <path
          d={`M 20,${ARC_HEIGHT - 5} Q ${ARC_WIDTH / 2},5 ${ARC_WIDTH - 20},${ARC_HEIGHT - 5}`}
          fill="none"
          stroke="rgba(16,185,129,0.4)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(normalizedMax - normalizedMin) * 240} 1000`}
          strokeDashoffset={`${-normalizedMin * 240}`}
        />

        {/* Current position dot */}
        {facePresent && (
          <motion.circle
            cx={20 + normalizedYaw * (ARC_WIDTH - 40)}
            cy={ARC_HEIGHT - 5 - Math.sin(normalizedYaw * Math.PI) * (ARC_HEIGHT - 12)}
            r="6"
            fill={dotColor}
            animate={{ cx: 20 + normalizedYaw * (ARC_WIDTH - 40) }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          />
        )}
      </svg>

      {/* Status text */}
      <motion.span
        className="text-xs font-medium mt-1"
        style={{ color: dotColor }}
        animate={{ color: dotColor }}
      >
        {statusText}
      </motion.span>
    </div>
  );
}
