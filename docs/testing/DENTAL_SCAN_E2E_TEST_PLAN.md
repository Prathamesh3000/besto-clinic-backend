# Dental AI Scan - End-to-End Test Plan

## Overview
This document outlines the complete E2E testing plan for the immersive dental AI scan system.

**Target completion time:** <60 seconds per scan
**Success rate target:** >80% scan completion
**Test environment:** Android emulator + physical device

---

## Pre-Test Setup

### Backend Requirements
- [ ] Server running at `192.168.1.60:5001` (or configured URL)
- [ ] MongoDB connected with test tenant database
- [ ] Redis running for subscription cache
- [ ] Google Gemini API key configured in `.env`
- [ ] BullMQ workers running (dental scan analysis)

### Mobile App Requirements
- [ ] Build app in debug mode: `cd BestoClinicMobile && npm run android`
- [ ] Camera permissions granted
- [ ] TTS engine available on device
- [ ] Network connected to backend
- [ ] Test user account created with dental scan permissions

---

## Test Scenarios

### ✅ Scenario 1: Happy Path - Complete 3-Position Scan

**Objective:** Verify the full scan flow completes successfully without intervention

**Steps:**
1. Launch app and navigate to Dental Scan feature
2. Tap "Start Scan" button
3. Grant camera permission if prompted
4. **INTRO screen**
   - [ ] Welcome message displays
   - [ ] "Skip" and "Let's Go" buttons visible
   - Tap "Let's Go"

5. **POSITION 1: LEFT**
   - [ ] Voice speaks: "Let's start with your left side..."
   - [ ] Position silhouette shows left-facing head
   - [ ] Status bar shows "Left Side"
   - [ ] Pre-validation indicator appears after 1s
   - [ ] "Checking position..." spinner shown
   - [ ] Auto-countdown begins (3 seconds)
   - [ ] Countdown ring animates
   - [ ] Auto-capture triggers at 0
   - [ ] "Validating capture..." spinner shown
   - [ ] "Analyzing teeth..." spinner shown
   - [ ] Success flash with checkmark
   - [ ] Badge shows "14 teeth detected" (or similar)
   - [ ] Voice speaks: "Awesome! Your left side looks great."
   - [ ] Auto-advance after 800ms

6. **TRANSITION 1 → 2**
   - [ ] Transition animation plays
   - [ ] Voice speaks: "Now let's get your front teeth."
   - [ ] Progress rail updates (1/3 complete)

7. **POSITION 2: FRONT**
   - [ ] Voice speaks: "Face the camera directly..."
   - [ ] Front teeth silhouette shows
   - [ ] Same auto-flow as Position 1
   - [ ] "8 teeth detected" badge (or similar)
   - [ ] Voice speaks: "Beautiful! Your smile is looking good."
   - [ ] Voice speaks: "Almost done! One more position..."
   - [ ] Auto-advance

8. **POSITION 3: RIGHT**
   - [ ] Voice speaks: "Turn to face your left shoulder..."
   - [ ] Right side silhouette shows
   - [ ] Same auto-flow
   - [ ] "14 teeth detected" badge
   - [ ] Voice speaks: "Excellent! All done..."
   - [ ] Auto-transition to processing

9. **PROCESSING**
   - [ ] "Analyzing your scan..." message shown
   - [ ] Progress indicator animates
   - [ ] Wait for AI analysis (5-15 seconds)

10. **RESULTS**
    - [ ] Results screen loads automatically
    - [ ] Image gallery shows 3 thumbnails (left, front, right)
    - [ ] Status shows "Completed"
    - [ ] AI Summary section displays
    - [ ] Health Score card shows overall/hygiene/structure scores
    - [ ] **Per-Angle Analysis section displays**:
      - [ ] Left Position card shows teeth count, quadrants, observations
      - [ ] Front Position card shows detected teeth
      - [ ] Right Position card shows detected teeth
    - [ ] Dental Chart displays with color-coded teeth
    - [ ] Observations list shows findings

**Expected Duration:** 45-60 seconds (intro to results)

**Pass Criteria:**
- ✅ All 3 positions captured automatically
- ✅ No manual "Next" button clicks required
- ✅ Voice guidance plays at each step
- ✅ Teeth detected in all 3 positions (>0 count)
- ✅ Per-angle analysis displays correctly
- ✅ Total time <60 seconds

---

### 🔄 Scenario 2: Pre-Validation Failure & Retry

**Objective:** Test real-time validation retry flow

**Steps:**
1. Start scan
2. At LEFT position, intentionally position poorly (e.g., look away from camera)
3. **Expected behavior:**
   - [ ] Pre-validation fails
   - [ ] "Adjust your position" feedback appears
   - [ ] System retries after 2 seconds
   - [ ] Repeats up to 3 attempts
   - [ ] After 3 failed attempts, proceeds to countdown anyway (graceful fallback)

**Pass Criteria:**
- ✅ Feedback messages display correctly
- ✅ Retry loop works (max 3 attempts)
- ✅ System doesn't get stuck in infinite validation
- ✅ Eventually proceeds even if validation unclear

---

### 📸 Scenario 3: Manual Capture Fallback

**Objective:** Test manual capture option after max retries

**Steps:**
1. Start scan
2. At FRONT position, trigger validation failures (3x)
3. **Expected behavior:**
   - [ ] After 3 retries, "Capture Now" button appears
   - [ ] Tap "Capture Now"
   - [ ] Manual capture succeeds
   - [ ] Flow continues normally

**Pass Criteria:**
- ✅ Manual button appears after max retries
- ✅ Manual capture works
- ✅ Flow continues to next position

---

### 🎤 Scenario 4: Voice Guidance Muted

**Objective:** Test experience with voice disabled

**Steps:**
1. Start scan
2. Tap voice toggle button (top-left)
3. Complete full scan
4. **Expected behavior:**
   - [ ] Voice icon changes to muted
   - [ ] No TTS audio plays
   - [ ] Visual indicators still work
   - [ ] Flow completes successfully

**Pass Criteria:**
- ✅ Voice toggles off
- ✅ No audio plays when muted
- ✅ Visual-only flow still works

---

### ⚡ Scenario 5: Interrupted Scan

**Objective:** Test app backgrounding/resuming mid-scan

**Steps:**
1. Start scan
2. Complete LEFT position
3. During FRONT position countdown, press home button
4. Wait 5 seconds
5. Return to app
6. **Expected behavior:**
   - [ ] Scan resumes where it left off
   - [ ] Countdown may need to restart
   - [ ] No crash or freeze

**Pass Criteria:**
- ✅ App doesn't crash on background/resume
- ✅ Scan can continue or restart gracefully

---

### 🌐 Scenario 6: Network Interruption

**Objective:** Test behavior with poor/no connectivity

**Setup:** Enable airplane mode after capturing images

**Steps:**
1. Start scan
2. Complete all 3 captures
3. Enable airplane mode BEFORE analysis starts
4. **Expected behavior:**
   - [ ] "Processing" state shows loading
   - [ ] After timeout, error message displays
   - [ ] Option to retry when network restored

**Pass Criteria:**
- ✅ Graceful error handling
- ✅ Clear user feedback
- ✅ Retry option available

---

### 🔄 Scenario 7: Rapid Succession Scans

**Objective:** Test system under repeated usage

**Steps:**
1. Complete full scan #1
2. Immediately start scan #2
3. Complete scan #2
4. Start scan #3
5. **Expected behavior:**
   - [ ] Each scan completes successfully
   - [ ] No memory leaks or performance degradation
   - [ ] Results remain distinct per scan

**Pass Criteria:**
- ✅ 3 consecutive scans complete
- ✅ No app slowdown
- ✅ Each scan properly isolated

---

## Performance Benchmarks

### Timing Targets
| Phase | Target Duration | Acceptable Range |
|-------|----------------|------------------|
| Intro | 3-5s | 2-10s |
| Position 1 (LEFT) | 8-12s | 6-20s |
| Transition 1→2 | 2s | 1-3s |
| Position 2 (FRONT) | 8-12s | 6-20s |
| Transition 2→3 | 2s | 1-3s |
| Position 3 (RIGHT) | 8-12s | 6-20s |
| Processing | 5-15s | 3-30s |
| **Total** | **<60s** | **40-90s** |

### Memory Usage
- [ ] Initial app memory: < 150MB
- [ ] During scan: < 250MB
- [ ] After 3 scans: < 300MB (no significant leak)

### Network Usage
- [ ] Pre-validation calls: ~50KB per attempt (3 positions × 3 max attempts = ~450KB)
- [ ] Image uploads: ~200KB per image (3 images = ~600KB)
- [ ] Teeth detection calls: ~50KB per image (3 images = ~150KB)
- [ ] **Total per scan: ~1.2MB**

---

## Test Data Requirements

### Test Images (Manual Testing)
Prepare 3 test scenarios:
1. **Good Quality**: Clear, well-lit, proper positioning
2. **Moderate Quality**: Slightly blurred, suboptimal lighting
3. **Poor Quality**: Very blurred, dark, unclear positioning

### Expected Teeth Detection Results
| Position | Expected Quadrants | Min Teeth Count |
|----------|-------------------|-----------------|
| LEFT | Q2, Q3 | 10 |
| FRONT | Q1-Q4 | 8 |
| RIGHT | Q1, Q4 | 10 |

---

## Bug Reporting Template

When issues are found, report using this format:

```markdown
**Bug ID:** SCAN-XXX
**Severity:** [Critical | High | Medium | Low]
**Scenario:** [Which test scenario]
**Device:** [Android/iOS version, model]

**Steps to Reproduce:**
1. ...
2. ...

**Expected Result:**
...

**Actual Result:**
...

**Screenshots/Logs:**
[Attach]

**Frequency:** [Always | Sometimes | Rare]
```

---

## Success Metrics

### Must Pass (Critical)
- ✅ 100% of Scenario 1 (happy path) passes
- ✅ No crashes during normal flow
- ✅ All 3 positions captured in <60s
- ✅ Per-angle analysis displays correctly
- ✅ Teeth detected in all positions (count >0)

### Should Pass (High Priority)
- ✅ 90% of Scenario 2 (retry) passes
- ✅ Voice guidance works on 100% of test devices
- ✅ Manual fallback available when needed
- ✅ Network errors handled gracefully

### Nice to Have (Medium Priority)
- ✅ App resume works smoothly
- ✅ Rapid succession scans work
- ✅ Memory stays under 300MB

---

## Test Execution Checklist

Before marking E2E testing complete:
- [ ] All 7 scenarios tested on Android emulator
- [ ] Scenarios 1-4 tested on physical Android device
- [ ] Performance benchmarks met (timing, memory, network)
- [ ] All critical bugs fixed
- [ ] All high-priority bugs fixed or documented
- [ ] Test results documented in `/docs/testing/E2E_TEST_RESULTS.md`
