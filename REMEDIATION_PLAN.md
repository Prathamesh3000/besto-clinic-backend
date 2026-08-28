# BestoClinic — Remediation Plan

**Branch:** `bugfix/batch1-batch2-multitenancy`
**Scope:** every defect still open after the platform-registry recovery.
**Size:** 14 defects, 6 phases. Phases 1–4 complete.

---

## Baseline vs current

| Check | At start | Now |
|---|---|---|
| Test suite | 64 / 64 passing | **64 / 64 passing** |
| Backend boot | OK | **OK** |
| Backend lint | 55 (36 err, 19 warn) | **55** (unchanged baseline) |
| Frontend lint | 496 (459 err, 37 warn) | **482** (445 err, 37 warn) |
| Frontend CVEs | 17 total, **14 high** | **0** |
| Backend CVEs (prod) | 9 total, **1 high** | **0 high** |
| Main bundle | 3.17 MB (750 kB gzip) | unchanged — Phase 6 |

---

## 1. Defect register

| ID | Defect | Severity | Phase | Est. | Status |
|---|---|---|---|---|---|
| P1-1 | Hooks called after early return in `PatientLayout` | **Critical** | 1 | 45m | ✅ Done |
| P1-2 | 14 high-severity dependency CVEs | **Critical** | 1 | 30m | ✅ Done |
| P2-1 | Auth rate limiters bind to per-process memory | High | 2 | 1h | ✅ Done |
| P2-2 | Health probes not exempt from global limiter | High | 2 | 30m | ✅ Done |
| P2-3 | Suspension does not eject live sessions | High | 2 | 2h | ✅ Done |
| P3-1 | Patient portal shows generic error on suspension | Medium | 3 | 1.5h | ✅ Done |
| P4-1 | Dead `procedure` / `reservation` modules | High | 4 | 45m | ✅ Done |
| P4-2 | Dead `PatientPortal.jsx` with undefined reference | Medium | 4 | 20m | ✅ Done |
| P4-3 | Ref accessed during render in `CalendarView` | Medium | 4 | 30m | ✅ Done |
| P4-4 | Lexical declaration in unbraced `case` | Medium | 4 | 10m | ✅ Done |
| P5-1 | `GET /subscriptions/` returns 404 for every role | Medium | 5 | 45m | ✅ Done |
| P5-2 | `/clinic` fetched four times per dashboard load | Medium | 5 | 1h | ✅ Done |
| P6-1 | Lint debt: 444 frontend / 21 backend errors | Debt | 6 | 3h | Partial |
| P6-2 | Main bundle 3.17 MB, no manual chunking | Debt | 6 | 2h | ✅ Done |

---

## 2. Why this order

1. **Phase 1 first.** The only work fixing a failure users hit today, and one item is a
   single command.
2. **Phase 2 before Phase 3.** Suspension must be fully enforced before its presentation
   is polished, or the flow stays half-enforced while looking finished.
3. **Phase 4 before Phase 6.** Deleting dead code removed lint noise for free; running
   the lint pass first would have meant fixing warnings in files that no longer exist.

---

## Phase 1 — Stop the bleeding — ✅ COMPLETE

Frontend CVEs 14 high to 0. Backend production CVEs 1 high to 0. Frontend lint 496 to 489.

### P1-1 · Hooks called after an early return

**File:** `website/src/patient/PatientLayout.jsx`

The auth guard returned at line 171 while eight hooks sat below it. When `hasToken`
flipped without a remount, React saw a different hook count and threw *"Rendered more
hooks than during the previous render"*.

**Fix applied.** The signed-out screen is built into a `signedOutScreen` const and
returned after every hook has run. Two hooks with real side effects were neutralised
rather than skipped, since hooks cannot be called conditionally:

- the socket effect early-returns on `signedOut` and takes it as a dependency, so no
  socket opens without a token
- `useCallBridge` already accepted an `enabled` flag, so it receives `enabled: !signedOut`

**Verified** by loading the portal signed out, then injecting a token and navigating
within the SPA (`pushState` + `popstate`) so React re-rendered the same mounted component:
0 hook-order errors, 0 console errors.

### P1-2 · Dependency CVEs

Frontend: `npm audit fix`, 39 packages changed, **0 vulnerabilities**, build passes.

**Backend needed judgement — only the safe subset was applied.** The remaining advisories
require major version changes:

| Advisory | npm's proposed fix | Verdict |
|---|---|---|
| firebase-admin chain (5 pkgs) | `firebase-admin@10.3.0` | **Rejected** — a *downgrade* from `^13.7.0`; would break push notifications |
| puppeteer chain (4 high) | `puppeteer@25.8.0` | Deferred — major, devDependency only |
| `uuid` | `uuid@14.0.1` | Deferred — major |
| gaxios, ip-address, js-yaml | patch | **Applied** |

`--force` was not used.

---

## Phase 2 — Harden the authentication edge — ✅ COMPLETE

### P2-1 · Auth limiters fell back to per-process memory

> **Correction found during implementation.** Boot ordering was real but *secondary*.
> The primary cause was a bad import: `rate-limit-redis` v4 exports
> `{ RedisStore, default }`, not the class. `const RedisStore = require('rate-limit-redis')`
> followed by `new RedisStore(...)` threw *"not a constructor"*, the `catch` swallowed it,
> and **every limiter used the memory store from the day the file was written** —
> regardless of when it was built.

**Fixes applied**, both needed:

- `const { RedisStore } = require('rate-limit-redis')` so the store class is real
- `lazyLimiter()` defers construction to the first request, so Redis exists by then
- the `catch` now logs the actual error — the silent catch is what hid this for so long

**Verified:** `POST /auth/login` now creates `rl:auth:::1` in Redis. Previously zero
`rl:*` keys ever existed.

### P2-2 · Health probes shared the request budget

`app.js:87` claimed probes were skipped; only the Razorpay webhook actually was.
`/api/v1/health` and `/api/v1/monitoring` are mounted after the limiter and were subject
to it.

**Fix applied.** Both paths added to the skip predicate.

**Verified under production config** on a throwaway in-process instance
(`NODE_ENV=production`, `RATE_LIMIT_MAX=5`) — development disables the global limiter, so
testing there proves nothing:

```
ordinary route first 429 at request #6      limiter live
200  /api/v1/health                          EXEMPT
200  /api/v1/monitoring/health               EXEMPT
429  /api/v1/public/plans                    THROTTLED (correct)
```

### P2-3 · Suspension did not eject live sessions

> **The originally proposed Option B was unworkable.** Blacklisting each live session's
> `jti` is impossible: access-token `jti` values are **never persisted** — only refresh
> tokens are, under `auth:refresh:devices:<userId>`. There is no list of live sessions to
> walk, so that approach would only have killed future refreshes, which the refresh guard
> already did.

**Fix applied.** A per-tenant cut-off in `src/utils/sessionRevocation.js`, compared
against each token's `iat`. Folded into the `MGET` that `authenticate()` already performed
for the blacklist, so it costs **no extra Redis round trip** — not the per-request read
originally feared. Applied to suspension **and cancellation**, which had the same hole.

The stamp is deliberately not cleared on reactivation: pre-suspension tokens must stay
dead, and post-reactivation tokens carry a later `iat` and pass anyway.

**Verified:**

```
/auth/me BEFORE suspend : 200 Current user
/auth/me AFTER  suspend : 401 Session ended — this clinic account was suspended  (same token)
old token after reactivation  : 401 (stays dead by design)
fresh login after reactivation: 200 Current user
```

Why this mattered even though data routes already returned 403: `/auth/*` is exempt from
the subscription guard, so a suspended clinic's user still passed `authenticate()` and sat
in a live-looking shell.

---

## Phase 3 — Finish the suspension flow — ✅ COMPLETE

### P3-1 · Suspension dialog on the patient portal

**The predicted blocker did not exist.** Patient login imports `tenantLoginByClinicId`
from `tenant/api`, which already carried the structured code — no API-layer change was
needed. Only the presentation was missing.

**Fix applied.** The dialog was extracted to
`website/src/components/common/ClinicSuspendedDialog.jsx` and both login pages now use it;
the staff page's inline copy was **removed** rather than duplicated, so the two audiences
cannot drift apart. Patient login branches on `err.code === 'CLINIC_SUSPENDED'` instead of
falling through to "Invalid email or password".

**Verified in a browser** against a genuinely suspended clinic — both portals show
*Access denied*, the clinic name, and the product owner's reason.

---

## Phase 4 — Remove latent traps — ✅ COMPLETE

Frontend lint 489 to **482**. Nine dead files removed, two real defects fixed.

### P4-1 · Dead `procedure` / `reservation` modules

Neither was mounted, and both referenced six permission constants that do not exist, so
mounting either would have **failed the boot** (`authorize()` validates keys at require
time). Both also declared paths without a leading slash.

**Decision: treated as abandoned and deleted.** Both modules were entirely
self-contained — the only external match anywhere in `src/` was the word "procedure"
inside a notification sentence in `purchaseOrder.service.js`.

> **Backups of all 9 deleted files are in the session scratchpad** under `p4-backup/`.
> If either feature is actually planned, restore from there and treat it as its own piece
> of work: add the six constants, fix the paths, assign permissions to roles, then mount.

### P4-2 · Dead `PatientPortal.jsx`

Zero references, 147 KB, and an undefined `setConfirmRemove` that would throw if reached.
Deleted.

### P4-3 · Ref accessed during render in `CalendarView`

> **Approach changed during implementation.** The obvious fix — moving the ref write into
> an effect — would have introduced a visible bug. The toolbar reads during the same
> render pass, so it would have shown the *previous* values until something else
> re-rendered it.

**Fix applied.** The ref was replaced with a React context. `ToolbarWithExtras` is now
defined at module level, so its identity is permanently stable — react-big-calendar
remounts the toolbar whenever `components.toolbar` changes — while context still delivers
current values.

**Verified in a browser:** toolbar, grid and view switcher all render, 0 console errors.

### P4-4 · Lexical declaration in an unbraced `case`

`enhancedScannerStateMachine.js` declared `nextIndex` inside a `case` without a block,
scoping it to the whole switch. Braced.

---

## Phase 5 — Correctness polish — ✅ COMPLETE

Frontend lint 482 to **481**.

### P5-1 · Bare subscriptions endpoint always 404s

`GET /api/v1/subscriptions/` returned "No active subscription found" for every role
including super_admin, because the registry repair recorded the plan denormalised on the
Clinic with no `Subscription` document.

**Fix applied.** `getCurrentSubscription` now falls back to `clinic.subscription`, the
same source `getOverview` treats as authoritative via its `legacy` branch. The
reconstructed object is flagged `isLegacy: true` so a caller can tell it apart from a
real Subscription document.

**Verified:** `GET /subscriptions/` now returns 200 for super_admin (was 404).

### P5-2 · Clinic settings fetched four times per load

Two components each called `getClinicSettings()` on the dashboard —
`TenantLayout.jsx:277` and `ClinicQRCard.jsx:15` — and StrictMode doubled both.

**Fix applied.** `ClinicQRCard` reads the clinic from auth context instead of fetching.
The context shape (`{ id, name, logo, clinicCode, slug }`) already carries everything it
uses and is restored from localStorage on refresh, so the code is available before the
layout's request resolves. Its `useCallback` deps were switched from
`clinic?.field` member expressions to plain hoisted strings, which the hooks lint can
verify.

**Verified:** `GET /clinic` requests per dashboard load **4 → 2**. The remaining pair is
the layout's single fetch doubled by StrictMode, which does not happen in a production
build. QR card renders with the correct code, 0 console errors.

**Still open (not blocking).** `QRCode.jsx` calls `getClinicSettings()` twice within one
file; `ITDashboard.jsx` and `ITSettings.jsx` fetch it too. Those are separate pages, so
they cost one request each rather than duplicating on the dashboard.

---

## Phase 6 — Debt burn-down — P6-2 ✅ COMPLETE, P6-1 PARTIAL

### P6-2 · Bundle size — ✅ DONE

**Initial JS cut by 86%.**

| | Before | After |
|---|---|---|
| Main chunk | 3,167 kB | **443 kB** |
| Main chunk (gzip) | 750 kB | **125 kB** |

Two changes:

1. **`manualChunks`** in `vite.config.js` splits the heavy vendors (`recharts`,
   `react-big-calendar` + `date-fns`, `@mediapipe/tasks-vision`, `framer-motion`,
   react core, socket.io/qrcode/papaparse) into separately cacheable chunks. These
   change far less often than app code, so they survive deploys in browser cache.
2. **Route-level code splitting.** All 120 page imports in `App.jsx` became
   `React.lazy`, behind a `Suspense` boundary with a quiet spinner fallback.
   `LandingPage` is deliberately **kept eager** — it is the index route and the first
   thing an unauthenticated visitor sees, so lazy-loading it would trade first paint
   for a spinner.

Output is now 238 chunks totalling 4.0 MB, of which a visitor downloads only the
routes they actually open.

**Verified:** 8 routes across all four portals (landing, tenant dashboard,
appointments, patients, plan & billing, staff login, patient login, platform login)
all render with no stuck fallback and no console errors.

### P6-1 · Lint debt — PARTIAL

**Backend: 55 → 40 problems (36 → 21 errors).** Frontend unchanged at 481.

`--fix` is useless here: `no-unused-vars` is not auto-fixable, because ESLint will not
delete code it cannot prove is side-effect free. Every removal is manual and needs its
initializer checked.

Removed so far (all verified side-effect free): unused destructured imports in
`authorize`, `errorHandler`, `auth.service`, `billing.routes`, `conflictResolution`,
`dentalScan`, `doctor.routes`, `inventory.routes`, `telemedicine.routes`,
`patientPortal.service`; unused model getters in `analytics.service`,
`careReminder.service`, `autoNoShowScanWorker`.

> **Two "unused variables" turned out to be real bugs — left in place deliberately, as
> deleting them would destroy the evidence.** See the section below.

**Remaining.** 21 backend errors (unused params, which want a `_` prefix rather than
deletion, plus a few locals) and 444 frontend errors. The frontend bulk is ~295
`no-unused-vars`; behind those sit 45 `set-state-in-effect`, 41
`only-export-components`, 37 `exhaustive-deps`, 25 `static-components`, 16 `purity`.
**Do not fix the hooks rules mechanically** — P4-3 showed the obvious fix for one of
them introduces a visible bug.

---

## Bugs surfaced by the lint pass

### `tempPassword` is generated and thrown away — `productOwner/tenant.service.js:140`

`_generateTempPassword()` is called, but the result is never used. The function's own
JSDoc at line 120 promises `@returns {object} — { tenant, superAdmin: { tempPassword } }`,
so the documented contract is broken: **a product owner creating a tenant never receives
the SuperAdmin's temporary password.** Needs a decision on whether it should be returned,
emailed, or the generation removed.

### Compliance summary drops two of its own metrics — `careReminder.service.js:344–346`

Three function-level accumulators are declared at lines 301–303 and incremented at
344–346, but only `totalCompleted` is ever read. `totalSkipped` and `totalMissed` are
computed and discarded, so the care-compliance summary silently omits two metrics it has
already calculated. (Note the per-prescription `rx.total*` counters at 339–341 are a
separate, working set.)

---

## Verification gate

Run at the end of every phase.

```bash
# Backend — from the project root
npm test                     # expect 5 suites, 64 tests passing
npm run lint                 # baseline 55 problems
node -e "require('./src/config/env'); require('./src/app')(); console.log('OK')"

# Frontend
cd website
npx eslint .                 # 482 and falling
npx vite build               # must exit 0
npm audit                    # 0 vulnerabilities
```

---

## Not defects — data state

`plans` and `promotions` are still empty after the registry recovery. That is missing
data, not a bug, and it is self-serviceable as product owner at `/platform/plans`.

Plan & Billing stays unusable until the catalogue exists. Two defects fixed earlier —
`admin` missing `subscription:purchase`, and the ungated purchase UI — remain latent until
plans exist.

---

## Environment notes

- **git is not on PATH** on this machine, so no commit hashes are recorded here.
- **`.env` is set to `NODE_ENV=development`** locally (backup at `.env.bak-nodeenv`).
  Reverting to `production` re-enables the 100 req/15 min global limiter on the dev box.
- Recovery scripts added earlier: `scripts/repair-platform-registry.js`,
  `scripts/repair-feature-flags.js`. DB snapshots land in `scripts/backups/`.
- New this session: `src/utils/sessionRevocation.js`,
  `website/src/components/common/ClinicSuspendedDialog.jsx`.
