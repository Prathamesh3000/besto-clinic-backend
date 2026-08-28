# Security & Coding Standards — Hardening Pass

**Date:** 31 July 2026
**Scope:** backend (`src/`, dependencies, lint baseline). The frontend was not part of this pass.

---

## 1. Brute force was completely unprotected — **FIXED**

Rate limiting was written, wired, and then commented out:

```js
// ── Rate limiting ─────────────────────────────
// Temporarily disabled
// if (process.env.NODE_ENV !== 'development') {
//   app.use('/api/', globalLimiter());
// }
```

Every auth route carried the same treatment — `/login`, `/register`, `/refresh`, `/forgot-password`, `/reset-password` and `/platform/login` all had `/* authLimiter(), */` commented out, with the note *"rate-limited - commented out for development"*. The limiters themselves were fine; nothing was calling them.

**Impact:** unlimited credential stuffing, password-spraying and password-reset abuse against every account, including platform admin.

**Now:** the global limiter is active outside development, and `authLimiter()` is applied to all six auth routes regardless of environment. `server.js` connects Redis before `createApp()`, so limits are shared across replicas rather than per-process. Health probes are unaffected.

## 2. No defence against Mongo operator injection — **FIXED**

Joi covers routes that validate, but not every route has a validator, and object-typed fields (metadata, filters, address blocks) passed through untouched. The classic payload was viable:

```json
{ "email": { "$ne": null }, "password": { "$ne": null } }
```

**Now:** [`middleware/sanitizeMongo.js`](src/middleware/sanitizeMongo.js) strips keys beginning with `$` or containing `.` from body, query and params before any route reads them, and logs what it removed — legitimate clients never send these. Verified against operator payloads, dotted paths, nested operators and arrays of objects, with normal payloads passing through untouched.

## 3. Dependency vulnerabilities — **critical 3 → 0, high 13 → 0** (production)

| | before | after |
|---|---|---|
| critical | 3 | **0** |
| high | 13 | **0** |
| moderate | 8 | 8 |

Three things got us there:

- `npm audit fix` (no `--force`) — cleared the semver-safe set: `axios`, `ws`, `socket.io-parser`, `engine.io`, `protobufjs`, `shell-quote`, `websocket-driver`, `form-data`, `path-to-regexp`, `js-yaml` and others.
- **Removed three React Native packages from the API's production dependencies** — `@react-native-clipboard/clipboard`, `react-native-keychain`, `react-native-reanimated`. Nothing in this repository imports them, and they dragged in the whole React Native tree (139 packages), which was the source of most remaining high findings. If a mobile app depends on these, it needs its own `package.json`; they do not belong to an Express API.
- **`nodemailer` 8.0.1 → 9.0.3** for the `raw`-option advisory (arbitrary file read / SSRF in the delivered message). Our usage is `createTransport` + `sendMail` with no `raw`, so exposure was limited, but the bump is clean. Email service verified loading afterwards.

**The remaining 8 moderates are deliberate:**
- `firebase-admin` and its `@google-cloud/*` chain — npm's suggested "fix" is a **downgrade** to 10.3.0, which is worse than the finding.
- `uuid` — the advisory affects `v3/v5/v6` when a `buf` argument is passed. This codebase only calls `uuidv4()`, so it is not reachable. The fix is a major bump with ESM implications.

Neither is worth a breaking change today; both are recorded here so the decision is visible rather than forgotten.

## 4. Lint could never run — **FIXED**

`package.json` has had `"lint": "eslint src/ --ext .js"` all along, but **no ESLint config existed** for the backend — only `website/eslint.config.js`. The script failed with *"couldn't find a configuration file"*, so no backend code has ever been linted.

[`.eslintrc.json`](.eslintrc.json) now exists, tuned to catch defects rather than argue about style. Two rules are project-specific:

- **`no-restricted-syntax`** flags `process.env.X` outside `src/config/`, `server.js`, `scripts/` and tests, because `env.js` validates at boot and direct reads fail at first use instead. `NODE_ENV` is exempt. Set to **warn** — migrating the flagged keys (`TURN_*`, `TENANT_DB_*`, `TELEMEDICINE_SECRET`) into `env.js` is a real refactor, not a mechanical fix. `TELEMEDICINE_SECRET` is the cautionary example: it is read at module load with no validation, and throws on import when unset.
- **`no-empty`** allows empty `catch` blocks — a deliberate best-effort idiom throughout this codebase.

### Bugs the linter found immediately

- **`billing.service.js`** — `{ $exists: true, $ne: null, $ne: '' }`. A duplicate key: the second `$ne` silently replaced the first, so **null HSN codes were never excluded from the GST report** and formed their own bucket. Now `$nin: [null, '']`.
- **`aiAnalysis.service.js`** — two `new Promise((r) => setTimeout(r, ms))` executors returning the timer id, plus a stray escape inside a template literal.

### Current baseline: 36 errors, 19 warnings across 370 files

All pre-existing. The 36 errors are unused variables, and **six of them are worth attention rather than deletion** — they are query validators that were written, imported, and never attached to their route:

| File | Unused validator |
|---|---|
| `purchaseOrder.routes.js` | `listPOQuerySchema`, `listVendorQuerySchema` |
| `patientPortal.routes.js` | `listQuerySchema`, `listCareTasksQuerySchema` |
| `doctor.routes.js` | `nextSlotsQuerySchema` |
| `inventory.routes.js` | `listQuerySchema` |
| `telemedicine.routes.js` | `extendSessionSchema` |

Those routes accept unvalidated query input today. **Deliberately not auto-wired:** attaching a validator turns on `stripUnknown`, which silently deletes any parameter the schema does not declare — precisely the bug that killed notification pagination (P1-1 in `BUG_REPORT.md`). Each needs its schema checked against what the frontend actually sends before it is switched on.

---

## Verified after every change

- `app`, all routes, and the lifecycle worker load cleanly.
- `npm audit --omit=dev`: 0 critical, 0 high.
- Sanitizer unit-checked against five payload shapes.
- `email.service` loads on nodemailer 9.

## Not covered by this pass

Authentication/authorization logic, JWT lifetime and revocation, file-upload validation, PII in logs, CORS origin policy, secret rotation, and the frontend. Helmet, CORS, env-var validation (32-char minimum on JWT secrets, 64-hex encryption key), bcrypt hashing, production stack-trace suppression and soft-delete scoping were all reviewed and found sound — but not exhaustively tested.
