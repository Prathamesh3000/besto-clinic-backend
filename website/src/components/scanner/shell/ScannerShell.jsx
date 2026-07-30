/**
 * Professional Medical-Grade Scanner Shell
 * Dark mode, real-time AI feedback, particle effects, professional UI
 *
 * This is the main scanning interface - conversion-critical component
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  VolumeX,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Cpu,
} from 'lucide-react';
import {
  colors,
  gradients,
  shadows,
  spacing,
  borderRadius,
  typography,
  glassMorphism,
  medicalUI,
} from '../../../lib/scanner/designSystem';

// Import overlays
import VoiceCoachOverlay from '../overlays/VoiceCoachOverlay';
import PositionGuideOverlay from '../overlays/PositionGuideOverlay';
import CountdownOverlay from '../overlays/CountdownOverlay';
import ValidationFeedback from '../overlays/ValidationFeedback';
import ProgressTracker from '../overlays/ProgressTracker';
import CaptureFlash from '../effects/CaptureFlash';
import TransitionWipe from '../effects/TransitionWipe';

export default function ScannerShell({
  // Flow state
  phase,
  scanState,
  currentPosition,
  positions,
  progress,

  // Voice state
  voiceActive,
  voiceMessage,
  voiceEnabled,
  onToggleVoice,

  // Camera
  cameraStream,
  cameraError,
  onCameraReady,
  onCameraError,

  // Actions
  onClose,
  onCapture,
  onManualCapture,

  // Visual feedback
  showFlash,
  showTransition,
  validationState,
}) {
  const videoRef = useRef(null);
  const [aiConfidence, setAiConfidence] = useState(0);
  const [showParticles, setShowParticles] = useState(false);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        onCameraReady?.(stream);
      } catch (error) {
        console.error('[ScannerShell] Camera error:', error);
        onCameraError?.(error);
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onCameraReady, onCameraError]);

  // Simulate AI confidence meter
  useEffect(() => {
    if (scanState === 'positioning' || scanState === 'intro') {
      setShowParticles(true);
      const interval = setInterval(() => {
        setAiConfidence((prev) => {
          const target = Math.random() * 40 + 30; // 30-70%
          return prev + (target - prev) * 0.1;
        });
      }, 100);

      return () => clearInterval(interval);
    } else if (scanState === 'countdown' || scanState === 'capturing') {
      setAiConfidence(100);
      setShowParticles(true);
    } else {
      setShowParticles(false);
    }
  }, [scanState]);

  // Particle effect component
  const ParticleEffect = () => {
    if (!showParticles) return null;

    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              background:
                i % 3 === 0
                  ? colors.accent.cyan
                  : i % 3 === 1
                  ? colors.brand.green
                  : colors.brand.blue,
              boxShadow:
                i % 3 === 0
                  ? shadows.cyanGlow
                  : i % 3 === 1
                  ? shadows.greenGlow
                  : shadows.blueGlow,
            }}
            initial={{
              x: Math.random() * window.innerWidth,
              y: window.innerHeight + 50,
            }}
            animate={{
              y: -50,
              x: [null, Math.random() * window.innerWidth],
              opacity: [0, 1, 1, 0],
              scale: [0, 1, 1, 0.5],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    );
  };

  // AI Status Indicator
  const AIStatusIndicator = () => (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-6 left-1/2 -translate-x-1/2 z-20"
    >
      <div
        className="flex items-center gap-3 px-6 py-3 rounded-full"
        style={{
          ...glassMorphism.medium,
          background: 'rgba(0, 229, 255, 0.1)',
          border: `1px solid ${colors.accent.cyan}40`,
          boxShadow: shadows.cyanGlow,
        }}
      >
        {/* AI Icon with pulse */}
        <div className="relative">
          <Cpu size={20} style={{ color: colors.accent.cyan }} strokeWidth={2} />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: colors.accent.cyan,
              opacity: 0.3,
            }}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>

        <span
          className="text-sm font-medium"
          style={{
            fontFamily: typography.fontFamily.body,
            color: colors.accent.cyan,
          }}
        >
          AI Scanner Active
        </span>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{
              background: colors.status.success,
              boxShadow: `0 0 8px ${colors.status.success}`,
            }}
            animate={{
              opacity: [1, 0.5, 1],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span
            className="text-xs font-mono uppercase tracking-wider"
            style={{
              color: colors.text.secondary,
            }}
          >
            LIVE
          </span>
        </div>
      </div>
    </motion.div>
  );

  // AI Confidence Meter
  const AIConfidenceMeter = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 w-80"
    >
      <div
        className="p-4 rounded-2xl"
        style={{
          ...glassMorphism.medium,
        }}
      >
        {/* Label */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-sm font-medium"
            style={{
              fontFamily: typography.fontFamily.body,
              color: colors.text.secondary,
            }}
          >
            Position Confidence
          </span>
          <span
            className="text-sm font-mono font-bold"
            style={{
              color: aiConfidence > 70 ? colors.status.success : colors.accent.cyan,
            }}
          >
            {Math.round(aiConfidence)}%
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="h-2 rounded-full overflow-hidden relative"
          style={{
            background: colors.background.tertiary,
            boxShadow: shadows.inset,
          }}
        >
          {/* Animated gradient fill */}
          <motion.div
            className="h-full rounded-full relative"
            style={{
              background: aiConfidence > 70 ? gradients.brandMixed : gradients.aiActive,
              boxShadow: aiConfidence > 70 ? shadows.greenGlow : shadows.cyanGlow,
              width: `${aiConfidence}%`,
            }}
            transition={{ duration: 0.3 }}
          >
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              }}
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background: colors.background.primary,
      }}
    >
      {/* Particles */}
      <ParticleEffect />

      {/* Video feed */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: 'scaleX(-1)', // Mirror effect
          }}
        />

        {/* Dark overlay for better contrast */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.4) 100%)',
          }}
        />
      </div>

      {/* AI Status Indicator */}
      <AIStatusIndicator />

      {/* Top bar controls */}
      <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between">
        {/* Close button */}
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            ...glassMorphism.medium,
          }}
        >
          <X size={24} style={{ color: colors.text.primary }} strokeWidth={2} />
        </button>

        {/* Voice toggle */}
        <button
          onClick={onToggleVoice}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            ...glassMorphism.medium,
            background: voiceEnabled ? 'rgba(76, 166, 38, 0.2)' : glassMorphism.medium.background,
            border: voiceEnabled
              ? `1px solid ${colors.brand.green}`
              : glassMorphism.medium.border,
          }}
        >
          {voiceEnabled ? (
            <Volume2 size={24} style={{ color: colors.brand.green }} strokeWidth={2} />
          ) : (
            <VolumeX size={24} style={{ color: colors.text.secondary }} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* AI Confidence Meter */}
      {(scanState === 'positioning' || scanState === 'intro') && <AIConfidenceMeter />}

      {/* Voice Coach Overlay */}
      {voiceActive && voiceMessage && (
        <VoiceCoachOverlay message={voiceMessage} isPlaying={voiceActive} />
      )}

      {/* Position Guide Overlay */}
      {(scanState === 'intro' || scanState === 'positioning') && currentPosition && (
        <PositionGuideOverlay position={currentPosition} />
      )}

      {/* Countdown Overlay */}
      {scanState === 'countdown' && <CountdownOverlay duration={3000} onComplete={onCapture} />}

      {/* Validation Feedback */}
      {validationState && <ValidationFeedback state={validationState} />}

      {/* Progress Tracker */}
      <ProgressTracker positions={positions} currentIndex={positions.indexOf(currentPosition)} />

      {/* Capture Flash */}
      {showFlash && <CaptureFlash />}

      {/* Transition Wipe */}
      {showTransition && <TransitionWipe />}
    </div>
  );
}
