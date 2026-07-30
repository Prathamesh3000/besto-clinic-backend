/**
 * ScanCelebration — Completion celebration animation.
 * Green checkmark + pulse + sparkle particles.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Simple particle generator
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  angle: (i / 12) * 360,
  delay: Math.random() * 0.3,
  size: 3 + Math.random() * 4,
}));

export default function ScanCelebration({ visible = false }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          {/* Green tint background */}
          <motion.div
            className="absolute inset-0 bg-emerald-500/10"
            animate={{ opacity: [0, 0.3, 0.1] }}
            transition={{ duration: 1.2 }}
          />

          {/* Sparkle particles */}
          {PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full bg-cyan-400"
              style={{ width: p.size, height: p.size }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
              animate={{
                x: Math.cos((p.angle * Math.PI) / 180) * 100,
                y: Math.sin((p.angle * Math.PI) / 180) * 100,
                opacity: [0, 1, 0],
                scale: [0, 1, 0.5],
              }}
              transition={{ duration: 1, delay: p.delay, ease: 'easeOut' }}
            />
          ))}

          {/* Central checkmark */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
          >
            {/* Pulse ring */}
            <motion.div
              className="absolute w-24 h-24 rounded-full border-2 border-emerald-400"
              animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
              transition={{ duration: 1, repeat: 1, repeatDelay: 0.3 }}
            />

            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <motion.svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <motion.polyline
                  points="20 6 9 17 4 12"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                />
              </motion.svg>
            </div>

            <motion.p
              className="text-emerald-400 text-xl font-bold mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              Scan Complete!
            </motion.p>

            <motion.p
              className="text-white/60 text-sm mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              Analyzing your dental health...
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
