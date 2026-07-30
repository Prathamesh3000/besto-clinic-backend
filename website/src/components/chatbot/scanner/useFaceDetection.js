/**
 * useFaceDetection — MediaPipe FaceLandmarker hook for real-time face angle detection.
 *
 * Initializes the WASM model, processes video frames at ~15fps,
 * and extracts yaw/pitch/mouthOpen/facePresent data.
 *
 * Falls back gracefully if MediaPipe fails to load (e.g. unsupported browser).
 */

import { useRef, useState, useCallback, useEffect } from 'react';

// Dynamically import MediaPipe to handle load failures gracefully
let FaceLandmarker = null;
let FilesetResolver = null;
let mediaPipeLoaded = false;
let mediaPipeLoadFailed = false;
let loadPromise = null;

async function ensureMediaPipe() {
  if (mediaPipeLoaded) return true;
  if (mediaPipeLoadFailed) return false;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      FaceLandmarker = vision.FaceLandmarker;
      FilesetResolver = vision.FilesetResolver;
      mediaPipeLoaded = true;
      return true;
    } catch (err) {
      console.warn('MediaPipe failed to load — falling back to timer mode:', err);
      mediaPipeLoadFailed = true;
      return false;
    }
  })();

  return loadPromise;
}

/**
 * Calculate face yaw from landmarks (approximation using nose-to-ear distances).
 * Returns degrees: positive = turned right, negative = turned left.
 */
function calculateYaw(landmarks) {
  // Key landmarks: nose tip (1), left ear (234), right ear (454)
  const nose = landmarks[1];
  const leftEar = landmarks[234];
  const rightEar = landmarks[454];

  if (!nose || !leftEar || !rightEar) return 0;

  const leftDist = Math.sqrt(
    (nose.x - leftEar.x) ** 2 + (nose.y - leftEar.y) ** 2
  );
  const rightDist = Math.sqrt(
    (nose.x - rightEar.x) ** 2 + (nose.y - rightEar.y) ** 2
  );

  // Ratio-based yaw estimation: when facing left, right ear is closer to nose
  const ratio = (leftDist - rightDist) / (leftDist + rightDist);
  // Map ratio to approximate degrees (-90 to +90)
  return ratio * 90;
}

/**
 * Calculate face pitch from landmarks (approximation).
 * Returns degrees: positive = looking up, negative = looking down.
 */
function calculatePitch(landmarks) {
  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  if (!nose || !forehead || !chin) return 0;

  const faceHeight = chin.y - forehead.y;
  const noseRelPos = (nose.y - forehead.y) / faceHeight;
  // Neutral face has nose at ~0.55 of face height
  return (0.55 - noseRelPos) * 120;
}

/**
 * Detect if mouth is open using lip landmarks.
 * Returns a ratio (0-1) where higher = more open.
 */
function calculateMouthOpen(landmarks) {
  // Upper lip center (13), lower lip center (14)
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  // Nose tip (1), chin (152) for normalization
  const nose = landmarks[1];
  const chin = landmarks[152];

  if (!upperLip || !lowerLip || !nose || !chin) return 0;

  const lipDist = Math.sqrt(
    (upperLip.x - lowerLip.x) ** 2 + (upperLip.y - lowerLip.y) ** 2
  );
  const faceHeight = Math.sqrt(
    (nose.x - chin.x) ** 2 + (nose.y - chin.y) ** 2
  );

  return faceHeight > 0 ? lipDist / faceHeight : 0;
}

export default function useFaceDetection(videoRef, enabled = true) {
  const [faceData, setFaceData] = useState({
    yaw: 0,
    pitch: 0,
    mouthOpen: false,
    mouthOpenRatio: 0,
    stable: false,
    facePresent: false,
  });
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastYawRef = useRef(0);
  const stableStartRef = useRef(null);
  const frameCountRef = useRef(0);

  // Initialize MediaPipe
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      const loaded = await ensureMediaPipe();
      if (cancelled) return;

      if (!loaded) {
        setHasFailed(true);
        return;
      }

      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsReady(true);
      } catch (err) {
        console.warn('MediaPipe FaceLandmarker initialization failed:', err);
        if (!cancelled) setHasFailed(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      setIsReady(false);
    };
  }, [enabled]);

  // Process video frames
  const processFrame = useCallback(() => {
    if (!landmarkerRef.current || !videoRef?.current || document.hidden) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Throttle to ~15fps
    frameCountRef.current++;
    if (frameCountRef.current % 2 !== 0) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const result = landmarkerRef.current.detectForVideo(video, performance.now());

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        const yaw = calculateYaw(landmarks);
        const pitch = calculatePitch(landmarks);
        const mouthOpenRatio = calculateMouthOpen(landmarks);

        // Stability detection: yaw hasn't changed more than 3 degrees in 1.5s
        const yawDelta = Math.abs(yaw - lastYawRef.current);
        lastYawRef.current = yaw;

        const now = Date.now();
        if (yawDelta > 3) {
          stableStartRef.current = now;
        }
        const stableDuration = stableStartRef.current ? now - stableStartRef.current : 0;
        const stable = stableDuration > 1500;

        setFaceData({
          yaw: Math.round(yaw * 10) / 10,
          pitch: Math.round(pitch * 10) / 10,
          mouthOpen: mouthOpenRatio > 0.12,
          mouthOpenRatio: Math.round(mouthOpenRatio * 100) / 100,
          stable,
          facePresent: true,
        });
      } else {
        stableStartRef.current = null;
        setFaceData((prev) => ({
          ...prev,
          facePresent: false,
          stable: false,
        }));
      }
    } catch {
      // Silently ignore processing errors — continue next frame
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  // Start/stop frame processing loop
  useEffect(() => {
    if (!isReady || !enabled) return;

    stableStartRef.current = Date.now();
    frameCountRef.current = 0;
    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isReady, enabled, processFrame]);

  return { faceData, isReady, hasFailed };
}
