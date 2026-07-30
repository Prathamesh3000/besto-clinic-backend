# Dental Scan System - Low-Level Design (LLD)

## Document Information
- **Version**: 2.0
- **Date**: April 2026
- **Status**: Design Phase
- **Dependencies**: [01-HIGH-LEVEL-DESIGN.md](./01-HIGH-LEVEL-DESIGN.md)

---

## Table of Contents
1. [3D Jaw Model Animation System](#1-3d-jaw-model-animation-system)
2. [Multi-Frame Capture Engine](#2-multi-frame-capture-engine)
3. [Quality Validation System](#3-quality-validation-system)
4. [State Machine Implementation](#4-state-machine-implementation)
5. [API Contracts](#5-api-contracts)
6. [Database Schemas](#6-database-schemas)
7. [Algorithm Specifications](#7-algorithm-specifications)

---

## 1. 3D Jaw Model Animation System

### 1.1 Overview

The 3D jaw model provides **ultra-realistic, immersive guidance** by showing a photorealistic human head performing the exact jaw movements needed for each scan position.

### 1.2 3D Model Specifications

#### Model Requirements
```javascript
{
  format: 'GLTF/GLB 2.0',
  polyCount: '< 50,000 triangles (optimized)',
  textureResolution: '2048x2048 (base) + 1024x1024 (normal map)',
  fileSize: '< 2MB compressed',
  rigging: 'Full jaw rig with blend shapes',
  animations: '10 pre-baked position transitions',

  // Model composition
  meshes: [
    'head_base',           // Main head mesh
    'teeth_upper',         // Separatefor visibility
    'teeth_lower',
    'gums',
    'tongue',
    'lips'
  ],

  // Bones/Skeleton
  bones: [
    'head_root',
    'jaw_root',            // Main jaw pivot
    'jaw_left',            // For asymmetric movements
    'jaw_right',
    'tongue_base',
    'lip_upper',
    'lip_lower'
  ],

  // Blend shapes (for micro-expressions)
  blendShapes: [
    'smile_wide',          // 0-1
    'mouth_open',          // 0-1
    'jaw_left_turn',       // 0-1
    'jaw_right_turn',      // 0-1
    'teeth_show_upper',    // 0-1
    'teeth_show_lower'     // 0-1
  ]
}
```

#### Animation Clips

```javascript
const ANIMATION_CLIPS = [
  {
    name: 'idle',
    duration: 2000,           // Loop
    description: 'Neutral pose with subtle breathing'
  },
  {
    name: 'to_front_smile',
    duration: 500,
    keyframes: [
      { time: 0, blendShapes: { smile_wide: 0, mouth_open: 0 } },
      { time: 250, blendShapes: { smile_wide: 0.5, mouth_open: 0.2 } },
      { time: 500, blendShapes: { smile_wide: 1.0, mouth_open: 0.3 } }
    ]
  },
  {
    name: 'to_left_lateral',
    duration: 800,
    keyframes: [
      { time: 0, rotation: { y: 0 }, blendShapes: { jaw_right_turn: 0 } },
      { time: 400, rotation: { y: 15 }, blendShapes: { jaw_right_turn: 0.5 } },
      { time: 800, rotation: { y: 35 }, blendShapes: { jaw_right_turn: 1.0, mouth_open: 0.4 } }
    ],
    easing: 'easeInOutCubic'
  },
  {
    name: 'to_right_lateral',
    duration: 800,
    keyframes: [
      { time: 0, rotation: { y: 0 }, blendShapes: { jaw_left_turn: 0 } },
      { time: 400, rotation: { y: -15 }, blendShapes: { jaw_left_turn: 0.5 } },
      { time: 800, rotation: { y: -35 }, blendShapes: { jaw_left_turn: 1.0, mouth_open: 0.4 } }
    ]
  },
  {
    name: 'to_upper_occlusal',
    duration: 1000,
    keyframes: [
      { time: 0, rotation: { x: 0 }, blendShapes: { mouth_open: 0 } },
      { time: 500, rotation: { x: 20 }, blendShapes: { mouth_open: 0.3 } },
      { time: 1000, rotation: { x: 45 }, blendShapes: { mouth_open: 0.6, teeth_show_upper: 1.0 } }
    ],
    description: 'Tilt head back, open wide, show upper teeth'
  },
  {
    name: 'to_lower_occlusal',
    duration: 1000,
    keyframes: [
      { time: 0, rotation: { x: 0 } },
      { time: 500, rotation: { x: -20 } },
      { time: 1000, rotation: { x: -45 }, blendShapes: { mouth_open: 0.6, teeth_show_lower: 1.0 } }
    ]
  },
  // ... 5 more animation clips for other positions
];
```

### 1.3 Three.js Implementation (Website)

#### Component Structure

```jsx
// components/3d/JawModelGuide.jsx
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls, Environment, Stage } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

export function JawModelGuide({ currentPosition, onAnimationComplete }) {
  return (
    <div className="jaw-model-container" style={{ width: '100%', height: '400px' }}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}  // Responsive pixel ratio
      >
        {/* Lighting setup */}
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={0.8} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        {/* 3D Environment */}
        <Environment preset="studio" />

        {/* Animated Jaw Model */}
        <AnimatedJawModel
          position={currentPosition}
          onComplete={onAnimationComplete}
        />

        {/* Optional: Allow user to rotate view */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>

      {/* Position label overlay */}
      <div className="position-label">
        {currentPosition.label}
      </div>
    </div>
  );
}

function AnimatedJawModel({ position, onComplete }) {
  const gltf = useLoader(GLTFLoader, '/models/jaw_realistic_v2.glb');
  const mixer = useRef();
  const modelRef = useRef();

  // Find animation clip for current position
  const targetClip = useMemo(() => {
    return gltf.animations.find(clip => clip.name === position.animation.animationClip);
  }, [gltf, position]);

  // Animate model to target position
  useEffect(() => {
    if (!targetClip || !gltf.scene) return;

    const animMixer = new THREE.AnimationMixer(gltf.scene);
    mixer.current = animMixer;

    const action = animMixer.clipAction(targetClip);
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();

    // Listen for animation completion
    const onFinished = (e) => {
      if (e.action === action) {
        onComplete?.();
      }
    };
    animMixer.addEventListener('finished', onFinished);

    return () => {
      animMixer.removeEventListener('finished', onFinished);
      animMixer.stopAllAction();
    };
  }, [targetClip, gltf, onComplete]);

  // Update animation mixer on each frame
  useFrame((state, delta) => {
    mixer.current?.update(delta);
  });

  // Smooth camera transition for each position
  const { cameraX, cameraY, cameraZ } = useSpring({
    cameraX: position.animation.cameraAngle.x,
    cameraY: position.animation.cameraAngle.y,
    cameraZ: position.animation.cameraAngle.z,
    config: { tension: 120, friction: 14 }
  });

  useFrame(({ camera }) => {
    camera.position.set(cameraX.get(), cameraY.get(), cameraZ.get());
    camera.lookAt(...position.animation.cameraAngle.lookAt);
  });

  return (
    <primitive
      ref={modelRef}
      object={gltf.scene}
      scale={1.5}
      position={[0, -1, 0]}
    />
  );
}
```

### 1.4 React Native Implementation (Mobile)

```typescript
// components/3d/JawModelGuide.tsx
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { useGLTF, OrbitControls } from '@react-three/drei/native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

export function JawModelGuide({ currentPosition, onAnimationComplete }) {
  return (
    <View style={styles.container}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} intensity={0.8} />

        <AnimatedJawModel
          position={currentPosition}
          onComplete={onAnimationComplete}
        />
      </Canvas>
    </View>
  );
}

function AnimatedJawModel({ position, onComplete }) {
  const { scene, animations } = useGLTF(require('../../../assets/models/jaw.glb'));
  const mixer = useRef();

  // Reanimated values for smooth interpolation
  const rotationY = useSharedValue(0);
  const mouthOpen = useSharedValue(0);

  useEffect(() => {
    // Animate to target position
    const targetRotation = getRotationForPosition(position.id);
    const targetMouth = getMouthOpenForPosition(position.id);

    rotationY.value = withTiming(targetRotation, {
      duration: position.animation.duration
    });

    mouthOpen.value = withTiming(targetMouth, {
      duration: position.animation.duration
    }, () => {
      onComplete?.();
    });
  }, [position]);

  useFrame(() => {
    if (scene) {
      scene.rotation.y = rotationY.value;
      // Apply blend shape for mouth opening
      if (scene.morphTargetInfluences) {
        scene.morphTargetInfluences[0] = mouthOpen.value;
      }
    }
  });

  return <primitive object={scene} scale={1.5} position={[0, -1, 0]} />;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    backgroundColor: '#f5f5f5',
    borderRadius: 12
  }
});
```

### 1.5 Animation State Controller

```javascript
class JawAnimationController {
  constructor(model, animations) {
    this.model = model;
    this.animations = animations;
    this.mixer = new THREE.AnimationMixer(model);
    this.currentAction = null;
  }

  /**
   * Transition to next position with smooth animation
   */
  async transitionToPosition(positionId) {
    const clip = this.animations.find(a => a.name === `to_${positionId}`);
    if (!clip) {
      console.warn(`Animation clip for ${positionId} not found`);
      return;
    }

    // Stop current animation
    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }

    // Start new animation
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.fadeIn(0.2);
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();

    this.currentAction = action;

    // Return promise that resolves when animation completes
    return new Promise((resolve) => {
      const onFinished = (e) => {
        if (e.action === action) {
          this.mixer.removeEventListener('finished', onFinished);
          resolve();
        }
      };
      this.mixer.addEventListener('finished', onFinished);
    });
  }

  /**
   * Update mixer (call on each frame)
   */
  update(deltaTime) {
    this.mixer.update(deltaTime);
  }

  /**
   * Cleanup
   */
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
```

### 1.6 Model Optimization Strategy

```javascript
{
  // Lazy loading
  loadStrategy: 'Progressive',
  firstLoad: ['idle', 'to_front_smile'],  // 200KB
  backgroundLoad: ['all_other_animations'],  // 1.8MB

  // Compression
  gltfDraco: true,           // 60% size reduction
  textureCompression: 'basis',  // Universal format
  meshOptimizer: true,       // Reduce draw calls

  // Level of Detail (LOD)
  lodLevels: [
    { distance: 0, polyCount: 50000 },   // High quality (close)
    { distance: 5, polyCount: 20000 },   // Medium (mid)
    { distance: 10, polyCount: 5000 }    // Low (far)
  ],

  // Caching
  cacheModels: true,
  cacheTextures: true,
  persistCache: 'IndexedDB'  // Web only
}
```

---

## 2. Multi-Frame Capture Engine

### 2.1 Capture Orchestrator

```typescript
// services/MultiFrameCaptureService.ts

interface CaptureConfig {
  position: EnhancedScanPosition;
  frameCount: number;
  intervalMs: number;
  qualityThreshold: number;
}

interface CapturedFrame {
  index: number;
  timestamp: number;
  imageData: string;  // base64
  quality: QualityMetrics;
  faceData: FaceDetectionData;
}

class MultiFrameCaptureService {
  private camera: Camera;
  private qualityValidator: QualityValidator;
  private faceDetector: FaceDetector;

  /**
   * Capture multiple frames for a position
   */
  async capturePosition(config: CaptureConfig): Promise<MultiFrameResult> {
    const frames: CapturedFrame[] = [];
    const startTime = Date.now();

    for (let i = 0; i < config.frameCount; i++) {
      // Wait interval between frames
      if (i > 0) {
        await this.wait(config.intervalMs);
      }

      // Capture frame
      const photo = await this.camera.takePhoto({
        quality: 0.9,
        skipMetadata: true
      });

      // Convert to base64
      const base64 = await this.toBase64(photo);

      // Validate quality (parallel)
      const [quality, faceData] = await Promise.all([
        this.qualityValidator.validate(base64),
        this.faceDetector.analyze(base64)
      ]);

      frames.push({
        index: i,
        timestamp: Date.now() - startTime,
        imageData: base64,
        quality,
        faceData
      });

      // Voice feedback
      if (i === 0) this.speak("Capturing...");
      if (i === config.frameCount - 1) this.speak("Got it!");
    }

    // Select best frame
    const bestFrame = this.selectBestFrame(frames);

    return {
      position: config.position.id,
      frames,
      selectedFrameIndex: bestFrame.index,
      bestQuality: bestFrame.quality.overall_score,
      captureTime: Date.now() - startTime
    };
  }

  /**
   * Select best quality frame
   */
  private selectBestFrame(frames: CapturedFrame[]): CapturedFrame {
    return frames.reduce((best, current) => {
      const bestScore = this.calculateFrameScore(best);
      const currentScore = this.calculateFrameScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate weighted quality score
   */
  private calculateFrameScore(frame: CapturedFrame): number {
    const weights = {
      overall_quality: 0.4,
      sharpness: 0.3,
      face_stability: 0.2,
      mouth_opening: 0.1
    };

    return (
      frame.quality.overall_score * weights.overall_quality +
      (1 - frame.quality.blur_score) * weights.sharpness +
      (frame.faceData.stable ? 1 : 0) * weights.face_stability +
      frame.faceData.mouthOpenRatio * weights.mouth_opening
    );
  }
}
```

### 2.2 Frame Buffer Management

```typescript
class FrameBufferManager {
  private maxBufferSize = 50 * 1024 * 1024;  // 50MB
  private frames: Map<string, CapturedFrame[]> = new Map();

  /**
   * Store frames with automatic cleanup
   */
  storeFrames(positionId: string, frames: CapturedFrame[]) {
    // Check buffer size
    if (this.getCurrentSize() > this.maxBufferSize) {
      this.evictOldest();
    }

    this.frames.set(positionId, frames);
  }

  /**
   * Get best frame for position
   */
  getBestFrame(positionId: string): CapturedFrame | null {
    const frames = this.frames.get(positionId);
    if (!frames || frames.length === 0) return null;

    return frames.reduce((best, curr) =>
      curr.quality.overall_score > best.quality.overall_score ? curr : best
    );
  }

  /**
   * Clear frames for position (after upload)
   */
  clearPosition(positionId: string) {
    this.frames.delete(positionId);
  }

  /**
   * Get current buffer size
   */
  private getCurrentSize(): number {
    let size = 0;
    this.frames.forEach(frames => {
      frames.forEach(frame => {
        // Estimate: base64 length * 0.75 (decode overhead)
        size += frame.imageData.length * 0.75;
      });
    });
    return size;
  }

  /**
   * Evict oldest position
   */
  private evictOldest() {
    const firstKey = this.frames.keys().next().value;
    if (firstKey) {
      this.frames.delete(firstKey);
    }
  }
}
```

---

## 3. Quality Validation System

### 3.1 Client-Side Quality Checker

```typescript
// utils/qualityValidator.ts

interface QualityMetrics {
  blur_score: number;      // 0-1 (lower = sharper)
  brightness: number;      // 0-1
  contrast: number;        // 0-1
  sharpness: number;       // 0-1 (higher = sharper)
  overall_score: number;   // 0-1
}

class QualityValidator {
  /**
   * Validate image quality using computer vision
   */
  async validate(base64Image: string): Promise<QualityMetrics> {
    // Decode base64 to pixel data
    const imageData = await this.decodeImage(base64Image);

    // Run validation checks in parallel
    const [blur, brightness, contrast, sharpness] = await Promise.all([
      this.detectBlur(imageData),
      this.checkBrightness(imageData),
      this.checkContrast(imageData),
      this.detectSharpness(imageData)
    ]);

    // Calculate overall score
    const overall_score = this.calculateOverall({
      blur_score: blur,
      brightness,
      contrast,
      sharpness
    });

    return {
      blur_score: blur,
      brightness,
      contrast,
      sharpness,
      overall_score
    };
  }

  /**
   * Detect blur using Laplacian variance
   */
  private async detectBlur(imageData: ImageData): Promise<number> {
    // Convert to grayscale
    const gray = this.toGrayscale(imageData);

    // Apply Laplacian kernel
    const laplacian = this.applyLaplacian(gray);

    // Calculate variance
    const variance = this.calculateVariance(laplacian);

    // Normalize: higher variance = sharper image
    // Inverse to get blur score (0 = sharp, 1 = blurry)
    const blurScore = 1 / (1 + variance / 100);

    return blurScore;
  }

  /**
   * Apply Laplacian edge detection
   */
  private applyLaplacian(grayData: number[][]): number[][] {
    const kernel = [
      [0, 1, 0],
      [1, -4, 1],
      [0, 1, 0]
    ];

    return this.convolve(grayData, kernel);
  }

  /**
   * Check brightness using histogram
   */
  private async checkBrightness(imageData: ImageData): Promise<number> {
    let sum = 0;
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      // Average RGB
      sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    }

    const avgBrightness = sum / (pixels.length / 4);
    return avgBrightness / 255;  // Normalize to 0-1
  }

  /**
   * Check contrast using standard deviation
   */
  private async checkContrast(imageData: ImageData): Promise<number> {
    const pixels = imageData.data;
    const values: number[] = [];

    for (let i = 0; i < pixels.length; i += 4) {
      values.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
    }

    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return Math.min(stdDev / 128, 1);  // Normalize
  }

  /**
   * Detect sharpness using edge density
   */
  private async detectSharpness(imageData: ImageData): Promise<number> {
    // Sobel edge detection
    const edges = this.applySobel(this.toGrayscale(imageData));

    // Count strong edges
    let edgeCount = 0;
    const threshold = 50;

    for (const row of edges) {
      for (const val of row) {
        if (val > threshold) edgeCount++;
      }
    }

    const totalPixels = imageData.width * imageData.height;
    return Math.min(edgeCount / (totalPixels * 0.3), 1);
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverall(metrics: Partial<QualityMetrics>): number {
    const weights = {
      blur_score: -0.4,     // Negative because lower is better
      brightness: 0.2,
      contrast: 0.2,
      sharpness: 0.6
    };

    let score = 0;
    score += (1 - metrics.blur_score!) * Math.abs(weights.blur_score);
    score += metrics.brightness! * weights.brightness;
    score += metrics.contrast! * weights.contrast;
    score += metrics.sharpness! * weights.sharpness;

    return Math.max(0, Math.min(1, score));
  }
}
```

### 3.2 Server-Side Deep Validation

```javascript
// src/services/imageQualityService.js

const sharp = require('sharp');
const cv = require('opencv4nodejs');  // Optional: for advanced CV

class ImageQualityService {
  /**
   * Deep validation with teeth detection
   */
  async validateFrame(base64Image, position) {
    // Decode base64
    const buffer = Buffer.from(base64Image, 'base64');

    // Get image metadata
    const metadata = await sharp(buffer).metadata();

    // Run parallel validations
    const [quality, detections] = await Promise.all([
      this.analyzeQuality(buffer),
      this.detectTeeth(buffer, position)
    ]);

    // Combine results
    return {
      valid: quality.overall_score > 0.7 && detections.teeth_count >= position.quality.minTeethVisible,
      confidence: (quality.overall_score + detections.confidence) / 2,
      feedback: this.generateFeedback(quality, detections, position),
      detections
    };
  }

  /**
   * Analyze image quality using Sharp
   */
  async analyzeQuality(buffer) {
    const stats = await sharp(buffer).stats();

    // Calculate metrics
    const brightness = stats.channels[0].mean / 255;
    const contrast = stats.channels[0].stdev / 128;

    // Laplacian variance for blur
    const gray = await sharp(buffer).grayscale().raw().toBuffer();
    const blur_score = await this.calculateLaplacianVariance(gray);

    return {
      blur_score,
      brightness,
      contrast,
      overall_score: this.weightedScore({ blur_score, brightness, contrast })
    };
  }

  /**
   * Detect teeth using contour detection
   */
  async detectTeeth(buffer, position) {
    // Convert to OpenCV Mat
    const img = await cv.imdecodeAsync(buffer);

    // Convert to HSV for better teeth detection (white/yellow range)
    const hsv = img.cvtColor(cv.COLOR_BGR2HSV);

    // Define teeth color range (white to light yellow)
    const lowerTeeth = new cv.Vec(0, 0, 180);
    const upperTeeth = new cv.Vec(180, 40, 255);

    // Create mask
    const mask = hsv.inRange(lowerTeeth, upperTeeth);

    // Find contours
    const contours = mask.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Filter contours by size (teeth are typically 50-500px²)
    const teethContours = contours.filter(c => {
      const area = c.area;
      return area > 50 && area < 500;
    });

    return {
      teeth_count: teethContours.length,
      gum_visible: await this.detectGums(img),
      confidence: Math.min(teethContours.length / position.quality.minTeethVisible, 1),
      areas_of_concern: []  // TODO: Cavity/plaque detection
    };
  }

  /**
   * Generate user-friendly feedback
   */
  generateFeedback(quality, detections, position) {
    if (quality.blur_score > 0.3) {
      return "Image is blurry. Hold your device steady.";
    }
    if (quality.brightness < 0.3) {
      return "Too dark. Move to better lighting.";
    }
    if (quality.brightness > 0.9) {
      return "Too bright. Reduce direct light.";
    }
    if (detections.teeth_count < position.quality.minTeethVisible) {
      return `Open your mouth wider. I can only see ${detections.teeth_count} teeth.`;
    }
    return "Excellent! Clear view of your teeth.";
  }
}
```

---

## 4. State Machine Implementation

### 4.1 Enhanced State Machine

```typescript
// state/scannerStateMachine.ts

type ScannerState =
  | 'IDLE'
  | 'WELCOME'
  | 'CAMERA_SETUP'
  | 'FACE_DETECTION_INIT'
  | 'INTRO'
  | 'POSITIONING'
  | 'PRE_COUNTDOWN'
  | 'COUNTDOWN'
  | 'MULTI_CAPTURE'
  | 'QUALITY_CHECK'
  | 'FRAME_SELECT'
  | 'SERVER_VALIDATE'
  | 'CAPTURED_OK'
  | 'CAPTURED_RETRY'
  | 'TRANSITION'
  | 'PROGRESS_REVIEW'
  | 'COMPLETE';

type ScannerEvent =
  | { type: 'START_SCAN' }
  | { type: 'CAMERA_READY' }
  | { type: 'FACE_DETECTED' }
  | { type: 'SKIP_INTRO' }
  | { type: 'INTRO_DONE' }
  | { type: 'ANGLE_MATCHED' }
  | { type: 'ANGLE_LOST' }
  | { type: 'HOLD_STEADY' }
  | { type: 'COUNTDOWN_TICK'; payload: { remaining: number } }
  | { type: 'COUNTDOWN_DONE' }
  | { type: 'FRAMES_CAPTURED'; payload: { frames: CapturedFrame[] } }
  | { type: 'QUALITY_PASS'; payload: { selectedFrame: number } }
  | { type: 'QUALITY_FAIL'; payload: { reason: string } }
  | { type: 'SERVER_VALID'; payload: { feedback: string } }
  | { type: 'SERVER_INVALID'; payload: { feedback: string; retry: boolean } }
  | { type: 'NEXT_POSITION' }
  | { type: 'TRANSITION_DONE' }
  | { type: 'SHOW_PROGRESS' }
  | { type: 'PROGRESS_DONE' }
  | { type: 'ALL_COMPLETE' }
  | { type: 'RESET' };

interface ScannerContext {
  currentPosition: number;
  totalPositions: number;
  captures: MultiFrameResult[];
  retryCount: number;
  adaptedQuality: Partial<QualityRequirements>;
  faceData: FaceDetectionData;
  errorMessage?: string;
}

const scannerMachine = createMachine<ScannerContext, ScannerEvent, ScannerState>({
  id: 'dentalScanner',
  initial: 'IDLE',

  states: {
    IDLE: {
      on: { START_SCAN: 'WELCOME' }
    },

    WELCOME: {
      on: {
        SKIP_INTRO: 'CAMERA_SETUP',
        INTRO_DONE: 'CAMERA_SETUP'
      },
      entry: 'playWelcomeAnimation'
    },

    CAMERA_SETUP: {
      on: {
        CAMERA_READY: 'FACE_DETECTION_INIT'
      },
      entry: 'requestCameraPermission',
      exit: 'initializeCamera'
    },

    FACE_DETECTION_INIT: {
      on: {
        FACE_DETECTED: 'INTRO',
        // Fallback if face detection fails
        after: { 5000: 'INTRO' }
      },
      entry: 'initFaceDetection'
    },

    INTRO: {
      on: {
        SKIP_INTRO: 'POSITIONING',
        INTRO_DONE: 'POSITIONING'
      },
      entry: ['show3DModelTutorial', 'speakIntroduction']
    },

    POSITIONING: {
      on: {
        ANGLE_MATCHED: 'PRE_COUNTDOWN',
        // Timeout fallback
        after: { 15000: 'CAPTURED_RETRY' }
      },
      entry: ['showPositionGuide', 'speakPositioning'],
      exit: 'clearPositioningTimer'
    },

    PRE_COUNTDOWN: {
      on: {
        HOLD_STEADY: 'COUNTDOWN',
        ANGLE_LOST: 'POSITIONING'
      },
      after: { 500: 'COUNTDOWN' },
      entry: 'speakHoldSteady'
    },

    COUNTDOWN: {
      on: {
        COUNTDOWN_TICK: { actions: ['updateCountdown', 'playHaptic'] },
        COUNTDOWN_DONE: 'MULTI_CAPTURE',
        ANGLE_LOST: 'POSITIONING'
      },
      entry: 'startCountdown',
      exit: 'clearCountdown'
    },

    MULTI_CAPTURE: {
      on: {
        FRAMES_CAPTURED: 'QUALITY_CHECK'
      },
      entry: 'captureMultipleFrames',
      exit: 'speakCaptured'
    },

    QUALITY_CHECK: {
      on: {
        QUALITY_PASS: 'FRAME_SELECT',
        QUALITY_FAIL: 'CAPTURED_RETRY'
      },
      invoke: {
        src: 'validateFrameQuality',
        onDone: { target: 'FRAME_SELECT', actions: 'setQualityResult' },
        onError: { target: 'CAPTURED_RETRY', actions: 'setErrorMessage' }
      }
    },

    FRAME_SELECT: {
      on: {
        SERVER_VALIDATE: 'SERVER_VALIDATE'
      },
      always: 'SERVER_VALIDATE',
      entry: 'selectBestFrame'
    },

    SERVER_VALIDATE: {
      on: {
        SERVER_VALID: 'CAPTURED_OK',
        SERVER_INVALID: [
          { target: 'CAPTURED_RETRY', cond: 'canRetry' },
          { target: 'CAPTURED_OK', actions: 'acceptWithWarning' }  // Max retries reached
        ]
      },
      invoke: {
        src: 'serverValidation',
        onDone: { target: 'CAPTURED_OK', actions: 'storeValidation' },
        onError: { target: 'CAPTURED_RETRY', actions: 'setErrorMessage' }
      }
    },

    CAPTURED_OK: {
      on: {
        NEXT_POSITION: [
          { target: 'PROGRESS_REVIEW', cond: 'shouldShowProgress' },
          { target: 'TRANSITION' }
        ]
      },
      after: { 1200: 'NEXT_POSITION' },
      entry: ['showSuccess', 'speakSuccess', 'saveCapture']
    },

    CAPTURED_RETRY: {
      on: {
        after: { 2000: 'POSITIONING' }
      },
      entry: ['showRetry', 'speakRetry', 'lowerQualityThreshold']
    },

    TRANSITION: {
      on: {
        TRANSITION_DONE: [
          { target: 'COMPLETE', cond: 'isLastPosition' },
          { target: 'POSITIONING', actions: 'incrementPosition' }
        ]
      },
      after: { 800: 'TRANSITION_DONE' },
      entry: ['animate3DModel', 'speakNextPosition']
    },

    PROGRESS_REVIEW: {
      on: {
        PROGRESS_DONE: 'TRANSITION'
      },
      after: { 3000: 'PROGRESS_DONE' },
      entry: 'showProgressSummary'
    },

    COMPLETE: {
      type: 'final',
      entry: ['showCelebration', 'speakComplete', 'notifyParent']
    }
  }
}, {
  guards: {
    canRetry: (ctx) => ctx.retryCount < 3,
    shouldShowProgress: (ctx) => ctx.currentPosition % 3 === 0,
    isLastPosition: (ctx) => ctx.currentPosition >= ctx.totalPositions - 1
  },

  actions: {
    incrementPosition: assign({
      currentPosition: (ctx) => ctx.currentPosition + 1,
      retryCount: 0,
      adaptedQuality: {}
    }),

    lowerQualityThreshold: assign({
      retryCount: (ctx) => ctx.retryCount + 1,
      adaptedQuality: (ctx) => ({
        minBrightness: Math.max(0.2, ctx.adaptedQuality.minBrightness - 0.1),
        maxBlur: Math.min(0.3, ctx.adaptedQuality.maxBlur + 0.1)
      })
    })
  }
});
```

---

## 5. API Contracts

### 5.1 REST API Endpoints

```typescript
/**
 * Initiate guest scan session
 */
POST /api/v1/public/guest-scan/initiate
Request:
{
  consentGiven: true,
  scanMode: 'enhanced_10pos' | 'quick_6pos',
  deviceInfo: {
    platform: 'web' | 'ios' | 'android',
    userAgent: string
  }
}

Response: {
  sessionToken: string,
  expiresAt: Date,
  positions: EnhancedScanPosition[],
  estimatedTime: number  // seconds
}

/**
 * Upload single frame (during multi-capture)
 */
POST /api/v1/public/guest-scan/:token/upload-frame
Request:
{
  position: string,
  frameIndex: number,
  totalFrames: number,
  imageData: string,  // base64
  quality: QualityMetrics,
  faceData: FaceDetectionData
}

Response: {
  received: true,
  frameId: string,
  storage: { path: string, size: number }
}

/**
 * Finalize position (select best frame + validate)
 */
POST /api/v1/public/guest-scan/:token/finalize-position
Request:
{
  position: string,
  selectedFrameIndex: number,
  allFrameIds: string[]
}

Response: {
  valid: boolean,
  confidence: number,
  feedback: string,
  detections: {
    teeth_count: number,
    gum_visible: boolean,
    quality_score: number
  },
  nextPosition: string | null,
  progress: {
    completed: number,
    total: number,
    percentage: number
  }
}

/**
 * Real-time quality check (no storage)
 */
POST /api/v1/public/guest-scan/:token/check-quality
Request:
{
  imageData: string,  // Thumbnail (512x512)
  position: string
}

Response: {
  score: number,
  issues: string[],
  recommendations: string[]
}

/**
 * Get scan progress
 */
GET /api/v1/public/guest-scan/:token/progress

Response: {
  sessionToken: string,
  completedPositions: number,
  totalPositions: number,
  currentPosition: string,
  estimatedTimeRemaining: number,
  qualityAverage: number,
  captures: {
    position: string,
    quality: number,
    timestamp: Date
  }[]
}
```

---

## 6. Database Schemas

### 6.1 Enhanced GuestScan Model

```javascript
// src/models/platform/GuestScan.js

const GuestScanSchema = new Schema({
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  scanMode: {
    type: String,
    enum: ['enhanced_10pos', 'quick_6pos'],
    default: 'quick_6pos'
  },

  // Multi-frame captures
  captures: [{
    position: String,  // 'front_smile', 'left_lateral', etc.
    timestamp: Date,

    // All captured frames
    frames: [{
      index: Number,
      frameTimestamp: Number,  // Relative to capture start
      imagePath: String,       // S3 or local path
      imageSize: Number,       // Bytes

      // Client quality metrics
      quality: {
        blur_score: Number,
        brightness: Number,
        contrast: Number,
        sharpness: Number,
        overall_score: Number
      },

      // Face detection data
      faceData: {
        yaw: Number,
        pitch: Number,
        roll: Number,
        mouthOpenRatio: Number,
        stable: Boolean
      }
    }],

    // Selected best frame
    selectedFrameIndex: Number,
    bestQuality: Number,

    // Server validation
    serverValidation: {
      timestamp: Date,
      valid: Boolean,
      confidence: Number,
      feedback: String,
      detections: {
        teeth_count: Number,
        gum_visible: Boolean,
        areas_of_concern: [String]
      }
    },

    // Retry tracking
    attempt: { type: Number, default: 1 },
    adaptedQuality: Schema.Types.Mixed
  }],

  // Session metadata
  deviceInfo: {
    platform: String,
    userAgent: String,
    cameraResolution: String
  },

  progress: {
    completedPositions: Number,
    totalPositions: Number,
    currentPosition: String,
    startTime: Date,
    estimatedCompletion: Date
  },

  // Analytics
  analytics: {
    totalCaptureTime: Number,     // ms
    averageFrameQuality: Number,
    retryCount: Number,
    voiceEnabled: Boolean,
    faceDetectionUsed: Boolean
  },

  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed', 'expired'],
    default: 'pending'
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000),  // 30 min
    index: { expires: 0 }  // TTL index
  }
}, {
  timestamps: true
});

// Indexes
GuestScanSchema.index({ sessionToken: 1, status: 1 });
GuestScanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });
```

---

## 7. Algorithm Specifications

### 7.1 Adaptive Quality Threshold Algorithm

```typescript
/**
 * Progressively lower quality requirements if user struggles
 */
function calculateAdaptiveThreshold(
  baseRequirements: QualityRequirements,
  retryCount: number
): QualityRequirements {
  const degradationFactor = retryCount * 0.1;  // 10% per retry

  return {
    minBrightness: Math.max(
      0.2,  // Absolute minimum
      baseRequirements.minBrightness - degradationFactor
    ),

    maxBlur: Math.min(
      0.3,  // Absolute maximum
      baseRequirements.maxBlur + degradationFactor
    ),

    minContrast: Math.max(
      0.3,
      baseRequirements.minContrast - degradationFactor
    ),

    minTeethVisible: Math.max(
      2,  // At least 2 teeth must be visible
      baseRequirements.minTeethVisible - retryCount
    ),

    minSharpness: Math.max(
      0.4,
      baseRequirements.minSharpness - degradationFactor
    )
  };
}
```

### 7.2 Frame Selection Algorithm

```typescript
/**
 * Select best quality frame from multi-capture
 */
function selectBestFrame(frames: CapturedFrame[]): number {
  const scores = frames.map((frame, index) => ({
    index,
    score: calculateCompositeScore(frame)
  }));

  // Sort by score (descending)
  scores.sort((a, b) => b.score - a.score);

  // Return index of best frame
  return scores[0].index;
}

/**
 * Calculate weighted composite score
 */
function calculateCompositeScore(frame: CapturedFrame): number {
  const weights = {
    overall_quality: 0.3,
    sharpness: 0.25,
    brightness: 0.15,
    face_stability: 0.15,
    mouth_opening: 0.1,
    temporal_position: 0.05  // Prefer middle frames
  };

  // Normalize temporal position (0 = first, 1 = last, 0.5 = middle)
  const temporalScore = 1 - Math.abs(0.5 - (frame.index / 4));

  return (
    frame.quality.overall_score * weights.overall_quality +
    frame.quality.sharpness * weights.sharpness +
    frame.quality.brightness * weights.brightness +
    (frame.faceData.stable ? 1 : 0) * weights.face_stability +
    frame.faceData.mouthOpenRatio * weights.mouth_opening +
    temporalScore * weights.temporal_position
  );
}
```

### 7.3 Position Sequence Optimizer

```typescript
/**
 * Optimize position sequence to minimize head movement
 */
function optimizePositionSequence(
  positions: EnhancedScanPosition[]
): EnhancedScanPosition[] {
  // Group by similar yaw angles
  const groups = {
    front: positions.filter(p => Math.abs(p.targetPose.yaw.min) < 15),
    left: positions.filter(p => p.targetPose.yaw.min >= 15),
    right: positions.filter(p => p.targetPose.yaw.max <= -15),
    occlusal: positions.filter(p => Math.abs(p.targetPose.pitch.min) > 20)
  };

  // Optimal sequence: front → left → right → occlusal
  return [
    ...groups.front,
    ...groups.left.sort((a, b) => a.targetPose.yaw.min - b.targetPose.yaw.min),
    ...groups.right.sort((a, b) => b.targetPose.yaw.max - a.targetPose.yaw.max),
    ...groups.occlusal.sort((a, b) => b.targetPose.pitch.min - a.targetPose.pitch.min)
  ];
}
```

---

## 8. Performance Optimizations

### 8.1 Lazy Loading Strategy

```typescript
/**
 * Progressive 3D model loading
 */
class ModelLoader {
  private cache = new Map<string, GLTF>();

  async loadEssential() {
    // Load only critical models first (< 500KB)
    await Promise.all([
      this.loadModel('jaw_neutral.glb'),
      this.loadModel('animation_front.glb')
    ]);
  }

  async loadRemainingAsync() {
    // Load rest in background
    const remaining = [
      'animation_left.glb',
      'animation_right.glb',
      'animation_occlusal_upper.glb',
      'animation_occlusal_lower.glb'
    ];

    // Load sequentially to avoid bandwidth spike
    for (const model of remaining) {
      await this.loadModel(model);
    }
  }

  private async loadModel(path: string): Promise<GLTF> {
    if (this.cache.has(path)) {
      return this.cache.get(path)!;
    }

    const gltf = await new GLTFLoader()
      .loadAsync(`/models/${path}`);

    this.cache.set(path, gltf);
    return gltf;
  }
}
```

### 8.2 Image Compression Pipeline

```typescript
/**
 * Compress images before upload
 */
async function compressImage(
  base64: string,
  quality: number = 0.85
): Promise<string> {
  // Decode base64
  const img = await loadImage(base64);

  // Create canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Resize if too large (max 1920x1080)
  const maxDim = 1920;
  let width = img.width;
  let height = img.height;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = (height / width) * maxDim;
      width = maxDim;
    } else {
      width = (width / height) * maxDim;
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;

  // Draw and compress
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}
```

---

**Status**: Complete - Ready for Implementation
**Next Document**: [03-3D-MODEL-SPECIFICATIONS.md](./03-3D-MODEL-SPECIFICATIONS.md)
