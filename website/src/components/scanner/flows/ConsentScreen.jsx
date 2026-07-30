/**
 * Professional Medical-Grade Consent Screen
 * Dark mode, trust-building, HIPAA-compliant messaging
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Camera, Brain, Lock, Check, X, Sparkles } from 'lucide-react';
import {
  colors,
  gradients,
  shadows,
  spacing,
  borderRadius,
  typography,
  glassMorphism,
} from '../../../lib/scanner/designSystem';

export default function ConsentScreen({ onConsent, onDecline, clinicName = 'BestoClinic' }) {
  const [agreed, setAgreed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConsent = () => {
    if (!agreed) return;
    setIsProcessing(true);
    setTimeout(() => onConsent?.(), 300);
  };

  const consentPoints = [
    {
      icon: Camera,
      title: 'Photo Capture',
      description: '3 quick photos (left, front, right) for comprehensive analysis',
      color: colors.brand.green,
    },
    {
      icon: Brain,
      title: 'AI Analysis',
      description: 'Advanced AI detects cavities, gum issues, and alignment problems',
      color: colors.accent.cyan,
    },
    {
      icon: Lock,
      title: 'HIPAA Compliant',
      description: 'End-to-end encryption. Your data is never shared or sold',
      color: colors.brand.blue,
    },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${colors.background.primary} 0%, ${colors.background.secondary} 50%, ${colors.background.tertiary} 100%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1 + 'px',
              height: Math.random() * 3 + 1 + 'px',
              background: i % 2 === 0 ? colors.brand.green : colors.accent.cyan,
              opacity: 0.4,
            }}
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              y: [null, Math.random() * window.innerHeight],
              opacity: [0.4, 0.8, 0.4],
            }}
            transition={{
              duration: Math.random() * 4 + 3,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>

      {/* Main content card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="relative w-full max-w-2xl mx-6"
        style={{
          ...glassMorphism.medium,
          borderRadius: borderRadius.xl,
          padding: spacing.xl,
        }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          {/* Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
            className="inline-flex mb-4"
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
              style={{
                background: gradients.brandMixed,
                boxShadow: shadows.greenGlow,
              }}
            >
              <Shield size={40} style={{ color: colors.text.primary }} strokeWidth={2} />

              {/* Pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{
                  border: `2px solid ${colors.brand.green}`,
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{
              fontFamily: typography.fontFamily.heading,
              color: colors.text.primary,
            }}
          >
            Medical Consent Required
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-base"
            style={{
              fontFamily: typography.fontFamily.body,
              color: colors.text.secondary,
            }}
          >
            {clinicName}'s AI Scanner uses advanced imaging technology to analyze your dental health
          </motion.p>
        </div>

        {/* Consent points */}
        <div className="space-y-4 mb-8">
          {consentPoints.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="flex gap-4 p-4 rounded-xl"
              style={{
                background: colors.background.secondary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              {/* Icon */}
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: `${point.color}15`,
                  border: `1px solid ${point.color}30`,
                }}
              >
                <point.icon size={24} style={{ color: point.color }} strokeWidth={2} />
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3
                  className="font-semibold mb-1"
                  style={{
                    fontFamily: typography.fontFamily.heading,
                    fontSize: typography.fontSize.lg,
                    color: colors.text.primary,
                  }}
                >
                  {point.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    fontFamily: typography.fontFamily.body,
                    color: colors.text.secondary,
                  }}
                >
                  {point.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Checkbox */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mb-6"
        >
          <label className="flex items-start gap-3 cursor-pointer group">
            {/* Custom checkbox */}
            <div
              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200"
              style={{
                background: agreed ? gradients.brandMixed : colors.background.tertiary,
                border: `2px solid ${agreed ? colors.brand.green : colors.border.default}`,
                boxShadow: agreed ? shadows.greenGlow : 'none',
              }}
              onClick={() => setAgreed(!agreed)}
            >
              {agreed && <Check size={16} style={{ color: colors.text.primary }} strokeWidth={3} />}
            </div>

            <span
              className="text-sm leading-relaxed"
              style={{
                fontFamily: typography.fontFamily.body,
                color: colors.text.secondary,
              }}
            >
              I understand and consent to the capture and analysis of my dental images by {clinicName}'s AI
              system. I acknowledge that this is for educational and screening purposes only and does not replace
              a professional dental examination.
            </span>
          </label>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex gap-4"
        >
          {/* Decline button */}
          <button
            onClick={onDecline}
            disabled={isProcessing}
            className="flex-1 py-4 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50"
            style={{
              fontFamily: typography.fontFamily.heading,
              fontSize: typography.fontSize.base,
              background: colors.background.tertiary,
              color: colors.text.secondary,
              border: `1px solid ${colors.border.default}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.background.secondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.background.tertiary;
            }}
          >
            <X className="inline mr-2" size={20} />
            Decline
          </button>

          {/* Consent button */}
          <button
            onClick={handleConsent}
            disabled={!agreed || isProcessing}
            className="flex-1 py-4 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            style={{
              fontFamily: typography.fontFamily.heading,
              fontSize: typography.fontSize.base,
              background: agreed ? gradients.brandMixed : colors.background.tertiary,
              color: agreed ? colors.text.primary : colors.text.tertiary,
              border: `2px solid ${agreed ? colors.brand.green : colors.border.default}`,
              boxShadow: agreed ? shadows.greenGlow : 'none',
            }}
          >
            {/* Shimmer effect on hover */}
            {agreed && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                }}
                animate={{
                  x: ['-100%', '200%'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            )}

            <span className="relative z-10 flex items-center justify-center">
              {isProcessing ? (
                <>
                  <motion.div
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="inline mr-2" size={20} />I Consent - Start Scan
                </>
              )}
            </span>
          </button>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-xs text-center mt-6"
          style={{
            fontFamily: typography.fontFamily.body,
            color: colors.text.tertiary,
          }}
        >
          Your privacy is protected. Images are encrypted and automatically deleted after analysis.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
