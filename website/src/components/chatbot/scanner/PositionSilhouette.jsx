/**
 * PositionSilhouette — SVG head silhouette overlay for each scan position.
 * Shows the user exactly how to position their head.
 * Renders semi-transparent over the camera feed with a breathing animation.
 */

import React from 'react';
import { motion } from 'framer-motion';

const breathingAnimation = {
  animate: {
    y: [0, -4, 0],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
};

function LeftSilhouette({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      {/* Head turned right — left side teeth visible */}
      <ellipse cx="110" cy="85" rx="50" ry="60" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Jaw line */}
      <path d="M 85 130 Q 95 155 120 150 Q 135 148 140 135" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" fill="none" />
      {/* Mouth area — highlighted with teeth */}
      <ellipse cx="130" cy="120" rx="22" ry="14" fill="none" stroke="#00e5ff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Teeth indication */}
      <rect x="115" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="121" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="127" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="133" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="139" y="117" width="4" height="7" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      {/* Direction arrow */}
      <path d="M 45 85 L 30 85 M 30 85 L 38 78 M 30 85 L 38 92" stroke="#00e5ff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      {/* Label */}
      <text x="100" y="185" textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="12" fontWeight="500">Turn head right</text>
    </svg>
  );
}

function FrontSilhouette({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      {/* Head facing forward */}
      <ellipse cx="100" cy="80" rx="45" ry="55" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Jaw */}
      <path d="M 65 110 Q 80 150 100 155 Q 120 150 135 110" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" fill="none" />
      {/* Mouth area */}
      <ellipse cx="100" cy="120" rx="25" ry="14" fill="none" stroke="#00e5ff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Teeth — front row */}
      <rect x="80" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="86" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="92" y="114" width="5" height="10" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="99" y="114" width="5" height="10" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="106" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="112" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      {/* Label */}
      <text x="100" y="185" textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="12" fontWeight="500">Face camera directly</text>
    </svg>
  );
}

function RightSilhouette({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      {/* Head turned left — right side teeth visible */}
      <ellipse cx="90" cy="85" rx="50" ry="60" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Jaw line */}
      <path d="M 115 130 Q 105 155 80 150 Q 65 148 60 135" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" fill="none" />
      {/* Mouth area */}
      <ellipse cx="70" cy="120" rx="22" ry="14" fill="none" stroke="#00e5ff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Teeth */}
      <rect x="55" y="117" width="4" height="7" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="61" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="67" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="73" y="115" width="4" height="9" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      <rect x="79" y="116" width="4" height="8" rx="1" fill="#00e5ff" fillOpacity="0.3" />
      {/* Direction arrow */}
      <path d="M 155 85 L 170 85 M 170 85 L 162 78 M 170 85 L 162 92" stroke="#00e5ff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      {/* Label */}
      <text x="100" y="185" textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="12" fontWeight="500">Turn head left</text>
    </svg>
  );
}

function TongueSilhouette({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      {/* Head outline */}
      <ellipse cx="100" cy="75" rx="45" ry="55" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.2" strokeWidth="1.5" />
      {/* Open mouth */}
      <ellipse cx="100" cy="125" rx="22" ry="16" fill="none" stroke="#00e5ff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Tongue protruding */}
      <path d="M 85 130 Q 85 165 100 170 Q 115 165 115 130" fill="#ff6b9d" fillOpacity="0.3" stroke="#ff6b9d" strokeOpacity="0.6" strokeWidth="1.5" />
      {/* Tongue center line */}
      <path d="M 100 132 L 100 160" stroke="#ff6b9d" strokeOpacity="0.3" strokeWidth="1" />
      {/* Label */}
      <text x="100" y="192" textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="12" fontWeight="500">Stick tongue out</text>
    </svg>
  );
}

const SILHOUETTES = {
  left: LeftSilhouette,
  front: FrontSilhouette,
  right: RightSilhouette,
  tongue: TongueSilhouette,
};

export default function PositionSilhouette({ position = 'front', size = 200, className = '' }) {
  const Component = SILHOUETTES[position] || FrontSilhouette;

  return (
    <motion.div className={`pointer-events-none ${className}`} {...breathingAnimation}>
      <Component size={size} />
    </motion.div>
  );
}
