# BestoClinic — Bug Fix Handoff / Implementation Guide

**Purpose:** this document is written to be handed to an AI coding agent (or developer)
working directly on the server copy of this project. It contains, for every bug in
`BestoClinic Bugs.xlsx`, the **root cause**, the **exact file and location**, and the
**change to make**.

**Status of the tree you are working on matters.** Several of these bugs were already
fixed in a newer working copy but never deployed. **Before applying any fix below,
check whether the code already matches the "AFTER" state.** If it does, skip it and
mark the bug as "needs retest after deploy" — do not re-fix it.

---

## 0. How to work through this document

1. Work in a branch. `git checkout -b bugfix/handoff-batch`
2. Go cluster by cluster in the order given. Backend first, then frontend.
3. For each fix: open the file, find the anchor code, confirm it still looks like
   the "BEFORE", then apply the "AFTER".
4. After each cluster, run the verification command for that cluster.
5. At the end run the full verification block in §6.

**Never skip the verification step.** Two of the fixes below are permission/data
related and will silently appear to work while doing nothing.

### Environment facts you need

| Thing | Value |
|---|---|
| API port | `5016` (from `.env` `PORT`) |
| Platform DB | MongoDB Atlas (`PLATFORM_DB_URI` in `.env`) |
| Architecture | **DB-per-tenant.** Platform DB holds encrypted `dbUri` per clinic |
| Redis | required before any tenant DB access (URI cache) |
| Storage | `STORAGE_PROVIDER=local` — **S3 is NOT implemented** |
| Frontend build | `cd website && npx vite build` |
| Backend smoke | `node -e "require('./src/config/env'); require('./src/app')()"` |

### The single most important architectural gotcha

`scheduledAt` on appointments is stored as **"fake UTC"** — the clinic's IST wall-clock
time stamped with a literal `Z`. `2026-06-12T10:00:00.000Z` means **10:00 AM IST**, not
10:00 UTC. This is deliberate and backend-wide:

- `src/utils/slotGenerator.js` builds `` `${date}T${hh}:${mm}:00.000Z` `` from the
  doctor's `"09:00"` schedule string
- `src/services/availability.service.js` validates with `getUTCHours()` against those
  same strings, and has a `_localNow()` helper + `CLINIC_TZ_OFFSET_MS`

**Therefore:** any UI that renders `scheduledAt` must read it with `getUTC*`, never with
`toLocaleTimeString()` or date-fns `format()`. Helpers exist in
`website/src/utils/fakeUtcTime.js`. Do **not** "fix" this by changing storage — that
would require touching slot generation, booking validation, reminders and conflict
detection all at once.

**Exception:** `createdAt`, `checkedInAt`, `startedAt`, `completedAt` and care-reminder
`scheduledAt` are **real UTC** and must use normal local formatting. Do not convert those.

---

## 1. Database migrations

> These were already run against the live Atlas cluster from a separate working copy.
> **Re-running them is safe and idempotent** — they are additive only and write a
> timestamped JSON snapshot to `scripts/backups/` before touching anything.
> Run them again on the server to confirm state, using `--dry-run` first.

### 1.1 Role permission drift — bugs #39, #40, #42

**Root cause.** `src/modules/role/role.service.js` line ~34 resolves permissions as:

```js
return entry.roles[role] || ROLE_PERMISSIONS[role] || [];
```

Once a tenant has a `Role` document, the static `ROLE_PERMISSIONS` map in code is
**never consulted again**. `src/services/seedDefaultData.js` writes permissions with
`$setOnInsert`, so they are stamped once at provisioning and never refreshed. Any
permission added to the code afterwards never reaches existing tenants, which surfaces
to users as *"Missing required permission(s): …"*.

**Observed damage before fix (tenant `jathar-dental`):**

| Role | Missing |
|---|---|
| `receptionist` | 16 perms — appointments, invoices, payments, queue (**role was unusable**) |
| `admin` | 15 perms — jobs, credits, vendors, purchase orders |
| `doctor` | 1 — `purchaseOrder:read` |

**Fix.** Run the sync script:

```bash
node scripts/seed-roles-existing-tenants.js --dry-run   # preview
node scripts/seed-roles-existing-tenants.js             # apply
```

If `scripts/seed-roles-existing-tenants.js` on your copy still uses `$set` for
permissions and only lists 5 roles, replace that logic:

- It must cover **all 12 staff roles**, not 5 (add `super_admin` is optional — see note)
- It must use **`$addToSet`**, never `$set`. `$set` silently revokes any permission a
  clinic admin granted through Role Master.
- Do **not** seed `patient` / `guardian` — the `Role.group` enum has no bucket for them
  and creating docs would expose them in staff role selectors.
- Consider **not** seeding `super_admin` / `owner`: `staff.service.js _getStaffRoles()`
  lists every active role except group `clinical`, so creating those docs makes the two
  highest-privilege roles assignable from the Staff UI.

**Verify.** Mint a token for a receptionist and hit the endpoints:

```
GET /api/v1/appointments  -> 200 (was 403)
GET /api/v1/invoices      -> 200 (was 403)
GET /api/v1/queue         -> 200 (was 403)
```

⚠️ **Two caveats.**
- Permission cache TTL is **5 minutes** (`role.service.js`), and an external script
  cannot clear it. Either wait 5 min or restart the API.
- The frontend caches permissions in `localStorage` **at login**
  (`TenantAuthContext.jsx`). **Users must log out and back in** or their menus will
  still be wrong.

### 1.2 UserDirectory backfill — bug #8

**Symptom.** "Doctor sign in is not working with email address, only works with Clinic
code + Email + Password."

**Root cause.** `POST /api/v1/public/lookup-email` resolves an email → clinic purely
from the platform `UserDirectory` collection. `syncUserDirectory` is called on login,
registration, doctor-create and staff-create — but **users inserted directly by seed
scripts bypass the service layer entirely**. Before the fix, 35 users were absent,
including **8 of 10 doctors** at `jathar-dental` and 19 of 20 users at `smilecare-dental`.

**⚠️ The backfill script itself was broken.** `scripts/backfill-user-directory.js` calls
`getTenantConnection()`, which resolves tenant URIs through the Redis cache — but the
script never called `connectRedis()`. It skipped **every** clinic with
`"Redis not initialized"` and then exited `0` reporting success. Check for this:

```js
// scripts/backfill-user-directory.js — must be present near the top of backfill()
const { connectRedis } = require('../src/config/redis');
await connectRedis();
```

And clean up at the end:

```js
const { closeAllTenantConnections } = require('../src/db/tenantConnectionManager');
const { disconnectRedis } = require('../src/config/redis');
await closeAllTenantConnections();
await mongoose.disconnect();
await disconnectRedis();
```

**Run:**

```bash
node scripts/backfill-user-directory.js --dry-run
node scripts/backfill-user-directory.js
```

**Verify.** Compare tenant `User` docs against `UserDirectory` — expect **0 users
unreachable**. Do *not* verify by hammering `POST /public/lookup-email` in a loop; it is
rate-limited and will return 429, which looks like a failure.

### 1.3 `payment:read` for `department_manager` — bug #38

**Symptom.** "In Finance/Billing section — Invoice details view: Payment history is not showing."

**Root cause.** Not a data bug. The reporter (`Vishal Sawant`) is a
`department_manager`, who had `invoice:read` but **not** `payment:read`. He could see
the invoice and its totals, but the Payment History panel on the same screen returned
`403 Requires at least one of: payment:read, payment:readOwn`.

**Fix.** `src/config/permissions.js`, in the `department_manager` array:

```js
department_manager: [
  ...
  PERMISSIONS.INVOICE_READ,
  PERMISSIONS.PAYMENT_READ,   // <-- ADD (read-only; no create, no refund)
  ...
]
```

Then re-run `node scripts/seed-roles-existing-tenants.js` to push it to tenant DBs.

---

## 2. Backend code fixes

### 2.1 Teleconsultation — End Call does nothing (#12, #1) and call never ends (#2, #28)

**File:** `src/modules/telemedicine/video.service.js`

**Root cause.** `endSession()` calls `_validateTransition(session.status, ENDED)`, but
`VIDEO_SESSION_TRANSITIONS` in `src/config/constants.js` has **no entry for terminal
states** (`ended`, `cancelled`, `expired`, `no_show`). Both participants race to end the
same call, so whoever clicks second got
`400 Cannot transition from "ended" to "ended"` — and the UI never tore down.

**Fix — make ending idempotent.** In `endSession()`, immediately after the
`if (!session) throw` line and **before** `_validateTransition`:

```js
const TERMINAL = [
  VIDEO_SESSION_STATUS.ENDED,
  VIDEO_SESSION_STATUS.CANCELLED,
  VIDEO_SESSION_STATUS.EXPIRED,
  VIDEO_SESSION_STATUS.NO_SHOW,
];
if (TERMINAL.includes(session.status)) {
  _broadcastCallEnded(conn, session, user, tenantSlug, {
    reason: data.reason || session.status,
    durationSec: session.duration || 0,
    endedAt: (session.endedAt || new Date()).toISOString(),
  });
  return session;
}

_validateTransition(session.status, VIDEO_SESSION_STATUS.ENDED);
```

Add this helper near `_resolvePeerUserIds` (it also de-duplicates three copies of the
same emit block in `endSession`, `cancelSession` and `declineSession`):

```js
function _broadcastCallEnded(conn, session, user, tenantSlug, { reason, durationSec, endedAt }) {
  const payload = {
    sessionId: String(session._id),
    endedBy: String(user.userId),
    reason,
    durationSec,
    endedAt,
  };
  emitToVideoRoom(tenantSlug, session.roomId, SOCKET_EVENTS.VIDEO_CALL_ENDED, payload);
  _resolvePeerUserIds(conn, session, user.userId)
    .then((ids) => ids.forEach((pid) => emitToUser(pid, SOCKET_EVENTS.VIDEO_CALL_ENDED, payload)))
    .catch(() => { /* room broadcast above is the primary path */ });
}
```

### 2.2 Chat — messages stuck on "processing" (#14) and peer messages never appear

**Files:** `src/modules/telemedicine/telemedicine.validator.js`,
`src/modules/telemedicine/video.service.js`

**Root cause A — `clientId` was being deleted.** The web client sends a `clientId` so it
can swap its optimistic message bubble for the persisted one. `sendMessageSchema` did
not declare it, and `validate()` runs with `stripUnknown: true` — so it was stripped
before the service ever saw it. `clientId` appeared **nowhere** in the backend, so the
socket echo could never carry it back and the bubble stayed pending forever.

`telemedicine.validator.js` → `sendMessageSchema`, add:

```js
clientId: Joi.string().trim().max(64),
```

**Root cause B — key-name mismatch.** The broadcast payload sends `session` and `_id`,
but the client filters on `payload.sessionId` and de-duplicates on `payload.messageId`.
In `video.service.js` `sendMessage()`, the payload must carry both spellings:

```js
const payload = {
  _id: String(message._id),
  messageId: String(message._id),   // <-- ADD
  session: String(sessionId),
  sessionId: String(sessionId),     // <-- ADD
  clientId: messageData.clientId || null,  // <-- ADD
  sender: String(user.userId),
  senderRole,
  senderName,
  type: message.type,
  content: messageData.content || '',
  attachment: message.attachment || null,
  createdAt: message.createdAt.toISOString(),
};
```

**Root cause C — stored XSS (not on the bug sheet, fix it anyway).** `attachment.url` is
rendered straight into an `<img src>` and a download link, and Joi's default `.uri()`
**accepts `javascript:alert(1)`** (verified). In `shareFileSchema`:

```js
url: Joi.string().uri({ scheme: ['http', 'https', 'data'] }).required(),
```

`data:` must stay allowed — the web client base64-encodes small files inline.

### 2.3 Public asset 404 vs 401 — bug #10 (partial)

**File:** `src/app.js`

**Root cause.** `express.static` calls `next()` when a file is missing, so a missing logo
fell through the *public* mount into the **auth-protected** `/uploads` handler below it
and answered **401 Unauthorized** instead of 404 — making a storage problem look like an
auth problem.

```js
const publicDirs = ['logos', 'avatars'];
for (const dir of publicDirs) {
  app.use(
    `/uploads/${dir}`,
    corpHeader,
    express.static(path.join(uploadsPath, dir)),
    (_req, res) => res.status(404).json({ success: false, message: 'Asset not found' }), // <-- ADD
  );
}
```

**Verify** (private dirs must still require auth):

```
GET /uploads/logos/missing.jpg  -> 404
GET /uploads/xrays/secret.png   -> 401
```

### 2.4 Upload EACCES leaking to users — bug #6

**Files:** `Dockerfile`, `src/services/storage.service.js`

**Root cause.** The Prescription Reader showed the raw error
`EACCES: permission denied, open '/app/uploads/prescription-scans/….jpg'` — the container
process cannot write to its uploads directory.

**Dockerfile** creates four upload dirs but **omits `uploads/logos`** (this also explains
part of #10). Keep the list in sync with the `uploadDirs` array in `server.js`:

```dockerfile
RUN mkdir -p logs \
      uploads/logos \
      uploads/prescription-scans \
      uploads/xrays \
      uploads/avatars \
      uploads/documents && \
    chown -R appuser:appgroup logs uploads
```

**`storage.service.js`** — wrap `_uploadToLocal`'s mkdir/write in try/catch and translate
`EACCES`/`EPERM`/`EROFS` into a user-safe message plus an actionable server log. Do not
let the raw path reach the UI.

> **⚠️ Do NOT "fix" this by setting `STORAGE_PROVIDER=s3`.** `_uploadToS3` is a stub that
> throws, and `@aws-sdk/client-s3` is not a dependency. That setting disables all uploads.

### 2.5 Care task status always undefined — bug #26

**File:** `src/modules/doctorDashboard/doctorDashboard.service.js` →
`listDoctorCareTasks()`

**Root cause.** `PrescriptionTask` stores **`isActive` (Boolean)**. The service returned
`status: t.status`, which is always `undefined`. Consequences: the status badge rendered
blank, the row's "Send Summary" action (gated on `status === 'active'`) was unreachable,
and the Active/Completed filter tabs queried a field that does not exist.

Filter block:

```js
if (status === 'active') {
  filter.isActive = true;
} else if (status === 'completed') {
  filter.isActive = false;
}
```

Result mapping:

```js
status: t.isActive === false ? 'completed' : 'active',
```

**Verify:** `GET /api/v1/doctor/care-tasks?limit=5` — every row must report
`status=active|completed`, never `undefined`.

---

## 3. Frontend code fixes

### 3.1 `user.userId` is undefined everywhere — bug #11 (+ silent data-scope bug)

**File:** `website/src/tenant/TenantAuthContext.jsx`

**Root cause.** The API returns `user.toJSON()` of the Mongoose `User` document, which
exposes **`_id` only** — the `id` virtual is not serialised because the schema's `toJSON`
has no `virtuals: true`. Verified directly:

```
keys: name, email, role, …, _id, fcmTokens
j._id = ObjectId(…)   j.id = undefined   j.userId = undefined
```

Yet **10+ call sites across the doctor portal read `user?.userId`.**

Two classes of damage:
- **Visible (#11):** `deleteDoctorLeave(user?.userId, …)` produced
  `DELETE /doctors/undefined/leaves/<id>` → param validator rejects → *"Validation Failed"*.
- **Silent and worse:** `listAppointments({ doctor: user?.userId })` and
  `getCurrentQueue({ doctor: user.userId })` — `qs()` **strips undefined**, so the filter
  vanished and those queries returned **clinic-wide** results instead of that doctor's.

**Fix at the source** rather than patching 10 call sites. Add to `TenantAuthContext.jsx`:

```js
function normalizeUser(raw, tenantSlug) {
  if (!raw) return raw;
  const id = raw._id || raw.id || raw.userId || null;
  return { ...raw, _id: id, id, userId: id, ...(tenantSlug !== undefined ? { tenantSlug } : {}) };
}
```

Apply it in **three** places: the `localStorage` restore effect (old sessions lack
`userId`), and **both** login functions (`login` and `loginByClinicId`).

> ⚠️ **Expect doctor dashboard numbers to DROP after this fix.** They were previously
> showing clinic-wide totals. That is the fix working — warn the client so it isn't
> mistaken for a regression.

**Also fix the leave cancellation itself.** `website/src/tenant/pages/DoctorSchedule.jsx`
used the *admin* endpoint, which a doctor has no permission for. Add to
`website/src/tenant/api.js`:

```js
export const deleteOwnLeave = (leaveId) => request(`/doctor/leaves/${leaveId}`, { method: 'DELETE' });
```

and use it in `handleDeleteLeave` instead of `deleteDoctorLeave(user?.userId, …)`.

### 3.2 Dead / mismatched API endpoints

**File:** `website/src/tenant/api.js`

```js
// Void = soft-delete + cascade-fail pending payments. There is no PATCH /:id/void route.
export const voidInvoice = (id) => request(`/invoices/${id}`, { method: 'DELETE' });
```

**File:** `website/src/platform/api.js` — six subscription actions were missing the
`/subscription` path segment and several used the wrong verb:

| Action | Wrong | Correct |
|---|---|---|
| Change plan | `POST …/change-plan` | `PUT …/subscription/plan` |
| Cancel | `POST …/cancel` | `POST …/subscription/cancel` |
| Reactivate | `POST …/reactivate` | `POST …/subscription/reactivate` |
| Activate | `POST …/activate` ⚠️ | `POST …/subscription/activate` |
| Custom pricing | `POST …/custom-pricing` | `PUT …/subscription/custom-pricing` |
| Cancel scheduled change | `POST …/cancel-scheduled-change` | `DELETE …/subscription/scheduled-change` |

⚠️ The Activate one was the worst: `POST …/activate` *does* exist as **tenant**-activate,
so it silently hit the wrong endpoint and failed quietly instead of erroring.

### 3.3 Empty response body crashes the API client — bug #30 banner

**Files:** `website/src/tenant/api.js`, `website/src/patient/api.js`,
`website/src/platform/api.js`, `website/src/api/publicApi.js`

**Root cause.** `JSON.parse('')` throws. Any legitimately empty body — **204 No Content**
or **304 Not Modified** — produced the alarming banner
*"Invalid server response. Please try again or contact support."* on a request that had
actually succeeded. The other three clients used bare `res.json()`, which fails the same way.

`tenant/api.js`:

```js
const text = await res.text();
let data;
if (!text) {
  data = {};                    // 204 / 304 — legitimately empty
} else {
  try { data = JSON.parse(text); }
  catch {
    console.error(`Non-JSON response from ${path} (HTTP ${res.status}):`, text.slice(0, 300));
    throw new Error(res.ok
      ? 'Invalid server response. Please try again or contact support.'
      : `Server error (${res.status}). Please try again or contact support.`);
  }
}
```

The other three:

```js
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
```

### 3.4 Timezone display — bug #18

**File:** `website/src/utils/fakeUtcTime.js` — this module existed but was **imported by
zero components**. It was dead code while ~40 files rendered `scheduledAt` with local
formatting. Add these helpers alongside the existing `displayTime`/`displayDate`:

```js
/** Date whose LOCAL components equal the stored wall clock — for libraries that
 *  lay out by getHours()/getMinutes(), e.g. react-big-calendar. */
export function fakeUtcToLocal(isoString) { /* build from getUTC* parts */ }
export function localToFakeUtc(date) { /* inverse */ }
export function fakeUtcMinutes(isoString) { /* minutes past midnight, wall clock */ }
export function clinicNowMinutes(at = new Date()) { /* now in IST minutes */ }
```

**Files to convert (render `scheduledAt` — must use the helpers):**

| File | Change |
|---|---|
| `tenant/components/appointments/AppointmentBoardView.jsx` | `format(new Date(a.scheduledAt),'h:mm a')` → `displayTime(a.scheduledAt)` |
| `tenant/components/appointments/AppointmentListView.jsx` | date + time columns → `displayDate` / `displayTime` |
| `tenant/components/appointments/AppointmentTimelineView.jsx` | labels → `displayTime`; **positioning** → `fakeUtcMinutes`; "Now" marker → `clinicNowMinutes` |
| `tenant/components/appointments/AppointmentCalendarView.jsx` | `new Date(a.scheduledAt)` → `fakeUtcToLocal(a.scheduledAt)` |
| `tenant/components/schedule/ConflictAppointmentCard.jsx` | `format(scheduledAt,…)` → `displayDate` / `displayTime` |
| `tenant/pages/DoctorConsultations.jsx` | **must branch** — see below |

**The calendar was the worst one.** `react-big-calendar` positions events by *local*
getters, so raw fake-UTC Dates rendered every appointment **5½ hours out of position** —
a 10:00 appointment sat in the 15:30 row.

**`DoctorConsultations.jsx` mixes two conventions in one variable:**

```js
const scheduled = row.appointment?.scheduledAt;   // fake UTC
const dateStr   = scheduled || row.createdAt;     // createdAt is REAL UTC
const dateLabel = scheduled ? displayDate(scheduled) : format(new Date(dateStr), 'MMM d, yyyy');
const timeLabel = scheduled ? displayTime(scheduled) : format(new Date(dateStr), 'h:mm a');
```

**Leave these alone — they are correct:**
- `AppointmentDrawer.jsx` timeline (renders real-UTC `createdAt`/`checkedInAt`)
- `consultation/CareTaskChecklist.jsx` (care reminders use server `setHours()` → real UTC)
- `doctor/shared.jsx` `formatDate` (already uses `getUTC*`)

**Dead files — do not waste time converting (~6k lines, zero references):**
`patient/pages/PatientPortal.jsx`, `tenant/pages/DoctorPatientRecords.jsx`,
`tenant/components/ConsultationFormNew.jsx`, `tenant/pages/DoctorConsultationsOld.jsx`,
`tenant/pages/DoctorConsultationOld.jsx`, `tenant/components/ConsultationFormOld.jsx`

### 3.5 Video call — mute shows wrong name (#19), self-camera black (#15, #27)

**Files:** `website/src/patient/pages/PatientVideoCall.jsx`,
`website/src/tenant/components/VideoCallPanel.jsx`

**Bug #19 — stale closure.** The own-echo guard was
`String(payload.userId) === String(user?.id || user?._id)`. That *looks* right, but the
socket listener's dependency array is `[phase, doctorDisplay, pushToast]` (patient) /
`[roomData, onEnd, pushToast]` (doctor) — **`user` is not in it**. `TenantAuthContext`
starts `user` as `null` and fills it from `localStorage` in an effect, so the listener
closed over `null` permanently and compared against the string `"undefined"`. The server
broadcasts with `io.to(room)` — **to everyone including the sender** — so each
participant applied their own mute state to the peer, showing the *other* person's name.

Fix with a ref so the listener always reads the current id without re-subscribing:

```js
const selfIdRef = useRef(null);
useEffect(() => { selfIdRef.current = user?._id || user?.id || null; }, [user]);
// guard becomes:
if (payload?.userId && String(payload.userId) === String(selfIdRef.current)) break;
```

**Bugs #15 / #27 — ref/render race.** Both sides bound the local stream in an effect
keyed only on `[phase]` / `[roomData]`, while the stream lives in `localStreamRef` — a
**ref**. Refs don't trigger re-renders, so if `getUserMedia` hadn't resolved when that
effect ran, it fired once against `null` and never retried → permanently black tile. On
reconnect the phase doesn't change at all, so it never re-ran.

Fix order-independently, on **both** files:

```js
const [localStreamVersion, setLocalStreamVersion] = useState(0);
// bump it wherever localStreamRef.current is assigned:
setLocalStreamVersion((v) => v + 1);
// add it to the sync effect deps: [phase, localStreamVersion]
// and bind on mount via a callback ref:
const attachLocalVideo = useCallback((node) => {
  localVideoRef.current = node;
  if (node && localStreamRef.current && node.srcObject !== localStreamRef.current) {
    node.srcObject = localStreamRef.current;
  }
}, []);
// <video ref={attachLocalVideo} … />
```

**Bug #28 — doctor stuck on "reconnecting" forever.** A patient closing their tab arrives
as `reason: 'disconnect'`, which the client treats as a *transient* blip. A closed tab and
a network blip are indistinguishable at that layer and nothing bounded the wait. Add a
grace timer in `VideoCallPanel.jsx`:

```js
const PEER_REJOIN_GRACE_MS = 30000;
// on transient peer-left: start timer -> on fire, treat as real departure
// clear it on 'video:peer-joined' AND in cleanup()
```

### 3.6 Chat client — inbound messages silently dropped

**File:** `website/src/lib/telemedicine/SessionChatThread.jsx`

**Root cause.** The socket guard tested `payload.sessionId`, but the server sends
`session`. `normalizeServerMessage` handles both shapes — **but the guard runs first and
returns early**, so *every* incoming message was discarded. Peer messages only appeared
after a page reload.

```js
const payloadSessionId = payload?.sessionId || payload?.session;
if (!payload || String(payloadSessionId) !== String(sessionId)) return;
```

De-duplicate on the **normalized** id, not `payload.messageId`:

```js
const incoming = normalizeServerMessage(payload);
if (incoming._clientId) { /* replace optimistic by clientId */ }
if (incoming._id && prev.some((m) => m._id === incoming._id)) return prev;
```

**Ordering** — replace the blind `.reverse()` (it depends on `parsePagination`'s default
sort, so a change there flips the thread upside down) with an explicit sort:

```js
setMessages([...items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
```

**Upload limit** — the client accepted **50 MB** but base64-encodes into a JSON body
capped at **10 MB** (`express.json` in `src/app.js`), so anything over ~7 MB died in the
body parser. Set `MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024`.

### 3.7 White blank page — bug #31 (+ missing safety net)

**File:** `website/src/tenant/pages/InsuranceManagement.jsx`

**Root cause.** `InsuranceProvider.address` is a **nested object**
(`{street, city, state, zipCode, country}`), but the detail modal rendered
`{viewItem.address || '--'}` directly. React throws *"Objects are not valid as a React
child"* — and **the app has no error boundary anywhere**, so the entire screen went white.

```js
function formatAddress(address) {
  if (!address) return '--';
  if (typeof address === 'string') return address || '--';
  const parts = [address.street, address.city, address.state, address.zipCode, address.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '--';
}
```

**Add the safety net too** — create `website/src/components/common/ErrorBoundary.jsx`
(class component with `getDerivedStateFromError` + `componentDidCatch`), then:
- wrap `<App />` in `website/src/main.jsx`
- wrap the `<Outlet />` in **all four** layouts (`layouts/MainLayout.jsx`,
  `patient/PatientLayout.jsx`, `platform/PlatformLayout.jsx`, `tenant/TenantLayout.jsx`)
  so a page crash keeps the nav shell alive.

> **Gotcha when adding those imports:** three of those layouts open with a *multi-line*
> `import {` block. Do not blindly insert after "the last line starting with `import`" —
> that splits the statement and breaks the build. Put the import on line 1; ES imports hoist.

### 3.8 Remaining single-file fixes

| Bug | File | Fix |
|---|---|---|
| **#9** clinic logo missing on Doctors list | `components/marketplace/DoctorCard.jsx` | Component had **no logo rendering at all**. Add `resolveAssetUrl(doctor.clinicLogo)` + `<img>` with `onError` fallback to the `MapPin` icon |
| **#9** | `pages/Browse.jsx` | The grouped-response `flatMap` dropped `clinicLogo`. Add `clinicLogo: group.clinicLogo \|\| doc.clinicLogo \|\| ''` |
| **#16** clinic link → "Not Found" | `components/chatbot-v2/screens/DoctorSearchInline.jsx` | Built `/clinic/${slug}` — singular `/clinic` is the **staff portal**; the public route is `/clinics/:slug`. Because it uses `window.open` it's a real page load, so the server returned a bare text 404. Use `/clinics/${slug}/doctors/${id}` |
| **#7** always detects Pune | `components/chatbot-v2/hooks/useDoctorDiscovery.js` | `findNearestCity` snapped to the nearest of **10 hardcoded metros** using Euclidean maths on raw lat/lon degrees, then asserted *"You're in Pune"*. Use haversine, add a **100 km** threshold (beyond it, show the city picker instead of guessing), reword to *"Showing dentists near …"* |
| **#20** call module won't render | `patient/pages/PatientVideoCall.jsx` | Accepting a call while already on that route is a **no-op navigation** (same path, no remount), so the page stayed on the post-call screen. Read `useLocation().state?.acceptedAt` and add it to the session-resolution effect deps |
| **#35** "Error Loading consultation" | `tenant/pages/ConsultationDetail.jsx` | An appointment can be `in_progress` with **no `TreatmentRecord`** (1 of 8 in live data) → API 404s. Detect `/no consultation record/i` and offer **"Open Consultation"** → `/clinic/consultation/${appointmentId}` instead of a dead end |
| **#36** filter tabs misaligned | `tenant/pages/Appointments.jsx` | The status pill row was a flex item beside the selects, so its `overflow-x-auto` had no width to scroll within and just clipped. Give it its own full-width row; move the dropdowns to a second row |
| **#30** stretched buttons | `tenant/components/PaymentModal.jsx` | Footer inherited flex default `items-stretch`, stretching Cancel / Record Payment to ~300px tall. Add `items-center` |

---

## 4. NOT code bugs — do not try to fix these in code

### 4.1 Stale demo data — bugs #24, #29, #34

**Every one of these panels is reporting correctly. The zeros are true.**

Measured on `jathar-dental` (as of 2026-07-29):

| Panel | Shows | Reality |
|---|---|---|
| #34 Material Preparation ("Today") | 0 | **0 future appointments** — newest is 2026-07-07, i.e. 22 days in the *past* |
| #24 Upcoming leaves | 0 | 31 leaves exist, **0 ending in the future** |
| #29 Teleconsultations | 0 | **0 `VideoSession` records** (45 teleconsult *appointments* exist, but no sessions) |

**Action:** refresh the demo data — either shift existing `scheduledAt` values forward, or
stand up a clean date-current demo tenant (safer: leaves the tenant under test untouched).
**Do not** modify the aggregation code.

> This matters more than the remaining bug count. With three-week-old data, every
> "today / upcoming / this week" panel across the product reads zero, which reads as
> "the product is broken".

### 4.2 Persistent storage — bug #10

`uploads/logos/` is **empty on disk** while the DB references 6 logo files in it.
`STORAGE_PROVIDER=local` + ephemeral container filesystem = **uploads are wiped on every
deploy**. Also: 12 of 19 clinics have no logo at all, and `FeaturedDoctor.clinicLogo` is
empty on 34 of 52 records (re-run `scripts/seed-featured-doctors.js`).

**Fix options (infra, not code):**
1. Mount a **persistent volume** at `./uploads`, owned by the container's `appuser` — the
   only option that works today.
2. Implement the S3 client (`@aws-sdk/client-s3` + fill in `_uploadToS3` / `_deleteFromS3`).
   **Until then `STORAGE_PROVIDER=s3` disables uploads entirely.**

### 4.3 Not reproducible — bugs #5, #25

- **#25 "Manage availability from Admin side is not working."** All **17** real
  `DoctorSchedule` documents were run through the actual `scheduleSchema` exactly as the
  modal submits them: **17 pass, 0 rejected.** Admin also holds `USER_UPDATE`. Most likely
  a permissions failure caused by the role drift that §1.1 fixes. **Retest after deploy.**
- **#5 "Confirm shows Validation Failed, but sometimes works."** Intermittent by
  description; not reproducible from code. Needs a live repro with the browser network
  tab open. Note that §3.3 (empty-body JSON crash) is a plausible cause of the
  intermittency and may have already resolved it.

---

## 5. Already fixed — verify, don't re-fix

These were confirmed working against live data and need **deploy + retest only**:

| Bug | Evidence |
|---|---|
| #21, #22, #23 gender filter | Verified live: no filter → 44 (26M/18F); `?gender=male` → 26, all male; `?gender=female` → 18, all female |
| #3, #32 notifications | 80 "Your teleconsult is starting" records exist; patient bell screenshot shows 4 delivered; `CHECKED_IN` notifies the doctor at `appointment.service.js` ~line 437 |
| #13 chat styling | The "Session Chat" UI in the screenshot no longer exists — replaced by `SessionChatThread`, which already aligns/colours by sender and renders image previews and file chips |
| #37 invoice PDF | Returns valid `%PDF-` with correct `Content-Type` and `Content-Disposition`, verified for a `department_manager` |
| #41 | Tester already noted it resolved |
| #33 check-in time | `checkedInAt` = `2026-05-20T06:43:45Z` = **12:13 pm IST**, matching the reported "12:14 PM". Storage is correct. The confusion is that the panel shows **Schedule** (fake-UTC) and **Timeline** (real UTC) side by side |

---

## 6. Final verification

```bash
# Backend loads
node -e "require('./src/config/env'); require('./src/app')(); console.log('BACKEND OK')"

# Public vs private asset handling
#   /uploads/logos/missing.jpg -> 404
#   /uploads/xrays/secret.png  -> 401

# Frontend builds
cd website && npx vite build      # must exit 0

# Migrations (idempotent, snapshot written to scripts/backups/)
node scripts/seed-roles-existing-tenants.js --dry-run
node scripts/backfill-user-directory.js --dry-run
```

**Manual retest checklist (after deploy):**

1. Log **out and back in** — permissions are cached in `localStorage` at login
2. Receptionist: appointments / invoices / queue all load
3. Doctor: cancel a leave request → succeeds
4. Doctor dashboard counts are **lower** than before → correct (was clinic-wide)
5. Appointments → Calendar view: a 10:00 appointment sits in the **10:00** row
6. Two-party video call: mute shows **your own** name; self-view is not black;
   End Call tears down on **both** sides; closing a tab ends the peer's call within 30s
7. Chat: your message stops saying "processing"; peer messages appear **without reload**
8. Insurance → Providers → eye icon: modal opens (no white screen)
9. `department_manager`: invoice detail shows Payment History

---

## 7. Bug → location index

| # | Cluster | Primary file | §  |
|---|---|---|---|
| 1, 2, 12, 28 | Call lifecycle | `src/modules/telemedicine/video.service.js`, `website/src/tenant/components/VideoCallPanel.jsx` | 2.1, 3.5 |
| 3, 32 | Notifications | — already working | 5 |
| 5 | Confirm intermittent | not reproducible | 4.3 |
| 6 | Prescription Reader | `Dockerfile`, `src/services/storage.service.js` | 2.4 |
| 7 | Chatbot location | `website/src/components/chatbot-v2/hooks/useDoctorDiscovery.js` | 3.8 |
| 8 | Email-only login | `scripts/backfill-user-directory.js` | 1.2 |
| 9 | Logo on doctors list | `website/src/components/marketplace/DoctorCard.jsx`, `pages/Browse.jsx` | 3.8 |
| 10 | Logo files missing | infra — persistent volume | 4.2 |
| 11 | Cancel leave | `website/src/tenant/TenantAuthContext.jsx`, `pages/DoctorSchedule.jsx` | 3.1 |
| 13, 14 | Chat | `website/src/lib/telemedicine/SessionChatThread.jsx`, `telemedicine.validator.js`, `video.service.js` | 2.2, 3.6 |
| 15, 19, 27 | Camera / mute | `PatientVideoCall.jsx`, `VideoCallPanel.jsx` | 3.5 |
| 16 | Clinic link 404 | `website/src/components/chatbot-v2/screens/DoctorSearchInline.jsx` | 3.8 |
| 18, 33 | Timezone | `website/src/utils/fakeUtcTime.js` + 6 render sites | 3.4 |
| 20 | Call module render | `website/src/patient/pages/PatientVideoCall.jsx` | 3.8 |
| 21, 22, 23 | Gender filter | — already working | 5 |
| 24, 29, 34 | Zero counts | stale demo data | 4.1 |
| 25 | Manage availability | not reproducible | 4.3 |
| 26 | Care task actions | `src/modules/doctorDashboard/doctorDashboard.service.js` | 2.5 |
| 30 | Payment modal UI | `website/src/tenant/components/PaymentModal.jsx` | 3.8 |
| 31 | White blank page | `website/src/tenant/pages/InsuranceManagement.jsx` + `ErrorBoundary` | 3.7 |
| 35 | Error loading consultation | `website/src/tenant/pages/ConsultationDetail.jsx` | 3.8 |
| 36 | Filter tabs | `website/src/tenant/pages/Appointments.jsx` | 3.8 |
| 37, 41 | Invoice PDF | — already working | 5 |
| 38 | Payment history | `src/config/permissions.js` + role sync | 1.3 |
| 39, 40, 42 | RBAC | `scripts/seed-roles-existing-tenants.js` | 1.1 |

### Bonus fixes not on the bug sheet — apply these too

1. **Stored XSS** in chat attachments — §2.2 root cause C
2. **`voidInvoice` hit a non-existent endpoint** — §3.2
3. **6 platform subscription endpoints mismatched**, one silently hitting the wrong
   route — §3.2
4. **`backfill-user-directory.js` was broken** and exited `0` while doing nothing — §1.2
5. **No error boundary in a 359-file React app** — §3.7
6. **Empty-body responses crashed all 4 API clients** — §3.3
7. **Doctor dashboards were querying clinic-wide** data — §3.1
