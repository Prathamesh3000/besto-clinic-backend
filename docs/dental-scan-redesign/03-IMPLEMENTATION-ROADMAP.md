# Dental Scan System - Implementation Roadmap

## Document Information
- **Version**: 2.0
- **Date**: April 2026
- **Timeline**: 4-5 weeks
- **Team**: 2-3 developers
- **Dependencies**: HLD + LLD documents

---

## Executive Summary

This roadmap outlines a **4-phase implementation** strategy to build the enhanced dental scan system with **3D jaw model guidance**, **multi-frame capture**, and **real-time quality validation**.

### Target Metrics
- **Phase 1 MVP**: 60% completion rate (2 weeks)
- **Phase 2**: 70% completion rate (3 weeks)
- **Phase 3**: 75% completion rate (4 weeks)
- **Phase 4 Full**: 80%+ completion rate (5 weeks)

---

## Phase 1: Core Auto-Capture MVP (Week 1-2)

### Objective
Build foundational auto-capture system with 6 essential positions and basic 3D guidance.

### Deliverables

#### 1.1 Enhanced Scan Positions (2 days)
```javascript
// File: src/constants/enhancedScanPositions.js

- [ ] Define 6 Tier-1 positions:
  - Front Smile (wide smile, front teeth)
  - Left Lateral (turn right, left side teeth)
  - Right Lateral (turn left, right side teeth)
  - Upper Occlusal (tilt up, top teeth)
  - Lower Occlusal (tilt down, bottom teeth)
  - Close Smile (detailed front teeth)

- [ ] Implement position schema with:
  - Target pose ranges (yaw, pitch, mouthOpen)
  - Voice coaching scripts
  - Quality requirements
  - Animation references
  - Camera settings

- [ ] Export SCAN_POSITIONS_ENHANCED array
- [ ] Create position sequencing utility
```

**Files to Create:**
- `src/constants/enhancedScanPositions.js`
- `src/utils/positionSequencer.js`

---

#### 1.2 Multi-Frame Capture Engine (3 days)

**Website Implementation:**
```javascript
// File: website/src/services/MultiFrameCaptureService.js

- [ ] Create MultiFrameCaptureService class
- [ ] Implement capturePosition(config):
  - Capture 3 frames with 1s interval
  - Store frame + quality metadata
  - Auto-select best frame
- [ ] Add frame buffer manager
- [ ] Implement quality validator (client-side)
- [ ] Add compression pipeline
```

**Mobile Implementation:**
```typescript
// File: BestoClinicMobile/src/services/MultiFrameCaptureService.ts

- [ ] Create React Native version
- [ ] Use react-native-vision-camera for capture
- [ ] Implement identical interface to web
- [ ] Add MMKV caching for frames
- [ ] Test on Android + iOS
```

**Testing:**
- [ ] Unit tests for frame selection logic
- [ ] Integration test: capture 3 frames
- [ ] Verify best frame selection accuracy

---

#### 1.3 Quality Validation System (3 days)

```typescript
// Files:
// - website/src/utils/qualityValidator.ts
// - BestoClinicMobile/src/utils/qualityValidator.ts

- [ ] Implement QualityValidator class:
  - detectBlur() using Laplacian variance
  - checkBrightness() using histogram
  - checkContrast() using std dev
  - detectSharpness() using edge detection
  - calculateOverall() weighted score

- [ ] Create client-side validation pipeline
- [ ] Add adaptive threshold calculator
- [ ] Implement quality feedback generator
```

**Testing:**
- [ ] Test with sample dental images
- [ ] Verify blur detection accuracy
- [ ] Test brightness/contrast detection
- [ ] Validate scoring algorithm

---

#### 1.4 3D Jaw Model - Basic Implementation (4 days)

**Model Acquisition/Creation:**
```bash
- [ ] Option A: Purchase royalty-free 3D head model
  - Sources: TurboSquid, CGTrader, Sketchfab
  - Budget: $50-200 for quality rigged model

- [ ] Option B: Create custom model (if budget allows)
  - Hire 3D artist on Fiverr/Upwork
  - Budget: $500-1000
  - Deliverables: Head with jaw rig + teeth meshes

- [ ] Model optimization:
  - Reduce poly count to < 50k triangles
  - Optimize textures (2048x2048 max)
  - Create LOD versions
  - Export as GLTF/GLB with Draco compression
```

**Animation Creation:**
```bash
- [ ] Create 6 animation clips in Blender:
  1. idle (neutral pose loop)
  2. to_front_smile (smile animation)
  3. to_left_lateral (turn right + open)
  4. to_right_lateral (turn left + open)
  5. to_upper_occlusal (tilt back + open)
  6. to_lower_occlusal (tilt forward + open)

- [ ] Export animations:
  - Bake animations to 30fps
  - Duration: 500-1000ms per clip
  - Include blend shapes for mouth/jaw
```

**Website Integration:**
```jsx
// File: website/src/components/3d/JawModelGuide.jsx

- [ ] Set up Three.js + React Three Fiber
- [ ] Create JawModelGuide component
- [ ] Implement AnimatedJawModel component
- [ ] Add GLTF loader with caching
- [ ] Implement animation controller
- [ ] Add smooth camera transitions
- [ ] Test performance (target: 30fps minimum)
```

**Mobile Integration:**
```tsx
// File: BestoClinicMobile/src/components/3d/JawModelGuide.tsx

- [ ] Install @react-three/fiber/native
- [ ] Create native 3D component
- [ ] Port web implementation
- [ ] Optimize for mobile performance
- [ ] Test on mid-range devices
```

**Testing:**
- [ ] Load time < 2 seconds
- [ ] Smooth animations (30+ fps)
- [ ] Transitions between positions
- [ ] Memory usage < 50MB

---

#### 1.5 Enhanced State Machine (2 days)

```typescript
// File: src/state/enhancedScannerStateMachine.ts

- [ ] Define 15 states (IDLE → COMPLETE)
- [ ] Implement state transition logic
- [ ] Add event handlers:
  - Camera events
  - Face detection events
  - Capture events
  - Quality validation events

- [ ] Create context management:
  - Current position tracking
  - Retry count
  - Adaptive quality thresholds
  - Capture storage

- [ ] Add guards and actions
- [ ] Integrate with React Hook
```

**Testing:**
- [ ] State transition unit tests
- [ ] Integration test: full scan flow
- [ ] Test retry logic
- [ ] Test adaptive thresholds

---

#### 1.6 Backend API Updates (2 days)

```javascript
// Files:
// - src/modules/public/public.routes.js
// - src/services/multiFrameService.js

- [ ] Update /initiate endpoint:
  - Add scanMode: 'enhanced_6pos'
  - Return enhanced position definitions

- [ ] Create /upload-frame endpoint:
  - Accept frame index + total frames
  - Store frame metadata
  - Return frame ID

- [ ] Create /finalize-position endpoint:
  - Select best frame from uploaded
  - Run server-side validation
  - Return validation result + next position

- [ ] Update GuestScan model:
  - Add frames array per position
  - Add selectedFrameIndex
  - Add serverValidation object
```

**Testing:**
- [ ] API integration tests
- [ ] Load test: 10 concurrent scans
- [ ] Test frame storage (S3/local)

---

#### 1.7 UI Polish & Integration (3 days)

**Website:**
```jsx
- [ ] Update ImmersiveScannerCard:
  - Replace manual ScannerView with enhanced version
  - Integrate JawModelGuide component
  - Add multi-frame progress indicator
  - Add quality feedback overlays

- [ ] Create PositionProgressTracker component
- [ ] Add transition animations
- [ ] Implement celebration micro-animations
```

**Mobile:**
```tsx
- [ ] Update DentalScanCameraScreen:
  - Integrate multi-frame capture
  - Add 3D model view
  - Update progress UI
  - Add haptic feedback

- [ ] Test on different screen sizes
- [ ] Optimize for Old Architecture
```

**Testing:**
- [ ] End-to-end scan flow
- [ ] User acceptance testing
- [ ] Performance profiling

---

### Phase 1 Checklist

**Must-Have (MVP):**
- [x] 6 enhanced scan positions defined
- [ ] Multi-frame capture (3 frames/position) working
- [ ] Basic 3D jaw model with 6 animations
- [ ] Client-side quality validation
- [ ] Enhanced state machine
- [ ] Backend API support

**Success Criteria:**
- Completion rate > 60%
- Average scan time < 3 minutes
- 3D model loads < 2 seconds
- Frame quality score > 0.7

**Estimated Effort:** 19 days (2.5 weeks with 2 developers)

---

## Phase 2: Enhanced Positions + Server Validation (Week 3)

### Objective
Add 4 additional positions (Tier 2) and implement deep server-side validation.

### Deliverables

#### 2.1 Tier 2 Positions (1 day)
```javascript
- [ ] Add 4 positions:
  - Left Canine Close-up (Q2 detail)
  - Right Canine Close-up (Q1 detail)
  - Lower Incisors (Q3+Q4 detail)
  - Gum Line Scan (gum health)

- [ ] Create animations for new positions
- [ ] Update position sequencer
```

#### 2.2 Server-Side Quality Validation (3 days)
```javascript
// File: src/services/imageQualityService.js

- [ ] Implement ImageQualityService:
  - Sharp integration for quality analysis
  - OpenCV for teeth detection
  - Contour detection for teeth count
  - Gum visibility detection

- [ ] Create validation endpoint
- [ ] Add feedback generator
- [ ] Integrate with finalize-position API
```

#### 2.3 Adaptive Retry Logic (2 days)
```typescript
- [ ] Implement adaptive threshold calculator
- [ ] Add progressive quality lowering
- [ ] Create retry feedback system
- [ ] Test with difficult lighting conditions
```

#### 2.4 Progressive Save/Resume (2 days)
```typescript
- [ ] Add session persistence
- [ ] Implement resume capability
- [ ] Add "Resume Scan" UI
- [ ] Test interruption scenarios
```

**Phase 2 Effort:** 8 days (1 week)

---

## Phase 3: Polish & Optimization (Week 4)

### Objective
Add welcome tutorial, micro-celebrations, and performance optimizations.

### Deliverables

#### 3.1 Welcome Tutorial (2 days)
```jsx
- [ ] Create WelcomeTutorialCard component
- [ ] Add 15-second animated guide
- [ ] Implement "Skip Tutorial" button
- [ ] Add first-time user detection
```

#### 3.2 Micro-Celebrations (1 day)
```jsx
- [ ] Add success animations (Lottie)
- [ ] Implement confetti burst
- [ ] Add haptic feedback (mobile)
- [ ] Create sound effects (optional)
```

#### 3.3 Real-Time Coaching Overlays (2 days)
```jsx
- [ ] Add alignment indicators
- [ ] Create angle meter component
- [ ] Add stability indicator
- [ ] Implement countdown ring
```

#### 3.4 Performance Optimization (3 days)
```javascript
- [ ] Optimize 3D model loading:
  - Lazy load animations
  - Implement LOD system
  - Add texture compression

- [ ] Optimize frame capture:
  - Background upload
  - Progressive JPEG compression
  - Frame buffer management

- [ ] Reduce bundle size:
  - Code splitting
  - Tree shaking
  - Asset optimization
```

**Phase 3 Effort:** 8 days (1 week)

---

## Phase 4: AI Integration & Analytics (Week 5)

### Objective
Add intelligent features and comprehensive analytics tracking.

### Deliverables

#### 4.1 Real-Time Frame Quality AI (3 days)
```python
# Optional: TensorFlow.js model for teeth detection

- [ ] Train teeth detection model (or use pre-trained)
- [ ] Integrate TF.js on client
- [ ] Add real-time quality scoring
- [ ] Implement auto-capture trigger
```

#### 4.2 Preliminary Analysis API (2 days)
```javascript
// After 3 positions captured, quick analysis

- [ ] Create quick-analysis endpoint
- [ ] Return preliminary findings
- [ ] Request additional positions if needed
- [ ] Show preview to user
```

#### 4.3 Analytics Tracking (2 days)
```javascript
- [ ] Track completion funnel
- [ ] Monitor drop-off by position
- [ ] Track quality metrics
- [ ] Measure performance metrics
- [ ] Create analytics dashboard
```

#### 4.4 A/B Testing Infrastructure (1 day)
```javascript
- [ ] Set up feature flags
- [ ] Create A/B test variants:
  - 6 vs 10 positions
  - Voice on vs voice off by default
  - Different animation styles

- [ ] Implement tracking
```

**Phase 4 Effort:** 8 days (1 week)

---

## Deployment Strategy

### Staging Deployment (After Phase 1)
```bash
- [ ] Deploy to staging environment
- [ ] Internal testing (team)
- [ ] Beta testing (5-10 users)
- [ ] Collect feedback
- [ ] Fix critical bugs
```

### Production Rollout (After Phase 2-3)
```bash
- [ ] Gradual rollout:
  - Week 1: 10% of users
  - Week 2: 25% of users
  - Week 3: 50% of users
  - Week 4: 100% of users

- [ ] Monitor metrics daily
- [ ] Emergency rollback plan
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| 3D model too large | Progressive loading, LOD system |
| Poor frame quality | Adaptive thresholds, coaching |
| Face detection fails | Timer-based fallback mode |
| User confusion | Tutorial, voice guidance, visual cues |
| Performance issues | Profiling, optimization, testing |
| Network interruptions | Progressive save, offline support |

---

## Resource Requirements

### Development Team
- **2 Full-Stack Developers** (primary)
- **1 3D Artist** (contract, 1 week)
- **1 QA Engineer** (part-time)
- **1 Product Manager** (oversight)

### Infrastructure
- **Cloud Storage**: S3 or equivalent (20GB/month initially)
- **CDN**: For 3D model delivery
- **Redis**: For session management
- **MongoDB**: Database (existing)

### Tools & Services
- **3D Model**: $50-1000 (purchase or create)
- **MediaPipe**: Free (open-source)
- **Three.js**: Free (open-source)
- **Sharp/OpenCV**: Free (open-source)

---

## Success Metrics (KPIs)

### Primary Metrics
| Metric | Baseline | Phase 1 Target | Phase 4 Target |
|--------|----------|----------------|----------------|
| Completion Rate | 30-40% | 60% | 80%+ |
| Avg Scan Time | 3-4 min | 3 min | 2.5 min |
| Quality Score | 0.6 | 0.75 | 0.85 |
| Retry Rate | 40% | 20% | 5% |

### Secondary Metrics
- User satisfaction (NPS): Target 8+/10
- Conversion to booking: Target 40%
- Return users: Target +60%
- Error rate: Target < 2%

---

## Testing Strategy

### Unit Tests
```bash
- Quality validation algorithms
- Frame selection logic
- State machine transitions
- Position sequencing
- API endpoints
```

### Integration Tests
```bash
- Full scan flow (6 positions)
- Multi-frame capture pipeline
- Server validation flow
- Resume capability
```

### E2E Tests
```bash
- Website: Cypress
- Mobile: Detox
- Scenarios:
  - Happy path (perfect conditions)
  - Poor lighting
  - Unstable positioning
  - Network interruption
  - Browser/device variety
```

### Performance Tests
```bash
- Load testing: 100 concurrent scans
- Memory profiling
- Network profiling (slow 3G)
- Battery impact (mobile)
```

---

## Documentation Deliverables

- [x] High-Level Design (HLD)
- [x] Low-Level Design (LLD)
- [x] Implementation Roadmap (this document)
- [ ] API Documentation (Swagger/OpenAPI)
- [ ] Component Documentation (Storybook)
- [ ] User Guide (help docs)
- [ ] Developer Onboarding Guide

---

## Post-Launch (Phase 5+)

### Continuous Improvements
```javascript
{
  month1: [
    'Monitor completion rate daily',
    'A/B test voice coaching scripts',
    'Optimize 3D model based on feedback'
  ],

  month2: [
    'Add AR overlay support (iOS lidar)',
    'Multi-language voice guidance',
    'Personalized scan modes'
  ],

  month3: [
    'Advanced AI analysis',
    '3D reconstruction from 2D images',
    'Integration with dental EMR systems'
  ]
}
```

---

## Approval & Sign-Off

**Design Approved By:**
- [ ] Product Manager: _________________ Date: _______
- [ ] Engineering Lead: ________________ Date: _______
- [ ] UX Designer: ____________________ Date: _______

**Implementation Start Date:** _________________
**Expected Completion:** _________________

---

**Status**: Ready for Implementation
**Next Steps**:
1. Approve design documents
2. Allocate resources
3. Set up development environment
4. Begin Phase 1 Sprint 1
