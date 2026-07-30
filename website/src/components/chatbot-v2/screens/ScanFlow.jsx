/**
 * ScanFlow Screen
 * Complete scanning experience: 4 positions (left, front, right, tongue)
 * - Color border feedback (green/yellow/red)
 * - Auto-capture only (countdown-based)
 * - Progress dots
 * - Voice guidance integration
 * - Professional instructions
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ProgressDots from '../components/ProgressDots';
import useFaceDetection from '../../chatbot/scanner/useFaceDetection';
import { uploadGuestScanImage } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

// Scan positions with expected yaw angles for validation
const POSITIONS = [
  {
    id: 'left',
    label: 'Left Side',
    instruction: 'Please turn your head to face your right shoulder and smile. Hold this position steady.',
    voiceScript: 'Please turn your head to face your right shoulder and smile. Hold this position steady.',
    expectedYaw: { min: -70, max: -30 }, // Face turned left (negative yaw)
  },
  {
    id: 'front',
    label: 'Front View',
    instruction: 'Face the camera directly and smile wide.',
    voiceScript: 'Face the camera directly and smile wide.',
    expectedYaw: { min: -20, max: 20 }, // Face forward (near zero yaw)
  },
  {
    id: 'right',
    label: 'Right Side',
    instruction: 'Turn your head to face your left shoulder and smile.',
    voiceScript: 'Turn your head to face your left shoulder and smile.',
    expectedYaw: { min: 30, max: 70 }, // Face turned right (positive yaw)
  },
  {
    id: 'tongue',
    label: 'Tongue',
    instruction: 'Face the camera and stick your tongue out as far as you can. Hold steady!',
    voiceScript: 'Face the camera and stick your tongue out as far as you can. Hold steady.',
    expectedYaw: { min: -25, max: 25 }, // Face forward (same gate as front)
  },
];

// Border colors based on position quality
const BORDER_COLORS = {
  red: 'var(--chatbot-error)',
  yellow: 'var(--chatbot-warning)',
  green: 'var(--chatbot-success)',
};

export default function ScanFlow({ sessionToken, voiceEnabled, onComplete, onError }) {
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState([]);
  const [borderColor, setBorderColor] = useState('red');
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [validationFeedback, setValidationFeedback] = useState('Position');
  const [transitionReady, setTransitionReady] = useState(true); // false during position transitions

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const greenStableTimeRef = useRef(null);
  const isCountingDownRef = useRef(false);
  const lastSpokenPositionRef = useRef(-1);
  const scanCompleteRef = useRef(false);
  const captureImageRef = useRef(null);
  const currentPositionIndexRef = useRef(currentPositionIndex);
  currentPositionIndexRef.current = currentPositionIndex;

  const currentPosition = POSITIONS[currentPositionIndex];
  const totalPositions = POSITIONS.length;

  // Initialize face detection
  const { faceData, isReady: faceDetectionReady, hasFailed: faceDetectionFailed } = useFaceDetection(videoRef, cameraReady);

  /**
   * Initialize camera
   */
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setCameraReady(true);
        }
      } catch (error) {
        console.error('[ScanFlow] Camera error:', error);
        setCameraError('Unable to access camera. Please check your browser permissions.');
        onError?.(error);
      }
    };

    initCamera();

    // Cleanup
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [onError]);

  /**
   * Speak voice instruction when position changes and reset validation state
   */
  useEffect(() => {
    if (voiceEnabled && currentPosition && window.puter && lastSpokenPositionRef.current !== currentPositionIndex) {
      lastSpokenPositionRef.current = currentPositionIndex;
      speakVoice(currentPosition.voiceScript);
    }
    // Reset green stable timer when position changes
    greenStableTimeRef.current = null;
  }, [currentPositionIndex, voiceEnabled, currentPosition]);

  /**
   * Speak using Puter.js TTS.
   * Stops any currently playing audio before starting new speech
   * to prevent overlapping voices when user advances quickly.
   */
  const currentAudioRef = useRef(null);
  const speakVoice = async (text) => {
    try {
      // Stop any in-progress audio first
      if (currentAudioRef.current) {
        try { currentAudioRef.current.pause(); currentAudioRef.current.currentTime = 0; } catch {}
        currentAudioRef.current = null;
      }
      const audio = await window.puter.ai.txt2speech(text, {
        provider: 'openai',
        voice: 'alloy',
        speed: 0.95,
      });
      currentAudioRef.current = audio;
      await audio.play();
      currentAudioRef.current = null;
    } catch (err) {
      console.warn('[ScanFlow] Voice failed:', err);
      currentAudioRef.current = null;
    }
  };

  /**
   * Real-time position validation using MediaPipe face detection.
   * All positions (including tongue) use face detection to gate the countdown.
   * The countdown ONLY starts after stable green detection — no shortcuts.
   */
  useEffect(() => {
    if (!cameraReady || !transitionReady || isCountingDown || scanCompleteRef.current) return;
    if (!currentPosition) return;

    // If face detection hasn't loaded yet, show waiting state but don't auto-trigger
    if (!faceDetectionReady && !faceDetectionFailed) {
      setBorderColor('red');
      setValidationFeedback('Initializing...');
      return;
    }

    // If face detection failed entirely, use a long positioning hold as fallback
    if (faceDetectionFailed) {
      setBorderColor('yellow');
      setValidationFeedback('Position yourself and hold steady');
      if (!greenStableTimeRef.current) {
        greenStableTimeRef.current = Date.now();
      } else {
        const holdDuration = Date.now() - greenStableTimeRef.current;
        if (holdDuration > 6000) { // 6s hold required without face detection
          setBorderColor('green');
          setValidationFeedback('Capturing...');
          startCountdown();
          greenStableTimeRef.current = null;
        }
      }
      return;
    }

    const { facePresent, mouthOpen, yaw, stable } = faceData;
    const expectedYaw = currentPosition.expectedYaw;
    if (!expectedYaw) return; // Safety: no yaw config means skip

    // Determine validation state
    let newColor = 'red';
    let feedback = 'Position';

    if (!facePresent) {
      newColor = 'red';
      feedback = 'No face detected';
    } else if (!mouthOpen) {
      newColor = 'red';
      feedback = currentPosition.id === 'tongue' ? 'Open your mouth' : 'Please smile';
    } else if (yaw < expectedYaw.min || yaw > expectedYaw.max) {
      newColor = 'yellow';
      feedback = 'Adjust head angle';
    } else if (!stable) {
      newColor = 'yellow';
      feedback = 'Hold steady...';
    } else {
      newColor = 'green';
      feedback = 'Perfect! Hold steady';
    }

    setBorderColor(newColor);
    setValidationFeedback(feedback);

    // Auto-trigger countdown ONLY after staying green for 1.5 seconds
    if (newColor === 'green') {
      if (!greenStableTimeRef.current) {
        greenStableTimeRef.current = Date.now();
      } else {
        const stableDuration = Date.now() - greenStableTimeRef.current;
        if (stableDuration > 1500) {
          startCountdown();
          greenStableTimeRef.current = null;
        }
      }
    } else {
      greenStableTimeRef.current = null;
    }
  }, [cameraReady, transitionReady, faceDetectionReady, faceDetectionFailed, faceData, isCountingDown, currentPosition]);

  /**
   * Start 3-second countdown (ref-guarded to prevent double-calling)
   */
  const startCountdown = () => {
    if (isCountingDownRef.current || scanCompleteRef.current) return;
    isCountingDownRef.current = true;

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setIsCountingDown(true);
    setCountdown(3);

    if (voiceEnabled) {
      speakVoice('Three. Two. One. Capture.');
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          // Use ref to always call latest captureImage (avoids stale closure)
          captureImageRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /**
   * Capture image from video stream.
   * Uses refs to read the latest currentPositionIndex and avoid stale closure bugs.
   */
  const captureImage = useCallback(() => {
    if (!videoRef.current || scanCompleteRef.current) return;

    // Read the CURRENT index from ref (not the stale closure value)
    const posIdx = currentPositionIndexRef.current;
    const pos = POSITIONS[posIdx];
    if (!pos) return; // Out of bounds safety

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    // Mirror the image (since camera is mirrored)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    // Also get base64 for server upload
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];

    // Upload to server (non-blocking)
    if (sessionToken && base64) {
      uploadGuestScanImage(sessionToken, {
        imageData: base64,
        angle: pos.id,
        mimeType: 'image/jpeg',
      }).catch((err) => console.warn('[ScanFlow] Upload failed for', pos.id, err));
    }

    canvas.toBlob(
      (blob) => {
        const imageUrl = URL.createObjectURL(blob);

        setCapturedImages((prev) => {
          const newImages = [...prev, { position: pos.id, url: imageUrl, blob }];
          const isLast = posIdx >= totalPositions - 1;

          if (!isLast) {
            // Block auto-capture during transition
            setTransitionReady(false);

            setTimeout(() => {
              isCountingDownRef.current = false;
              setCurrentPositionIndex(posIdx + 1);
              setBorderColor('red');
              setIsCountingDown(false);
              setCountdown(3);
              setValidationFeedback('Position');
              // Allow auto-capture after the new instruction is visible
              setTransitionReady(true);
            }, 800);
          } else {
            // Mark scan as complete to prevent any further captures
            scanCompleteRef.current = true;
            setTimeout(() => {
              isCountingDownRef.current = false;
              onComplete?.(newImages);
            }, 1000);
          }

          return newImages;
        });
      },
      'image/jpeg',
      0.9
    );
  }, [totalPositions, onComplete]);
  // Keep ref in sync so startCountdown's interval always calls the latest version
  captureImageRef.current = captureImage;

  if (cameraError) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--chatbot-error)', marginBottom: '16px' }}>{cameraError}</p>
        <button className="chatbot-btn-primary" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Progress dots */}
      <ProgressDots totalSteps={totalPositions} currentStep={currentPositionIndex + 1} />

      {/* Instructions */}
      <div style={{ padding: '16px 24px', textAlign: 'center', background: 'var(--chatbot-bg-card)' }}>
        <h3
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-lg)',
            fontWeight: 'var(--chatbot-weight-semibold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          {currentPosition?.label}
        </h3>
        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-sm)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          {currentPosition?.instruction}
        </p>
      </div>

      {/* Camera view with color border */}
      <div style={{ padding: '24px', background: 'var(--chatbot-bg-primary)' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '640px',
            margin: '0 auto',
            borderRadius: 'var(--chatbot-radius-lg)',
            overflow: 'hidden',
            border: `4px solid ${BORDER_COLORS[borderColor]}`,
            transition: 'border-color 0.3s ease',
            boxShadow: `0 0 20px ${BORDER_COLORS[borderColor]}40`,
          }}
        >
          {/* Video element */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              transform: 'scaleX(-1)', // Mirror effect
            }}
          />

          {/* Countdown overlay */}
          {isCountingDown && countdown > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--chatbot-font-heading)',
                  fontSize: '80px',
                  fontWeight: 'var(--chatbot-weight-bold)',
                  color: 'white',
                  animation: 'chatbot-pulse 1s ease',
                }}
              >
                {countdown}
              </div>
            </div>
          )}

          {/* Status indicator (top-right) */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 'var(--chatbot-radius-md)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: BORDER_COLORS[borderColor],
                boxShadow: `0 0 8px ${BORDER_COLORS[borderColor]}`,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-xs)',
                color: 'white',
                textTransform: 'uppercase',
              }}
            >
              {validationFeedback}
            </span>
          </div>
        </div>

        {/* Auto-capture hint */}
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-xs)',
              color: 'var(--chatbot-text-tertiary)',
            }}
          >
            Photo will auto-capture when positioned correctly
          </p>
        </div>
      </div>
    </div>
  );
}
