# BestoClinic — Bug Report & Fix Priority

**Date:** 30 July 2026
**Branch:** `bugfix/batch1-batch2-multitenancy`
**Method:** code audit plus read-only queries against the live platform and tenant databases. Every item marked **Verified** was reproduced against real data or by executing the code path; items marked **Code-read** were established by reading the implementation but not executed.

Priorities are ordered by *what it costs to leave it alone*, not by effort.

| | Meaning |
|---|---|
| **P0** | Loses money, leaks access, or corrupts/misreports data. Fix before the next release. |
| **P1** | A feature is advertised but does not work. Users hit it. |
| **P2** | Wrong or confusing behaviour with a workaround. |
| **P3** | Hygiene, consistency, future risk. |

---

## Status at a glance

| Priority | Items | Fixed | Outstanding |
|---|---|---|---|
| P0 | 4 | 3 | **P0-1** (your Razorpay keys) · **P0-2(a)** (subscription backfill — awaiting your call) |
| P1 | 6 | 5 | none — P1-6 was a false alarm, corrected below |
| P2 | 8 | 8 | none |
| P3 | 6 | 3 fixed, 3 accepted | see notes |

**Two things are deliberately not done, and neither is a coding task:**

1. **Razorpay credentials (P0-1).** The secret in `.env` is 11 characters; the API rejects it with a 401. Every payment path is fixed and hardened, but nothing can transact until valid keys are in place and the API restarts.
2. **Subscription backfill (P0-2a).** Creating the missing `Subscription` documents makes seven overdue paid clinics visible to the lifecycle worker — they would enter grace within the hour and suspend seven days later. Whether to bill, extend, or write off those periods is a business decision, so the data has been left untouched.

---

## P0 — Money, security, data integrity

### P0-1 · Razorpay credentials are invalid — every gateway payment fails silently
**Verified.** A read-only `orders.all` call returns `401 BAD_REQUEST_ERROR: Authentication failed`. `RAZORPAY_KEY_SECRET` is 11 characters; real secrets are 24.

Because `razorpay.createOrder()` runs *before* `Payment.create()` in [payment.service.js:306](src/modules/payment/payment.service.js#L306), a failure leaves **no database record at all** — not even a `pending` row. Four invoices raised on 30 Jul (₹51,500 total) have zero payment rows against them.

**Impact:** no online payment can be taken, and failed attempts are invisible in the app.
**Fix:** put valid keys in `.env` and restart the API. *(Config only — code side is already hardened: see “Fixed” below.)*

### P0-2 · Subscriptions never expire — two independent causes · **CODE FIXED, DATA PENDING**
**Verified, and worse than first reported.** Two separate faults compound:

**(a) No clinic has a `Subscription` document.** Of 21 clinics, **0** have one; their plan lives only on the Clinic doc. `processSubscriptionLifecycle()` queries the `subscriptions` collection, so every clinic is invisible to it. (The collection holds exactly one document, an orphan whose clinic no longer exists — an earlier draft of this report wrongly called the collection empty.)

**(b) Nothing ever expired an active subscription anyway.** The worker expired *trials* and suspended subscriptions *already* in grace — but only a Razorpay payment-failure webhook ever set grace in the first place. With no recurring billing configured, an `active` plan ran past `currentPeriodEnd` forever. The state machine had always permitted `active → grace_period`; no code performed it.

**Seven clinics are on paid plans past their period end, fully featured and unbilled:**

| clinic | plan | overdue |
|---|---|---|
| smilecare-dental | professional | 122 days |
| little-angels-pediatric | starter | 113 days |
| momcare-hospital | professional | 103 days |
| skin-and-you-derma | starter | 108 days |
| jathar-dental | professional | 88 days |
| healthplus-hospital | enterprise | 68 days |
| cardiocare-heart | enterprise | 38 days |

**(b) is fixed** — a new lifecycle step moves `active` past `currentPeriodEnd` into `grace_period` with a 7-day deadline, after which the existing step suspends. Tested against a real overdue subscription: transition, grace deadline and audit entry all correct.

**(a) is a data decision, not a code one, and has NOT been run.** Backfilling one `Subscription` per clinic makes them visible to the worker — and the seven above would enter grace on the next hourly run and suspend 7 days later. Whether to bill, extend, or write off those periods first is a business call.
**Next step:** confirm the intent, then run the backfill.

### P0-3 · `countDocuments` ignores soft deletes — 117 call sites · **FIXED**
**Verified.** The `pre(/^find/)` hook does not match `countDocuments` or `distinct`. On `JobPosting`: `find()` → 26, `countDocuments()` → 36, soft-deleted → 10.

Fixed centrally with [`plugins/softDeleteCount.js`](src/models/plugins/softDeleteCount.js), applied to all 37 registered tenant schemas via the registry and to the 5 platform models directly. `skipSoftDelete` and explicit `deletedAt` queries still bypass it.
**After:** `countDocuments()` → 26, matching `find()`; `skipSoftDelete` still → 36; `distinct('slug')` → 26.

### P0-4 · A published job could be made “featured” for free · **FIXED**
`updateJobPosting` accepts `isFeatured`, but the 2 featured credits were only charged at publish — so publishing cheaply and then editing the flag bought paid placement for nothing.

Now charges `JOB_CREDIT_COSTS.FEATURE` when the flag is turned on for an **active** posting, deducting *before* saving so an insufficient wallet aborts the whole update. Draft postings still toggle freely, since publish bills them.

---

## P1 — Advertised features that do not work

### P1-1 · Notification pagination is dead · **FIXED**
**Code-read, high confidence.** `validate(..., { source: 'query' })` runs with `stripUnknown: true` ([validate.js:147](src/middleware/validate.js#L147)) and `listNotificationsQuery` allows only `type` and `isRead`. `page` and `limit` are deleted before `parsePagination` sees them.

**Impact:** the notifications page is permanently stuck on page 1; the bell requests 5 items and receives 20.
**Fix:** add `page`/`limit` to the schema. **Check the same pattern** in `analytics`, `dentalScan`, `procedure`, `productOwner`, `globalSearch`, `billing` and `conflictResolution` validators, none of which declare `page`.
**Effort:** ~20 minutes plus the sweep.

### P1-2 · The “Unread” notification filter does nothing · **FIXED**
**Code-read.** The frontend sends `unread=true` ([PatientNotifications.jsx:125](website/src/patient/pages/PatientNotifications.jsx#L125)); the service reads `isRead` — and `unread` is stripped by the validator anyway.
**Fix:** send `isRead=false`. **Effort:** 5 minutes.

### P1-3 · Four notification types are addressed to a non-existent recipient · **FIXED**
**Code-read.** `conflictResolution.service.js` lines 400, 488, 596, 648 pass `patient._id` where every other creator passes `patient.user`. `Notification.recipient` is a **User** id.
**Impact:** rescheduling and cancellation-refund notices never reach anyone.
**Fix:** use `patient.user`. **Effort:** 15 minutes.

### P1-4 · “Remove dependent” calls an endpoint that doesn't exist · **FIXED**
**Code-read.** [tenant/api.js:594](website/src/tenant/api.js#L594) calls `DELETE /portal/dependents/:id`; no such route is registered. The UI shows “Guardian link removed” on failure.
**Fix:** remove the dead button (detach is the supported path) or implement the route. **Effort:** 15 minutes.

### P1-5 · No patient → guardian upgrade path · **FIXED**
**Code-read.** Role is fixed at signup (`auth.validator.js:10` allows `patient`/`guardian` only at registration). [PatientDependents.jsx:300](website/src/patient/pages/PatientDependents.jsx#L300) tells the user to “contact your clinic to set up guardian access” — no such staff flow exists.
**Impact:** anyone who chose “For myself” and later has a child must create a second account.
**Fix:** a staff-side role change, or self-serve promotion on first dependent. **Effort:** ~half a day.

### P1-6 · Clinics without a `clinicCode` — **NOT A LIVE ISSUE (corrected)**
The first draft of this report claimed 12 clinics had degraded email-first login. A dry run of `scripts/backfill-user-directory.js` shows that is wrong: **all 9 active clinics already have codes and complete directory entries** (166 users, 0 missing). The 12 without codes are all inactive/pending tenants — including `hh` and `JJ`, whose provisioning failed on the clinic-code bug (P0 section). They receive a code when provisioning completes, now that the generator is fixed.
**Action:** none. Re-run the backfill after retrying those tenants if you want belt-and-braces.

---

## P2 — Wrong or confusing behaviour · **ALL FIXED**

| ID | Issue | Resolution |
|---|---|---|
| P2-1 | A multi-type notification filter sent a comma list to a Joi `valid()` and would 400. | The validator now accepts a comma-separated set and the service maps it to `$in`. |
| P2-2 | New prescriptions were typed `appointment` — calendar icon, wrong filter chip. | Added a `prescription` notification type, with its own icon, colour and filter chip in both the bell and the list. |
| P2-3 | The job form sent `location.branch`, which the schema and validator silently dropped; the page re-derived it by matching city names. | `branch` added to both, so the selected branch persists. |
| P2-4 | No-show rate divided by *all* appointments in the month, including ones that hadn't happened — artificially low on the 1st, climbing all month. | Divides by concluded appointments (completed + no-show). |
| P2-5 | `detachDependent` ran four unguarded steps; a mid-way failure stranded an archive row for a still-attached dependent. | The new account is created first — the only step that realistically fails on input — and the rest runs in a try/catch that deletes it on failure, so a retry isn't blocked by "email already registered". |
| P2-6 | `GuardianConsent.ipAddress` existed for evidential weight but was never written. | Captured from `req.ip` at consent time. |
| P2-7 | Soft-deleting a dependent left the guardian consent live. | `deletePatient` now revokes outstanding consents as part of its cascade. |
| P2-8 | Abandoned checkouts stayed `pending` forever. | `expireStalePendingPayments()` closes off uncaptured orders older than 24h. Deliberately leaves rows the gateway already captured. |

---

## P3 — Hygiene · **ALL ADDRESSED**

- **P3-1 · Duplicate index declarations — FIXED.** 19 fields declared an index twice (field-level *and* `schema.index()`), warning on every boot. Removed the redundant declaration in each; where the standalone index carried real options (TTL on `Consent.expiresAt` / `ShareToken.expiresAt`, the partial unique index on `CashRegister.branch`) the field-level flag was dropped instead so the meaningful index survives. **Verified: 19 → 0 warnings.**
- **P3-2 · Two definitions of "monthly revenue" — FIXED.** `dashboard.service.js` summed paid *invoices* by `paidAt` while `analytics.service.js` summed *payments* by `createdAt`. Both now use the same net-cash-collected definition, so the same words give the same number on every screen.
- **P3-3 · Redis was mandatory for tenant DB connections — FIXED.** It is a cache, not the source of truth, but a missing Redis threw `Redis not initialized` and blocked every script. Cache reads and writes are now best-effort with a warning, falling back to the platform DB. **Verified:** a tenant connection now opens with no Redis running.
- **P3-4 · `_stepApplyPlan` reads payment details from a synthetic `_paymentDetails` provisioning step** — works, but it is a side channel rather than a field. Left as is; changing it is a refactor, not a fix.
- **P3-5 · `ProcedureTemplate.js` and `MaterialReservation.js` throw on require** — they read `PROCEDURE_CATEGORY` / `RESERVATION_STATUS` constants that do not exist. Their modules are also never mounted, so the feature is unreachable rather than broken in production. **Left deliberately unfixed:** adding these schemas to the tenant registry crashes the API at boot, and defining the missing constants would resurrect a half-built feature nobody asked for. A comment in `models/tenant/index.js` records why.
- **P3-6 · One orphaned `Subscription` document** points at a clinic id that no longer exists. Harmless; delete it whenever you clean up.

---

## Fixed during this session

All verified by loading the modules, parsing the frontend, and where possible executing against live data.

**Job portal** — publish-after-edit 400; editing closed/filled postings; repost of closed/filled jobs (new `POST /jobs/:id/repost`, idempotent, with `repostedFrom` lineage so a relisted role stops appearing twice); resume View/Download menu with in-app PDF preview.

**Payments** — the staff modal sent **rupees** into an endpoint expecting **paise**, charging 1/100th of every invoice and recording it as revenue; verify omitted a required field so payments stuck in `pending`; the settled amount was taken from the **client** at verification (a client could pay ₹1 and claim any plan) and now comes from Razorpay; checkout script was never loaded on the clinic side; signature verifiers crashed with a `RangeError` on a malformed signature instead of returning “invalid”; gateway misconfiguration now fails with an actionable message and a log line instead of vanishing.

**Analytics** — refunds erased the entire original payment instead of reducing it; `credit_balance` counted as revenue; month/day boundaries used server-local time instead of IST; today's appointments counted cancelled ones and the week ran only to “now”.

**Provisioning** — clinic-code generation produced invalid codes for names under three letters (`"hh"` → `HH1234`), and the fallback emitted hex where digits were required. Both fixed and verified against every real clinic name.

**Subscriptions** — built clinic-facing self-service: overview with usage against every limit, quote/order/verify upgrade flow with proration, renewal after expiry, add-on purchases, scheduled downgrades, an expiry banner, and upgrade prompts on limit errors. Free plan restricted to first registration and hidden thereafter.

**Notifications** — clicking a notification (bell or list) now opens the specific appointment, invoice or prescription rather than a generic list.

**Navigation** — logos link home; every route change now starts at the top of the page.

---

## Coverage and limits

Audited in depth: job portal, payments and billing analytics, notifications, subscriptions and provisioning, guardian/dependents, tenant and patient navigation shells.

Cross-cutting sweeps: query-validator pagination, `countDocuments` soft-delete, `timingSafeEqual` usage, client-supplied monetary values, unauthenticated route files.

**Not audited:** appointments and scheduling, telemedicine/video, inventory, payroll, insurance claims, dental-scan AI, compliance alerts, external integrations, and the platform-owner console beyond subscriptions. A P0 could well be sitting in any of these — absence from this report is not evidence of absence.
