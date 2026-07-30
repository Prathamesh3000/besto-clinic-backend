/**
 * Position Illustration Guide — Visual fallback when videos aren't available
 *
 * Shows illustrated diagrams, step-by-step instructions, and helpful tips
 * for each scan position.
 *
 * @version 1.0
 * @date April 2026
 */

import React from 'react';
import { Smile, ArrowLeft, ArrowRight, Camera, CheckCircle } from 'lucide-react';

const POSITION_ILLUSTRATIONS = {
  front_smile: {
    icon: Smile,
    color: '#10b981',
    steps: [
      'Face the camera directly',
      'Smile wide showing your front teeth',
      'Hold your head steady',
      'Keep your teeth visible'
    ],
    tips: [
      'Make sure good lighting hits your face',
      'Relax your jaw naturally',
      'Show both upper and lower teeth'
    ]
  },
  left_lateral: {
    icon: ArrowRight,
    color: '#3b82f6',
    steps: [
      'Turn your head 45° to your right',
      'Open your mouth wide',
      'Show your left side teeth',
      'Hold the position steady'
    ],
    tips: [
      'Camera should see your left cheek',
      'Open wide to show molars',
      'Keep your head at eye level'
    ]
  },
  right_lateral: {
    icon: ArrowLeft,
    color: '#8b5cf6',
    steps: [
      'Turn your head 45° to your left',
      'Open your mouth wide',
      'Show your right side teeth',
      'Hold the position steady'
    ],
    tips: [
      'Camera should see your right cheek',
      'Open wide to show molars',
      'Maintain steady head position'
    ]
  }
};

/**
 * Visual Guide Component
 */
export default function PositionIllustrationGuide({
  position,
  currentPositionIndex = 0,
  className = ''
}) {
  if (!position) return null;

  const guide = POSITION_ILLUSTRATIONS[position.id];
  if (!guide) return null;

  const Icon = guide.icon;

  return (
    <div className={`position-illustration-guide ${className}`}>
      {/* Header with icon */}
      <div className="guide-header">
        <div className="icon-container" style={{ backgroundColor: guide.color }}>
          <Icon className="position-icon" size={48} strokeWidth={2} />
        </div>
        <div className="header-text">
          <h3 className="position-title">{position.label}</h3>
          <span className="progress-badge">{currentPositionIndex + 1} of 3</span>
        </div>
      </div>

      {/* Illustration placeholder - can be replaced with actual SVG diagrams */}
      <div className="illustration-area">
        <div className="face-diagram">
          {position.id === 'front_smile' && (
            <svg viewBox="0 0 200 200" className="diagram-svg">
              {/* Front face outline */}
              <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="3" />
              {/* Eyes */}
              <circle cx="75" cy="85" r="5" fill="currentColor" />
              <circle cx="125" cy="85" r="5" fill="currentColor" />
              {/* Smiling mouth */}
              <path d="M 70 120 Q 100 140 130 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              {/* Teeth indication */}
              <rect x="85" y="120" width="30" height="10" fill="white" stroke="currentColor" strokeWidth="1" rx="2" />
            </svg>
          )}

          {position.id === 'left_lateral' && (
            <svg viewBox="0 0 200 200" className="diagram-svg">
              {/* Side profile */}
              <path d="M 150 60 Q 140 50 120 50 Q 80 50 60 80 Q 50 100 55 130 Q 60 150 80 160 Q 100 165 120 160 L 140 155"
                    fill="none" stroke="currentColor" strokeWidth="3" />
              {/* Eye */}
              <circle cx="130" cy="80" r="5" fill="currentColor" />
              {/* Mouth opening */}
              <path d="M 90 130 L 110 135 L 100 145 Z" fill="currentColor" opacity="0.6" />
              {/* Arrow indicating direction */}
              <path d="M 170 100 L 190 100" stroke={guide.color} strokeWidth="3" strokeLinecap="round" />
              <path d="M 185 95 L 190 100 L 185 105" stroke={guide.color} strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}

          {position.id === 'right_lateral' && (
            <svg viewBox="0 0 200 200" className="diagram-svg">
              {/* Side profile (mirrored) */}
              <path d="M 50 60 Q 60 50 80 50 Q 120 50 140 80 Q 150 100 145 130 Q 140 150 120 160 Q 100 165 80 160 L 60 155"
                    fill="none" stroke="currentColor" strokeWidth="3" />
              {/* Eye */}
              <circle cx="70" cy="80" r="5" fill="currentColor" />
              {/* Mouth opening */}
              <path d="M 110 130 L 90 135 L 100 145 Z" fill="currentColor" opacity="0.6" />
              {/* Arrow indicating direction */}
              <path d="M 30 100 L 10 100" stroke={guide.color} strokeWidth="3" strokeLinecap="round" />
              <path d="M 15 95 L 10 100 L 15 105" stroke={guide.color} strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Step-by-step instructions */}
      <div className="steps-section">
        <h4 className="section-title">
          <Camera size={16} />
          How to Position
        </h4>
        <ol className="steps-list">
          {guide.steps.map((step, index) => (
            <li key={index} className="step-item">
              <span className="step-number">{index + 1}</span>
              <span className="step-text">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Helpful tips */}
      <div className="tips-section">
        <h4 className="section-title">
          <CheckCircle size={16} />
          Tips for Best Results
        </h4>
        <ul className="tips-list">
          {guide.tips.map((tip, index) => (
            <li key={index} className="tip-item">
              <span className="tip-bullet">•</span>
              <span className="tip-text">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <style jsx>{`
        .position-illustration-guide {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .guide-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .icon-container {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .position-icon {
          color: white;
        }

        .header-text {
          flex: 1;
        }

        .position-title {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
        }

        .progress-badge {
          display: inline-block;
          margin-top: 4px;
          padding: 4px 12px;
          background: #3b82f6;
          color: white;
          font-size: 12px;
          font-weight: 600;
          border-radius: 12px;
        }

        .illustration-area {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 12px;
          padding: 32px;
          min-height: 200px;
        }

        .face-diagram {
          width: 100%;
          max-width: 240px;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }

        .diagram-svg {
          width: 100%;
          height: auto;
          color: #64748b;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #475569;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .steps-section {
          background: white;
          border-radius: 12px;
          padding: 16px;
        }

        .steps-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          animation: slideIn 0.3s ease forwards;
          opacity: 0;
        }

        .step-item:nth-child(1) { animation-delay: 0.1s; }
        .step-item:nth-child(2) { animation-delay: 0.2s; }
        .step-item:nth-child(3) { animation-delay: 0.3s; }
        .step-item:nth-child(4) { animation-delay: 0.4s; }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .step-number {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
        }

        .step-text {
          flex: 1;
          font-size: 14px;
          color: #334155;
          line-height: 1.6;
        }

        .tips-section {
          background: #fef3c7;
          border: 2px solid #fbbf24;
          border-radius: 12px;
          padding: 16px;
        }

        .tips-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tip-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .tip-bullet {
          color: #f59e0b;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.4;
        }

        .tip-text {
          flex: 1;
          font-size: 13px;
          color: #78350f;
          line-height: 1.5;
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .position-illustration-guide {
            padding: 16px;
            gap: 16px;
          }

          .position-title {
            font-size: 20px;
          }

          .illustration-area {
            padding: 24px;
            min-height: 160px;
          }
        }
      `}</style>
    </div>
  );
}
