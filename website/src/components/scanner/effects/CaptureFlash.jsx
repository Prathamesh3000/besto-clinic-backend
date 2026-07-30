/**
 * CaptureFlash - Camera shutter flash effect
 * Brief white flash on photo capture
 */

import React from 'react';
import { motion } from 'framer-motion';
import { captureFlashVariants } from '../../../lib/scanner/animations';

/**
 * CaptureFlash Component
 * Full-screen white flash with fade out
 */
export default function CaptureFlash() {
  return (
    <motion.div
      variants={captureFlashVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-0 bg-white z-40 pointer-events-none"
    />
  );
}
