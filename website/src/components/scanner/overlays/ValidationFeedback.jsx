/**
 * ValidationFeedback - Real-time validation feedback overlay
 * Shows success/failure state with confidence indicator
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

/**
 * ValidationFeedback Component
 * Displays validation state with icon, message, and confidence meter
 */
export default function ValidationFeedback({ state, message, confidence }) {
  // State config
  const stateConfig = {
    validating: {
      icon: Loader2,
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/50',
      textColor: 'text-blue-300',
      iconColor: 'text-blue-400',
      animate: { rotate: 360 },
      transition: { duration: 1, repeat: Infinity, ease: 'linear' },
    },
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/50',
      textColor: 'text-green-300',
      iconColor: 'text-green-400',
      animate: { scale: [0.8, 1.1, 1] },
      transition: { duration: 0.4 },
    },
    failure: {
      icon: XCircle,
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/50',
      textColor: 'text-red-300',
      iconColor: 'text-red-400',
      animate: { x: [-5, 5, -5, 5, 0] },
      transition: { duration: 0.4 },
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-amber-500/20',
      borderColor: 'border-amber-500/50',
      textColor: 'text-amber-300',
      iconColor: 'text-amber-400',
      animate: { scale: [1, 1.05, 1] },
      transition: { duration: 0.3, repeat: 3 },
    },
  };

  const config = stateConfig[state] || stateConfig.validating;
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        >
          <motion.div
            animate={config.animate}
            transition={config.transition}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 backdrop-blur-xl shadow-2xl ${config.bgColor} ${config.borderColor}`}
          >
            {/* Icon */}
            <Icon className={`w-6 h-6 flex-shrink-0 ${config.iconColor}`} />

            {/* Message */}
            <div className="flex flex-col">
              <span className={`font-semibold ${config.textColor}`}>{message}</span>

              {/* Confidence meter (if provided) */}
              {confidence !== undefined && confidence !== null && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${confidence * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        confidence >= 0.8
                          ? 'bg-green-400'
                          : confidence >= 0.6
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      }`}
                    />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {Math.round(confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
