/**
 * CaptureTransition — Position transition animation.
 * Blurs camera, shows "Next position" text, then unblurs.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SCAN_POSITIONS } from '../../../constants/dentalScanGuide';

export default function CaptureTransition({ visible = false, nextPosition = 1 }) {
  const nextPos = SCAN_POSITIONS[nextPosition];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Blur overlay */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Content */}
          <motion.div
            className="relative z-10 flex flex-col items-center"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6 }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>

            {nextPos && (
              <>
                <p className="text-white/80 text-sm font-medium">Next position</p>
                <p className="text-cyan-400 text-lg font-bold mt-1">{nextPos.label}</p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
