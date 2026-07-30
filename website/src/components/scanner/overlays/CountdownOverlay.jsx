/**
 * CountdownOverlay - Animated countdown before capture
 * Large, clear numbers with scale animation
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { countdownVariants } from '../../../lib/scanner/animations';

/**
 * CountdownOverlay Component
 * Shows 3-2-1 countdown with scale animations
 */
export default function CountdownOverlay({ startFrom = 3, onComplete }) {
  const [count, setCount] = useState(startFrom);

  useEffect(() => {
    if (count <= 0) {
      onComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      setCount(count - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
      <AnimatePresence mode="wait">
        {count > 0 && (
          <motion.div
            key={count}
            variants={countdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative"
          >
            {/* Glow background */}
            <div className="absolute inset-0 bg-cyan-500/30 rounded-full blur-3xl scale-150" />

            {/* Number */}
            <div className="relative text-[200px] font-black text-white leading-none">
              <span
                className="bg-gradient-to-b from-white to-cyan-200 bg-clip-text text-transparent"
                style={{
                  textShadow: '0 0 40px rgba(34, 211, 238, 0.8)',
                }}
              >
                {count}
              </span>
            </div>

            {/* Circular progress ring */}
            <svg
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10"
              width="320"
              height="320"
              viewBox="0 0 320 320"
            >
              <motion.circle
                cx="160"
                cy="160"
                r="140"
                stroke="rgba(34, 211, 238, 0.3)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 1 }}
                animate={{ pathLength: 0 }}
                transition={{ duration: 1, ease: 'linear' }}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                }}
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
