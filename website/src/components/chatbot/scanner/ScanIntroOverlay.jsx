/**
 * ScanIntroOverlay — Animated 3-position preview shown before scanning starts.
 * Auto-dismisses after 3 seconds, or user can tap to skip.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PositionSilhouette from './PositionSilhouette';
import { SCAN_POSITIONS } from '../../../constants/dentalScanGuide';

export default function ScanIntroOverlay({ visible = false, onDone, onSkip }) {
  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onDone?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [visible, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={onSkip}
        >
          <motion.p
            className="text-white/90 text-lg font-semibold mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            4 Quick Positions
          </motion.p>

          <div className="flex items-center gap-4">
            {SCAN_POSITIONS.map((pos, i) => (
              <motion.div
                key={pos.id}
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.3, duration: 0.5 }}
              >
                <PositionSilhouette position={pos.id} size={80} />
                <motion.span
                  className="text-cyan-400 text-xs font-medium mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1, 0.7] }}
                  transition={{ delay: 0.5 + i * 0.3, duration: 1.5 }}
                >
                  {pos.label}
                </motion.span>
              </motion.div>
            ))}
          </div>

          <motion.p
            className="text-white/50 text-xs mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            Tap anywhere to start
          </motion.p>

          {/* Animated sequence indicator */}
          <div className="flex gap-2 mt-4">
            {SCAN_POSITIONS.map((_, i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-cyan-400"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  delay: i * 1,
                  duration: 1,
                  repeat: Infinity,
                  repeatDelay: 2,
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
