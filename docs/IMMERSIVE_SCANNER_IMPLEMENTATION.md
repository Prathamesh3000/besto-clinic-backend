# Immersive Dental Scanner Implementation Guide

## Overview

This document guides the complete transformation from "chatbot with scanner" to "medical AI scanner with voice coach" for both web and mobile platforms.

---

## ✅ COMPLETED: Phase 1 Foundation

### 1. Animation Library (`website/src/lib/scanner/animations.js`)
**Complete set of Framer Motion variants for all scanner states:**

- Shell & container animations (entrance/exit)
- Voice waveform animations (speaking/idle states)
- Position guide overlays (silhouette, angle meter)
- Countdown animations (ring fill, number transitions)
- Capture effects (flash, checkmark, tooth count badge)
- Validation feedback (success pulse, warning shake)
- Position transitions (wipe effects, slide animations)
- Celebration confetti & completion animations
- Progress tracker (dot states, line fill)
- Onboarding screens (splash, consent, preview)
- Utility animations (fadeInOut, slideUp, scaleIn)

**Usage:** Import variants and apply to motion components
```jsx
import { voiceWaveformVariants } from '../../../lib/scanner/animations';

<motion.div variants={voiceWaveformVariants} animate={isActive ? 'speaking' : 'idle'} />
```

### 2. Sound Manager (`website/src/lib/scanner/sounds.js`)
**Synthetic sound effects (no external files):**

- Countdown ticks (800Hz oscillator)
- Capture shutter (white noise burst)
- Success tones (C-E-G melody)
- Transition whoosh (frequency sweep)
- Complete chime (C-E-G-high C)
- Error/warning tones

**Usage:** Initialize on first user interaction, then play sounds
```jsx
import { soundManager, SCANNER_SOUNDS } from '../../../lib/scanner/sounds';

// On first button click
await soundManager.init();

// Play sound
soundManager.play(SCANNER_SOUNDS.CAPTURE);
```

### 3. Voice Coach Hook (`website/src/components/scanner/hooks/useVoiceCoach.js`)
**Natural voice guidance with state tracking:**

- `speak(message)` - Speak with timing info
- `speakNatural(message, variableEncouragement)` - Add random encouragement
- `speakSequence(messages, delay)` - Speak multiple messages
- `speakFeedback(message)` - High-priority interrupting feedback
- State: `isPlaying`, `currentMessage`, `progress`, `duration`

**Usage:**
```jsx
import { useVoiceCoach } from './hooks/useVoiceCoach';

const voice = useVoiceCoach(voiceEnabled);

// Speak naturally with variation
voice.speakNatural("Turn to face your right shoulder");

// Check if speaking
if (voice.isPlaying) {
  // Show waveform animation
}
```

### 4. Scanner Flow Hook (`website/src/components/scanner/hooks/useScannerFlow.js`)
**Orchestrates entire scanner experience:**

- Phase management (splash → preview → consent → scanning → analyzing → results)
- Scan state machine (positioning → countdown → capturing → validating → captured_ok)
- Auto-advance logic (no manual "Next" buttons)
- Voice guidance integration
- Sound effect triggering
- Progress tracking (0-100%)

**Usage:**
```jsx
import { useScannerFlow } from './hooks/useScannerFlow';

const scanner = useScannerFlow({
  sessionToken,
  onCaptureComplete: (captures) => console.log('All captured'),
  onAnalysisComplete: (results) => console.log('Results ready'),
  voiceEnabled: true,
});

// Current phase
scanner.phase // 'scanning', 'analyzing', etc.

// Current position
scanner.currentPosition // SCAN_POSITIONS[0], [1], [2]

// Actions
scanner.handleConsentAccept();
scanner.startCountdown();
scanner.handleValidationSuccess(captureData);
```

### 5. Voice Coach Overlay Component (`website/src/components/scanner/overlays/VoiceCoachOverlay.jsx`)
**Ambient voice indicator replacing chat bubbles:**

- 5-bar waveform animation (synced to voice state)
- Minimal auto-hiding text (4s fade)
- Voice toggle button (top-right)
- Drop shadow for readability

**Usage:**
```jsx
import VoiceCoachOverlay from './overlays/VoiceCoachOverlay';

<VoiceCoachOverlay
  isActive={voice.isPlaying}
  currentMessage={voice.currentMessage}
  voiceEnabled={voiceEnabled}
  onToggleVoice={() => setVoiceEnabled(v => !v)}
/>
```

---

## 🔨 TO IMPLEMENT: Web Platform Components

### Component Hierarchy

```
src/components/scanner/
├── DentalScanExperience.jsx          ⭐ NEW (main entry)
├── shell/
│   ├── ScannerShell.jsx              ⭐ NEW (full-screen container)
│   └── CameraViewport.jsx            ⭐ NEW (MediaPipe + camera)
├── overlays/
│   ├── VoiceCoachOverlay.jsx         ✅ DONE
│   ├── PositionGuideOverlay.jsx      🔄 REFACTOR (reuse existing)
│   ├── CountdownOverlay.jsx          🔄 REFACTOR
│   └── ValidationFeedback.jsx        ⭐ NEW
├── effects/
│   ├── CaptureFlash.jsx              ⭐ NEW
│   ├── TransitionWipe.jsx            ⭐ NEW
│   └── Celebration.jsx               ⭐ NEW
├── flows/
│   ├── SplashScreen.jsx              ⭐ NEW
│   ├── PositionPreview.jsx           ⭐ NEW
│   ├── ConsentScreen.jsx             ⭐ NEW
│   └── PostScanReview.jsx            ⭐ NEW
└── hooks/
    ├── useVoiceCoach.js              ✅ DONE
    ├── useScannerFlow.js             ✅ DONE
    └── useCaptureEffects.js          ⭐ NEW
```

### Implementation Priority

#### 1. Main Entry Point (DentalScanExperience.jsx)

```jsx
/**
 * DentalScanExperience - Immersive medical scanner (replaces DentalScanChatbot)
 * Full-screen scanner experience with voice guidance
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScannerFlow } from './hooks/useScannerFlow';
import ScannerShell from './shell/ScannerShell';
import SplashScreen from './flows/SplashScreen';
import PositionPreview from './flows/PositionPreview';
import ConsentScreen from './flows/ConsentScreen';
import PostScanReview from './flows/PostScanReview';

export default function DentalScanExperience({
  sessionToken,
  onClose,
  onNavigateToClinic,
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const scanner = useScannerFlow({
    sessionToken,
    voiceEnabled,
    onCaptureComplete: (captures) => {
      console.log('Captured all positions:', captures);
    },
    onAnalysisComplete: (results) => {
      console.log('Analysis complete:', results);
    },
  });

  // Render current phase
  return (
    <AnimatePresence mode="wait">
      {scanner.phase === scanner.SCANNER_PHASES.SPLASH && (
        <SplashScreen key="splash" />
      )}

      {scanner.phase === scanner.SCANNER_PHASES.POSITION_PREVIEW && (
        <PositionPreview key="preview" />
      )}

      {scanner.phase === scanner.SCANNER_PHASES.CONSENT && (
        <ConsentScreen
          key="consent"
          onAccept={scanner.handleConsentAccept}
          onDecline={scanner.handleConsentDecline}
        />
      )}

      {scanner.phase === scanner.SCANNER_PHASES.SCANNING && (
        <ScannerShell
          key="scanning"
          scanner={scanner}
          voiceEnabled={voiceEnabled}
          onToggleVoice={() => setVoiceEnabled(v => !v)}
        />
      )}

      {(scanner.phase === scanner.SCANNER_PHASES.RESULTS ||
        scanner.phase === scanner.SCANNER_PHASES.ANALYZING) && (
        <PostScanReview
          key="results"
          scanner={scanner}
          onClose={onClose}
          onNavigateToClinic={onNavigateToClinic}
        />
      )}
    </AnimatePresence>
  );
}
```

#### 2. Scanner Shell (shell/ScannerShell.jsx)

```jsx
/**
 * ScannerShell - Full-screen immersive scanner container
 * Houses camera viewport + all HUD overlays
 */

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { shellVariants } from '../../lib/scanner/animations';
import CameraViewport from './CameraViewport';
import VoiceCoachOverlay from '../overlays/VoiceCoachOverlay';
import PositionGuideOverlay from '../overlays/PositionGuideOverlay';
import CountdownOverlay from '../overlays/CountdownOverlay';
import ValidationFeedback from '../overlays/ValidationFeedback';
import ProgressTracker from '../overlays/ProgressTracker';
import CaptureFlash from '../effects/CaptureFlash';
import TransitionWipe from '../effects/TransitionWipe';
import Celebration from '../effects/Celebration';

export default function ScannerShell({ scanner, voiceEnabled, onToggleVoice }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      variants={shellVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Progress Rail (top) */}
      <ProgressTracker
        currentPosition={scanner.currentPositionIndex}
        captures={scanner.captures}
      />

      {/* Camera Viewport (center) */}
      <div className="relative flex-1 overflow-hidden">
        <CameraViewport
          ref={videoRef}
          canvasRef={canvasRef}
          scanner={scanner}
        />

        {/* HUD Overlays (layered on top) */}
        <VoiceCoachOverlay
          isActive={scanner.isVoiceActive}
          currentMessage={scanner.voiceMessage}
          voiceEnabled={voiceEnabled}
          onToggleVoice={onToggleVoice}
        />

        {(scanner.scanState === scanner.SCAN_STATES.POSITIONING ||
          scanner.scanState === scanner.SCAN_STATES.COUNTDOWN) && (
          <PositionGuideOverlay position={scanner.currentPosition} />
        )}

        {scanner.scanState === scanner.SCAN_STATES.COUNTDOWN && (
          <CountdownOverlay
            seconds={3}
            onComplete={scanner.capturePhoto}
          />
        )}

        {scanner.validationFeedback && (
          <ValidationFeedback message={scanner.validationFeedback} />
        )}

        {/* Capture Effects */}
        {scanner.scanState === scanner.SCAN_STATES.CAPTURED_OK && (
          <CaptureFlash
            toothCount={scanner.captures[scanner.captures.length - 1]?.detectedTeeth?.length}
          />
        )}

        {scanner.scanState === scanner.SCAN_STATES.TRANSITIONING && (
          <TransitionWipe />
        )}

        {scanner.phase === scanner.SCANNER_PHASES.COMPLETE && (
          <Celebration />
        )}
      </div>

      {/* Status Bar (bottom) */}
      {scanner.scanState === scanner.SCAN_STATES.POSITIONING && scanner.currentPosition && (
        <div className="bg-black/80 backdrop-blur-sm px-6 py-4 text-center">
          <p className="text-cyan-400 text-sm font-semibold uppercase tracking-wider">
            {scanner.currentPosition.label}
          </p>
          <p className="text-white/50 text-xs mt-1">
            {scanner.currentPosition.voiceInstruction.split('.')[0]}
          </p>
        </div>
      )}
    </motion.div>
  );
}
```

#### 3. Splash Screen (flows/SplashScreen.jsx)

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { splashVariants } from '../../lib/scanner/animations';

export default function SplashScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gradient-to-br from-cyan-950 via-black to-black flex flex-col items-center justify-center"
      variants={splashVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="relative"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 150, damping: 20 }}
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-6">
          <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          AI Dental Scanner
        </h1>
        <p className="text-white/60 text-sm text-center">
          Powered by advanced AI technology
        </p>

        {/* Loading spinner */}
        <motion.div
          className="mt-8 w-8 h-8 mx-auto border-2 border-cyan-400 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  );
}
```

#### 4. Consent Screen (flows/ConsentScreen.jsx)

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { consentButtonVariants } from '../../lib/scanner/animations';
import { Shield } from 'lucide-react';

export default function ConsentScreen({ onAccept, onDecline }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gradient-to-b from-black via-slate-950 to-black flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="max-w-md w-full bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-cyan-400" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-4">
          Privacy & Consent
        </h2>

        <div className="space-y-3 mb-8">
          <p className="text-white/70 text-sm leading-relaxed">
            By proceeding, you agree that:
          </p>
          <ul className="space-y-2 text-white/60 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">✓</span>
              <span>Your dental images will be analyzed by AI for preliminary observations only</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">✓</span>
              <span>This is not a professional diagnosis — always consult a dentist</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">✓</span>
              <span>Your data is encrypted and stored securely for 30 days</span>
            </li>
          </ul>
        </div>

        <motion.button
          onClick={onAccept}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-base mb-3 cursor-pointer"
          variants={consentButtonVariants}
          initial="idle"
          whileHover="hover"
          whileTap="tap"
        >
          I Consent — Start Scan
        </motion.button>

        <button
          onClick={onDecline}
          className="w-full py-3 text-white/50 text-sm hover:text-white/70 transition cursor-pointer"
        >
          No Thanks
        </button>
      </motion.div>
    </motion.div>
  );
}
```

---

## 🔨 TO IMPLEMENT: Mobile Platform Components

### Component Hierarchy (React Native)

```
BestoClinicMobile/src/components/scanner/
├── DentalScanExperience.tsx          ⭐ NEW (main entry)
├── shell/
│   ├── ScannerShell.tsx              ⭐ NEW
│   └── CameraViewport.tsx            ⭐ NEW
├── overlays/
│   ├── VoiceCoachOverlay.tsx         ⭐ NEW
│   ├── PositionGuideOverlay.tsx      🔄 REFACTOR (reuse from ImmersiveScannerView)
│   ├── CountdownOverlay.tsx          🔄 REFACTOR
│   └── ValidationFeedback.tsx        ⭐ NEW
├── effects/
│   ├── CaptureFlash.tsx              ⭐ NEW
│   ├── HapticFeedback.ts             ⭐ NEW
│   └── TransitionWipe.tsx            ⭐ NEW
└── hooks/
    ├── useVoiceCoach.ts              ⭐ NEW (port from web)
    ├── useScannerFlow.ts             ⭐ NEW (port from web)
    └── useCaptureEffects.ts          ⭐ NEW
```

### Mobile-Specific Libraries Needed

```bash
# Animation library
npm install react-native-reanimated

# Haptic feedback
npm install expo-haptics

# Sound effects
npm install react-native-sound

# Already installed
# - react-native-vision-camera
# - react-native-tts
```

### Mobile Implementation Guide

#### 1. Haptic Feedback (lib/scanner/haptics.ts)

```typescript
/**
 * Haptic Feedback Patterns for Medical Scanner
 */

import * as Haptics from 'expo-haptics';

export const hapticPatterns = {
  // Countdown tick
  tick: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  // Final countdown
  countdownFinal: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  // Capture moment
  capture: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      150
    );
  },

  // Success feedback
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  // Error feedback
  error: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  // Warning
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};

export const triggerHaptic = (pattern: keyof typeof hapticPatterns) => {
  try {
    hapticPatterns[pattern]();
  } catch (error) {
    console.warn('[Haptics] Error:', error);
  }
};
```

#### 2. Voice Coach Overlay (Mobile)

```typescript
/**
 * VoiceCoachOverlay (React Native)
 * Animated voice waveform with minimal text
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export default function VoiceCoachOverlay({
  isActive,
  currentMessage,
  voiceEnabled,
  onToggleVoice,
  colors,
}) {
  const waveformAnims = useRef([...Array(5)].map(() => new Animated.Value(0.3))).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  // Animate waveform when speaking
  useEffect(() => {
    if (isActive) {
      const animations = waveformAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 600,
              delay: i * 100,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        )
      );
      animations.forEach(a => a.start());

      return () => animations.forEach(a => a.stop());
    } else {
      waveformAnims.forEach(anim => anim.setValue(0.3));
    }
  }, [isActive, waveformAnims]);

  // Animate text (show 4s, then fade out)
  useEffect(() => {
    if (currentMessage) {
      Animated.sequence([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(3400),
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentMessage, textOpacity]);

  return (
    <View style={styles.container}>
      {/* Waveform */}
      <View style={styles.waveform}>
        {waveformAnims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: colors.primary,
                transform: [{ scaleY: anim }],
              },
            ]}
          />
        ))}
      </View>

      {/* Text */}
      {currentMessage && (
        <Animated.Text
          style={[
            styles.text,
            { opacity: textOpacity },
          ]}
        >
          {currentMessage}
        </Animated.Text>
      )}

      {/* Voice toggle */}
      <TouchableOpacity
        onPress={onToggleVoice}
        style={styles.toggleBtn}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={voiceEnabled ? 'volume-high' : 'volume-off'}
          size={20}
          color="#fff"
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  waveform: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  bar: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
    maxWidth: '90%',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  toggleBtn: {
    position: 'absolute',
    top: 0,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

---

## 🚀 IMPLEMENTATION STEPS

### Web Platform

1. **Create remaining overlay components** (Position Guide, Countdown, Validation Feedback)
   - Reuse existing overlay components from `website/src/components/chatbot/scanner/`
   - Apply new animation variants from `animations.js`

2. **Create effect components** (Capture Flash, Transition Wipe, Celebration)
   - Use Framer Motion with variants from `animations.js`
   - Trigger sounds via `soundManager`

3. **Create flow screens** (Splash, Position Preview, Post-Scan Review)
   - Follow design in implementation guide above
   - Apply animations for smooth transitions

4. **Build Scanner Shell** (main full-screen container)
   - Integrate all overlays and effects
   - Wire up scanner flow state machine
   - Handle camera viewport

5. **Create main entry** (DentalScanExperience.jsx)
   - Replace DentalScanChatbot.jsx usage
   - Phase-based rendering with AnimatePresence

6. **Update app entry point**
   ```jsx
   // In website/src/App.jsx or wherever chatbot is mounted
   import DentalScanExperience from './components/scanner/DentalScanExperience';

   // Replace <DentalScanChatbot /> with:
   <DentalScanExperience
     sessionToken={sessionToken}
     onClose={() => setShowScanner(false)}
     onNavigateToClinic={() => navigate('/clinics')}
   />
   ```

### Mobile Platform

1. **Port hooks to TypeScript**
   - Copy `useVoiceCoach.js` → `useVoiceCoach.ts` (replace Web Speech API with react-native-tts)
   - Copy `useScannerFlow.js` → `useScannerFlow.ts` (adapt for React Native)

2. **Create haptic feedback utility** (`lib/scanner/haptics.ts`)
   - Use expo-haptics
   - Define patterns for all scanner events

3. **Create mobile overlays**
   - Port VoiceCoachOverlay to React Native (use Animated API)
   - Reuse/refactor existing overlays from ImmersiveScannerView

4. **Build Scanner Shell** (React Native)
   - Use SafeAreaView
   - Integrate react-native-vision-camera
   - Layer all overlays

5. **Create main entry** (DentalScanExperience.tsx)
   - Replace DentalScanWidget.tsx usage
   - Phase-based rendering

6. **Update app entry point**
   ```typescript
   // In BestoClinicMobile/src/App.tsx or navigation
   import DentalScanExperience from './components/scanner/DentalScanExperience';

   // Replace <DentalScanWidget /> with:
   <DentalScanExperience
     sessionToken={sessionToken}
     onClose={() => navigation.goBack()}
     onNavigateToClinic={() => navigation.navigate('ClinicSearch')}
   />
   ```

---

## 🎨 DESIGN TOKENS

### Colors (Medical Scanner Theme)

```javascript
const scannerColors = {
  background: '#0B0E11',        // Deep black
  viewport: '#000000',          // Pure black
  overlay: 'rgba(0,0,0,0.4)',

  // Medical cyan
  primary: '#00E5FF',
  primaryGlow: 'rgba(0,229,255,0.3)',

  // Text
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};
```

### Typography

```javascript
const scannerTypography = {
  voice: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hud: {
    fontSize: '14px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#00E5FF',
  },
  caption: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
};
```

---

## 📊 TESTING CHECKLIST

### Functional Tests

- [ ] Splash screen auto-advances after 2s
- [ ] Position preview animates all 3 positions
- [ ] Consent accept/decline works
- [ ] Voice plays on each position
- [ ] Voice toggle mutes/unmutes
- [ ] Countdown triggers capture
- [ ] Capture flash shows tooth count
- [ ] Auto-advances between positions (no manual buttons)
- [ ] All 3 positions captured
- [ ] Transitions to analysis phase
- [ ] Results screen displays

### Visual Tests

- [ ] Waveform animates when voice is active
- [ ] Text auto-hides after 4s
- [ ] Countdown ring fills clockwise
- [ ] Capture flash is visible
- [ ] Success checkmark springs in
- [ ] Position transitions are smooth
- [ ] Confetti appears on completion

### Audio Tests

- [ ] Sound effects play at correct times
- [ ] Voice TTS sounds natural
- [ ] No audio overlap
- [ ] Sounds respect volume setting

### Performance Tests

- [ ] Camera initializes in <2s
- [ ] No dropped frames during animations
- [ ] Memory usage <150MB (mobile)
- [ ] Battery impact <5% for full scan (mobile)

---

## 🐛 TROUBLESHOOTING

### Voice not playing
- Check browser autoplay policy (require user gesture)
- Initialize `soundManager.init()` on first user click
- Verify TTS engine available

### Animations stuttering
- Use `useNativeDriver: true` (React Native)
- Apply `will-change: transform` (Web)
- Reduce animation complexity

### Camera black screen
- Check camera permissions
- Verify `getUserMedia()` support
- Test with `facingMode: 'user'`

### State machine stuck
- Check `useScannerFlow` console logs
- Verify phase transitions have timers/callbacks
- Test auto-advance logic

---

## 📝 NEXT STEPS

1. **Complete web components** (ScannerShell, flow screens, effects)
2. **Test web implementation** end-to-end
3. **Port to mobile** (TypeScript + React Native APIs)
4. **Test mobile implementation** on real devices
5. **Polish animations and timing**
6. **Add analytics tracking**
7. **Deploy to production** with feature flag

---

## 🎯 SUCCESS METRICS

### User Experience
- Scan completion time: **<60 seconds** (down from 90s)
- Completion rate: **>80%**
- Voice clarity rating: **>4/5**
- Users who disable voice: **<15%**

### Technical Performance
- Camera init: **<2s**
- Frame rate: **30fps** (no drops)
- Memory usage: **<150MB** (mobile)
- API latency: **<1s** per validation

---

## 💡 KEY DESIGN PRINCIPLES

1. **Scanner is the hero** - Full-screen, immersive, medical-grade
2. **Voice is primary** - Natural coaching, minimal text
3. **Zero-stop flow** - Auto-advance, no manual buttons
4. **Clinical polish** - Professional feel, premium animations
5. **Micro-interactions** - Haptics, sounds, visual feedback

---

This guide provides the complete foundation and roadmap for transforming the dental scan experience from a chatbot into a professional medical scanner. All core utilities and hooks are implemented—now build the UI components following the patterns above!
