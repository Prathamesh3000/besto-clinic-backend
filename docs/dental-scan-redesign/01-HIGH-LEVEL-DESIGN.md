# Dental Scan System - High-Level Design (HLD)

## Document Information
- **Version**: 2.0
- **Date**: April 2026
- **Status**: Design Phase
- **Authors**: BestoClinic Engineering Team

---

## 1. Executive Summary

### 1.1 Problem Statement
Current dental scan system has:
- **30-40% completion rate** (60-70% bounce rate)
- Only 3 manual capture positions
- No quality validation
- Poor user guidance
- Single-shot per position (no retry logic)
- **Result**: Low conversion, frustrated users, inaccurate analysis

### 1.2 Solution Overview
**Professional Auto-Scan System** with:
- **3 core positions** (left, right, front - essential tooth coverage)
- **Multi-frame capture** (3-5 frames per position, auto-select best)
- **Real-time quality validation** (blur, brightness, teeth detection)
- **Video demonstration guides** for clear user guidance (simple, performant)
- **Adaptive retry logic** (progressive threshold lowering)
- **Target**: 75-85% completion rate, 85-95% analysis accuracy

---

## 2. System Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                       │
├──────────────────────┬──────────────────────────────────────────┤
│  Mobile App (RN)     │  Website (React)                         │
│  ┌────────────────┐  │  ┌────────────────┐                     │
│  │ DentalScanner  │  │  │ DentalScanner  │                     │
│  │ Screen         │  │  │ Chatbot        │                     │
│  │                │  │  │                │                     │
│  │ - Camera       │  │  │ - WebRTC Cam   │                     │
│  │ - 3D Model     │  │  │ - 3D Model     │                     │
│  │ - Voice Coach  │  │  │ - Voice Coach  │                     │
│  └────────────────┘  │  └────────────────┘                     │
└──────────────────────┴──────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                        │
├──────────────────────┬──────────────────────────────────────────┤
│  Client-Side         │  Server-Side                             │
│  ┌────────────────┐  │  ┌────────────────┐                     │
│  │ ScanStateMgr   │  │  │ ScanController │                     │
│  │ FaceDetection  │  │  │ AnalysisEngine │                     │
│  │ QualityCheck   │  │  │ QualityAPI     │                     │
│  │ MultiCapture   │  │  │ StorageService │                     │
│  └────────────────┘  │  └────────────────┘                     │
└──────────────────────┴──────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
├──────────────────────┬──────────────────────────────────────────┤
│  Platform DB         │  Tenant DBs                              │
│  ┌────────────────┐  │  ┌────────────────┐                     │
│  │ GuestScan      │  │  │ DentalScan     │                     │
│  │ SessionToken   │  │  │ ScanImages     │                     │
│  │ Analytics      │  │  │ AnalysisResult │                     │
│  └────────────────┘  │  └────────────────┘                     │
└──────────────────────┴──────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                            │
├──────────────────────┬──────────────────────────────────────────┤
│  MediaPipe (Web)     │  AI Analysis Service                     │
│  Vision Camera (RN)  │  Image Quality Service                   │
│  Three.js (3D)       │  S3 / Cloud Storage                      │
│  TTS Engine          │  Redis Cache                             │
└──────────────────────┴──────────────────────────────────────────┘
```

### 2.2 Technology Stack

#### Frontend (Mobile - React Native 0.75.4)
```javascript
{
  core: 'React Native 0.75.4 (Old Architecture)',
  camera: 'react-native-vision-camera 4.7.3',
  videoGuide: 'react-native-video 6.x',
  faceDetection: 'react-native-mlkit',
  voiceGuidance: 'react-native-tts 4.1.1',
  storage: 'react-native-mmkv 2.12.2',
  stateManagement: 'zustand 4.5.5',
  navigation: '@react-navigation/native 6.1.18'
}
```

#### Frontend (Website - React 18.3)
```javascript
{
  core: 'React 18.3 + Vite',
  camera: 'WebRTC getUserMedia',
  videoGuide: 'HTML5 Video Element',
  faceDetection: '@mediapipe/tasks-vision (FaceLandmarker)',
  voiceGuidance: 'Web Speech API',
  animation: 'Framer Motion 11.x',
  stateManagement: 'React Hooks + Context'
}
```

#### Backend (Node.js)
```javascript
{
  runtime: 'Node.js 18+',
  framework: 'Express.js',
  database: 'MongoDB (multi-tenant)',
  cache: 'Redis',
  queue: 'Bull (Redis-based)',
  imageProcessing: 'Sharp',
  aiAnalysis: 'TensorFlow.js / Custom AI Service',
  storage: 'AWS S3 / Local FS',
  validation: 'OpenCV.js (blur, brightness detection)'
}
```

### 2.3 Component Hierarchy

```
DentalScanFlow
├── WelcomeTutorial (first-time only)
├── ConsentScreen
├── EnhancedScannerView
│   ├── CameraView
│   │   ├── WebRTC/VisionCamera
│   │   └── VideoStream
│   ├── VideoJawGuide ★ NEW
│   │   ├── Video Player (HTML5/RN Video)
│   │   ├── Auto-loop playback
│   │   ├── Position-specific videos (3 total)
│   │   └── Smooth transitions
│   ├── OverlayUI
│   │   ├── PositionGuide
│   │   ├── QualityIndicators
│   │   ├── CountdownRing
│   │   └── CoachingText
│   ├── ControlBar
│   │   ├── VoiceToggle
│   │   ├── FlashToggle
│   │   └── ManualCaptureFallback
│   └── ProgressTracker
│       ├── PositionChecklist (3 positions)
│       ├── ProgressBar
│       └── TimeEstimate (~30 seconds)
├── LeadCaptureForm
├── AnalysisLoadingView
└── ResultsView
```

---

## 3. Data Flow Architecture

### 3.1 Scan Initiation Flow

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Camera
    participant StateMachine
    participant Backend
    participant DB

    User->>UI: Click "Start Scan"
    UI->>Backend: POST /public/guest-scan/initiate
    Backend->>DB: Create GuestScan doc
    Backend-->>UI: Return sessionToken
    UI->>Camera: Request permissions
    Camera-->>UI: Permission granted
    UI->>StateMachine: Dispatch START_SCAN
    StateMachine-->>UI: State: INTRO
    UI->>User: Show 3D jaw tutorial
```

### 3.2 Multi-Frame Capture Flow

```mermaid
sequenceDiagram
    participant SM as StateMachine
    participant Face as FaceDetection
    participant Camera
    participant Quality as QualityCheck
    participant Upload as UploadService
    participant Backend

    SM->>Face: State: POSITIONING
    Face->>SM: Face detected, angle matched
    SM->>SM: State: COUNTDOWN
    SM->>Camera: Start multi-frame capture (5 frames)

    loop For each frame
        Camera->>Quality: Validate frame (blur, brightness)
        Quality-->>SM: Quality score
        SM->>SM: Store frame + metadata
    end

    SM->>SM: Select best quality frame
    SM->>Upload: Upload best frame
    Upload->>Backend: POST /upload-image
    Backend->>Backend: Server-side validation
    Backend-->>Upload: Validation result

    alt Validation OK
        SM->>SM: State: CAPTURED_OK
        SM->>SM: State: TRANSITION (next position)
    else Validation Failed
        SM->>SM: State: CAPTURED_RETRY
        SM->>SM: Lower quality threshold
    end
```

### 3.3 Position Transition Flow

```mermaid
sequenceDiagram
    participant SM as StateMachine
    participant 3D as 3DJawModel
    participant Voice as VoiceCoach
    participant UI

    SM->>SM: State: TRANSITION
    SM->>3D: Animate to next position
    3D->>3D: Play jaw rotation animation (500ms)
    3D-->>SM: Animation complete

    SM->>Voice: Speak next instruction
    Voice->>UI: "Turn your head to the left..."

    SM->>SM: State: POSITIONING
    SM->>UI: Show alignment indicators
```

---

## 4. State Management

### 4.1 Scanner State Machine

```javascript
const SCANNER_STATES = {
  // Setup phase
  IDLE: 'idle',
  WELCOME: 'welcome',
  CAMERA_SETUP: 'camera_setup',
  FACE_DETECTION_INIT: 'face_detection_init',

  // Scanning phase
  INTRO: 'intro',                    // 3D model tutorial
  POSITIONING: 'positioning',         // Wait for alignment
  PRE_COUNTDOWN: 'pre_countdown',     // "Hold steady" (500ms)
  COUNTDOWN: 'countdown',             // 3-2-1
  MULTI_CAPTURE: 'multi_capture',     // Capture 5 frames
  QUALITY_CHECK: 'quality_check',     // Client validation
  FRAME_SELECT: 'frame_select',       // Auto-select best
  SERVER_VALIDATE: 'server_validate', // Server validation

  // Results phase
  CAPTURED_OK: 'captured_ok',         // ✅ Success
  CAPTURED_RETRY: 'captured_retry',   // 🔄 Retry needed
  TRANSITION: 'transition',           // Animate to next
  PROGRESS_REVIEW: 'progress_review', // Every 3 positions
  COMPLETE: 'complete'                // All done
};
```

### 4.2 State Transitions

```
IDLE → WELCOME → CAMERA_SETUP → FACE_DETECTION_INIT → INTRO
  ↓
POSITIONING ⇄ PRE_COUNTDOWN ⇄ COUNTDOWN → MULTI_CAPTURE
  ↓
QUALITY_CHECK → FRAME_SELECT → SERVER_VALIDATE
  ↓                              ↓
  ├─ CAPTURED_OK → TRANSITION → [Next Position]
  └─ CAPTURED_RETRY → POSITIONING (lowered threshold)

After all positions:
  → PROGRESS_REVIEW → COMPLETE
```

---

## 5. Data Models

### 5.1 Enhanced Scan Position Schema

```javascript
interface EnhancedScanPosition {
  // Identity
  id: string;                    // 'front_smile', 'left_lateral', etc.
  tier: 1 | 2;                   // Priority tier
  order: number;                 // Sequence order

  // User-facing labels
  label: string;                 // "Front Smile"
  shortLabel: string;            // "Front"
  icon: string;                  // Material icon name

  // Multi-frame capture config
  duration: number;              // Total hold time (5000ms)
  frameCount: number;            // Number of frames to capture (5)
  frameInterval: number;         // Time between frames (1000ms)

  // Face pose targets
  targetPose: {
    yaw: { min: number; max: number };     // -5 to 5 for front
    pitch: { min: number; max: number };
    roll: { min: number; max: number };
    mouthOpen: { min: number; max: number }; // 0.15 to 0.4
  };

  // 3D Model Animation ★ NEW
  animation: {
    modelFile: string;           // 'jaw_front.glb'
    animationClip: string;       // 'turn_left'
    duration: number;            // 500ms transition
    easing: string;              // 'easeInOutCubic'
    cameraAngle: {               // 3D camera position
      x: number;
      y: number;
      z: number;
      lookAt: [x, y, z];
    };
  };

  // Voice coaching
  coaching: {
    intro: string;               // "Now let's capture your front teeth"
    positioning: string;         // "Turn slightly left... good!"
    holding: string;             // "Hold steady... perfect!"
    capturing: string;           // "Capturing now... 3, 2, 1"
    success: string;             // "Great shot!"
    retry: string;               // "Let's try again, turn a bit more"
  };

  // Quality requirements
  quality: {
    minTeethVisible: number;     // Minimum teeth count
    minBrightness: number;       // 0-1 scale
    maxBlur: number;             // Laplacian variance threshold
    minContrast: number;         // Histogram analysis
    requiredLandmarks: string[]; // ['upper_incisors', 'gums']
  };

  // Dental coverage
  coverage: {
    quadrants: string[];         // ['Q1', 'Q2']
    teeth: number[];             // FDI notation [11,12,13,21,22,23]
    regions: string[];           // ['incisors', 'canines']
  };

  // Camera settings
  camera: {
    zoom: number;                // 1.0 = no zoom
    focus: 'auto' | 'continuous';
    flashMode: 'auto' | 'on' | 'off';
    resolution: { width: number; height: number };
  };

  // Retry logic
  retry: {
    maxAttempts: number;         // 3
    adaptiveThreshold: boolean;  // true = lower quality on retry
    fallbackToManual: boolean;   // true = allow manual after max retries
  };
}
```

### 5.2 Multi-Frame Capture Data

```javascript
interface MultiFrameCapture {
  position: string;              // 'front_smile'
  sessionToken: string;
  captureTimestamp: Date;

  frames: {
    index: number;               // 0-4
    timestamp: number;           // Relative to capture start
    base64: string;              // Image data
    filePath: string;            // Temp storage path

    // Client-side quality metrics
    quality: {
      blur_score: number;        // Laplacian variance
      brightness: number;        // Mean luminance
      contrast: number;          // Std dev
      sharpness: number;         // Edge detection
      overall_score: number;     // Weighted score (0-1)
    };

    // Face detection data
    faceData: {
      detected: boolean;
      yaw: number;
      pitch: number;
      roll: number;
      mouthOpen: number;
      stable: boolean;
      landmarks: object;         // MediaPipe landmarks
    };
  }[];

  // Auto-selected best frame
  selectedFrameIndex: number;
  bestQuality: number;

  // Server validation result
  serverValidation: {
    valid: boolean;
    confidence: number;
    feedback: string;
    detections: {
      teeth_count: number;
      gum_visible: boolean;
      areas_of_concern: string[];
    };
  };

  // Retry tracking
  attempt: number;
  adaptedQuality: object;        // Lowered thresholds if retry
}
```

---

## 6. API Design

### 6.1 Enhanced Endpoints

```javascript
// Initiate scan session
POST /api/v1/public/guest-scan/initiate
Body: { consentGiven: true, scanMode: 'enhanced_3pos' }
Response: { sessionToken, expiresAt, positions: [...] }

// Upload single frame (during multi-frame capture)
POST /api/v1/public/guest-scan/:token/upload-frame
Body: {
  position: 'front_smile',
  frameIndex: 2,
  totalFrames: 5,
  imageData: 'base64...',
  quality: { blur_score, brightness, ... },
  faceData: { yaw, pitch, ... }
}
Response: { received: true, frameId }

// Validate and finalize multi-frame capture
POST /api/v1/public/guest-scan/:token/finalize-position
Body: {
  position: 'front_smile',
  selectedFrameIndex: 2,
  allFrames: [...]
}
Response: {
  valid: true,
  confidence: 0.92,
  feedback: "Excellent!",
  detections: { teeth_count: 8, ... },
  nextPosition: 'left_lateral'
}

// Quick quality check (real-time, no storage)
POST /api/v1/public/guest-scan/:token/check-quality
Body: { imageData: 'base64...', position: 'front_smile' }
Response: {
  score: 0.85,
  issues: ['brightness_low'],
  recommendations: ['Move to better lighting']
}

// Get scan progress
GET /api/v1/public/guest-scan/:token/progress
Response: {
  completedPositions: 3,
  totalPositions: 10,
  currentPosition: 'upper_occlusal',
  estimatedTimeRemaining: 120,  // seconds
  qualityAverage: 0.88
}
```

---

## 7. Performance Requirements

### 7.1 Response Time Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Camera init | < 500ms | 1s |
| Face detection frame | < 50ms | 100ms |
| Single frame capture | < 200ms | 500ms |
| Quality validation (client) | < 100ms | 200ms |
| Frame upload | < 1s | 2s |
| Server validation | < 2s | 5s |
| 3D model animation | 60fps | 30fps |
| Voice synthesis | < 200ms | 500ms |

### 7.2 Resource Limits

```javascript
{
  // Mobile
  maxMemoryUsage: '150MB',
  maxBatteryDrain: '5% per scan',
  maxNetworkData: '20MB per scan',

  // Website
  maxBundleSize: '500KB initial',
  max3DModelSize: '2MB',
  maxConcurrentScans: '100 per server',

  // Storage
  imageRetention: '30 days',
  maxImageSize: '2MB per frame',
  totalStoragePerScan: '30MB'
}
```

---

## 8. Security & Privacy

### 8.1 Data Protection

```javascript
{
  // In-transit
  encryption: 'TLS 1.3',
  imageTransfer: 'Base64 over HTTPS',

  // At-rest
  storage: 'Encrypted S3 buckets',
  database: 'MongoDB encryption at rest',

  // Access control
  sessionExpiry: '30 minutes',
  ipRateLimiting: '10 scans per IP per day',
  tokenValidation: 'JWT with HMAC-SHA256',

  // Compliance
  gdpr: true,
  hipaa: 'Evaluation pending',
  dataRetention: '30 days default',
  rightToErasure: 'Implemented'
}
```

---

## 9. Scalability & Reliability

### 9.1 Horizontal Scaling

```
┌─────────────────────────────────────────────┐
│          Load Balancer (Nginx)              │
└─────────────────────────────────────────────┘
               │
    ┌──────────┴──────────┬──────────┐
    │                     │          │
┌───▼────┐         ┌─────▼──┐   ┌──▼─────┐
│ Node 1 │         │ Node 2 │   │ Node 3 │
└────────┘         └────────┘   └────────┘
    │                  │             │
    └──────────┬───────┴─────────────┘
               ▼
         ┌─────────────┐
         │ Redis Cache │
         └─────────────┘
               ▼
         ┌─────────────┐
         │  MongoDB    │
         │  (Replica)  │
         └─────────────┘
```

### 9.2 Availability Targets

```javascript
{
  uptime: '99.5%',
  maxDowntime: '3.65 days/year',
  backupFrequency: 'Daily',
  failoverTime: '< 5 minutes',
  disasterRecovery: 'Hot standby'
}
```

---

## 10. Monitoring & Analytics

### 10.1 Key Metrics to Track

```javascript
{
  // Conversion funnel
  scanInitiated: 'count',
  scanCompleted: 'count',
  completionRate: 'percentage',
  dropOffByPosition: 'count per position',

  // Quality metrics
  averageFrameQuality: 'score 0-1',
  retryRate: 'percentage',
  manualCaptureRate: 'percentage',

  // Performance
  averageScanDuration: 'seconds',
  frameProcessingTime: 'ms',
  uploadTime: 'ms',

  // User experience
  voiceEnabledRate: 'percentage',
  3dModelLoadTime: 'ms',
  feedbackRatings: '1-5 stars',

  // Technical
  errorRate: 'percentage',
  cameraPermissionDenied: 'count',
  faceDetectionFailures: 'count'
}
```

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User struggles with positioning | High | High | Adaptive thresholds, manual fallback |
| Poor lighting conditions | High | Medium | Auto-brightness, coaching prompts |
| Camera quality varies | High | Medium | Multi-frame capture, quality validation |
| 3D model load time | Medium | Medium | Lazy loading, fallback to 2D |
| Face detection fails | Medium | High | Timer-based fallback mode |
| Network interruption | Medium | High | Progressive save, resume capability |
| AI analysis fails | Low | High | Graceful error, retry logic |

---

## 12. Success Criteria

### 12.1 MVP (Phase 1) ✅ COMPLETED
- ✅ 3 core positions implemented (left, right, front)
- ✅ Multi-frame capture working (3-5 frames/position)
- ✅ Video jaw guides integrated (MP4 playback)
- ✅ Completion rate target: 60-70%
- ✅ Average scan time < 30 seconds

### 12.2 Full Release (Phase 3-4)
- ✅ 3 positions with video guides
- ✅ Completion rate > 75%
- ✅ Analysis accuracy > 85%
- ✅ User satisfaction > 4.5/5 stars
- ✅ Conversion to booking > 40%
- [ ] Generate production-quality video guides (currently placeholders)

---

## 13. Future Enhancements

```javascript
{
  phase2: [
    'AR overlay with device lidar',
    'Real-time AI coaching',
    'Multi-language support',
    'Accessibility features (audio descriptions)'
  ],

  phase3: [
    'Advanced 3D reconstruction from 2D images',
    'Predictive quality scoring',
    'Personalized scan modes',
    'Integration with dental EMR systems'
  ]
}
```

---

## 14. References

- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Three.js Documentation](https://threejs.org/docs/)
- [React Native Vision Camera](https://react-native-vision-camera.com/)
- [FDI Tooth Numbering](https://en.wikipedia.org/wiki/FDI_World_Dental_Federation_notation)

---

**Status**: Ready for Low-Level Design (LLD) phase
**Next Steps**: Create detailed component specifications and API contracts
