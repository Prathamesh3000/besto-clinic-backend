# BestoClinic — Remaining Bugs & Fix Plan

**Created:** 4 Aug 2026
**Last updated:** 5 Aug 2026
**Scope:** API (`src/`), mobile app (`BestoClinicMobile/`), marketing site (`website/`), Google Play submission.

This is a working document. Each item is updated in place as it is fixed — status, date, and how it was verified. Items already closed move to [Completed](#completed).

Companion documents: [`BUG_REPORT.md`](BUG_REPORT.md) (30 Jul audit, mostly closed) and [`BUGFIX_HANDOFF.md`](BUGFIX_HANDOFF.md).

---

## Status at a glance

| Group | Open | Blocked | Done |
|---|---|---|---|
| Play Store | 3 | 0 | 0 |
| Code — defects | 2 (1 in progress) | 1 | **1** |
| Code — decision / hygiene / environment | 5 | 0 | — |
| Pre-existing (from `BUG_REPORT.md`) | 2 | 0 | — |
| **Fixed overall** | — | — | **17** |

**Legend:** ⬜ open · 🟦 in progress · ⛔ blocked (needs someone else) · ✅ done · ❌ withdrawn

---

## Baseline metrics

Re-measure after each fix; these are the numbers to move.

| Metric | At start | Now | Target |
|---|---|---|---|
| Mobile TypeScript errors | 166 | **0** ✅ | 0 |
| Mobile lint (errors / warnings) | 174 / 756 | **126 / 744** | 0 errors |
| Backend lint problems | 55 | **55** | 0 errors |
| Backend tests passing | 0 (none existed) | **33** (17 unit + 16 integration) | grow coverage |
| Mobile↔API endpoint mismatches | 8 | **7** | 0 or documented |
| Dead source files | 57 (11 miscounted) | **32** (14 removed) | 0 |

**`tsc --noEmit` now exits clean.** The 32 dead files that remain carry no errors; removing them is optional tidy-up.

---

## Priority order

Work top-down. The first two unblock or de-risk everything below them.

1. **PS-3** — organisation account (longest lead time, gates all releases)
2. **C-8** — development database (everything else is unsafe to test without it)
3. **C-1** — delete dead code (also clears ~39 TypeScript errors)
4. **C-2** — biometric cold-start lockout (affects every returning user)
5. **PS-1 / PS-2** — Play Console declaration + release rebuild
6. **C-3** — remaining TypeScript errors
7. Everything else

---

# Play Store

## PS-1 · Families Policy: Social Features ⬜
**Rejected 19 Jul 2026.** Google flagged chat/video as child-accessible without safety controls.

**Findings:** the app has no child users. `createDependent` creates only a `Patient` record with a guardian — no login, no credentials — and rejects age ≥ 18. Chat and video are server-restricted to session participants ([`video.service.js`](src/modules/telemedicine/video.service.js), [`emergency.service.js`](src/modules/emergency/emergency.service.js)). There is no stranger contact anywhere.

The rejection stems from the **Play Console audience declaration**, not the code.

**Plan**
1. Play Console → App Content → *Target audience and content* → set **18+ only**.
2. Appeal, citing: dependents have no login; all messaging is patient ↔ assigned clinician within a booked session; registration now enforces 18+.
3. ✅ Code prerequisite already done — see [F-9](#f-9).

**Verify:** policy status clears in Play Console.
**Owner:** account holder. **Not a code task.**

## PS-2 · Must target Android 15 (API 35) ⬜
**Source is already compliant** — [`android/build.gradle`](BestoClinicMobile/android/build.gradle) has `compileSdkVersion = 35`, `targetSdkVersion = 35`. The rejected bundle predates it.

**Plan**
1. Bump `versionCode 2` → `3` in [`android/app/build.gradle`](BestoClinicMobile/android/app/build.gradle) — Play rejects a repeated version code.
2. Restore `reactNativeArchitectures` to all four ABIs if it was narrowed for dev builds.
3. `npm run release:android`, upload the `.aab`.

**Verify:** Play Console accepts the bundle and the API-level warning disappears.

## PS-3 · Organisation account required ⬜
Health/medical apps cannot be published from a personal developer account.

**Plan:** obtain a D-U-N-S number → create/verify an organisation account → transfer the app.
**Verify:** the Play Console Requirements violation clears.
**Owner:** account holder. **Start first — longest lead time.**

---

# Code — defects

## C-1 · Unreachable source files — 14 of 46 removed ✅ (5 Aug)
Dead code including four **phantom dependencies** that are imported but absent from `package.json`: `expo-haptics`, `expo-av`, `react-native-video`, `@bam.tech/react-native-image-resizer`. Not currently bundled (all unreachable from `index.js`), but one import away from breaking a release build.

Also removes superseded navigators (`PatientMoreStack`, `PatientPaymentStack`, `InventoryStack`, `DoctorTelemedicineStack`), `LoginScreen`/`DoctorLoginScreen` (replaced by `UnifiedLoginScreen`), and `socket.service.ts` (duplicate of the live `api/socket.ts`).

**Done (5 Aug) — 14 removed**, chosen as exactly those carrying TypeScript errors:

`JawModelGuide` · `VideoJawGuide` · `useVoiceCoach` · `haptics.ts` · `soundManager.ts` · `MultiFrameCaptureService` · `PatientMoreStack` · `PatientPaymentStack` · `LoginScreen` · `DoctorLoginScreen` · `doctor/InventoryListScreen` · `PaymentListScreen` · `DentalScanExperience` · `InventoryStack`

**Verified after deletion:**

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** (from 166) |
| Reachable files from `index.js` | **281 — unchanged**, so nothing live was removed |
| Uninstalled packages reachable | **none** — all four phantom deps gone |
| App boots | ✅ `Running "BestoClinicMobile"` after the deletions |
| Mobile lint errors | 174 → **126** |

**Order mattered:** deleting `useVoiceCoach` / `haptics` / `soundManager` first *created* 3 new "Cannot find module" errors in `DentalScanExperience`, which was their only importer. Removing it cleared them. Same for `InventoryStack`, which imported the deleted `doctor/InventoryListScreen`. When deleting dead clusters, remove the importer along with its dependencies.

**Caution for the remaining 32:** the list was verified twice — an earlier count of 57 wrongly included 11 live components re-exported through `components/ui/index.ts` via `export … from`, which the first reachability pass did not follow. Four more were basename collisions. Re-verify before deleting further.

**Remaining 32 carry no errors** — `PermissionGate`, shared chat components, `query-keys.ts`, `validation.ts`, `statuses.ts`, the rest of the old scanner cluster. Optional tidy-up, no urgency.

## C-2 · Biometric prompt blocks cold start ✅ done (5 Aug)
[`storage.ts:47`](BestoClinicMobile/src/utils/storage.ts) stores tokens with `accessControl: BIOMETRY_ANY_OR_DEVICE_PASSCODE`, and `hydrate()` performs **three** separate `getToken` reads (access, refresh, user) — so a returning user can face repeated fingerprint prompts at launch, with the splash frozen behind them. Observed: cancelling did **not** fall through to login; four back presses exited the app. Because it is a secure system window, screenshots show only black, so it looks like a hang.

**Done (5 Aug):** [`storage.ts`](BestoClinicMobile/src/utils/storage.ts) rewritten to keep all secure values in **one** keychain entry holding a JSON map, cached per process — so at most **one** prompt per launch instead of three. A cancelled unlock now caches an empty bundle and resolves, so the app continues to the logged-out state instead of re-prompting on every read. Legacy per-key entries migrate automatically on first read (costs one prompt each, once, for existing installs only).

**Also fixed here:** `clearAll()` listed `'access_token'` / `'user_data'`, which never matched the real `STORAGE_KEYS` values (`auth.accessToken`, …) — so it **deleted nothing**. It now drops the single entry, which cannot drift out of sync.

**Verified on device (5 Aug, OnePlus CPH2707 / Android 16):**

| Run | Result |
|---|---|
| 1st cold start (runs the legacy migration) | Session **preserved**, 0 prompts, no `[secureStorage]` warnings |
| 2nd cold start (steady state, bundle exists) | Session **preserved**, **0 prompts** across a 20s poll |

**Honest caveat:** no prompt fired in either run, so the "3 prompts → 1" reduction was not observed directly today — this device's keystore did not require re-authentication (auth-validity window). What *is* established: the migration keeps the session, two consecutive cold starts restore it cleanly, and structurally there is now **one** keychain read instead of three, so the worst case is one prompt rather than three. The 3-prompt behaviour was observed on this same device before the fix (`BiometricPrompt` holding focus + `keystore2: KEY_USER_NOT_AUTHENTICATED`).

**Cancel path now confirmed (5 Aug).** The Metro log later captured the exact case, proving the new failure handling works:

```
WARN [secureStorage] unlock failed, continuing signed out:
     CryptoFailedException: code: 10, msg: Fingerprint operation cancelled by user
```

The app logged the warning and **continued to the signed-out state** instead of hanging on the splash behind repeated prompts — which is precisely the behaviour this fix was for. C-2 is fully verified.

**Open question for the team:** should token reads require biometrics at all? `accessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` already requires an unlocked device. Dropping `accessControl` would remove the prompt entirely — a security-posture decision, not a bug fix, so it is left as-is.

## C-3 · TypeScript errors — 166 → 0 ✅ done (5 Aug)
`npx tsc --noEmit` exits **0**. Verified after deletion: reachable file count unchanged at **281**, so nothing live was removed, and the app booted (`Running "BestoClinicMobile"`).

> Worth noting for management: nearly every "type error" fixed so far turned out to be a **functional defect users would hit**, not cosmetic type debt. Two screens were outright broken.

**Cleared so far (5 Aug)** — each was a *runtime* bug, not just a type complaint:

| Cluster | Count | Real-world effect |
|---|---|---|
| `Skeleton` given `borderRadius` instead of `radius` | 13 | Prop silently ignored; skeletons rendered with the default radius |
| `colors.text` (no such token; it is `textPrimary`) | 10 | `undefined` colour → platform default text, near-invisible in dark mode |
| `Avatar size={36\|42\|…}` where only tokens were typed | 11 | `SIZES[36]` was `undefined` → **11 avatars rendered with no width or height** |
| `SectionCard` missing required `iconBg` | 6 | Icon container had no background |
| `Avatar uri=` (the prop is `source`) | 1 | Doctor's avatar image never loaded, silently fell back to initials |
| `Text variant="body1"` (not a variant) | 1 | Fell back to default typography |
| **`EodChecklistScreen` destructured `r` instead of `radius: r`** | 1 | `r` was `undefined`, so `r.full` **threw on render — the screen crashed** |
| `GradientHeader` given `title`/`subtitle`/`leftAction` (it only takes `children`) | 1 | Header rendered **empty — no title and no back button** |
| `rem.task` used as a Map key while typed `string \| object` | 3 | Populated vs bare-id responses could key the map with an object |
| `react-native-webrtc` → `event-target-shim/index` unresolvable | 4 | **Types only** — see below |
| **`queueApi.callPatient` / `completeEntry` / `cancelEntry` do not exist** (API has `call` / `complete` / `cancel`) | 3 | **All three queue actions threw "is not a function"** into a silent `catch` — Call, Complete and Cancel appeared to do nothing |
| **Queue status compared against `'serving'`**, which the backend never emits (it is `in_consultation`) | 0 (untyped) | "Active" counter permanently **0**, and `isServing` never true — so the **Complete button never rendered** and a patient in consultation could not be marked done |
| **`templateApi.delete` does not exist** (API has `remove`) | 1 | Deleting a consultation template always failed with an error alert |
| `Card` had no `onLongPress` prop | 1 | Long-press-to-delete on the template list was silently dropped — the screen's only delete affordance |
| `variant="outlined"` (valid value is `outline`) | 1 | Invoice action button fell back to the default style |
| `styles.backBtn` referenced but never defined | 1 | Back button had no size or hit area |
| **Compliance API omitted `_id` and `isActive` per task** (backend fix) | 3 | On the doctor **and** guardian compliance screens every toggle rendered **ON** (`undefined !== false`) and toggling called `/care-tasks/undefined/toggle` |
| `Appointment.paymentOrder` / `.id` not on the type | 2 | Types-only — backend does return `paymentOrder`; type now mirrors it. Dead `\|\| appointment.id` fallback removed |
| `navigateToIncomingCall` signature missing `autoAccept` | 1 | Types-only — `ModalParamList` declared it and the screen reads it |
| `MENU_ITEMS` was a union of literals, so `crossTab` was rejected | 2 | Types-only — guarded at runtime; array now has an explicit element type |
| **`Button` given `icon=` (the prop is `leftIcon`)** | 2 | Camera / Gallery buttons on the prescription scanner rendered **with no icon** |
| **`Chip` given `icon=` and `size=`, neither supported** | 2 | Appointment-type chips rendered **without their icons**; `icon` support added to `Chip`, dead `size` removed |
| `quality: 0.85` — `PhotoQuality` only allows 0.1 steps | 1 | Unsupported value passed to the image picker; now `0.8` |
| `Consultation.patient` typed `string` while code branches on object | 2 | Types-only — widened to `string \| { _id, name? }`, matching populated-vs-id responses |

`Avatar` now accepts a numeric diameter as well as tokens, since several screens legitimately want sizes between them.

**On the WebRTC one — a library packaging bug, not our code.** `event-target-shim@6.0.2` publishes an `exports` map with no `"./index"` subpath, but `react-native-webrtc` imports `event-target-shim/index`. Under `moduleResolution: "bundler"` TS honours `exports`, so the import fails, `RTCPeerConnection`'s `EventTarget` base becomes an error type, and every `addEventListener` is reported missing. Metro does not enforce `exports`, so **video calls were never broken**. Fixed with a `paths` mapping in [`tsconfig.json`](BestoClinicMobile/tsconfig.json) rather than rewriting working code. Revisit if the dependency is ever hoisted differently.

**Remaining live clusters (10):** `MoreScreen` / `MedicalHistoryScreen` / `PatientRecordScreen` navigation param mismatches (3) · `EmergencyChatScreen` setState union (1) · `HealthHomeScreen` `PaginationParams.status` (1) · `AnalyticsDashboardScreen` ProgressBar props (1) · `ImmersiveScannerView` nullable arg (1) · `useVoiceGuidance` iOS silent-switch enum (1) · `ClinicDetailScreen` optional string (1) · `DoctorAppointmentCreateScreen` chip (1).

**Lint side-effect:** 9 unused imports removed from files touched along the way (mobile lint errors 174 → 163).

**Left deliberately:** `BookAppointmentScreen` has an `exhaustive-deps` warning for `route.params`. The effect intentionally keys on `route.params?.doctorId`; adding the whole params object would re-run it on every identity change. Flagged rather than "fixed" blindly.

**Plan:** finish the live clusters, then add a CI gate so this cannot regress.
**Verify:** `npx tsc --noEmit` exits 0.

## C-10 · Prescription list crashed on a null doctor ✅ done (5 Aug)
Caught in the Metro log, not by static analysis:

```
ERROR Warning: TypeError: Cannot read property 'name' of null
  in PrescriptionListScreen … in ErrorBoundary
```

[`PrescriptionListScreen`](BestoClinicMobile/src/screens/patient/PrescriptionListScreen.tsx) read `item.doctor.name` unguarded. A prescription whose doctor is null — a deleted doctor, or an unpopulated response — threw and the ErrorBoundary replaced **the entire prescription list** with an error screen. `item.medications` was unguarded in the same way (three places).

**Fixed:** optional chaining with a "Doctor unavailable" fallback, and `medications || []`. Also guarded `medications` in [`PrescriptionDetailScreen`](BestoClinicMobile/src/screens/patient/PrescriptionDetailScreen.tsx), which already handled `doctor` correctly.

**Worth noting:** this is exactly the class of bug a typecheck cannot find — the types say `doctor` is always present; the data disagrees. Runtime logs found it in seconds. Reading Metro output during manual testing is worth doing routinely.

## C-4 · `distanceKm: null` renders as "0 km" ⬜
When the API returns no distance, [`ChatBubbles.tsx:520`](BestoClinicMobile/src/components/chatbot/ChatBubbles.tsx) still renders a chip reading `0 km`, implying the clinic is at the user's exact location.

**Plan:** hide the chip when `distanceKm == null` (the guard exists but `0` is falsy-adjacent — confirm the API isn't sending `0` for "unknown"). Match `BrowseScreen`'s `.toFixed(1)` formatting.
**Verify:** a no-coordinates search shows no distance chip.

---

# Code — decision, hygiene, environment

## C-5 · `/procedures` + `/reservations` — 7 endpoint mismatches ⬜ *(product decision)*
Three **live, routed** doctor screens call endpoints that 404: `ProcedureListScreen`, `ProcedureFormScreen`, `ProcedureAvailabilityScreen`.

The routers exist but are **deliberately unmounted** — [`BUG_REPORT.md`](BUG_REPORT.md) P3-5 records the decision. Mounting them as-is **crashes the API at boot**: `authorize()` throws on unknown permission keys, six `PERMISSIONS.PROCEDURE_*` / `RESERVATION_*` constants are missing, and `PROCEDURE_CATEGORY` is absent from `config/constants.js`.

The new information is that the mobile app now ships UI for this feature, so "unreachable rather than broken" no longer holds.

**Decide:** finish the backend feature (add the constants + permissions + role grants), or hide the three screens.
**Verify:** endpoint mismatch count reaches 0, or the screens are removed from `DoctorMoreStack` / `DoctorScheduleStack`.

## C-6 · Mobile lint — 173 errors / 757 warnings ⬜
Mostly `no-unused-vars` (133) and `react-hooks/exhaustive-deps` (27). All 12 remaining `rules-of-hooks` errors are inside dead `JawModelGuide.tsx`, so [C-1](#c-1--46-unreachable-source-files--blocked) clears them.

**Plan:** C-1 first → `eslint --fix` for the mechanical set → review `exhaustive-deps` individually (they can hide real staleness bugs) → gate in CI.
**Verify:** 0 errors.

## C-7 · Backend lint — 55 problems ⬜
36 `no-unused-vars` errors, 19 `no-restricted-syntax` warnings for direct `process.env` reads that should go through `config/env.js`.
**Verify:** 0 errors.

## C-8 · Local development runs against the production database ⬜
`PLATFORM_DB_URI` points at MongoDB Atlas (`cluster0…mongodb.net/besto_clinic`) with `NODE_ENV=production`. Only the Node process is local — every booking, scan, or registration made while testing writes to live data.

**This is the single biggest blocker to verifying anything safely.**

**Plan**
1. Create a `besto_clinic_dev` database (Atlas or local `mongod`).
2. Add `.env.development`, set `NODE_ENV=development`.
3. Seed it: `npm run seed:platform:full`, `npm run seed:discovery`.
4. Point the mobile `.env` at the dev API.

**Verify:** `/api/v1/health` reports `environment: development`; a test registration appears only in the dev database.

## C-9 · Integration tests 🟦 foundation built (5 Aug)
**16 integration tests now pass** against a real in-memory MongoDB, covering the two highest-risk changes made this cycle.

| Suite | Covers |
|---|---|
| [`ageGate.test.js`](tests/integration/ageGate.test.js) (7) | Under-18 rejection incl. the *turns 18 tomorrow* boundary, missing / future / unparseable dates, **that nothing is written to the DB on rejection**, and that `platformRegister` (which bypasses Joi) is gated too |
| [`patientScope.test.js`](tests/integration/patientScope.test.js) (9) | Guardian sees own + dependents, excludes soft-deleted and unrelated patients, **never silently defaults to a dependent**, and refuses to act for someone else's record |

**New helper:** [`tests/helpers/tenant.js`](tests/helpers/tenant.js) seeds a Clinic whose `dbUri` points back at the in-memory server, so tenant-scoped code runs for real. Redis is not required — the URI resolver falls back to the platform DB.

**Harness bug found and fixed:** `tests/setup.js` clears collections on the *default* mongoose connection only. A tenant connection is a separate `createConnection`, pooled by slug, so tenant documents leaked between tests — a test matched a `Patient` created by an earlier one. The helper now wipes the tenant DB per test. Verified by running the suite twice with identical results.

**Next:** the emergency IDOR guard, `_resolvePatientAccess` across the portal's 33 call sites, and the dependent detach flow.
**Verify:** `npx jest tests/integration` passes.

---

# Pre-existing (from `BUG_REPORT.md`, still open)

## P0-1 · Razorpay credentials invalid ⬜
`RAZORPAY_KEY_SECRET` is 11 characters; real secrets are 24. The API returns 401, so **no online payment can complete**, and because `razorpay.createOrder()` runs before `Payment.create()`, failures leave no database record at all.
**Plan:** put valid keys in `.env`, restart. Config only — the code path is already hardened.

## P0-2(a) · Subscription backfill ⬜
No clinic has a `Subscription` document, so the lifecycle worker cannot see any of them. Seven clinics are on paid plans past their period end. Creating the documents makes them enter grace within the hour and suspend seven days later — **a billing decision, not a code one.**
**Plan:** confirm intent (bill / extend / write off), then run the backfill.

---

# Completed

Fixed and verified this cycle.

| # | Fix | Verified by |
|---|---|---|
| F-1 | **Cold start opened "Invalid share link"** — app was unusable. `SharedRecordView` was declared first in [`RootNavigator`](BestoClinicMobile/src/navigation/RootNavigator.tsx), making it the initial route | Reproduced on a clean `MAIN` intent; app now boots to Welcome |
| F-2 | **Theme typing** — `darkColors: typeof lightColors` with `as const` forced literal types | TS errors 166 → 117 (−49) |
| F-3 | **Hook-order crash risk** — `ObservationBubble` called `useState` after an early return | `rules-of-hooks` clear |
| F-4 | **`useRef` inside `.map()`** in `ScanIntroOverlay` | `rules-of-hooks` clear |
| F-5 | **Emergency status enum mismatch** — mobile declared `pending`/`accepted`, which do not exist server-side; surfaced a missing `cancelled` case in `status-colors` | Typecheck |
| F-6 | **Jest never ran its setup** — `setupFilesAfterSetup` is not a Jest option; split into `unit`/`integration` projects | `npm run test:unit` works for the first time |
| F-7 | **First tests written** — `age.test.js`, `patientScope.test.js` | 17 passing |
| F-8 | **Guest `detect-teeth` endpoint missing** — every guest scan silently lost tooth detection | Live probe returns the handler's own 404 |
| F-9 | **18+ age gate** — enforced in the service layer, covering all three registration entry points, plus date-of-birth fields in the app and website | All four rejection cases blocked **before any DB access** |
| F-10 | **No patient → guardian upgrade** — backend endpoint existed, app never called it | New `BecomeGuardianScreen`; token refresh ordering handled |
| F-11 | **Wrong-patient medical data** — dentalScan / emergency / telemedicine resolved `Patient.findOne({user})`, ignoring guardians. A parent scanning a child filed it under themselves | New `patientScope.js`; verified live: switching to a dependent re-scoped all data, no 403s |
| F-12 | **Emergency IDOR** — `POST /emergency` took a client-supplied `patient` id with no ownership check; any patient could file an emergency against another patient | Authorised via `resolveActingPatientId` |
| F-13 | **Dependent detach deadlock** — `updateDependent` refused any 18+ date of birth while `detachDependent` required one, permanently locking adults under a guardian | Age rule now applies only at creation |
| F-14 | **Nothing noticed a dependent turning 18** | New daily `dependentMajorityScan` job; confirmed scheduled in Redis |
| F-15 | **Notification deep-link** — turns-18 notification now opens the Dependents screen | Routed in the in-app list (this path is WebSocket, not FCM) |
| F-16 | **`.env` committed to a public repo** — mobile app became its own repo and lost the parent's `.gitignore` coverage | History rewritten; remote scanned, all commits clean |

---

# Withdrawn

## ❌ "City selection ignored in doctor search"
Reported as unresolved, then disproved. `CITY_COORDS` is correct, `handleCitySelect` uses one value for both the label and the lookup, `getUserLocation` throws rather than defaulting, and no hardcoded Pune default exists anywhere. The Pune coordinates came from **a stray tap during testing** — the chat auto-scrolled between screenshot and tap, which mis-landed at least three taps that session. **Not a defect. Do not track.**

---

# Notes for whoever picks this up

- **The API runs under `nodemon`** — backend edits reload automatically. Mobile JS hot-reloads through Metro, but **`.env` changes need a full rebuild**, because `react-native-config` bakes values into `BuildConfig` at compile time.
- **`adb reverse tcp:8081 tcp:8081` drops** whenever the device reconnects, producing a red "Could not connect to development server" screen. Re-run it; Metro is usually fine.
- **A first clean Android build takes ~1h35m** (native C++ for four ABIs). For dev, `reactNativeArchitectures=arm64-v8a` cuts that dramatically — but restore all four before a release build.
- **Do not trust basename matching** when judging whether a file is used. Four apparent references were different files with the same name (`StatCard`, `SplashScreen`, `InventoryListScreen`, `ProfileScreen`).
