/**
 * Video Jaw Guide — Video demonstrations showing target jaw positions.
 *
 * Much simpler than 3D models - just 3 short video clips showing
 * a person demonstrating the exact jaw movements needed.
 *
 * @version 2.0 (Video-based)
 * @date April 2026
 */

import React, { useEffect, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';
import { SCAN_POSITIONS_ENHANCED } from '../../constants/enhancedScanPositions';
import PositionIllustrationGuide from './PositionIllustrationGuide';

// Video sources (update these paths after recording your videos)
const POSITION_VIDEOS = {
  front_smile: '/videos/guides/front-smile.mp4',
  left_lateral: '/videos/guides/left-lateral.mp4',
  right_lateral: '/videos/guides/right-lateral.mp4',
};

/**
 * VideoJawGuide Component
 * Shows looping video demonstration of target jaw position
 */
export default function VideoJawGuide({
  currentPositionIndex = 0,
  autoPlay = true,
  className = ''
}) {
  const videoRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const position = SCAN_POSITIONS_ENHANCED[currentPositionIndex];
  const videoSrc = position ? POSITION_VIDEOS[position.id] : null;

  // Handle video transitions
  useEffect(() => {
    if (videoRef.current && videoSrc) {
      setIsLoaded(false);
      setHasError(false);

      // Reset and load new video
      videoRef.current.load();

      if (autoPlay) {
        videoRef.current.play().catch(err => {
          console.warn('[VideoGuide] Autoplay failed:', err);
        });
      }
    }
  }, [videoSrc, autoPlay]);

  if (!position) {
    return (
      <div className={`video-jaw-guide empty ${className}`}>
        <div className="placeholder">
          <span className="icon"><CircleDot className="h-6 w-6" /></span>
          <span className="text">Ready to scan</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`video-jaw-guide ${className} ${isLoaded ? 'loaded' : 'loading'}`}>
      <div className="video-container">
        {/* Video player */}
        <video
          ref={videoRef}
          className="guide-video"
          loop
          muted
          playsInline
          onLoadedData={() => setIsLoaded(true)}
          onError={() => {
            console.error('[VideoGuide] Failed to load:', videoSrc);
            setHasError(true);
          }}
        >
          <source src={videoSrc} type="video/mp4" />
          Your browser does not support video playback.
        </video>

        {/* Loading overlay */}
        {!isLoaded && !hasError && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>Loading guide...</span>
          </div>
        )}

        {/* Error fallback - show illustrated guide */}
        {hasError && (
          <div className="fallback-container">
            <PositionIllustrationGuide
              position={position}
              currentPositionIndex={currentPositionIndex}
            />
          </div>
        )}

        {/* Video overlay with instructions */}
        <div className="instruction-overlay">
          <div className="instruction-badge">
            <span className="label">{position.label}</span>
            <span className="progress">{currentPositionIndex + 1} of 3</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .video-jaw-guide {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 12px;
          overflow: hidden;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .video-container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .guide-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
        }

        .loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
        }

        .fallback-container {
          position: absolute;
          inset: 0;
          background: white;
          overflow: hidden;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .instruction-overlay {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }

        .instruction-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 20px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          border-radius: 8px;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .instruction-badge .label {
          font-size: 16px;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .instruction-badge .progress {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
        }

        .placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 40px;
        }

        .placeholder .icon {
          font-size: 48px;
        }

        .placeholder .text {
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        /* Smooth fade-in when loaded */
        .video-jaw-guide.loading .guide-video {
          opacity: 0;
        }

        .video-jaw-guide.loaded .guide-video {
          opacity: 1;
          transition: opacity 0.3s ease;
        }
      `}</style>
    </div>
  );
}

/**
 * SETUP INSTRUCTIONS:
 *
 * 1. Record 3 videos (5-10 seconds each):
 *    - front-smile.mp4 (front teeth)
 *    - left-lateral.mp4 (left side teeth)
 *    - right-lateral.mp4 (right side teeth)
 *
 * 2. Compress videos (keep under 2MB each):
 *    Using FFmpeg:
 *    ```bash
 *    ffmpeg -i input.mp4 -vcodec h264 -b:v 800k -s 720x720 output.mp4
 *    ```
 *
 * 3. Place videos in:
 *    website/public/videos/guides/
 *
 * 4. That's it! Videos will auto-loop and guide users.
 *
 * ALTERNATIVE: Use placeholder until videos ready
 * Just show text + icon for now, add videos later
 */
