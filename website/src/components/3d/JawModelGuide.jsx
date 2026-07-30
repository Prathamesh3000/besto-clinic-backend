/**
 * Jaw Model Guide — 3D animated guide showing target jaw positions.
 *
 * Phase 1 Implementation:
 * - Placeholder with animated illustrations (CSS/SVG)
 * - Shows target pose for each position
 * - Smooth transitions between positions
 *
 * Phase 2 Enhancement (when 3D model acquired):
 * - Replace with React Three Fiber + GLTF model
 * - Actual jaw animations from Blender
 * - Camera angle transitions
 *
 * @version 2.0 (Placeholder)
 * @date April 2026
 */

import React, { useEffect, useState } from 'react';
import { Smile, Search, CircleDot } from 'lucide-react';
import { getCurrentPosition } from '../../constants/enhancedScanPositions';

/**
 * Position illustration components (CSS-based placeholders)
 * TODO: Replace with actual 3D model when available
 */
const PositionIllustrations = {
  front_smile: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline">
        <div className="mouth smile">
          <div className="teeth-row upper">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
          <div className="teeth-row lower">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon"><Smile className="h-6 w-6" /></span>
        <span className="text">Big Smile</span>
      </div>
    </div>
  ),

  left_lateral: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline rotated-right">
        <div className="mouth side-view left">
          <div className="teeth-side">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon">↶</span>
        <span className="text">Turn Right</span>
      </div>
    </div>
  ),

  right_lateral: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline rotated-left">
        <div className="mouth side-view right">
          <div className="teeth-side">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon">↷</span>
        <span className="text">Turn Left</span>
      </div>
    </div>
  ),

  upper_occlusal: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline tilted-back">
        <div className="mouth occlusal upper">
          <div className="teeth-arch">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon">⤴</span>
        <span className="text">Tilt Back</span>
      </div>
    </div>
  ),

  lower_occlusal: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline tilted-forward">
        <div className="mouth occlusal lower">
          <div className="teeth-arch">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon">⤵</span>
        <span className="text">Tilt Forward</span>
      </div>
    </div>
  ),

  close_smile: ({ animate }) => (
    <div className={`position-illustration ${animate ? 'animate' : ''}`}>
      <div className="head-outline zoomed">
        <div className="mouth gentle-smile">
          <div className="teeth-row upper">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
          <div className="gums" />
          <div className="teeth-row lower">
            <div className="tooth" />
            <div className="tooth" />
            <div className="tooth" />
          </div>
        </div>
      </div>
      <div className="instruction-overlay">
        <span className="icon"><Search className="h-6 w-6" /></span>
        <span className="text">Close-Up</span>
      </div>
    </div>
  ),
};

/**
 * JawModelGuide Component
 * @param {Object} props
 * @param {number} props.currentPositionIndex - Current position index (0-5)
 * @param {boolean} props.animate - Whether to play animation
 * @param {string} props.className - Additional CSS classes
 */
export default function JawModelGuide({ currentPositionIndex = 0, animate = false, className = '' }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(currentPositionIndex);

  const position = getCurrentPosition({ currentPositionIndex });

  // Handle position transitions
  useEffect(() => {
    if (currentPositionIndex !== displayIndex) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayIndex(currentPositionIndex);
        setIsTransitioning(false);
      }, 300); // Transition duration
      return () => clearTimeout(timer);
    }
  }, [currentPositionIndex, displayIndex]);

  if (!position) {
    return (
      <div className={`jaw-model-guide empty ${className}`}>
        <div className="placeholder">
          <span className="icon"><CircleDot className="h-6 w-6" /></span>
          <span className="text">Ready to scan</span>
        </div>
      </div>
    );
  }

  const IllustrationComponent = PositionIllustrations[position.id];

  return (
    <div className={`jaw-model-guide ${className} ${isTransitioning ? 'transitioning' : ''}`}>
      <div className="model-container">
        {IllustrationComponent ? (
          <IllustrationComponent animate={animate} />
        ) : (
          <div className="placeholder">
            <span className="icon"><CircleDot className="h-6 w-6" /></span>
            <span className="text">{position.label}</span>
          </div>
        )}
      </div>

      {/* Position indicator */}
      <div className="position-indicator">
        <span className="label">{position.label}</span>
        <span className="progress">
          {currentPositionIndex + 1} of 6
        </span>
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        .jaw-model-guide {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
        }

        .jaw-model-guide.transitioning {
          opacity: 0.6;
          transform: scale(0.95);
        }

        .model-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 300px;
        }

        .position-illustration {
          position: relative;
          width: 200px;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.5s ease;
        }

        .position-illustration.animate {
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .head-outline {
          width: 120px;
          height: 150px;
          border: 3px solid rgba(255, 255, 255, 0.9);
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          position: relative;
          background: rgba(255, 255, 255, 0.1);
          transition: transform 0.8s ease;
        }

        .head-outline.rotated-right {
          transform: rotateY(-30deg);
        }

        .head-outline.rotated-left {
          transform: rotateY(30deg);
        }

        .head-outline.tilted-back {
          transform: rotateX(-20deg);
        }

        .head-outline.tilted-forward {
          transform: rotateX(20deg);
        }

        .head-outline.zoomed {
          transform: scale(1.3);
        }

        .mouth {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 30px;
          border-radius: 0 0 30px 30px;
          border: 2px solid rgba(255, 255, 255, 0.9);
          background: rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .mouth.smile {
          width: 70px;
          height: 35px;
          border-radius: 0 0 40px 40px;
        }

        .mouth.side-view {
          width: 40px;
          height: 35px;
          border-radius: 20px;
        }

        .mouth.occlusal {
          width: 50px;
          height: 40px;
          border-radius: 50%;
        }

        .mouth.gentle-smile {
          width: 60px;
          height: 25px;
          border-radius: 0 0 30px 30px;
        }

        .teeth-row {
          display: flex;
          justify-content: center;
          gap: 2px;
          padding: 4px;
        }

        .teeth-row.upper {
          margin-top: 2px;
        }

        .teeth-side, .teeth-arch {
          display: flex;
          gap: 3px;
          padding: 5px;
        }

        .tooth {
          width: 8px;
          height: 10px;
          background: white;
          border-radius: 2px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .gums {
          height: 3px;
          background: rgba(255, 200, 200, 0.6);
          margin: 2px 0;
        }

        .instruction-overlay {
          position: absolute;
          bottom: -40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .instruction-overlay .icon {
          font-size: 32px;
          animation: bounce 1.5s ease-in-out infinite;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        .instruction-overlay .text {
          font-size: 14px;
          font-weight: 600;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .position-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          margin-top: 20px;
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          backdrop-filter: blur(10px);
        }

        .position-indicator .label {
          font-size: 16px;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .position-indicator .progress {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
        }

        .placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .placeholder .icon {
          font-size: 48px;
        }

        .placeholder .text {
          font-size: 16px;
          font-weight: 600;
          color: white;
        }
      `}</style>
    </div>
  );
}

/**
 * Create jaw model guide with React Three Fiber (for when real model is available)
 *
 * Example implementation:
 *
 * import { Canvas } from '@react-three/fiber'
 * import { OrbitControls, useGLTF, useAnimations } from '@react-three/drei'
 *
 * function JawModel({ position, animate }) {
 *   const { scene, animations } = useGLTF('/models/jaw-guide.glb')
 *   const { actions } = useAnimations(animations, scene)
 *
 *   useEffect(() => {
 *     if (animate && position?.animation?.animationClip) {
 *       const action = actions[position.animation.animationClip]
 *       action?.reset().play()
 *     }
 *   }, [position, animate, actions])
 *
 *   return <primitive object={scene} />
 * }
 *
 * export default function JawModelGuide3D({ currentPositionIndex }) {
 *   return (
 *     <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
 *       <ambientLight intensity={0.5} />
 *       <spotLight position={[10, 10, 10]} angle={0.15} />
 *       <JawModel position={getCurrentPosition({ currentPositionIndex })} animate />
 *       <OrbitControls enableZoom={false} />
 *     </Canvas>
 *   )
 * }
 */
