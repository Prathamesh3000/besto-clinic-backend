/**
 * EnhancedScannerCard — v2.0 immersive scanner with multi-frame capture + video guides.
 *
 * Features:
 * - 3 core scan positions (left, right, front)
 * - Multi-frame auto-capture (3-5 frames per position)
 * - Client-side quality validation
 * - Video jaw guides (MP4 demonstrations)
 * - Enhanced state machine (15 states)
 * - Adaptive retry logic
 *
 * Flow: Welcome → Camera Setup → Intro → [Position Loop × 3] → Complete
 *
 * @version 2.0
 * @date April 2026
 */

import React, { useRef, useState, useCallback, useEffect, useReducer } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Loader2, Upload, CheckCircle, AlertCircle, Volume2 } from 'lucide-react';
import { isVoiceSupported, speak as speakVoice, stopSpeaking } from '../../../lib/voiceGuidance';
import { createMultiFrameCaptureService } from '../../../services/MultiFrameCaptureService';
import {
  SCAN_POSITIONS_ENHANCED,
  getAdaptiveQuality,
} from '../../../constants/enhancedScanPositions';
import {
  enhancedScannerReducer,
  createInitialContext,
  SCANNER_STATES,
  SCANNER_EVENTS,
  getCurrentPosition,
  getScanProgress,
  shouldShowManualCapture,
  getCurrentQualityThreshold,
} from '../../../state/enhancedScannerStateMachine';
import VideoJawGuide from '../../guides/VideoJawGuide';
import useFaceDetection from './useFaceDetection';
import ScanIntroOverlay from './ScanIntroOverlay';
import AngleMeter from './AngleMeter';
import CountdownRing from './CountdownRing';
import ProgressRail from './ProgressRail';
import CaptureTransition from './CaptureTransition';
import ScanCelebration from './ScanCelebration';

export default function EnhancedScannerCard({
  sessionToken,
  onUploadFrame,
  onFinalizePosition,
  onAllCaptured,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureServiceRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Enhanced scanner state machine
  const [scanner, dispatch] = useReducer(enhancedScannerReducer, createInitialContext());

  // Get current position
  const currentPosition = getCurrentPosition(scanner);
  const scanProgress = getScanProgress(scanner);

  // Face detection (MediaPipe)
  const { faceData, isReady: faceReady, hasFailed: faceFailed } = useFaceDetection(
    videoRef,
    cameraReady && scanner.state !== SCANNER_STATES.IDLE
  );

  // Initialize multi-frame capture service
  useEffect(() => {
    if (videoRef.current && !captureServiceRef.current) {
      captureServiceRef.current = createMultiFrameCaptureService(videoRef.current);
    }
    return () => {
      if (captureServiceRef.current) {
        captureServiceRef.current.dispose();
        captureServiceRef.current = null;
      }
    };
  }, []);

  // ── Camera lifecycle ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
        dispatch({ type: SCANNER_EVENTS.CAMERA_READY });
      }
    } catch (err) {
      console.error('[EnhancedScanner] Camera error:', err);
      setCameraError('Camera access denied or unavailable');
      dispatch({ type: SCANNER_EVENTS.CAMERA_ERROR, payload: { error: err.message } });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start camera when needed
  useEffect(() => {
    const needsCamera =
      scanner.state === SCANNER_STATES.CAMERA_SETUP ||
      scanner.state === SCANNER_STATES.INTRO ||
      scanner.state === SCANNER_STATES.POSITIONING ||
      scanner.state === SCANNER_STATES.DETECTING ||
      scanner.state === SCANNER_STATES.COUNTDOWN ||
      scanner.state === SCANNER_STATES.MULTI_CAPTURE;

    if (needsCamera && !streamRef.current && !cameraError) {
      startCamera();
    }

    if (!needsCamera && streamRef.current) {
      stopCamera();
    }
  }, [scanner.state, cameraError, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeaking();
    };
  }, [stopCamera]);

  // ── Face detection → State machine ──
  useEffect(() => {
    if (!currentPosition || !faceData) return;

    const { yaw, pitch, mouthOpen, facePresent } = faceData;

    if (scanner.state === SCANNER_STATES.POSITIONING && facePresent) {
      dispatch({ type: SCANNER_EVENTS.FACE_DETECTED, payload: { yaw, pitch, mouthOpen } });
    }

    if (scanner.state === SCANNER_STATES.DETECTING && facePresent) {
      // Check if angle matches target
      const targetPose = currentPosition.targetPose;
      const yawMatch = yaw >= targetPose.yaw.min && yaw <= targetPose.yaw.max;
      const pitchMatch = pitch >= targetPose.pitch.min && pitch <= targetPose.pitch.max;
      const mouthMatch = mouthOpen >= targetPose.mouthOpen.min && mouthOpen <= targetPose.mouthOpen.max;

      if (yawMatch && pitchMatch && mouthMatch) {
        dispatch({ type: SCANNER_EVENTS.ANGLE_MATCHED, payload: { yaw, pitch, mouthOpen } });
      }
    }

    if (scanner.state === SCANNER_STATES.COUNTDOWN && !facePresent) {
      dispatch({ type: SCANNER_EVENTS.ANGLE_LOST });
    }
  }, [scanner.state, faceData, currentPosition]);

  // ── Countdown → Multi-capture ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.COUNTDOWN || !currentPosition) return;

    const countdownDuration = currentPosition.camera.countdownMs || 3000;
    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.COUNTDOWN_DONE });
    }, countdownDuration);

    return () => clearTimeout(timer);
  }, [scanner.state, currentPosition]);

  // ── Multi-frame capture ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.MULTI_CAPTURE || !currentPosition || isCapturing) return;

    const captureFrames = async () => {
      setIsCapturing(true);
      setUploadProgress(0);

      try {
        const result = await captureServiceRef.current.capturePosition(
          {
            frameCount: currentPosition.frameCount,
            captureInterval: currentPosition.camera.captureInterval,
            minFrameQuality: getCurrentQualityThreshold(scanner),
            compressionQuality: 0.85,
            generateThumbnails: true,
          },
          (frame, progress) => {
            setUploadProgress(progress);
            dispatch({
              type: SCANNER_EVENTS.FRAME_CAPTURED,
              payload: { frame },
            });
          }
        );

        // Upload frames to server
        if (onUploadFrame && sessionToken) {
          for (const frame of result.frames) {
            await onUploadFrame({
              positionId: currentPosition.id,
              positionIndex: scanner.currentPositionIndex,
              frameIndex: frame.index,
              frameCount: result.frames.length,
              imageData: frame.imageData.split(',')[1], // Remove data:image/jpeg;base64, prefix
              quality: frame.quality,
              mimeType: 'image/jpeg',
            });
          }

          // Finalize position
          if (onFinalizePosition) {
            const finalizeResult = await onFinalizePosition({
              positionId: currentPosition.id,
              positionIndex: scanner.currentPositionIndex,
              selectedFrameIndex: result.selectedFrameIndex,
            });

            // Check quality
            if (result.selectedFrame.quality.overall >= getCurrentQualityThreshold(scanner)) {
              dispatch({
                type: SCANNER_EVENTS.VALIDATION_PASS,
                payload: {
                  selectedFrame: result.selectedFrame,
                  quality: result.selectedFrame.quality,
                },
              });
            } else {
              dispatch({
                type: SCANNER_EVENTS.VALIDATION_FAIL,
                payload: {
                  feedback: `Quality score ${result.selectedFrame.quality.overall.toFixed(2)} below threshold. Please try again.`,
                },
              });
            }
          }
        } else {
          // No server upload, just validate locally
          dispatch({ type: SCANNER_EVENTS.MULTI_CAPTURE_COMPLETE });
          dispatch({
            type: SCANNER_EVENTS.VALIDATION_PASS,
            payload: {
              selectedFrame: result.selectedFrame,
              quality: result.selectedFrame.quality,
            },
          });
        }
      } catch (err) {
        console.error('[EnhancedScanner] Capture failed:', err);
        dispatch({
          type: SCANNER_EVENTS.VALIDATION_FAIL,
          payload: { feedback: 'Capture failed. Please try again.' },
        });
      } finally {
        setIsCapturing(false);
        setUploadProgress(0);
      }
    };

    captureFrames();
  }, [scanner.state, currentPosition, isCapturing, sessionToken, onUploadFrame, onFinalizePosition, scanner]);

  // ── Position transition ──
  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.VALIDATION_SUCCESS) return;

    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.NEXT_POSITION });
    }, 1500);

    return () => clearTimeout(timer);
  }, [scanner.state]);

  useEffect(() => {
    if (scanner.state !== SCANNER_STATES.TRANSITION) return;

    const timer = setTimeout(() => {
      dispatch({ type: SCANNER_EVENTS.TRANSITION_DONE });
    }, 1000);

    return () => clearTimeout(timer);
  }, [scanner.state]);

  // ── Voice coaching ──
  useEffect(() => {
    if (!voiceEnabled || !currentPosition) return;

    const timer = setTimeout(() => {
      if (scanner.state === SCANNER_STATES.POSITIONING) {
        speakVoice(currentPosition.coaching.intro);
      } else if (scanner.state === SCANNER_STATES.DETECTING) {
        speakVoice(currentPosition.coaching.positioning);
      } else if (scanner.state === SCANNER_STATES.COUNTDOWN) {
        speakVoice(currentPosition.coaching.holding);
      } else if (scanner.state === SCANNER_STATES.VALIDATION_SUCCESS) {
        speakVoice(currentPosition.coaching.success);
      } else if (scanner.state === SCANNER_STATES.VALIDATION_RETRY) {
        speakVoice(currentPosition.coaching.retry);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      stopSpeaking();
    };
  }, [scanner.state, voiceEnabled, currentPosition, scanner.validationFeedback]);

  // ── All complete ──
  useEffect(() => {
    if (scanner.state === SCANNER_STATES.COMPLETE && onAllCaptured) {
      onAllCaptured(scanner.completedPositions);
    }
  }, [scanner.state, scanner.completedPositions, onAllCaptured]);

  // ── Event handlers ──
  const handleStartScan = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.START_SCAN });
  }, []);

  const handleSkipIntro = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.SKIP_INTRO });
  }, []);

  const handleIntroDone = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.INTRO_DONE });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.RETRY_CAPTURE });
  }, []);

  const handleManualCapture = useCallback(() => {
    // Manual fallback - force accept current frames
    dispatch({ type: SCANNER_EVENTS.FORCE_ACCEPT });
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: SCANNER_EVENTS.RESET });
  }, []);

  // ── Render ──
  return (
    <div className="enhanced-scanner-card">
      <div className="scanner-container">
        {/* Camera view */}
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Video Jaw Guide */}
          {currentPosition && scanner.state !== SCANNER_STATES.IDLE && (
            <div className="jaw-guide-overlay">
              <VideoJawGuide
                currentPositionIndex={scanner.currentPositionIndex}
                autoPlay={scanner.state === SCANNER_STATES.DETECTING || scanner.state === SCANNER_STATES.COUNTDOWN}
              />
            </div>
          )}

          {/* Overlays */}
          <AnimatePresence mode="wait">
            {/* Welcome/Intro */}
            {scanner.state === SCANNER_STATES.WELCOME && (
              <ScanIntroOverlay
                key="intro"
                onSkip={handleSkipIntro}
                onDone={handleIntroDone}
              />
            )}

            {/* Positioning instructions */}
            {currentPosition && (scanner.state === SCANNER_STATES.POSITIONING || scanner.state === SCANNER_STATES.DETECTING) && (
              <motion.div
                key="positioning"
                className="positioning-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="instruction-card">
                  <h3>{currentPosition.label}</h3>
                  <p>{currentPosition.coaching.positioning}</p>
                  {shouldShowManualCapture(scanner) && (
                    <button onClick={handleManualCapture} className="manual-btn">
                      Manual Capture
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Countdown */}
            {scanner.state === SCANNER_STATES.COUNTDOWN && (
              <CountdownRing
                key="countdown"
                duration={currentPosition?.camera.countdownMs || 3000}
                onComplete={() => {}}
              />
            )}

            {/* Capturing progress */}
            {scanner.state === SCANNER_STATES.MULTI_CAPTURE && (
              <motion.div
                key="capturing"
                className="capture-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="capture-progress">
                  <Loader2 className="spin" size={48} />
                  <p>Capturing {uploadProgress.toFixed(0)}%</p>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Validation success */}
            {scanner.state === SCANNER_STATES.VALIDATION_SUCCESS && (
              <motion.div
                key="success"
                className="validation-overlay success"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <CheckCircle size={64} color="#10b981" />
                <p>Excellent!</p>
              </motion.div>
            )}

            {/* Validation retry */}
            {scanner.state === SCANNER_STATES.VALIDATION_RETRY && (
              <motion.div
                key="retry"
                className="validation-overlay retry"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AlertCircle size={48} color="#f59e0b" />
                <p>{scanner.validationFeedback}</p>
                <button onClick={handleRetry} className="retry-btn">
                  Try Again ({scanner.retryCount}/{3})
                </button>
              </motion.div>
            )}

            {/* Complete celebration */}
            {scanner.state === SCANNER_STATES.COMPLETE && (
              <ScanCelebration key="celebration" />
            )}
          </AnimatePresence>
        </div>

        {/* Progress rail */}
        <ProgressRail
          total={SCAN_POSITIONS_ENHANCED.length}
          current={scanner.currentPositionIndex}
          completed={scanner.completedPositions.length}
          progress={scanProgress}
        />

        {/* Controls */}
        <div className="scanner-controls">
          {scanner.state === SCANNER_STATES.IDLE && (
            <button onClick={handleStartScan} className="start-btn">
              <Camera size={20} />
              Start Enhanced Scan
            </button>
          )}

          {voiceEnabled && isVoiceSupported() && (
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className="voice-toggle"
            >
              <Volume2 className="inline h-4 w-4 mr-1" /> Voice {voiceEnabled ? 'On' : 'Off'}
            </button>
          )}

          {(scanner.state === SCANNER_STATES.ERROR || cameraError) && (
            <button onClick={handleReset} className="reset-btn">
              Reset
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .enhanced-scanner-card {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }

        .scanner-container {
          position: relative;
          background: #000;
          border-radius: 16px;
          overflow: hidden;
        }

        .camera-view {
          position: relative;
          width: 100%;
          aspect-ratio: 4 / 3;
          background: #000;
        }

        .camera-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .jaw-guide-overlay {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 200px;
          height: 250px;
          z-index: 10;
        }

        .positioning-overlay,
        .capture-overlay,
        .validation-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
        }

        .instruction-card {
          background: white;
          padding: 24px;
          border-radius: 12px;
          text-align: center;
          max-width: 400px;
        }

        .capture-progress {
          text-align: center;
          color: white;
        }

        .progress-bar {
          width: 200px;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          margin-top: 12px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }

        .validation-overlay {
          flex-direction: column;
          gap: 16px;
        }

        .validation-overlay p {
          color: white;
          font-size: 18px;
          font-weight: 600;
        }

        .scanner-controls {
          display: flex;
          gap: 12px;
          padding: 16px;
          justify-content: center;
        }

        button {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .start-btn {
          background: #3b82f6;
          color: white;
        }

        .retry-btn,
        .manual-btn {
          background: #f59e0b;
          color: white;
          margin-top: 12px;
        }

        .reset-btn {
          background: #ef4444;
          color: white;
        }

        .voice-toggle {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
