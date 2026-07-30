/**
 * PositionGuideOverlay - Minimal position guidance during scanning
 * Shows subtle silhouette or guide markers without text clutter
 */

import React from 'react';
import { motion } from 'framer-motion';
import { silhouetteVariants } from '../../../lib/scanner/animations';

/**
 * PositionGuideOverlay Component
 * Displays translucent face silhouette aligned to expected position
 */
export default function PositionGuideOverlay({ position, angle }) {
  // Position-specific silhouette rotation
  const rotationMap = {
    left: -45,
    front: 0,
    right: 45,
  };

  const rotation = rotationMap[angle] || 0;

  // Position-specific colors
  const colorMap = {
    left: 'from-cyan-500/30 to-blue-500/30',
    front: 'from-cyan-500/30 to-cyan-600/30',
    right: 'from-blue-500/30 to-cyan-500/30',
  };

  const gradientColor = colorMap[angle] || 'from-cyan-500/30 to-cyan-600/30';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      {/* Center guide circle with silhouette */}
      <motion.div
        variants={silhouetteVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className="relative"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {/* Outer ring pulse */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-cyan-400/50"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.2, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            width: 320,
            height: 400,
          }}
        />

        {/* Face silhouette guide */}
        <div
          className={`relative bg-gradient-to-b ${gradientColor} rounded-full border-2 border-cyan-400/60`}
          style={{
            width: 280,
            height: 360,
            borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', // Oval shape
          }}
        >
          {/* Eye positions (subtle dots) */}
          <div className="absolute top-[35%] left-[30%] w-3 h-3 bg-cyan-400/40 rounded-full" />
          <div className="absolute top-[35%] right-[30%] w-3 h-3 bg-cyan-400/40 rounded-full" />

          {/* Mouth position (smile arc) */}
          <svg
            className="absolute bottom-[30%] left-1/2 -translate-x-1/2"
            width="80"
            height="40"
            viewBox="0 0 80 40"
          >
            <path
              d="M 10,10 Q 40,30 70,10"
              stroke="rgba(34, 211, 238, 0.4)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Position label (below silhouette) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center"
        >
          <div className="px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full">
            <span className="text-cyan-400 font-semibold text-sm uppercase tracking-wider">
              {position?.label || angle}
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* Corner alignment guides */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top-left corner */}
        <div className="absolute top-12 left-12 w-8 h-8 border-t-2 border-l-2 border-cyan-400/50" />
        {/* Top-right corner */}
        <div className="absolute top-12 right-12 w-8 h-8 border-t-2 border-r-2 border-cyan-400/50" />
        {/* Bottom-left corner */}
        <div className="absolute bottom-12 left-12 w-8 h-8 border-b-2 border-l-2 border-cyan-400/50" />
        {/* Bottom-right corner */}
        <div className="absolute bottom-12 right-12 w-8 h-8 border-b-2 border-r-2 border-cyan-400/50" />
      </div>
    </div>
  );
}
