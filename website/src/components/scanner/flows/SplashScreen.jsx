/**
 * Premium Medical-Grade Splash Screen
 * Dark mode, smooth animations, professional branding
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Cpu, Zap } from 'lucide-react';
import { colors, gradients, shadows, spacing, borderRadius, typography } from '../../../lib/scanner/designSystem';

export default function SplashScreen({ onComplete, clinicName = 'BestoClinic' }) {
  const [progress, setProgress] = useState(0);

  // Auto-advance with progress bar
  useEffect(() => {
    const duration = 2500;
    const interval = 50;
    const steps = duration / interval;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setProgress((step / steps) * 100);

      if (step >= steps) {
        clearInterval(timer);
        setTimeout(() => onComplete?.(), 200);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [onComplete]);

  const features = [
    {
      icon: Cpu,
      label: 'AI-Powered Analysis',
      delay: 0.2,
      color: colors.accent.cyan,
    },
    {
      icon: Zap,
      label: '30-Second Scan',
      delay: 0.4,
      color: colors.brand.green,
    },
    {
      icon: Shield,
      label: 'Medical Grade',
      delay: 0.6,
      color: colors.brand.blue,
    },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${colors.background.primary} 0%, ${colors.background.secondary} 50%, ${colors.background.tertiary} 100%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              background: i % 3 === 0 ? colors.accent.cyan : i % 3 === 1 ? colors.brand.green : colors.brand.blue,
              boxShadow: i % 3 === 0 ? shadows.cyanGlow : i % 3 === 1 ? shadows.greenGlow : shadows.blueGlow,
            }}
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              opacity: 0,
              scale: 0,
            }}
            animate={{
              y: [null, Math.random() * window.innerHeight],
              opacity: [0, 0.8, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              delay: i * 0.1,
              repeat: Infinity,
              repeatDelay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Radial glow effect */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none"
        style={{
          background: gradients.cyanGlow,
          opacity: 0.3,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
        {/* Logo container with glass morphism */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 20,
            duration: 0.8,
          }}
          className="mb-8"
        >
          <div
            className="relative w-32 h-32 flex items-center justify-center rounded-3xl"
            style={{
              background: gradients.brandMixed,
              boxShadow: `${shadows.greenGlow}, ${shadows.xl}`,
            }}
          >
            {/* Inner glow */}
            <div
              className="absolute inset-2 rounded-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
              }}
            />

            {/* Icon */}
            <Sparkles
              className="relative z-10"
              size={56}
              strokeWidth={2.5}
              style={{ color: colors.text.primary }}
            />

            {/* Rotating ring */}
            <motion.div
              className="absolute inset-0 rounded-3xl"
              style={{
                border: `2px solid ${colors.accent.cyan}`,
                opacity: 0.5,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl md:text-6xl font-bold text-center mb-3"
          style={{
            fontFamily: typography.fontFamily.heading,
            color: colors.text.primary,
            textShadow: shadows.md,
          }}
        >
          Dental AI Scanner
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-lg mb-12"
          style={{
            fontFamily: typography.fontFamily.body,
            color: colors.text.secondary,
          }}
        >
          Powered by{' '}
          <span
            style={{
              background: gradients.brandMixed,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            {clinicName}
          </span>
        </motion.p>

        {/* Features */}
        <div className="flex gap-8 mb-12">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: feature.delay, duration: 0.6 }}
              className="flex flex-col items-center gap-3"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
                style={{
                  background: `${colors.background.tertiary}`,
                  border: `1px solid ${colors.border.subtle}`,
                  boxShadow: shadows.md,
                }}
              >
                <feature.icon size={28} style={{ color: feature.color }} strokeWidth={2} />

                {/* Pulse effect */}
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    border: `2px solid ${feature.color}`,
                  }}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: feature.delay,
                  }}
                />
              </div>

              <span
                className="text-sm font-medium text-center"
                style={{
                  fontFamily: typography.fontFamily.body,
                  color: colors.text.secondary,
                }}
              >
                {feature.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Track */}
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{
              background: colors.background.tertiary,
              boxShadow: shadows.inset,
            }}
          >
            {/* Progress */}
            <motion.div
              className="h-full rounded-full"
              style={{
                background: gradients.brandMixed,
                boxShadow: shadows.greenGlow,
                width: `${progress}%`,
              }}
              transition={{ duration: 0.1 }}
            />
          </div>

          {/* Status text */}
          <p
            className="text-center text-sm mt-4"
            style={{
              fontFamily: typography.fontFamily.body,
              color: colors.text.tertiary,
            }}
          >
            Initializing AI scanner...
          </p>
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${colors.background.primary}, transparent)`,
        }}
      />
    </motion.div>
  );
}
