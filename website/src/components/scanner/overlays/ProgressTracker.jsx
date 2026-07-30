/**
 * ProgressTracker - Minimal step progress indicator
 * Shows current position in scan sequence
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { progressTrackerVariants } from '../../../lib/scanner/animations';

/**
 * ProgressTracker Component
 * Bottom-center progress dots with labels
 */
export default function ProgressTracker({
  currentStep,
  totalSteps,
  progress,
  positions,
  currentPosition,
}) {
  return (
    <motion.div
      variants={progressTrackerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
    >
      <div className="flex items-center gap-3 px-6 py-3 bg-black/60 backdrop-blur-xl rounded-full border border-gray-700">
        {/* Step indicators */}
        {positions.map((position, index) => {
          const stepNumber = index + 1;
          const isActive = currentPosition?.id === position.id;
          const isCompleted = stepNumber < currentStep;

          return (
            <div key={position.id} className="flex items-center gap-3">
              {/* Step dot */}
              <motion.div
                animate={{
                  scale: isActive ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  duration: 0.5,
                  repeat: isActive ? Infinity : 0,
                  repeatDelay: 0.5,
                }}
                className="relative flex items-center justify-center"
              >
                {/* Outer ring (active) */}
                {isActive && (
                  <motion.div
                    animate={{
                      scale: [1, 1.5],
                      opacity: [0.5, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                    className="absolute w-8 h-8 rounded-full border-2 border-cyan-400"
                  />
                )}

                {/* Dot */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-green-500'
                      : isActive
                      ? 'bg-cyan-500'
                      : 'bg-gray-700'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  ) : (
                    <span className="text-white text-sm font-bold">{stepNumber}</span>
                  )}
                </div>

                {/* Label (below dot) */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span
                    className={`text-xs font-medium ${
                      isActive ? 'text-cyan-400' : 'text-gray-500'
                    }`}
                  >
                    {position.label}
                  </span>
                </div>
              </motion.div>

              {/* Connecting line (except after last step) */}
              {index < positions.length - 1 && (
                <div className="relative w-12 h-0.5 bg-gray-700 rounded-full overflow-hidden">
                  {/* Progress fill */}
                  {(isCompleted || isActive) && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: isCompleted ? '100%' : '50%' }}
                      transition={{ duration: 0.5 }}
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-green-500"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress percentage (optional) */}
      {progress !== undefined && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2"
        >
          <div className="px-3 py-1 bg-black/80 backdrop-blur-sm rounded-full border border-gray-700">
            <span className="text-cyan-400 text-xs font-semibold">
              {Math.round(progress)}% Complete
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
