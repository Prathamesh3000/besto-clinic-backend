# BestoClinic Chatbot - Final Design Specification

**Date:** April 2026
**Status:** Approved - Ready for Implementation
**Purpose:** Professional B2B SaaS chatbot for AI Dental Scan + Find Nearby Doctors

---

## ✅ Design Decisions (All 25 Questions Answered)

### **SECTION 1: CORE ARCHITECTURE**

**Q1. Modal Size:** Adaptive Responsive
- Desktop: 700px × 800px centered
- Tablet: 90% viewport
- Mobile: Full-screen takeover

**Q2. Mobile Behavior:** Full-screen takeover
- 100% screen coverage, immersive experience
- Back button or X to close

**Q3. Widget Trigger:** Pill button with text
- ~140px × 50px rounded rectangle
- Icon + "Chat with AI" or "Scan Your Teeth" text
- Bottom-right corner, floating

**Q4. Widget Features:** Notification badge
- Red dot for unread messages
- No pulse animation
- No custom text per clinic

**Q5. Mode Selection:** Two large cards
- Visual cards with icons, titles, descriptions
- User clicks a card to select mode
- Options: "🦷 AI Dental Scan" and "🔍 Find Doctors"

**Q6. Color Scheme:** Soft gray mode
- Background: #F8F9FA (light gray)
- Cards: #FFFFFF (white)
- Subtle shadows for depth
- Brand colors (#4ca626 green, #2e5fa2 blue) for CTAs and accents

**Q7. Voice Activation:** Ask permission first
- Show prompt: "🔊 Voice guidance improves scan accuracy. Enable voice?"
- User chooses Yes/No
- Remember preference for future visits

**Q8. Voice Control:** Header button (top-right)
- Next to close button in modal header
- Speaker icon to mute/unmute
- Part of standard controls

---

### **SECTION 2: VISUAL DESIGN**

**Q9. Typography:** Inter + Plus Jakarta Sans
- Body text: Inter (already loaded!)
- Headings: Plus Jakarta Sans (already loaded!)
- Professional SaaS standard

**Q10. Component Style:** Soft elevation
- Subtle shadows: `0 2px 8px rgba(0,0,0,0.08)`
- Border radius: 8-12px
- Professional depth without being heavy

**Q11. Button Style:** Soft squared
- Border radius: 10-12px
- Not too round, not too square
- Professional middle ground

**Q12. Progress Indicator:** Progress dots
- Circles for each step
- Filled = complete, Outlined = current, Empty = pending
- Clean and unobtrusive

---

### **SECTION 3: INTERACTION PATTERNS**

**Q13. Consent Screen:** Checkbox + brief terms
- 3-4 bullet points about scan:
  - Photo capture (3 angles)
  - AI analysis
  - HIPAA compliance
- Checkbox: "I consent to dental image capture and analysis"
- Button enabled only after check

**Q14. Camera Display:** Camera in modal
- Camera stays within modal bounds
- Centered within the 700×800px desktop modal
- Maintains consistent design pattern

**Q15. Position Feedback:** Color border
- Green border = good position, ready to capture
- Yellow border = adjusting, keep moving
- Red border = incorrect position
- Simple and intuitive visual feedback

**Q16. Capture Method:** Hybrid (auto + manual)
- Auto-capture: 3-second countdown when positioned correctly
- Manual: "Capture Now" button always available
- Best of both worlds - hands-free with user control option

**Q17. Results Display:** Dental chart + observations
- Visual tooth diagram with issues highlighted
- Observation cards below chart
- Each observation: type, tooth numbers, description, severity

**Q18. Doctor Cards:** Vertical list
- Scrollable list showing all recommended doctors
- Each card: Photo, name, rating, specialty, distance, "View Profile" button
- Easy comparison, clean layout

**Q19. Loading State:** Step-by-step status
- During 15-30s AI analysis:
  - "Detecting teeth... ✓"
  - "Analyzing cavities... ✓"
  - "Checking gum health... ✓"
  - "Generating report... ✓"
- Feels faster, engaging

**Q20. Error Handling:** Inline error + retry
- ⚠️ "Image quality too low. Please try again."
- [Retry Scan] button
- Clear and actionable

---

### **SECTION 4: TECHNICAL DETAILS**

**Q21. Modal Rendering:** Lazy load
- Component loads only when widget clicked
- Faster initial page load
- Slight delay on first open acceptable

**Q22. Image Quality:** Medium (1280×720)
- Balanced: good AI accuracy, reasonable file size
- ~200-400KB per image
- Best middle ground for performance and quality

**Q23. Multi-Tenant Branding:** BestoClinic branding only
- Generic branding for all clinics
- No per-clinic customization
- Consistent experience across all tenants
- Simpler to maintain

**Q24. Export Options:** 3 methods (multi-select)
- Download PDF (with BestoClinic branding)
- Email results (send PDF to user email)
- Share link (unique URL to view online)

**Q25. Analytics:** Conversion funnel
- Track: Mode selected → Consent accepted → Scan completed → Results viewed → Doctor clicked → Appointment intent
- Focus on business metrics and drop-off points
- Privacy-conscious, no heatmaps or mouse tracking

---

## 🎨 Design System Summary

### Colors
```css
/* Backgrounds */
--bg-primary: #F8F9FA;        /* Main background */
--bg-card: #FFFFFF;           /* Cards, elevated surfaces */

/* Brand Colors */
--brand-green: #4ca626;       /* Primary CTA */
--brand-blue: #2e5fa2;        /* Secondary CTA */

/* Text */
--text-primary: #1A1A1A;      /* Headings, important text */
--text-secondary: #6B7280;    /* Body text */
--text-tertiary: #9CA3AF;     /* Captions, hints */

/* Feedback */
--success: #10B981;           /* Green border, success states */
--warning: #F59E0B;           /* Yellow border, warnings */
--error: #EF4444;             /* Red border, errors */

/* Borders & Shadows */
--border: #E5E7EB;
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 2px 8px rgba(0,0,0,0.08);
--shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
```

### Typography
```css
/* Font Families */
--font-body: 'Inter', sans-serif;
--font-heading: 'Plus Jakarta Sans', sans-serif;

/* Font Sizes */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;

/* Font Weights */
--weight-normal: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
```

### Spacing
```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

### Border Radius
```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-pill: 24px;
```

---

## 📐 Component Specifications

### Widget Button
```
Size: 140px × 50px
Border radius: 25px (pill shape)
Background: Brand green (#4ca626)
Text: "Chat with AI" or "Scan Your Teeth"
Icon: 💬 or 🦷 (20px, left of text)
Position: Fixed bottom-right (24px from edges)
Shadow: 0 4px 12px rgba(76, 166, 38, 0.3)
Notification badge: 12px red circle, top-right of button
```

### Modal Container
**Desktop/Tablet:**
```
Width: 700px (desktop), 90% (tablet)
Height: 800px (desktop), 85% (tablet)
Background: #FFFFFF
Border radius: 16px
Shadow: 0 20px 25px rgba(0,0,0,0.15)
Position: Fixed, centered
Backdrop: rgba(0, 0, 0, 0.5) with 8px blur
```

**Mobile:**
```
Width: 100vw
Height: 100vh
Border radius: 0
Full-screen takeover
```

### Modal Header
```
Height: 64px
Background: #FFFFFF
Border bottom: 1px solid #E5E7EB
Padding: 0 24px

Left: [Clinic logo if available] or "BestoClinic"
Center: Current step indicator (optional)
Right: [Voice button] [Close X button]

Voice button: 40px circle, transparent bg, speaker icon
Close button: 40px circle, transparent bg, X icon
```

### Mode Selection Cards
```
Container: Grid 2 columns, gap 16px
Padding: 24px

Each card:
  Width: 100% (responsive)
  Height: 200px
  Background: #FFFFFF
  Border: 2px solid #E5E7EB
  Border radius: 12px
  Padding: 24px
  Shadow: 0 2px 8px rgba(0,0,0,0.04)
  Hover: Border color → Brand green, shadow increases

  Icon: 48px, top-left
  Title: 20px, Plus Jakarta Sans, semibold
  Description: 14px, Inter, regular, text-secondary
  CTA arrow: Bottom-right, 24px
```

### Progress Dots
```
Container: Centered horizontally, top of modal
Height: 32px
Gap between dots: 12px

Each dot:
  Size: 12px diameter
  Empty state: Border 2px #E5E7EB, transparent fill
  Current state: Border 2px brand-green, transparent fill, pulse animation
  Complete state: Solid brand-green fill, white checkmark icon (8px)
```

### Camera View
```
Aspect ratio: 16:9 or 4:3 (depends on device)
Width: 90% of modal width
Height: Auto (maintain aspect ratio)
Border radius: 12px
Overflow: hidden

Position feedback border:
  Border: 4px solid
  Green: #10B981
  Yellow: #F59E0B
  Red: #EF4444
  Transition: 0.3s ease
```

### Primary Button (CTA)
```
Height: 48px
Padding: 0 24px
Border radius: 12px
Background: Brand green (#4ca626)
Color: White
Font: 16px, Plus Jakarta Sans, semibold
Shadow: 0 2px 4px rgba(76, 166, 38, 0.2)

Hover: Background → #5bc72e, shadow increases
Active: Background → #3d8520, shadow decreases
Disabled: Background → #E5E7EB, color → #9CA3AF
```

### Secondary Button
```
Same size as primary
Background: Transparent
Border: 2px solid brand-green
Color: Brand green
Other properties: Same as primary
```

---

## 🔄 User Flows

### Flow 1: AI Dental Scan (Complete)
```
1. User clicks widget button "Scan Your Teeth"
   ↓
2. Modal opens (lazy loaded, animated)
   ↓
3. Mode selection screen: Two cards shown
   - User clicks "🦷 AI Dental Scan" card
   ↓
4. Voice permission prompt (if first time)
   - "🔊 Voice guidance improves scan accuracy. Enable voice?"
   - [Yes, Enable Voice] [No, I'll Read]
   ↓
5. Consent screen
   - 3-4 bullet points about scan
   - Checkbox "I consent..."
   - [I Consent] button (enabled after check)
   ↓
6. Camera initialization
   - "Initializing camera..." loader
   - Request camera permissions
   ↓
7. Scan Position 1: LEFT SIDE
   - Voice: "Please turn your head to face your right shoulder and smile. Hold this position steady."
   - Visual: Color border (red → yellow → green as position improves)
   - When green: 3-second countdown → Auto-capture
   - OR user clicks "Capture Now" button anytime
   - Progress dots: [●] [○] [○] [○]
   ↓
8. Scan Position 2: FRONT
   - Voice: "Face the camera directly and smile wide."
   - Same color border feedback
   - Same capture logic
   - Progress dots: [●] [●] [○] [○]
   ↓
9. Scan Position 3: RIGHT SIDE
   - Voice: "Turn your head to face your left shoulder and smile."
   - Same logic
   - Progress dots: [●] [●] [●] [○]
   ↓
10. Processing screen
    - Step-by-step status updates:
      * "Detecting teeth... ✓"
      * "Analyzing cavities... ✓"
      * "Checking gum health... ✓"
      * "Generating report... ✓"
    - Progress dots: [●] [●] [●] [●]
    ↓
11. Results screen
    - Dental chart visualization (tooth diagram with highlighted issues)
    - Observation cards below:
      * "Cavity detected on tooth #14"
      * "Mild gum inflammation"
      * "Good alignment"
    - Export options: [Download PDF] [Email] [Share Link]
    ↓
12. Doctor recommendations (auto-scrolls or user scrolls)
    - "Recommended dentists near you:"
    - Vertical list of doctor cards:
      * Photo, name, rating, specialty, distance
      * [View Profile] button
    ↓
13. User clicks [View Profile] → Navigate to doctor detail
    OR
    User closes modal → Analytics: "Scan complete, no appointment intent"
```

### Flow 2: Find Nearby Doctors (Simplified)
```
1. User clicks widget button
   ↓
2. Modal opens → Mode selection
   ↓
3. User clicks "🔍 Find Doctors" card
   ↓
4. Search form:
   - Location input (auto-detect or manual)
   - Specialty dropdown (General, Orthodontist, Endodontist, etc.)
   - [Search] button
   ↓
5. Loading: "Finding dentists near you..."
   ↓
6. Results: Vertical list of doctor cards
   - Same card design as scan results
   ↓
7. User clicks [View Profile] → Doctor detail
```

---

## 🔊 Voice Scripts (Professional Clinical Tone)

### Consent
- **Intro:** "Welcome to BestoClinic's dental AI scanner. Please review and accept the consent terms to begin."
- **After consent:** "Thank you. We will now scan three angles of your teeth. This will take approximately 30 seconds."

### Scanning
- **Position LEFT:** "Please turn your head to face your right shoulder and smile. Hold this position steady."
- **Countdown:** "Three. Two. One. Capture."
- **Success:** "Left side captured successfully."
- **Transition:** "Moving to front view."

- **Position FRONT:** "Face the camera directly and smile wide."
- **Countdown:** "Three. Two. One. Capture."
- **Success:** "Front captured successfully."
- **Transition:** "Moving to right side."

- **Position RIGHT:** "Turn your head to face your left shoulder and smile."
- **Countdown:** "Three. Two. One. Capture."
- **Success:** "Right side captured successfully."

### Processing
- **Start:** "All images captured. Analyzing your dental health. This will take approximately 20 seconds."

### Results
- **Complete:** "Analysis complete. Your results are ready."

### Errors
- **Poor quality:** "Image quality is too low. Please adjust your lighting and try again."
- **Camera error:** "Unable to access camera. Please check your browser permissions."
- **AI error:** "We encountered an issue processing your scan. Please try again."

---

## 📊 Analytics Events (Conversion Funnel)

```javascript
// Event structure
{
  event: 'chatbot_event',
  category: 'Chatbot',
  action: 'action_name',
  label: 'additional_context',
  timestamp: Date.now(),
  sessionId: 'uuid',
  userId: 'user_id_if_available'
}
```

### Events to Track

1. **chatbot_widget_clicked**
   - When: User clicks widget button
   - Label: Entry page URL

2. **chatbot_modal_opened**
   - When: Modal finishes opening animation
   - Label: Mode selection screen shown

3. **chatbot_mode_selected**
   - When: User clicks mode card
   - Label: 'dental_scan' or 'find_doctors'

4. **voice_permission_response**
   - When: User responds to voice permission prompt
   - Label: 'enabled' or 'disabled'

5. **consent_accepted**
   - When: User checks consent and clicks "I Consent"
   - Label: 'dental_scan_consent'

6. **scan_position_captured**
   - When: Each position captured
   - Label: 'left' or 'front' or 'right'
   - Additional: capture_method ('auto' or 'manual')

7. **scan_completed**
   - When: All 3 positions captured
   - Label: total_time_seconds

8. **scan_failed**
   - When: User cancels or error occurs
   - Label: reason ('user_cancelled', 'camera_error', 'quality_error')

9. **results_viewed**
   - When: Results screen shown
   - Label: Number of observations found

10. **results_exported**
    - When: User exports results
    - Label: 'pdf_download', 'email', or 'share_link'

11. **doctor_clicked**
    - When: User clicks "View Profile" on doctor card
    - Label: doctor_id, source ('scan_results' or 'direct_search')

12. **chatbot_modal_closed**
    - When: User closes modal
    - Label: Last screen viewed (e.g., 'mode_selection', 'scanning', 'results')
    - Additional: time_spent_seconds

### Drop-off Points to Monitor
- Mode selection → Consent (user leaves before consenting)
- Consent → Position 1 (camera issues, user scared)
- Position 1 → Position 2 (user gives up mid-scan)
- Position 2 → Position 3 (same)
- Results → Doctor clicked (user sees results but doesn't explore doctors)
- Doctor clicked → Appointment (user views profile but doesn't book)

---

## 🚀 Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Create design system CSS file (`chatbotDesignSystem.css`)
- [ ] Build widget button component (`ChatbotWidget.jsx`)
- [ ] Build modal shell with header/footer (`ChatbotModal.jsx`)
- [ ] Implement lazy loading with React.lazy
- [ ] Add responsive breakpoints (mobile, tablet, desktop)
- [ ] Implement modal open/close animations

### Phase 2: Mode Selection & Navigation (Week 1-2)
- [ ] Build mode selection screen (`ModeSelection.jsx`)
- [ ] Build two card components with hover states
- [ ] Implement routing/state management for modes
- [ ] Add progress dots component (`ProgressDots.jsx`)
- [ ] Wire up analytics for mode selection

### Phase 3: Dental Scan Flow (Week 2-3)
- [ ] Build consent screen (`ConsentScreen.jsx`)
- [ ] Build voice permission prompt component
- [ ] Build camera view component (`CameraView.jsx`)
- [ ] Implement color border feedback (green/yellow/red)
- [ ] Build countdown overlay component
- [ ] Implement auto-capture + manual capture logic
- [ ] Build step-by-step loading screen (`ScanAnalysisLoader.jsx`)
- [ ] Integrate with Puter.js TTS for voice guidance
- [ ] Wire up all voice scripts

### Phase 4: Results & Recommendations (Week 3-4)
- [ ] Build dental chart visualization (`DentalChart.jsx`)
- [ ] Build observation cards component (`ObservationCard.jsx`)
- [ ] Build doctor card component (`DoctorCard.jsx`)
- [ ] Build vertical list container for doctors
- [ ] Implement export options (PDF, Email, Share Link)
- [ ] Wire up doctor profile navigation

### Phase 5: Find Doctors Flow (Week 4)
- [ ] Build search form component (`DoctorSearchForm.jsx`)
- [ ] Implement location input (auto-detect + manual)
- [ ] Implement specialty dropdown
- [ ] Build search results screen
- [ ] Reuse doctor card component
- [ ] Wire up search API integration

### Phase 6: Polish & Testing (Week 5)
- [ ] Add all error states and messages
- [ ] Add loading skeletons for better perceived performance
- [ ] Implement all analytics events
- [ ] Cross-browser testing (Chrome, Safari, Firefox, Edge)
- [ ] Mobile device testing (iOS Safari, Android Chrome)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Performance optimization (bundle size, lazy loading)
- [ ] Voice guidance QA on real devices

---

## 🎯 Success Metrics

### Technical Performance
- Initial widget load: < 100KB
- Modal lazy load time: < 500ms (first open)
- Modal open animation: < 300ms
- Camera initialization: < 2s
- Image capture: < 500ms
- Scan analysis (backend): 15-30s
- Results display: < 1s

### User Experience
- Modal responsive on all devices: ✓
- Voice clarity rating: > 4/5
- Scan completion rate: > 70%
- Doctor profile click rate: > 40%
- Export/share rate: > 30%

### Business Metrics
- Scan → Doctor viewed: > 60%
- Doctor viewed → Appointment intent: Track and optimize
- Mode selection distribution: Track (Scan vs Find)
- Drop-off points: Identify and address

---

## 📝 Notes

- **BestoClinic branding only** (Q23) - No per-clinic customization. All modals show generic BestoClinic branding. Simpler to maintain and consistent experience.
- **Medium image quality** (Q22) - 1280×720 is the sweet spot for AI accuracy vs file size.
- **Color border feedback** (Q15) - Simple and intuitive, better than complex visual guides that may obscure the face.
- **Hybrid capture** (Q16) - Auto-capture is great, but manual button gives users control for edge cases.
- **Dental chart + observations** (Q17) - User chose standard medical format over health score gauge.
- **Conversion funnel analytics** (Q25) - Focus on business metrics, not invasive tracking.

---

**Design approved by:** Akash Kamble
**Date:** April 20, 2026
**Ready for implementation:** ✅ YES
