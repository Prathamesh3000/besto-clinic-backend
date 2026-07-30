/**
 * TransitionWipe - Smooth transition between positions
 * Sliding wipe effect with gradient
 */

import React from 'react';
import { motion } from 'framer-motion';
import { transitionWipeVariants } from '../../../lib/scanner/animations';

/**
 * TransitionWipe Component
 * Animated gradient wipe from left to right
 */
export default function TransitionWipe({ direction = 'left-to-right' }) {
  const directionVariants = {
    'left-to-right': {
      hidden: { x: '-100%' },
      visible: { x: '100%' },
    },
    'right-to-left': {
      hidden: { x: '100%' },
      visible: { x: '-100%' },
    },
    'top-to-bottom': {
      hidden: { y: '-100%' },
      visible: { y: '100%' },
    },
  };

  const variants = directionVariants[direction] || transitionWipeVariants;

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{
        duration: 0.8,
        ease: [0.43, 0.13, 0.23, 0.96], // Custom easing
      }}
      className="absolute inset-0 z-35 pointer-events-none"
    >
      <div className="w-full h-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    </motion.div>
  );
}
