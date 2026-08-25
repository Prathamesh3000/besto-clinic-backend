# Migration guide

**Phase 0, deliverable 9.** How the MongoDB → PostgreSQL migration is built, how to
run it, what it decided and why, and what the remaining phases actually involve.

Companion documents: [`../SQL_MIGRATION_PLAN.md`](../SQL_MIGRATION_PLAN.md) (the
programme) · [`FINDINGS.md`](FINDINGS.md) (what the data profile found) ·
[`schema/SCHEMA.md`](schema/SCHEMA.md) (the generated schema, table by table).

---

## 1. State at the end of Phase 0

All eight checkpoints in plan §4.1 are green:

```
npm run sql:gates
```

| Gate | What it proves | Result |
|---|---|---|
| **CP-0** Environment | Postgres reachable, not production; Mongo source safe | PASS |
| **CP-1** Data profile | 74 collections profiled, zero skipped | PASS |
| **CP-2** DDL | up → down → up clean; every manifest object present | PASS, 8/8 |
| **CP-3** Isolation 🔒 | Cross-tenant read refused with SQLSTATE 42501 | PASS, 8/8 |
| **CP-4** ETL | Row parity, 15,667 field comparisons, idempotent | PASS, 8/8 |
| **CP-5** Timezone 🕐 | 250/250 appointments show the same wall clock | PASS |
| **CP-6** Parity | Ported modules equivalent on either database | PASS, 7/7 |
| **CP-7** No regression | Mongo app still boots, 64/64 tests | PASS |

Measured, on the pilot clinic:

| | |
|---|---:|
| Tables generated | 73 (+3 child, +6 junction) |
| Columns | 1,581 |
| Indexes | 453 |
| Foreign keys | 194 |
| Rows migrated (platform + `jathar-dental`) | 11,824 |
| Conversion problems | **0** |
| Foreign keys restored fully validated | 176 of 182 |

---

## 2. Running it

Order matters only the first time; everything is re-runnable afterwards.

```bash
npm run sql:check              # CP-0 — refuses a production target
npm run sql:profile            # generate sql/profile/  (writes)
npm run sql:schema             # generate schema/manifest.json + SCHEMA.md
npm run sql:migrate            # build the platform schema
npm run sql:tenant:provision -- --all      # one schema + role per clinic
node sql/etl/load.js --platform
node sql/etl/load.js --all     # every clinic
npm run sql:gates              # the board
```

`sql:profile` **writes**; `sql:profile:verify` **does not**. That split matters:
the board runs the verify form, and a gate that rewrites the files a later gate
derives from turns CP-2 red for a reason unrelated to the DDL.

### Before anything runs

`.env` needs the PostgreSQL target and one secret:

```ini
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=bestoclinic_dev
PG_USER=postgres
PG_PASSWORD=…

# Derives per-tenant role passwords. Without it, provisioning refuses to run.
SQL_TENANT_ROLE_SECRET=<32+ random bytes>
```

---

## 3. How the schema is produced

**Nothing under `sql/migrations/` names a table.** The migrations execute SQL
generated from `sql/schema/manifest.json`, which `sql/schema/build.js` produces by
walking all 73 Mongoose schemas and joining each path to the CP-1 profile evidence
for the same collection.

```
src/models/**          the code's intent      ┐
sql/profile/*.json     what the data is       ├─► build.js ─► manifest.json ─► migrations
sql/schema/typeMap.js  the rules              │                     │
sql/schema/overrides.js the exceptions        ┘                     └─► SCHEMA.md
```

**Why generated.** Hand-writing 73 tables is ~7,000 lines of DDL in which every
nullability and type decision becomes invisible the moment it is made. Generating
means the *rules* get reviewed — stated once, tested once
([`tests/unit/sqlSchema.test.js`](../tests/unit/sqlSchema.test.js)), applied
uniformly — and the exceptions stay short enough to read in one sitting. It is
also re-runnable: refresh the profile, rebuild, and `git diff` shows exactly which
columns the new evidence changed.

### Changing the schema

1. Edit the Mongoose model, or the rule in `typeMap.js`, or the exception in `overrides.js`.
2. `npm run sql:schema`
3. `npm run sql:migrate:verify` (CP-2)

Never hand-edit `manifest.json` or a migration file.

---

## 4. The decisions, and why

| Decision | Choice | Why |
|---|---|---|
| **ObjectId** | `char(24)` hex via an `objectid` domain | Preserving the value makes the ETL a copy, makes foreign keys line up without a translation table, and keeps ids clients already hold valid. Converting to `uuid` would require rewriting every one of 194 references *and* every id embedded in a JSONB field, consistently, in one pass — and any missed one becomes a silent dangling reference. |
| **Dates** | `timestamptz`, same instant | `scheduledAt` holds clinic wall-clock time labelled as UTC. The convention is wrong, but it is the one the whole app renders through. Migrating the instant unchanged is what keeps CP-5 green; *correcting* the convention is a separate change with its own backfill. Doing both at once is exactly how every appointment moves 5½ hours. |
| **Numbers** | `numeric` | These columns hold invoice totals, and binary floating point cannot represent 0.10. The ETL sends decimal strings so values do not route through a double on the way in. |
| **Embedded arrays** | JSONB by default | Promoted to a child table only when something *aggregates across* it — answerable from the code as a `$unwind`, not from taste. There are 5 in the whole codebase; 2 unwind `$lookup` output, leaving 3 promotions. |
| **Arrays of references** | Junction tables, always | Pure relationships, and enforcing them is most of the reason for moving to SQL at all. All 6. |
| **Violated references** | `NOT VALID` foreign keys | Enforced for new rows, tolerant of existing damage, promotable with `VALIDATE CONSTRAINT`. Omitting them would leave the database in exactly the unenforced state the migration exists to end. |
| **Tenancy** | Schema-per-clinic + per-tenant roles | Ratified in plan §2.2. CP-3 proves the server refuses a cross-tenant read rather than returning an empty set. |

### A correction to the plan's counts

The plan states **237 embedded arrays**. Measured, there are **86** — 52
object-subschema arrays, 6 arrays of references, 28 scalar arrays. The 237 appears
to count textual `[` occurrences in the schema sources. Reproduce with
`npm run sql:schema:census`. This makes §4 step 3's per-array decision work
substantially smaller than estimated.

---

## 5. The repository seam

Modules do not know which database answers them.

```js
const { repo } = require('../../db/repository');

const { items, total } = await repo('Department').find(
  { isActive: true },
  { limit: 20, populate: [{ path: 'branch', select: ['name'] }] },
);
```

`SQL_ENTITIES` decides, per entity:

```ini
SQL_ENTITIES=            # everything on Mongo (default)
SQL_ENTITIES=Department,Role
SQL_ENTITIES=*           # parity testing only — safe once every clinic is loaded
```

**Per-entity, not global.** A global switch makes the unit of risk the whole
application; per-entity makes it one table. If a ported module misbehaves in
production it is one environment variable to put it back, with no deploy.

Tenant identity comes from request-scoped context, never a parameter —
plan §2.2 rule 2. `tenantResolver` binds it *after* the JWT has been checked
against the header, so the context can never hold a tenant the caller was not
entitled to. Exactly one function decides how isolation is enforced:
`withTenantScope` in
[`sqlConnection.js`](../src/db/repository/sqlConnection.js), which uses
`SET LOCAL` inside a transaction (rule 3) so `search_path` cannot leak between
requests under transaction pooling.

### Porting a module

1. Replace `getTenantConnection(slug)` + `conn.model(X)` with `repo('X')`.
2. Drop the trailing `tenantSlug` argument; drop `deletedAt: null` from filters — the repository owns it.
3. `populate('a', 'b c')` → `populate: [{ path: 'a', select: ['b', 'c'] }]`.
4. Add the operations to `CASES` in [`verify-parity.js`](../scripts/sql/verify-parity.js).
5. `npm run sql:test:parity` must be green **before** the module is considered done.

Where a caller outside a request still passes a slug, `withTenantIfNeeded` bridges
it: an already-bound context always wins, and the argument is a fallback for when
there is none — never an override, which would be a deliberate cross-tenant read.

---

## 6. What running it actually caught

Recorded because each was invisible to review and surfaced only by execution.

**A unique index that lost its predicate.** `cash_registers` declares unique on
`branch` where `status = 'open' and deletedAt is null` — "at most one *open*
register per branch". The translator did not handle a bare `{ deletedAt: null }`,
dropped the predicate, and emitted a plain unique index. That does not weaken the
constraint, it **strengthens** it over a larger set of rows than intended, and the
load failed on a branch with five registers. A UNIQUE index whose predicate cannot
be translated is now not created at all: a missing index costs performance and
CP-2 catches it; a wrong unique constraint silently rejects valid writes.

**`populate()` and soft deletes.** The join was written assuming a
`pre(/^find/)` hook filters only the collection being queried. It does not —
`populate()` issues its own `find`, so the referenced model's hook runs too. Three
departments point at soft-deleted doctors; Mongo returns `undefined` and the
unfiltered join returned the doctor. CP-6 caught it. The predicate belongs in the
JOIN condition, never in WHERE, or the parent row disappears too.

**Mongoose `Map` types.** They emit a `$*` wildcard path that snake_cases onto its
own parent — `column "plan_defaults" specified more than once`. Fixing it revealed
88 further columns that duplicated data already inside the JSONB column that held
it.

**A singleton constraint MongoDB never enforced.** `ClinicBookingPolicy` declares
`index({}, { unique: true })` commented "at most one policy document per tenant".
MongoDB does not accept an empty key pattern, so that index was never created and
nothing has ever stopped a second row. PostgreSQL expresses it exactly, so the
migration now delivers the constraint the author asked for.

**Three gates that were red for the wrong reason** — CP-5 predicting a failure its
own measurement disproved, CP-7 building the app with no environment loaded, and a
board timeout failing two gates that passed when run directly. All fixed. A gate
that goes red for reasons unrelated to what it tests trains people to ignore it.

---

## 7. Decisions still needed

These block promoting foreign keys from `NOT VALID` to enforced. None blocks
further porting work.

| Finding | What | Rows | Needs |
|---|---|---:|---|
| **F-1** | `patient_ledgers` → patients / users / branches | 1,564 | Delete as seed debris (recommended — demo data in a demo tenant) or reattach. 627 sound rows load either way. |
| **F-2** | `chat_messages.session_id` → deleted video sessions | 77 | Column stays NOT NULL (see the correction in `overrides.js`). The **live defect** — every clinic with chat data has lost 100% of its video sessions — is a separate ticket. |
| **F-2** | `emergency_sessions.video_session_id` | 8 | Same cause. |
| **new** | `notifications.recipient_id` → users | 2 | Not in FINDINGS.md. Surfaced by the ETL orphan audit. |
| **F-4** | Tenant `dbUri` stored in plaintext | 27 clinics | Its own security ticket. The column is marked sensitive and withheld from tenant roles; encrypting it during the ETL would tie cutover to key management. |
| **F-8** | `subscriptions.clinic`, `tenant_audit_logs.clinic` | small | Billing and audit data. Both are currently *validated* — the live population no longer contains the orphans the 13-Aug profile measured. |

---

## 8. Environment findings

**The clinic population changed.** The plan says ~19 clinics, FINDINGS.md measured
**27** on 13 Aug 2026, and the platform database currently holds **1**
(`jathar-dental`, created 17 Aug 2026). The profile is described as "the authority
for every DDL decision", so it is worth knowing it was measured against a
population that no longer exists. Schema *shapes* are unaffected; Phase 1 and
Phase 7 estimates, which scale per tenant, are not.

**Still reading production.** `SQL_ALLOW_PRODUCTION_READ=true` points at the live
Atlas cluster. `NODE_ENV=development` now, which is an improvement on the plan's
critical finding, but prerequisite #4 — a development database — remains
unsatisfied. Everything here is read-only against Mongo by construction.

---

## 9. What the remaining phases involve

Phase 0 replaces some of the plan's estimates with measurements.

| Phase | Plan estimate | What Phase 0 suggests |
|---|---:|---|
| 1 · Schema & ETL for all clinics | 8 d | The per-clinic path is a loop and already works (`--all`). Effort scales with clinic count, now 1 rather than 27. **Likely lower.** |
| 2 · Data-access layer | 6 d | The seam exists and both backends implement one interface. The remaining work is the **83 `pre()` hooks** — soft delete is done; invoice numbering, password hashing and the rest are not. **Roughly as estimated.** |
| 3 · Module port (standard, ~30) | 30 d | Two ported. Both were CRUD-shaped and the second exercised the common complication (callers outside the module). The mechanical part is fast; the cost is in per-module parity cases. |
| 4 · Module port (complex, 11) | 28 d | Untouched. auth, billing, payment and appointment carry the aggregations and the transactions. |
| 5 · Aggregations (95) | 14 d | Untouched, and still the highest defect risk. Note the GST HSN report already sums `items.cgst/sgst/igst`, **fields that exist in neither the schema nor the data** — worth checking before porting it. |
| 6 · Test & regression | 20 d | The gate harness is built and runs; per-module suites are not. |
| 7 · Dual-run & cutover | 12 d | The seam makes shadow reads straightforward. Rollback is rehearsed at the schema level (CP-2) but not with data. |

The one number Phase 0 genuinely produced is that the **pattern works end to end**:
a module can be moved without changing its controller, its routes or its
responses, and a gate proves the responses match. What it does not yet produce is
a reliable per-module day-rate — two modules is a small sample, and both were
chosen from the easy end.

---

## 10. File map

```
knexfile.js                     Two migration sets; refuses non-local and prod targets
sql/
  config.js                     Standalone config — deliberately not src/config/env.js
  migrate.js                    Platform runner (the Knex CLI reported success on failure)
  MIGRATION_GUIDE.md            This file
  FINDINGS.md                   CP-1 findings F-1..F-8
  schema/
    typeMap.js                  Mongoose path -> column. Pure, unit-tested
    overrides.js                The recorded exceptions, with evidence
    ddl.js                      Manifest -> SQL text. Pure
    build.js                    Generates manifest.json + SCHEMA.md
    manifest.json               Generated. Never hand-edited
  migrations/platform|tenant/   Contain no table names
  tenant/
    naming.js                   slug -> schema/role/password. Validates, never coerces
    provision.js                Per-clinic schema + role + grants
  etl/
    transform.js                Document -> row. Pure, unit-tested
    load.js                     The loader, orphan audit, constraint restore
src/db/repository/              The seam
scripts/sql/                    CP-0..CP-7 and the board
```
