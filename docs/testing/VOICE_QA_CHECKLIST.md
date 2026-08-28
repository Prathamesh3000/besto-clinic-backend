# Voice Guidance QA Checklist - Real Device Testing

## Overview
Test voice guidance quality across different devices and scenarios to ensure natural, conversational TTS experience.

**Test Devices Required:**
- Android phone (minimum 2 devices, different manufacturers)
- Android emulator (as baseline)
- iOS device (optional but recommended)

---

## Pre-Test Setup

### Device Requirements
- [ ] TTS engine installed (Google TTS for Android, system TTS for iOS)
- [ ] App installed in debug mode
- [ ] Volume set to 50-75% (not max, not min)
- [ ] Silent mode OFF (test ringer mode)
- [ ] Background apps closed for clean audio

### Test Environment
- [ ] Quiet room (minimal background noise)
- [ ] Record audio samples for quality review
- [ ] Have test participants ready (if conducting user testing)

---

## Voice Quality Assessment

### 1. TTS Initialization & Parameters

**Objective:** Verify natural TTS parameters are applied

**Steps:**
1. Launch app and navigate to dental scan
2. Start scan
3. Listen to first voice instruction

**Checklist:**
- [ ] Voice speaks immediately (no delay >1s)
- [ ] Voice sounds natural (not robotic)
- [ ] Pace is comfortable (not too fast/slow)
- [ ] Pitch is friendly (not monotone)
- [ ] Volume is appropriate (not too quiet/loud)

**Technical Validation:**
- [ ] `Tts.setDefaultRate(0.52)` applied (slightly faster than default 0.5)
- [ ] `Tts.setDefaultPitch(1.05)` applied (slightly higher, friendlier)
- [ ] `Tts.setIgnoreSilentSwitch(true)` works (plays even on silent)

**Rating Scale (1-5):**
- Clarity: [ ] 1 2 3 4 5 (5 = crystal clear)
- Naturalness: [ ] 1 2 3 4 5 (5 = human-like)
- Pace: [ ] 1 2 3 4 5 (5 = perfect speed)
- Pleasantness: [ ] 1 2 3 4 5 (5 = very pleasant)

**Target:** Average ≥4.0 across all metrics

---

### 2. Conversational Scripts Testing

**Objective:** Verify voice scripts sound natural and actionable

**Test Each Position's Voice Instruction:**

#### Position 1: LEFT
**Script:** _"Let's start with your left side. Turn to face your right shoulder, and give me a big smile. Perfect, hold that!"_

**Checklist:**
- [ ] Script flows naturally (no awkward pauses)
- [ ] Instructions are clear and actionable
- [ ] Tone is encouraging
- [ ] "Perfect, hold that!" emphasis sounds natural

**User Feedback:**
- Does the instruction help you position correctly? [ ] Yes [ ] No
- Is the tone encouraging? [ ] Yes [ ] No
- Any confusing words? _____________

#### Position 2: FRONT
**Script:** _"Face the camera directly and smile wide. Show me those pearly whites!"_

**Checklist:**
- [ ] "Pearly whites" phrase sounds natural (not forced)
- [ ] Enthusiasm comes through
- [ ] Clear what action to take

#### Position 3: RIGHT
**Script:** _"Turn to face your left shoulder, and show me a big smile. Hold steady!"_

**Checklist:**
- [ ] Direction clear (left shoulder = patient's left)
- [ ] "Hold steady!" motivating

**Success Messages:**
Test each position's success feedback:
- LEFT: _"Awesome! Your left side looks great."_
- FRONT: _"Beautiful! Your smile is looking good."_
- RIGHT: _"Excellent! All done. Now let's analyze your dental health."_

**Checklist:**
- [ ] Success messages play immediately after capture
- [ ] Timing feels right (not too fast)
- [ ] Variety in praise words ("Awesome", "Beautiful", "Excellent")

**Transition Messages:**
- LEFT→FRONT: _"Now let's get your front teeth."_
- FRONT→RIGHT: _"Almost done! One more position - your right side."_

**Checklist:**
- [ ] Transitions smooth (no abrupt jumps)
- [ ] Progress indication clear ("Almost done!")
- [ ] Natural segue to next step

---

### 3. Variable Encouragement Testing

**Objective:** Test speakNatural() function with random encouragement

**Script:** Call `speakNatural()` 10 times and verify variety

**Steps:**
1. In test mode, add console logs to track prefixes
2. Trigger voice multiple times
3. Record which prefixes are used

**Expected Prefixes:**
- "Great! "
- "Excellent! "
- "Perfect! "
- "Wonderful! "
- "Awesome! "
- "" (no prefix)

**Checklist:**
- [ ] At least 4 different prefixes used in 10 calls
- [ ] No prefix appears >50% of the time (good variety)
- [ ] Prefixes sound natural when combined with instructions
- [ ] Random selection feels authentic (not predictable)

**Example Output:**
```
Attempt 1: "Great! Turn to face your right shoulder..."
Attempt 2: "Turn to face your right shoulder..." (no prefix)
Attempt 3: "Perfect! Turn to face your right shoulder..."
```

---

### 4. Voice State Transitions

**Objective:** Test voice feedback at each state transition

**Complete Scan States:**
| State | Expected Voice Output | Timing |
|-------|----------------------|--------|
| INTRO | (None - visual only) | N/A |
| POSITIONING | Position instruction | Immediate |
| PRE_VALIDATING | (None - visual indicator) | N/A |
| COUNTDOWN | (None - visual countdown) | N/A |
| CAPTURED_OK | Success message | <200ms after success flash |
| TRANSITIONING | Transition message | During animation |
| COMPLETE | Final success message | At results load |
| CAPTURED_FAIL | Validation feedback | Immediate |

**Checklist:**
- [ ] Voice plays at correct state transitions
- [ ] No voice overlap (previous speech stopped)
- [ ] Timing feels natural
- [ ] No unexpected silence or chatter

---

### 5. Voice Toggle Functionality

**Objective:** Verify mute/unmute works correctly

**Steps:**
1. Start scan with voice ON
2. Tap voice toggle button (top-left)
3. Complete a position
4. Tap voice toggle again
5. Complete another position

**Checklist:**
- [ ] Voice icon changes to muted state
- [ ] No TTS audio plays when muted
- [ ] Visual indicators still work correctly
- [ ] Toggle restores voice correctly
- [ ] Toggle state persists across positions

---

### 6. Background Audio Behavior

**Objective:** Test voice guidance with background audio

**Scenarios:**

#### Scenario A: Music Playing
1. Start music (Spotify, YouTube Music, etc.)
2. Launch scan
3. Voice speaks

**Expected Behavior:**
- [ ] Music volume lowers (ducking works)
- [ ] Voice clearly audible over music
- [ ] Music resumes after voice completes
- [ ] `Tts.setDucking(true)` working

#### Scenario B: Phone Call Scenario
1. During scan, simulate incoming call notification
2. Observe voice behavior

**Expected Behavior:**
- [ ] Voice doesn't interrupt critical phone functions
- [ ] Scan can resume after dismissing notification

---

### 7. Silent Mode / Do Not Disturb

**Objective:** Test `setIgnoreSilentSwitch(true)` functionality

**Steps:**
1. Enable silent mode on device
2. Start scan
3. Voice should still play

**Checklist:**
- [ ] Voice plays even in silent mode
- [ ] Volume appropriate (not too loud)
- [ ] Behavior documented in app (user knows voice will play)

---

### 8. Device-Specific Testing

**Test on Multiple Devices:**

| Device | Manufacturer | Android Version | TTS Clarity (1-5) | Natural Tone (1-5) | Notes |
|--------|-------------|-----------------|-------------------|-------------------|-------|
| Device 1 | Samsung | 13 | __ | __ | |
| Device 2 | Google Pixel | 14 | __ | __ | |
| Device 3 | Xiaomi | 12 | __ | __ | |
| Emulator | Android | 13 | __ | __ | |

**Common Device Issues:**
- Samsung: Sometimes uses Samsung TTS instead of Google TTS
- Xiaomi: MIUI may have custom TTS settings
- Emulator: May lack TTS engine (graceful degradation test)

**Checklist Per Device:**
- [ ] TTS engine available and initialized
- [ ] Voice quality acceptable (≥4/5)
- [ ] No crashes or errors
- [ ] Consistent experience across devices

---

### 9. Edge Cases & Error Scenarios

**Test Error Handling:**

#### No TTS Engine Available
**Steps:**
1. Disable/uninstall Google TTS
2. Start scan

**Expected Behavior:**
- [ ] App doesn't crash
- [ ] Console warning: "TTS not available"
- [ ] Visual-only flow still works
- [ ] Graceful degradation

#### TTS Initialization Failure
**Steps:**
1. Force TTS error (airplane mode during init, etc.)

**Expected Behavior:**
- [ ] Silent degradation
- [ ] `ttsAvailable` state = false
- [ ] Scan continues without voice

---

### 10. User Experience Testing (Optional)

**Recruit 5-10 Users for Feedback:**

**User Testing Protocol:**
1. User completes full scan
2. User rates voice guidance:

**Questions:**
- "Was the voice guidance helpful?" [ ] Yes [ ] No
- "Did the voice sound natural or robotic?" [ ] Natural [ ] Robotic
- "Was the pace comfortable?" [ ] Too fast [ ] Just right [ ] Too slow
- "Did you find the voice annoying or pleasant?" [ ] Annoying [ ] Neutral [ ] Pleasant
- "Would you prefer to mute the voice?" [ ] Yes [ ] No
- "Any suggestions for improvement?" _______________

**Target Metrics:**
- ≥80% find voice helpful
- ≥70% rate voice as "Natural"
- ≥75% find pace "Just right"
- ≤15% want to mute voice
- ≥60% rate voice as "Pleasant"

---

## Testing Execution Plan

### Week 1: Technical Validation
- [ ] Day 1: Test on Android emulator (baseline)
- [ ] Day 2: Test on 2 physical Android devices
- [ ] Day 3: Device-specific testing (Samsung, Pixel, etc.)
- [ ] Day 4: Edge cases and error scenarios
- [ ] Day 5: Document findings and issues

### Week 2: User Experience Testing (Optional)
- [ ] Day 1-2: Recruit 5-10 test users
- [ ] Day 3-4: Conduct user testing sessions
- [ ] Day 5: Analyze feedback and create recommendations

---

## Success Criteria

### ✅ Voice QA Passes If:
1. **Technical:**
   - TTS initializes successfully on 100% of test devices
   - Natural mode parameters applied correctly
   - Voice plays at all expected state transitions
   - Toggle works reliably
   - Ducking works with background audio

2. **Quality:**
   - Average voice rating ≥4.0/5 (clarity, naturalness, pace)
   - Conversational scripts sound natural
   - Variable encouragement adds variety

3. **User Experience:**
   - ≥70% users find voice helpful
   - ≥60% rate voice as natural
   - ≤20% users disable voice

### ❌ Voice QA Fails If:
- TTS fails to initialize on any device
- Average voice rating <3.0/5
- Voice overlap or interruption issues
- >30% users find voice annoying or want to mute
- Silent mode override doesn't work

---

## Bug Reporting Template

```markdown
**Bug ID:** VOICE-XXX
**Severity:** [Critical | High | Medium | Low]
**Device:** [Manufacturer, Model, Android Version]

**Issue:**
...

**Steps to Reproduce:**
1. ...
2. ...

**Expected Voice Behavior:**
...

**Actual Voice Behavior:**
...

**Audio Recording:**
[Attach .mp3 or .wav file if possible]
```

---

## Post-Test Actions

After completing voice QA:
- [ ] Compile all device test results
- [ ] Calculate average quality ratings
- [ ] Document any device-specific issues
- [ ] Create recommendation list for TTS improvements
- [ ] Update voice scripts if needed based on user feedback
- [ ] Save test results to `/docs/testing/VOICE_QA_RESULTS.md`
- [ ] Mark Voice QA task as complete

---

## Recommendations for Improvement

Based on test findings, consider:
1. **If voice sounds too robotic:** Increase pitch to 1.1 or try different TTS voice
2. **If pace too fast:** Reduce rate to 0.48
3. **If scripts awkward:** Revise specific phrases based on user feedback
4. **If users disable voice:** Add option to toggle voice before scan starts
5. **If variety lacking:** Add more encouragement phrase options

---

## Reference: TTS Parameter Tuning Guide

Current settings:
```typescript
rate: 0.52      // Range: 0.1 (very slow) to 2.0 (very fast), default 0.5
pitch: 1.05     // Range: 0.5 (low) to 2.0 (high), default 1.0
language: 'en-US'
ducking: true   // Lower background audio
ignoreSilent: true  // Play even on silent mode
```

If adjustments needed, test ranges:
- **Slower, calmer:** rate: 0.45, pitch: 1.0
- **Faster, energetic:** rate: 0.58, pitch: 1.1
- **Deeper voice:** pitch: 0.9
- **Higher voice:** pitch: 1.15
