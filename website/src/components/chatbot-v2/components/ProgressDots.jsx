/**
 * ProgressDots Component
 * Shows scan progress: empty → current → complete
 * Dots: Filled = complete, Outlined = current, Empty = pending
 */

import React from 'react';
import '../../../styles/chatbotDesignSystem.css';

export default function ProgressDots({ totalSteps, currentStep }) {
  return (
    <div className="chatbot-progress">
      {[...Array(totalSteps)].map((_, index) => {
        const stepNumber = index + 1;
        const isComplete = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isEmpty = stepNumber > currentStep;

        return (
          <div
            key={index}
            className={`chatbot-progress-dot ${isComplete ? 'complete' : isCurrent ? 'current' : 'empty'}`}
            aria-label={`Step ${stepNumber} of ${totalSteps}${isComplete ? ' - Complete' : isCurrent ? ' - Current' : ''}`}
          >
            {/* Show checkmark icon for completed steps */}
            {isComplete && (
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
