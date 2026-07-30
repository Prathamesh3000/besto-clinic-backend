# BestoClinic — Bug Fix Plan (Grouped by Root Cause)

42 reported issues, grouped into **13 root-cause clusters**. Fixing the root cause in each cluster should resolve every bug listed under it, so we work cluster by cluster instead of bug by bug.

Status legend: ⬜ Not started · 🔧 In progress · ✅ Fixed · 🧪 Needs retest

---

## Priority order

| # | Cluster | Bugs covered | Priority | Status |
|---|---------|--------------|----------|--------|
| 1 | Permission / RBAC | #39, #40, #42 | P0 — blocks core billing/room actions | ⬜ |
| 2 | Timezone (+5:30 offset) | #18, #33 | P0 — corrupts booking & timeline data | ⬜ |
| 3 | Teleconsultation call lifecycle | #1, #2, #12, #28 | P0 — core feature broken | ⬜ |
| 4 | Teleconsultation camera/mute | #15, #19, #27 | P1 | ⬜ |
| 5 | Teleconsultation notifications | #3, #32 | P1 | ⬜ |
| 6 | Chat / messaging module | #13, #14 | P1 | ⬜ |
| 7 | Gender filter logic | #21, #22, #23 | P1 | ⬜ |
| 8 | Doctor login (email-only) | #8 | P1 | ⬜ |
| 9 | Confirm / Validation Failed actions | #5, #11, #25 | P1 | ⬜ |
| 10 | Clinic logo not rendering | #9, #10 | P2 | ⬜ |
| 11 | Invoice/Billing data & PDF | #37, #38, #41 | P2 | ⬜ |
| 12 | Dashboard counts/data not loading | #24, #29, #34, #35 | P2 | ⬜ |
| 13 | Misc UI-only issues | #26, #30, #36 | P3 | ⬜ |
| — | Investigate separately (unclear root cause yet) | #6, #7, #16, #20, #31 | P2 | ⬜ |

---

## Cluster detail

### 1. Permission / RBAC — P0
**Bugs:** #39 (add room → "Missing required permission"), #40 (Record Payment → "Missing required permission(s): payment:create"), #42 (Overview/Branch Monitor/Rooms permission issue)
**Hypothesis:** A specific role (Doctor and/or Admin) is missing permission grants — likely a seed data or role-permission mapping gap, not a per-endpoint bug. Report Chapter 14.2 (RBAC) and 14.3 (Role Hierarchy) describe the expected model.
**Investigate:**
- Pull the role's permission list from DB (or seed script) and check for `payment:create`, `room:create`, and whatever permission gates Branch Monitor.
- Check whether this is a data problem (role doc missing scopes) vs. code problem (wrong permission key checked in middleware).

### 2. Timezone (+5:30 offset) — P0
**Bugs:** #18 (booked 10:00 AM shows as 3:30 PM), #33 (checked in 12:14 PM but timeline shows 11:35 AM)
**Hypothesis:** Classic UTC/IST double-conversion — a value already in IST is being treated as UTC (or vice versa) somewhere between frontend, API, and DB storage. One fix in the shared date-handling utility likely resolves both.
**Investigate:**
- Find where appointment times are formatted/parsed on both frontend (probably `dayjs`/`date-fns`/native `Date`) and backend.
- Check whether Mongo stores UTC (expected) and whether frontend is adding IST offset on top of an already-local value.

### 3. Teleconsultation call lifecycle — P0
**Bugs:** #1 (Audio/Video + End Session not working, chat "Validation Failed"), #2 (call doesn't auto-end, manual return required), #12 (End Call button not working), #28 (doctor side stuck on "Connecting" after patient leaves)
**Hypothesis:** WebSocket/signaling event for call-end isn't propagating both directions, and end-call handlers may be wired to dead/incorrect refs. Report Chapter 10.2 (Telemedicine & Video Calling) has the intended architecture — worth checking against `src/websocket` and the video call component.
**Investigate:**
- Confirm the `call-ended`/`session-ended` WebSocket event is emitted and *listened to* on both patient and doctor clients.
- Check button handlers actually call the disconnect function (not just closing a modal).

### 4. Teleconsultation camera/mute — P1
**Bugs:** #15 (camera not working, patient side), #19 (mic click shows wrong doctor name in mute indicator), #27 (same camera layout issue, doctor side)
**Hypothesis:** Related to but distinct from cluster 3 — likely a media-stream/track binding issue in the WebRTC layer, plus a UI state bug for the mute indicator (probably reading from a hardcoded/wrong participant object).

### 5. Teleconsultation notifications — P1
**Bugs:** #3 ("started" notification doesn't reach patient), #32 (doctor check-in notification not working)
**Hypothesis:** Notification dispatch (Firebase/WebSocket) firing for one role but not the other — check whether patient-side notification listener is registered, and whether the backend actually sends to the patient's device/socket, not just the doctor's.

### 6. Chat / messaging module — P1
**Bugs:** #13 (sent/received same color+alignment, newest message at top, attachments invisible), #14 ("processing" stuck, attachments only in Chats section)
**Hypothesis:** Frontend message-list rendering issue (sort order + sender-based styling logic) plus a broken attachment URL/type render path. Likely one component (`MessageList` or similar) needs fixing for most of this.

### 7. Gender filter logic — P1
**Bugs:** #21 (Male filter shows female), #22 (Other filter shows male+female), #23 (Female filter shows male)
**Hypothesis:** Filter condition is probably inverted, using `!==` where `===` needed, or all three filters share one broken comparison function. Single fix likely resolves all three — this is the clearest "one root cause, one fix" cluster.

### 8. Doctor login (email-only) — P1
**Bugs:** #8 (sign-in fails with just email, only works with Clinic Code + Email + Password)
**Note:** This may not be a bug — from the login code we already reviewed, `clinicId`/`clinicCode` is a required field alongside email+password by design (multi-tenant resolution). Needs a decision: is email-only login supposed to be supported (e.g., via a "remembered clinic" or email-domain lookup), or was the bug report filed against a UI that isn't asking for clinic code when it should? Confirm expected behavior before coding a fix.

### 9. Confirm / "Validation Failed" actions — P1
**Bugs:** #5 (patient-side Confirm — intermittent Validation Failed), #11 (Cancel Leave Request Confirm not working), #25 (Manage Availability from Admin not working)
**Hypothesis:** Could be three unrelated bugs, or a shared cause if all three Confirm buttons submit through a common form/modal component with a validation schema mismatch (e.g., frontend sends a field the backend Joi/Zod schema doesn't expect, causing intermittent failures depending on optional fields). Worth checking if they share a component before assuming separate fixes.

### 10. Clinic logo not rendering — P2
**Bugs:** #9 (Doctors List), #10 (For Clinics page)
**Hypothesis:** Broken image path/URL construction, or missing fallback when `clinic.logo` is null but path still gets built.

### 11. Invoice/Billing data & PDF — P2
**Bugs:** #37 (Invoice PDF won't download), #38 (payment history missing in invoice details view), #41 (invoice now visible — confirm this is resolved/retest only)
**Note:** Report section 7.2.2 (Invoice Calculation with GST) is relevant background reading here.

### 12. Dashboard counts/data not loading — P2
**Bugs:** #24 (upcoming leaves count not updating), #29 (teleconsultations count shows 0), #34 (Material Management data unavailable), #35 ("In Progress" consultation → Error Loading consultation)
**Hypothesis:** Possibly unrelated bugs sharing a *pattern* (dashboard aggregation queries returning empty/stale/error) rather than one shared root cause — treat as one investigation batch, but expect separate fixes per data source.

### 13. Misc UI-only issues — P3
**Bugs:** #26 (Action column missing edit/view icons), #30 (Billing/finance section UI issue), #36 (filter tabs misaligned)
**Note:** Cosmetic, no functional/data risk — good candidates to batch into one quick frontend pass.

### Needs separate investigation (no clear shared cause yet)
- **#6** Prescription Reader failed
- **#7** Chatbot always detects location as Pune regardless of actual location
- **#16** Doctor's clinic link → "Not Found"
- **#20** Incoming call shows but call module doesn't render on connect
- **#31** Insurance view icon → blank white page

---

## How we'll work through this
For each cluster: I'll ask you for the relevant source files (or we grep together), confirm the root cause with you, apply the fix, and mark bugs 🧪 for you to retest before we call them ✅.

**Suggested starting point:** Cluster 1 (Permission/RBAC) — it's blocking real money-handling actions (payments, rooms) and is likely a fast, contained fix (seed data or one middleware check).

Let me know if you want to start there or reorder priorities.
