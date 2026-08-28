# BestoClinic — Defect Tracker

Companion to `docs/BestoClinic_Defect_Register.docx` (findings) and
`docs/BestoClinic_Remediation_Plan.docx` (how they get closed).

**This file is the record that makes "zero open defects" checkable.** Update the
Status, Commit and Guard columns as work lands. A finding is only `CLOSED` when
the Guard column names a test, assertion or constraint that fails if the defect
returns — "fixed by inspection" is not a closure.

Re-audit entry point:

```bash
npm run lint && npm test && node scripts/self-check.js --strict
```

**Baseline: 117 findings, 0 closed** (verified against commit `7b16728`, 6 Aug 2026).

**Wave 0 day 1 applied — 11 findings fixed in the working tree, 0 yet guarded.**
Code changes are in place and verified not to regress lint (0 new errors; 8 pre-existing
remain) or the unit suite (17/17 pass). None of the 11 move to `CLOSED` until Wave 5
lands the test or assertion named in its Guard column — a fix without a guard is exactly
how these defects arrived. Status `FIXED (UNGUARDED)` is the intermediate state.

Status values: `OPEN` · `IN PROGRESS` · `CLOSED` · `WONTFIX (reason)`

---

## Critical — Wave 0

| ID | Defect | Location | Status | Commit | Guard |
|----|--------|----------|--------|--------|-------|
| C-01 | Six routers run `tenantResolver()` before `authenticate()` — cross-tenant read/write | `inventory.routes.js:20`, `purchaseOrder.routes.js:22`, `patientPortal.routes.js:46`, `doctorDashboard.routes.js:25`, `procedure.routes.js:18`, `reservation.routes.js:17` | FIXED (UNGUARDED) | wave0-d1 | `tenant-isolation.test.js` + self-check router-stack walk |
| C-02 | Refresh drops `deviceId`; next refresh revokes all sessions | `auth.service.js:175` | FIXED (UNGUARDED) | wave0-d1 | `session.test.js` — two consecutive refreshes on a named device |
| C-03 | Webhook HMAC computed over re-serialised body; `express.raw` is a no-op | `app.js:49`, `payment.service.js:474` | FIXED (UNGUARDED) | wave0-d1 | `webhook.test.js` with a **sender-escaped `\uXXXX`** payload — measured: compact ASCII *and* literal UTF-8 both round-trip and would pass against the broken code |
| C-04 | Refund calls gateway before the CAS guard — double disbursement | `payment.service.js:723` vs `:732` | OPEN | — | `refund.test.js` — concurrent refunds, gateway called once |
| C-05 | SMS stub returns `success: true` and increments paid quota | `sms.service.js:66-68` | FIXED (UNGUARDED) | wave0-d1 | Stub registry + self-check; assert no quota increment when unconfigured |
| C-06 | Appointment conflict check ignores existing `duration` | `appointment.service.js:122-131` | OPEN | — | `booking.test.js` + partial unique index on `{doctor, scheduledAt}` |
| C-07 | Discount codes never apply — `conn.model('Promotion')` on tenant connection.<br>**Revised:** `Promotion` is a subscription model; no patient-invoice promotion exists. Plan Option A = remove the surface | `billing.service.js:136` | FIXED (UNGUARDED) | wave0-d1 | Lint rule banning empty `catch` around `conn.model(...)` |
| C-08 | Tenant connections recreate ~49 collections → ~9-clinic Atlas ceiling | `tenantConnectionManager.js:94-102` | OPEN | — | `tenant-collections.test.js` — connect/disconnect does not grow count |
| C-09 | `complianceAlertWorker` disabled with live producers (clinical safety) | `jobs/index.js:116` vs `careReminderScanWorker.js:78-79` | OPEN | — | `queue-wiring.test.js` — every produced queue has a consumer |
| C-10 | `syncWorker` disabled with live producer — integrations never sync | `jobs/index.js:112` vs `externalSync.service.js:421` | OPEN | — | `queue-wiring.test.js` |
| C-11 | Frontend ships as one 2.99 MB chunk; 130 routes, 0 `React.lazy` | `website/src/App.jsx` | OPEN | — | CI bundle-size budget on the entry chunk |
| C-12 | Fixed-amount promotion drives GST negative (latent behind C-07) | `billing.service.js:143-174` | OPEN | — | Closed by C-07 Option A; must be rebuilt into Option B if chosen |

## High — Wave 0 remainder

| ID | Defect | Location | Status | Commit | Guard |
|----|--------|----------|--------|--------|-------|
| H-01 | `/uploads` authorises on any valid JWT — no ownership or tenant scope | `app.js:111` | OPEN | — | Integration test: tenant-A token cannot fetch tenant-B file |
| H-02 | WebSocket auth skips the access-token blacklist | `wsAuth.js:27` | FIXED (UNGUARDED) | wave0-d1 | Test: revoked token is refused at handshake |
| H-03 | Logout without `deviceId` leaves the refresh token live | `auth.controller.js:22` | FIXED (UNGUARDED) | wave0-d1 | `session.test.js` |
| H-04 | Blacklist TTL hardcoded 900s vs configurable token lifetime | `auth.service.js:189` | FIXED (UNGUARDED) | wave0-d1 | Derived from `JWT_ACCESS_EXPIRES_IN`; unit test |
| H-06 | `department_manager` may update/delete branches but not create | `permissions.js:339` | FIXED (UNGUARDED) | wave0-d1 | Permission-matrix snapshot test |
| H-07 | Public upload endpoints have no dedicated rate limiter | `public.routes.js:894`, `:935` | FIXED (UNGUARDED) | wave0-d1 | Route-config assertion |
| H-08 | Login self-heal queries `PlatformPatient` with un-normalised email | `auth.service.js:112` | FIXED (UNGUARDED) | wave0-d1 | Unit test with mixed-case email |

## High — Wave 1

| ID | Defect | Location | Status | Commit | Guard |
|----|--------|----------|--------|--------|-------|
| H-05 | Password reset fans out to every connected clinic | `auth.service.js:648-675` | OPEN | — | Documented + user-facing notice; test asserts notification sent |
| H-09 | Two permission engines disagree (`_hasFullAccess` vs `authorize`) | `payment.service.js:22-25` + peers | OPEN | — | Lint rule banning `ROLE_PERMISSIONS` import outside `config/` |
| H-10 | Payment idempotency + overpayment guards are read-then-write | `payment.service.js:179-209` | OPEN | — | Unique index on `idempotencyKey`; concurrency test |
| H-11 | Gateway verify skips invoice update when client omits `invoiceId` | `payment.service.js:431` | OPEN | — | `invoiceId` required in validator |
| H-12 | Invoice `sequenceNumber` read-max-then-increment, not unique | `billing.service.js:41-47`, `Invoice.js:81` | OPEN | — | Atomic counter + unique index |
| H-13 | Invoice numbers are not a sequential statutory series | `Invoice.js:148-151` | OPEN | — | Format assertion test (**confirm cutover with GST filer first**) |
| H-14 | Webhook subject to the global rate limiter | `app.js:71` | FIXED (UNGUARDED) | wave0-d1 | Route-config assertion |
| H-15 | No TURN server configured — teleconsults fail behind symmetric NAT | `video.service.js:475-488`, `.env` | OPEN | — | Stub registry + settings-screen ICE health indicator |
| H-16 | S3 storage selectable but not implemented | `storage.service.js:93-101` | OPEN | — | Stub registry |
| H-17 | Four more workers disabled; queues still declared | `jobs/index.js:84-90` | OPEN | — | `UNUSED_QUEUES` allowlist + `queue-wiring.test.js` |
| H-18 | Role-permission cache is per-process, 5-min TTL | `role.service.js:9-41` | OPEN | — | Redis-backed with pub/sub invalidation |
| H-19 | Redis is a hard dependency of every tenant request | `featureGuard.js:190` | OPEN | — | DB fallback; test with Redis unavailable |
| H-20 | Eleven env vars bypass boot validation (incl. `JWT_SECRET` fallback) | project-wide | OPEN | — | `no-restricted-syntax` promoted to `error` + self-check |
| H-21 | Timezone helper used by 1 of 12 modules; 37 `setHours` call sites remain | `clinicTime.js` vs 11 files | OPEN | — | Lint rule banning `setHours(0,0,0,0)` outside `clinicTime.js` |
| H-22 | Six scan workers walk every tenant serially against a 50-connection pool | 6 files in `jobs/workers/` | OPEN | — | Batched + paged; ideally a separate worker process |
| H-23 | No Socket.IO Redis adapter — realtime breaks with >1 replica | `package.json` | OPEN | — | Self-check asserts adapter when replicas > 1 |
| H-24 | `redis.keys()` on the admin path — blocking O(N) | `featureGuard.js:293` | OPEN | — | Lint rule banning `redis.keys(` |
| H-25 | `processRefund` returns the stale pre-update document | `payment.service.js:822` | OPEN | — | Closed by C-04 rewrite; `refund.test.js` asserts response shape |
| H-26 | Tenant-connection failures surface as generic 500s | `tenantConnectionManager.js:51`, `:226` | OPEN | — | Typed `ApiError`; test asserts 404 vs 503 |
| H-27 | Fire-and-forget identity syncs swallow all failures | `auth.service.js:85`, `:89`, `:138` | OPEN | — | Logged failure counter |
| H-28 | Appointment has no unique constraint on a doctor's slot | `Appointment.js:144` | OPEN | — | Covered by C-06 index |
| H-29 | `CreditNote` numbering repeats the non-sequential Invoice pattern | `CreditNote.js:90-94` | OPEN | — | Covered by H-12/H-13 counter |
| H-30 | `GuestScan` retains biometric imagery under a TTL only | `GuestScan.js:181-184` | OPEN | — | Retention policy + deletion-on-request endpoint |

## High — Waves 3 (frontend)

| ID | Defect | Location | Status | Commit | Guard |
|----|--------|----------|--------|--------|-------|
| H-31 | Three privilege tiers share one origin and `localStorage` | `useAuthStatus.js:14`, `:36` | OPEN | — | Platform console on a separate origin |
| H-32 | 12 `htmlFor` bindings against 538 `<label>` elements | `website/src` | OPEN | — | `jsx-a11y/label-has-associated-control` in CI |
| H-33 | 9 `role="dialog"` / `aria-modal` occurrences app-wide | `website/src` | OPEN | — | Shared modal component + a11y lint |
| H-34 | 0 of 69 `<img>` carry `loading="lazy"` | `website/src` | OPEN | — | ESLint rule |
| H-35 | 9 `document.title` assignments across 130 routes | `website/src` | OPEN | — | `useDocumentTitle` hook in the route wrapper |

## Dead code — Wave 1

| ID | Item | Size | Status | Commit |
|----|------|------|--------|--------|
| D-01 | `src/modules/procedure/` — complete, never mounted. **Revised: it is un-mountable.** Requires `PROCEDURE_CREATE/READ/UPDATE`, none of which exist in `PERMISSIONS`; `authorize()` validates keys at require time, so the module throws on `require` and would crash the boot if mounted | 247 lines, 4 endpoints | OPEN — decide delete vs build | — |
| D-02 | `src/modules/reservation/` — same. Requires `RESERVATION_CREATE/READ/RELEASE`, none of which exist | 269 lines, 3 endpoints | OPEN — decide delete vs build | — |
| D-03 | `websocket/handlers/chatHandler.js` — deprecated, unreferenced | 26 lines | OPEN | — |
| D-04 | `jobs/index.js:1-50` — previous implementation, commented out | 50 lines | OPEN | — |
| D-05 | `services/adapters/index.js` — unreferenced | 22 lines | OPEN | — |
| D-06 | `_uploadToS3` / `_deleteFromS3` — both throw | `storage.service.js:93-101` | OPEN | — |
| D-07 | `tenantLimiter()` — implemented, only call site commented out | `rateLimiter.js:72` | OPEN | — |
| D-08 | `invoiceOverdueQueue`, `reportGenerationQueue`, `auditArchivalQueue` — no producer, no consumer | 3 definitions | OPEN | — |

## Medium and Low — Wave 4

Tracked as themed batches; expand into rows when the batch is picked up.

| ID | Batch | Count | Status |
|----|-------|-------|--------|
| M-A | Error-contract consistency — bare `Error` where `ApiError` expected, swallowed catches | 12 | OPEN |
| M-B | Query hygiene — unbounded `find()`, `populate()` without projection, missing `.lean()` | 14 | OPEN |
| M-C | Accessibility long tail — ARIA state, focus order, colour-only state, keyboard traps | 16 | OPEN |
| M-D | Validation gaps — unvalidated query params, missing param schemas | 9 | OPEN |
| M-E | Logging and observability — no correlation on background jobs, missing tenant context | 8 | OPEN |
| M-F | Comment/code drift — comments describing behaviour the code lacks | 11 | OPEN |

## Regression armour — Wave 5

Closes no findings. Keeps every closure durable. Not optional: without these,
this table returns to `OPEN` one release at a time.

| ID | Artifact | Status | Guards |
|----|----------|--------|--------|
| G-01 | `src/config/selfCheck.js` — router order, queue wiring, stub states, env coverage, tenant conn options | OPEN | C-01, C-05, C-08, C-09, C-10, H-20, H-23 |
| G-02 | `src/config/stubs.js` — stub registry feeding boot report, `/monitoring`, settings UI | OPEN | C-05, H-15, H-16 |
| G-03 | ESLint rules (5 — see plan §9.3) | OPEN | C-07, H-09, H-20, H-21, H-24 |
| G-04 | Seven integration suites (see plan §9.4) | OPEN | C-01…C-04, C-06, C-08, C-09 |
| G-05 | `.github/workflows/ci.yml` — lint + unit + integration on PR | OPEN | all of the above |
| G-06 | Test harness: `MongoMemoryReplSet` (transactions) + `ioredis-mock` | OPEN | prerequisite for G-04 |

---

## Open decisions — needed before the relevant task starts

| # | Decision | Blocks | Owner |
|---|----------|--------|-------|
| 1 | C-07: remove the discount-code surface (Option A) or build `ClinicPromotion` (Option B, 3–4d) | C-07, C-12 | Product |
| 2 | H-13: invoice-series cutover point — next financial year or at deploy | H-13, H-29 | Whoever files GST |
| 3 | C-09/C-10: enable the two workers, or remove producers **and** the UI that offers the feature | C-09, C-10 | Product + Eng |
| 4 | Atlas MongoDB version — `$in` in `partialFilterExpression` needs 5.3+ | C-06 | Eng (verify) |
| 5 | `razorpay@2.9.4` refund idempotency-key support | C-04 | Eng (verify) |
| 6 | C-05: ship honest stub now and schedule a real provider, or block on the provider | C-05 | Product |
