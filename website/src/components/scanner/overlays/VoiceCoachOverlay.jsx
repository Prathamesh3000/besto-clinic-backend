/**
 * VoiceCoachOverlay - Ambient voice indicator with minimal text
 * Replaces chat bubbles with modern, immersive voice visualization
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { voiceWaveformVariants, voiceTextVariants } from '../../../lib/scanner/animations';

export default function VoiceCoachOverlay({
  isActive,
  currentMessage,
  voiceEnabled,
  onToggleVoice,
}) {
  return (
    <motion.div
      className="absolute top-6 left-0 right-0 z-30 flex flex-col items-center pointer-events-none"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Voice waveform indicator */}
      <motion.div
        className="flex gap-1 mb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-cyan-400"
            style={{ height: 32 }}
            variants={voiceWaveformVariants}
            animate={isActive ? 'speaking' : 'idle'}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.1,
            }}
          />
        ))}
      </motion.div>

      {/* Text display (minimal, auto-hides after 4s) */}
      <AnimatePresence mode="wait">
        {currentMessage && (
          <motion.p
            key={currentMessage}
            className="text-white text-sm font-medium text-center px-6 max-w-md leading-relaxed"
            variants={voiceTextVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {currentMessage}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Voice toggle (subtle, top-right corner) */}
      <button
        onClick={onToggleVoice}
        className="absolute top-0 right-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-colors hover:bg-black/50 pointer-events-auto"
        aria-label={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
      >
        {voiceEnabled ? (
          <Volume2 className="w-4 h-4 text-white/80" />
        ) : (
          <VolumeX className="w-4 h-4 text-white/50" />
        )}
      </button>
    </motion.div>
  );
}
