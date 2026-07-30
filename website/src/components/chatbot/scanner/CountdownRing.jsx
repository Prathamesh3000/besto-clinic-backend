/**
 * CountdownRing — Circular countdown progress ring with center number.
 * Animates clockwise fill over the countdown duration.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SIZE = 120;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CountdownRing({ seconds = 3, progress = 0, visible = false }) {
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
        >
          {/* Glow background */}
          <div className="absolute w-32 h-32 rounded-full bg-cyan-400/10 blur-xl" />

          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative">
            {/* Background circle */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={STROKE}
            />
            {/* Progress arc */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="#00e5ff"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>

          {/* Center number */}
          <motion.span
            key={seconds}
            className="absolute text-4xl font-bold text-cyan-400"
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {seconds}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
