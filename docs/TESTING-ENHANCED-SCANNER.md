# 🧪 Enhanced Scanner Testing Guide

**Status**: ✅ Ready for Testing
**Date**: April 2026

---

## 🚀 Quick Start

### 1. Enable Enhanced Scanner
```bash
cd website
echo "VITE_USE_ENHANCED_SCANNER=true" >> .env
npm run dev
```

### 2. Open Application
```
http://localhost:5173
```

### 3. Start Dental Scan
1. Click chatbot button (bottom right)
2. Click "Start Free Scan"
3. Accept consent
4. Enhanced scanner should load!

---

## ✅ Fixed Issues

### Issue 1: Missing Export Error ✅
**Error**: `The requested module does not provide an export named 'getCurrentPosition'`

**Fix**:
- Updated `VideoJawGuide.jsx` to import `SCAN_POSITIONS_ENHANCED` array
- Changed from `getCurrentPosition({ currentPositionIndex })` to `SCAN_POSITIONS_ENHANCED[currentPositionIndex]`
- No longer using non-existent helper function

**Files Fixed**:
- [VideoJawGuide.jsx](../website/src/components/guides/VideoJawGuide.jsx)

---

## 🎯 What to Test

### Test 1: Video Fallback (Most Important!)
Since videos don't exist yet, this will trigger immediately:

**Expected Behavior**:
1. ✅ Scanner loads successfully
2. ✅ Instead of video, see **PositionIllustrationGuide** with:
   - Animated SVG diagram (front face / side profile)
   - Step-by-step instructions (numbered 1-4)
   - Yellow tips section
   - Smooth animations
3. ✅ Progress badge shows "1 of 3", "2 of 3", "3 of 3"
4. ✅ Color-coded by position (green/blue/purple)

**How to Trigger**:
- Just start scanning - videos will fail to load automatically
- Fallback activates instantly

### Test 2: Voice Quality
**Expected Behavior**:
1. ✅ Open browser console
2. ✅ Look for log: `[VoiceGuidance] Selected premium voice: ...`
3. ✅ Voice should sound natural (not robotic)
4. ✅ Speech pace should be comfortable (0.95x rate)
5. ✅ Toggle voice button works (on/off)

**Voice Priority** (browser-dependent):
- Chrome: Google UK English Female (premium)
- Safari: Samantha (macOS premium)
- Firefox: Local voices
- Windows: Microsoft Zira

### Test 3: Complete Scan Flow
**Steps**:
1. Start scan → See illustrated guide for Position 1 (Front Smile)
2. Position guide shows:
   - Green icon (Smile)
   - "Face the camera directly"
   - 4 numbered steps
   - Tips section
3. Scanner state machine advances through positions
4. After 3 positions → Lead capture form
5. Analysis → Results

### Test 4: Responsive Design
**Test On**:
- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x667)

**Expected**:
- Illustrations scale properly
- Text remains readable
- Steps don't overflow
- Tips section visible

### Test 5: Error Handling
**Scenarios to Test**:
- Camera permission denied → Should show file upload option
- No camera available → Graceful fallback
- Network disconnected → Illustrated guide still works (offline)
- Browser compatibility → Works on all modern browsers

---

## 📊 Console Logs to Watch For

### Success Logs:
```
[VoiceGuidance] Selected premium voice: Google UK English Female
[VoiceGuidance] Speaking: Let's start with a big smile! Show me your ...
[VideoGuide] Failed to load: /videos/guides/front-smile.mp4
```
(Video fail is EXPECTED and OK - fallback handles it)

### Error Logs (Should NOT See):
```
❌ Uncaught TypeError
❌ Cannot read property ... of undefined
❌ getCurrentPosition is not a function
❌ Failed to render component
```

---

## 🎨 Visual Checklist

### Position 1: Front Smile
- [ ] Green circular icon with Smile symbol
- [ ] SVG shows front face with smile
- [ ] 4 steps clearly listed
- [ ] Yellow tips section visible
- [ ] Badge shows "1 of 3"
- [ ] Animations play smoothly

### Position 2: Left Lateral
- [ ] Blue circular icon with right arrow
- [ ] SVG shows side profile facing right
- [ ] Arrow indicator on diagram
- [ ] Steps mention "Turn head 45° to your right"
- [ ] Badge shows "2 of 3"

### Position 3: Right Lateral
- [ ] Purple circular icon with left arrow
- [ ] SVG shows side profile facing left (mirrored)
- [ ] Arrow indicator on diagram
- [ ] Steps mention "Turn head 45° to your left"
- [ ] Badge shows "3 of 3"

---

## 🐛 Known Issues & Workarounds

### Issue: Videos Don't Exist Yet
**Status**: ✅ **Not a problem!**
**Workaround**: Illustrated guide automatically shows (this is the intended fallback)

### Issue: Voice Sounds Robotic
**Status**: ✅ **Fixed!**
**Solution**: Enhanced voice system now selects premium voices
**Check**: Console should show "Selected premium voice: [name]"

### Issue: Illustrations Too Simple
**Status**: ✅ **By Design**
**Reason**: SVG diagrams are intentionally minimalist for:
- Fast loading
- Universal browser support
- Clear visual communication
- No external dependencies

---

## 🚦 Pass/Fail Criteria

### ✅ PASS If:
1. Scanner loads without errors
2. Illustrated guide displays for all 3 positions
3. Voice guidance plays (if enabled)
4. Complete scan flow works end-to-end
5. No console errors
6. Responsive on mobile/tablet/desktop

### ❌ FAIL If:
1. Scanner crashes or shows blank screen
2. Console shows "getCurrentPosition" error
3. Illustrations don't render
4. Voice doesn't initialize
5. State machine gets stuck
6. Cannot complete scan

---

## 📝 Testing Checklist

### Pre-Flight:
- [ ] Enhanced scanner enabled (`VITE_USE_ENHANCED_SCANNER=true`)
- [ ] Dev server running (`npm run dev`)
- [ ] Browser console open (F12)
- [ ] Network tab open (to see video 404s)

### Main Flow:
- [ ] Chatbot opens successfully
- [ ] "Start Free Scan" button works
- [ ] Consent screen appears
- [ ] Scanner loads (illustrated guide visible)
- [ ] Position 1 guide renders correctly
- [ ] Voice guidance plays (if supported)
- [ ] Can advance to Position 2
- [ ] Position 2 guide renders correctly
- [ ] Can advance to Position 3
- [ ] Position 3 guide renders correctly
- [ ] Lead capture form appears after all positions
- [ ] Can submit lead info
- [ ] Analysis starts
- [ ] Results display

### Edge Cases:
- [ ] Voice toggle button works
- [ ] Can disable/enable voice mid-scan
- [ ] Works with camera permission denied
- [ ] Works offline (illustrated guides)
- [ ] Mobile responsive
- [ ] Works in incognito/private mode

---

## 📞 Troubleshooting

### Problem: "getCurrentPosition is not defined"
**Solution**: ✅ Already fixed! Clear browser cache and reload.

### Problem: Voice still sounds robotic
**Solution**:
1. Check console for voice selection log
2. Try different browser (Chrome has best voices)
3. macOS users: Should use "Samantha" voice

### Problem: Illustrations don't show
**Solution**:
1. Check console for errors
2. Verify PositionIllustrationGuide.jsx exists
3. Clear browser cache
4. Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)

### Problem: Scanner stuck on loading
**Solution**:
1. Check network tab for failed requests
2. Verify sessionToken is present
3. Check backend is running
4. Review console logs

---

## 🎉 Success Criteria

**The enhanced scanner is working correctly if**:

✅ Users can complete a full scan WITHOUT videos
✅ Illustrated guides provide clear instructions
✅ Voice guidance sounds natural and helpful
✅ System gracefully handles all failure modes
✅ No console errors during normal operation
✅ Mobile experience is smooth
✅ Completion rate improves vs. old scanner

---

## 📈 Next Steps After Testing

### If Tests Pass:
1. ✅ Deploy to staging
2. 📊 Enable analytics tracking
3. 👥 Beta test with 10 users
4. 📝 Collect feedback
5. 🚀 Production rollout

### Optional Enhancements:
1. Generate actual video files (see VIDEO-QUICK-REFERENCE.md)
2. A/B test: Videos vs. Illustrations
3. Add Lottie animations for richer illustrations
4. Integrate ElevenLabs for premium AI voice
5. Multi-language support

---

**Happy Testing!** 🚀

If you encounter any issues, check:
- [ENHANCED-SCANNER-IMPROVEMENTS.md](./ENHANCED-SCANNER-IMPROVEMENTS.md) - Feature documentation
- [dental-scan-redesign/README.md](./dental-scan-redesign/README.md) - Technical design
- [VIDEO-QUICK-REFERENCE.md](./VIDEO-QUICK-REFERENCE.md) - Video generation guide
