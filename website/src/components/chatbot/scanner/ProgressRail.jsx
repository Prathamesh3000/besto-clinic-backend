/**
 * ProgressRail — Horizontal thumbnail progress strip at top of scanner.
 * Shows 3 circular slots: empty (dashed), active (pulsing), captured (thumbnail + checkmark).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { SCAN_POSITIONS } from '../../../constants/dentalScanGuide';

export default function ProgressRail({ currentPosition = 0, captures = [] }) {
  return (
    <div className="flex items-center justify-center gap-4 py-3 px-4 bg-black/50 backdrop-blur-sm">
      {SCAN_POSITIONS.map((pos, i) => {
        const captured = captures.find((c) => c.angle === pos.id);
        const isActive = i === currentPosition && !captured;
        const isDone = !!captured;

        return (
          <div key={pos.id} className="flex flex-col items-center gap-1.5">
            <div className="relative">
              {/* Slot circle */}
              <div
                className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center
                  ${isDone
                    ? 'border-2 border-emerald-400'
                    : isActive
                      ? 'border-2 border-cyan-400'
                      : 'border-2 border-dashed border-white/30'
                  }`}
              >
                {isDone && captured.thumbnailUri ? (
                  <img
                    src={captured.thumbnailUri}
                    alt={pos.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className={`text-[10px] font-medium ${isActive ? 'text-cyan-400' : 'text-white/30'}`}>
                    {i + 1}
                  </span>
                )}
              </div>

              {/* Checkmark badge */}
              {isDone && (
                <motion.div
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </motion.div>
              )}

              {/* Active pulse ring */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-cyan-400"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={`text-[10px] font-medium
                ${isDone ? 'text-emerald-400' : isActive ? 'text-cyan-400' : 'text-white/40'}`}
            >
              {pos.label}
            </span>
          </div>
        );
      })}

      {/* Connection lines */}
      <svg className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none" height="2" style={{ zIndex: -1 }}>
        {/* Line drawing handled by the gap between dots — no extra SVG needed */}
      </svg>
    </div>
  );
}
