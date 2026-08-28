# BestoClinic — MongoDB → PostgreSQL Migration Plan

**Prepared:** 13 Aug 2026
**Status:** Proposal — awaiting approval
**Repo / branch:** `besto_clinic` · `bugfix/batch1-batch2-multitenancy`
**Basis:** static analysis of the current working tree (counts are exact, day-estimates are judgement)

Companion documents: [`docs/DEFECT_TRACKER.md`](docs/DEFECT_TRACKER.md) ·
[`FIX_PLAN.md`](FIX_PLAN.md) · [`BUGFIX_HANDOFF.md`](BUGFIX_HANDOFF.md)

---

## Recommendation

**The migration is viable and worth doing, but it is a ~6-month programme, not a two-day task.**

The data layer touches **166 files** and roughly **1,200 query call sites**, including **95 aggregation
pipelines** and **291 `populate()` joins** across **73 collections**. Converting that safely, against
**19 live clinic databases** holding medical and financial records, is approximately **121 developer-days**
before contingency.

What we propose first is **Phase 0 — three days**: ratify the tenancy model (§2.1), profile the real data,
design the complete relational schema, build and verify a working data migration for the platform database
and one real clinic, and convert two modules end to end. That produces a proven pattern, a tested migration
path, and an estimate for the remaining work grounded in measured throughput rather than guesswork.

> **We are asking to approve Phase 0 only.** The full programme should be re-costed at the end of it, when
> the numbers below can be replaced with observed ones.

---

## 1. What we are actually converting

Every figure was counted from the codebase, not estimated.

| Surface | Count | Why it drives cost |
|---|---:|---|
| Mongoose schemas (21 platform + 52 tenant) | **73** | Each becomes one or more tables, with types, constraints and defaults decided individually |
| Lines of schema definition | **6,934** | The raw material for the DDL |
| Files touching the data layer | **166** | The blast radius — every one needs review, most need edits |
| Query call sites | **~1,200** | `find`, `findOne`, `findById`, `findOneAndUpdate`, `update*`, `countDocuments` |
| `populate()` calls → SQL joins | **291** | Each needs an explicit join and column projection; silent behaviour changes hide here |
| `aggregate()` pipelines → SQL / CTEs | **95** | **The hardest part.** 29 in analytics alone; results must reconcile exactly |
| Embedded array fields | **237** | Each is a modelling decision: child table or JSONB. Wrong calls are expensive to reverse |
| `ref:` declarations → foreign keys | **213** | Mongo never enforced these — existing data will contain violations |
| Index declarations | **225** | Must be reproduced or performance regresses badly on day one |
| `pre()` hooks | **83** | Business logic (invoice numbering, password hashing, soft delete) invisible at call sites |
| Live tenant databases | **~19** | Production clinics — each is a separate migration and a separate cutover |

---

## 2. Architecture decisions

Four choices that shape everything downstream. Recommended against *this* codebase, not in general.

| Decision | Choice | Rationale |
|---|---|---|
| **Engine** | **PostgreSQL** | JSONB absorbs the 237 embedded arrays without inventing 237 child tables. Partial indexes map directly onto our soft-delete filters. Schema-per-tenant is native and cheap. Managed on every cloud |
| **Access layer** | **Knex + repository layer** | A query builder, not an ORM. Closest to a mechanical port of 1,200 call sites, full control over the 95 aggregations, and a pool model mirroring the existing tenant manager. Least hidden behaviour |
| **Tenancy** | **Schema-per-clinic + per-tenant DB roles** ✅ *ratified — see §2.2* | One database, one schema per clinic, and the app connects as a role holding `USAGE` on only that schema. One pool serves all tenants instead of 19, removing the connection ceiling capping us at ~9 clinics per process (tracker `C-08`). **A deliberate step down in isolation from today's DB-per-tenant**, taken with compensating controls and built to stay swappable — see §2.2 |
| **Cutover** | **Incremental, per clinic** | Module-by-module conversion behind a repository seam, then clinic-by-clinic cutover with a tested rollback. A big-bang switch of a live medical system is not a risk worth taking |

### 2.1 Tenancy — the options weighed

**This was the one decision worth a dedicated review rather than a default** (outcome in §2.2).
Today's DB-per-tenant model is
the *strongest possible* isolation. Both candidates below are a reduction from it, and the reduction should
be made consciously with compensating controls — particularly given `C-01` in our own tracker was a real
cross-tenant access bug (six routers resolved the tenant *before* authenticating).

| | **A — Schema-per-tenant + per-tenant roles** *(recommended)* | **B — Shared tables + Row-Level Security** |
|---|---|---|
| Isolation mechanism | Which *tables* a role can see at all | Which *rows* a policy admits, via session variable |
| Enforcement if app code forgets | Server refuses — role lacks `USAGE` on other schemas, even for a fully-qualified `other_clinic.patients` | Policy filters rows — provided `FORCE ROW LEVEL SECURITY` is set |
| Delta from today | Moderate | Large — `tenant_id` on ~50 tables, every index becomes composite |
| Migrations | 19 runs (a loop) | 1 run |
| Cross-tenant queries | `UNION` across schemas | Trivial |
| Per-clinic cutover / rollback | Clean — schema is the unit | Messier — rows interleaved in shared tables |

**Three technical points that shaped this recommendation:**

1. **In schema-per-tenant, RLS is not the matching primitive — roles and `GRANT`s are.** RLS filters rows
   within a table you already have access to; schema-per-tenant has no `tenant_id` column to filter on.
   The equivalent database-level guarantee is a per-tenant role with `USAGE` on one schema only. In this
   shape that is *stronger* than RLS, not a weaker substitute for it.
2. **The connection-pooling critique applies to both equally.** `SET search_path` and `SET app.current_tenant`
   are both per-session state, and both leak across transactions under PgBouncer transaction pooling unless
   set with `SET LOCAL` / `set_config(…, true)` inside an explicit transaction. This is an implementation
   requirement for either option, not a differentiator.
3. **RLS does not apply to table owners** unless `ALTER TABLE … FORCE ROW LEVEL SECURITY` is set. Apps
   commonly connect as the schema owner, in which case every policy silently does nothing. If we adopt RLS
   anywhere, this becomes an acceptance test, not a code-review item.

**What we verified rather than assumed:** the strongest argument for Option B is cheap cross-tenant
querying. It largely does not apply here — `productOwner.service.js` reads only platform collections
(`Clinic`, `Subscription`), and cross-clinic discovery is already denormalised into platform collections.
The exception is the **six scan workers that loop every clinic** (tracker `H-22`), which Option B would
collapse into a single query.

**Required either way — the guard `C-01` never had:** a negative test that connects as tenant A, attempts a
fully-qualified read of tenant B's data, and asserts a permission error. Isolation bugs leak quietly; this
belongs in CI, not in review.

### 2.2 Decision — ratified 13 Aug 2026

**Option A: schema-per-clinic with per-tenant database roles — built to remain swappable.**

Rationale: at 19 clinics the per-schema migration cost is a loop, the data is medical and financial, and
per-clinic cutover and rollback in Phase 7 are far safer when a whole clinic is a single unit. Expected
clinic count in 2–3 years is **genuinely unknown**, so the model is implemented to be reversible rather than
bet on.

**One correction to how `C-01` is being used in this argument.** `C-01` was *not* a forgotten-filter bug. It
was an **ordering** bug — six routers resolved the tenant before authenticating, so `req.tenantSlug` became
whatever the caller sent in the `X-Tenant-ID` header. The request was scoped correctly, to the **wrong
clinic**. No storage layout prevents that: RLS would faithfully serve the attacker's chosen clinic, and
`search_path` would faithfully switch to it. What the layout changes is the blast radius of the *other* bug
class — the forgotten `WHERE` clause — and the failure mode when tenant identity is absent entirely
(per-tenant roles fail closed, a header-derived `clinic_id` fails open). The real fix for `C-01`'s shape is
the router-order guard plus the negative isolation test, in either model.

**Four implementation rules that follow from the decision. All four are cheap now and expensive to retrofit.**

1. **`clinic_id` on every tenant table from day one**, despite schema-per-clinic not needing it. It holds one
   distinct value per schema — ~16 bytes/row, under 1 MB for a 50,000-patient clinic. It makes a later
   consolidation `INSERT INTO shared.patients SELECT * FROM <schema>.patients` rather than a backfill of a
   non-existent column across 19 databases, and it lets RLS policies be written and tested now as a second
   layer instead of designed under pressure later.
2. **Tenant scoping never appears in module code.** No module writes `WHERE clinic_id = …` or touches
   `search_path`. Modules call `repo.patients.findById(id)`; the repository takes tenant identity from
   request-scoped context. Exactly one function decides *how* isolation is enforced. Switching models is then
   an edit to one file plus a data migration — not a rewrite of ~1,200 call sites.
3. **`SET LOCAL` inside an explicit transaction, always** — never plain `SET`. Both `search_path` and
   `app.clinic_id` are per-session state and both leak between requests under transaction pooling.
4. **Per-tenant roles with `USAGE` on one schema only.** A fully-qualified `SELECT * FROM other_clinic.patients`
   is then refused by the server regardless of application state.

**Guards (CI, not code review):** the negative isolation test described above; a lint rule failing any
`search_path` or `clinic_id` reference outside the seam; and, if RLS is ever enabled, an acceptance test
asserting `FORCE ROW LEVEL SECURITY` is set — without it the table owner is exempt and every policy is
decorative.

**Revisit if** clinic count passes ~200, or cross-clinic reporting stops being satisfiable from the
denormalised platform tables. At that point rule 1 makes the move a data migration rather than a rewrite.

---

## 3. Phased plan and estimate

| # | Phase | Scope | Dev-days |
|---:|---|---|---:|
| **0** | **Foundation** *(approving now)* | Tenancy decision record (§2.1), **real-data profiling of all 73 collections**, full relational schema design, DDL for platform + tenant, ETL for platform and one clinic, repository seam, two modules ported end to end | **3** |
| 1 | Schema & ETL completion | All 73 tables finalised, migration for all 19 tenants, idempotent re-runs, verification harness (row counts + referential integrity) | 8 |
| 2 | Data-access layer | Repositories for all entities, transaction handling, soft-delete semantics, the 83 `pre()` hooks reimplemented explicitly | 6 |
| 3 | Module port — standard | ~30 CRUD-shaped modules at ~1 day each | 30 |
| 4 | Module port — complex | auth, appointment, billing, payment, patientPortal, subscription, inventory, jobPortal, telemedicine, dentalScan, notification | 28 |
| 5 | Aggregation port ⚠️ | 95 pipelines rewritten as SQL, output reconciled row-for-row against the Mongo originals. **Highest defect risk** | 14 |
| 6 | Test & regression | Integration suites per module, cross-tenant isolation tests, financial reconciliation against production figures | 20 |
| 7 | Dual-run & cutover | Shadow reads against both databases, comparison harness, per-clinic cutover, rehearsed rollback | 12 |
| | **Base estimate** | before contingency | **121** |
| | **With 20% contingency** | *the number to plan against* | **145** |

> **Why Phase 0 is 3 days, not 2.** Adding the tenancy decision record (§2.1) and real-data profiling (§4)
> does not fit in two days. The alternative is holding at 2 days and porting **one** pilot module instead of
> two — not recommended, because the pilot is the only thing that produces measured throughput to replace
> the estimates above. Profiling is what makes the DDL trustworthy; cutting it means designing the schema
> from `.js` files that describe intent rather than data.

### Calendar time

| Staffing | Elapsed | Note |
|---|---|---|
| 1 developer | ~7 months | Not recommended — single point of failure on a production migration |
| 2 developers | ~4 months | Phases 3–5 parallelise cleanly by module |
| **3 developers** | **~3 months** | **Best balance.** Beyond three, coordination cost outweighs the gain |

---

## 4. What Phase 0 delivers

Concrete and checkable. If any line below is not true at the end of Phase 0, it has not landed.

1. **Tenancy decision record** — §2.1 ratified, with the chosen isolation model and its compensating
   controls written down before any DDL depends on it.
2. **Real-data profile of all 73 collections** — field-presence percentage, type distribution per field,
   null/empty counts, orphaned-reference counts and outliers, measured against production data.
   **Mongoose schemas describe intent, not content:** documents written before validation existed, or by
   since-removed code paths, silently violate the declared schema. Designing DDL from the `.js` files alone
   is how a constraint gets declared that 12% of the existing rows cannot satisfy. The profile is the
   authority for every nullability, type and constraint decision that follows.
3. **Complete relational schema** — all 73 collections mapped to PostgreSQL tables, with an explicit
   documented decision for each of the 237 embedded arrays (child table vs JSONB) and all 213 references
   expressed as foreign keys, **reconciled against the profile in step 2**.
4. **Runnable DDL** — Knex migrations creating the platform schema and the per-clinic tenant schema
   template, including all 225 indexes, the per-tenant roles and their `GRANT`s.
5. **Verified data migration** — an ETL script moving the platform database and one real clinic into
   PostgreSQL, with row-count parity, referential-integrity checks and spot-value comparison. Re-runnable
   without duplicating data. **Sourced from a restored snapshot, not the live primary** (§5).
6. **Cross-tenant isolation test** — connects as tenant A, attempts a fully-qualified read of tenant B,
   asserts a permission error. The guard `C-01` never had.
7. **Repository seam** — a data-access boundary letting modules move to SQL one at a time, so the
   application keeps working throughout the programme instead of breaking until the end.
8. **Two modules ported, with tests** — proves the pattern end to end and gives the measured throughput
   that replaces the estimates in §3.
9. **Written migration guide** — table-by-table mapping, strategy for the 95 aggregations, cutover and
   rollback plan, per-module breakdown of the remaining work.

---

## 4.1 Testing checkpoints — hard gates

**Rule: a checkpoint is binary, is one command, and stops the work when it is red.** No "mostly passing",
no "we'll fix it in the next phase". A gate that can be argued with is not a gate.

Each checkpoint below names the command that decides it. Every one is re-runnable at any time, so a later
change that breaks an earlier guarantee is caught rather than discovered at cutover.

### Phase 0 gates

| Gate | Verifies | Command | Passes when |
|---|---|---|---|
| **CP-0** Environment | PostgreSQL reachable and it is **not** production; existing Mongo test suite still green | `node scripts/sql/check-env.js` | Exit 0. Refuses to run if the target looks like a production host |
| **CP-1** Data profile | All 73 collections profiled — field presence, type distribution, orphaned refs | `node scripts/sql/profile-mongo.js --verify` | Every collection profiled, **zero skipped or errored**. A skipped collection is a silent hole in the DDL |
| **CP-2** DDL | Migrations apply, roll back and re-apply cleanly; all 225 indexes present; per-tenant roles and grants created | `npm run sql:migrate:verify` | Up → down → up with no errors, and index/constraint counts match the expected manifest |
| **CP-3** Isolation 🔒 | Tenant A's role cannot read tenant B's schema, even fully-qualified | `npm run sql:test:isolation` | **Permission denied — not an empty result set.** An empty result means the query was allowed and merely found nothing |
| **CP-4** ETL correctness | Row-count parity per collection, FK integrity, spot-value comparison, **idempotency** | `node scripts/sql/verify-etl.js` | Counts match exactly; zero unreported orphans; running the ETL twice changes nothing |
| **CP-5** Timezone 🕐 | `scheduledAt` wall-clock display identical before and after migration | `node scripts/sql/verify-timezone.js` | **Zero mismatches** across the sample. Any mismatch is a 5½-hour error on every appointment |
| **CP-6** Pilot parity | The same API request through the Mongo path and the SQL path returns equivalent responses | `npm run sql:test:parity` | Zero response diffs, and the existing Jest suite still green |
| **CP-7** No regression | The live Mongo application still boots and passes its full suite | `npm test && node -e "require('./src/app')()"` | Green. **Phase 0 must not degrade the running product** |

`CP-3` and `CP-5` are the two that would be expensive to discover late — a silent cross-tenant leak, and a
system-wide five-and-a-half-hour time shift. Both are cheap to check and both run in CI from day one.

### Exit gates for later phases

| Phase | Exit gate |
|---|---|
| 1 · Schema & ETL | CP-4 green for **all 19 clinics**, not just the pilot. Orphan report reviewed and each class decided |
| 2 · Data-access layer | Every one of the 83 `pre()` hooks has a named test proving its behaviour survived |
| 3 · Module port (standard) | Per module: CP-6 parity green before the module is considered done |
| 4 · Module port (complex) | As above, plus a financial reconciliation for billing/payment modules |
| 5 · Aggregations | Each of the 95 pipelines reconciled row-for-row against its Mongo output on real data |
| 6 · Test & regression | Cross-tenant isolation suite green; coverage gate agreed and enforced in CI |
| 7 · Cutover | Rollback rehearsed on a non-production clinic **before** the first real cutover. Invoice-series continuity asserted |

---

## 5. Risks

Ordered by severity. The first three are conditions in the environment **today** — they affect this project
whether or not it goes ahead.

| Severity | Risk | Mitigation |
|---|---|---|
| 🔴 **Critical** | **Local development runs against the production database.** `NODE_ENV=production` and `PLATFORM_DB_URI` points at the live Atlas cluster, so anything we test writes to real clinic data | Stand up a development database **before** any migration work begins. Prerequisite to Phase 0, not part of it |
| 🔴 **Critical** | **Medical and financial records in scope.** 19 live clinics. A data-loss or corruption event during migration is not recoverable by apology | Read-only source during ETL, verified backups before every cutover, per-clinic rollback rehearsed before the first real one |
| 🟠 High | **139 uncommitted files in the working tree** — ~2,900 lines of unreviewed bug-fix work, unbacked by version control, that this migration would build on top of | Commit and review before Phase 0 starts. ~half a day, and it protects everything after it |
| 🟠 High | **Appointment times use a non-standard convention.** `scheduledAt` stores clinic wall-clock time labelled as UTC. A naive move to a real timestamp type shifts **every appointment by 5½ hours** | **Automated differential test, not just a design decision:** sample N appointments pre-migration, render each through the same `fakeUtcTime` helper the UI uses, re-render post-migration from PostgreSQL, and **fail the migration on any mismatch**. A design-time decision can still be implemented wrong; this catches it |
| 🟠 High | **Declared schemas do not match stored data.** Mongoose describes intent. Documents predating validation, or written by since-removed code paths, silently violate it — so DDL designed from the `.js` files can declare constraints the existing rows cannot satisfy | Profile all 73 collections against real data **before** DDL (§4 step 2). The profile, not the schema file, is the authority for nullability, type and constraint decisions |
| 🟠 High | **ETL load on the production cluster.** Full-collection scans of 19 live clinic databases during business hours degrades the running product | Run ETL against a **restored point-in-time snapshot** for real runs — zero production load, and a stable snapshot so row counts do not move underneath the verification. `readPreference=secondary` is acceptable for the Phase 0 rehearsal. *Verify our Atlas tier supports snapshot restore (M10+); shared tiers may not* |
| 🟠 High | **Invoice and credit-note numbering is statutory.** GST series cannot gap, repeat or restart across the cutover | Sequence continuity is an explicit acceptance test. Confirm the cutover point with whoever files our GST returns |
| 🟠 High | **Existing data will violate the new foreign keys.** Mongo never enforced the 213 references, so orphaned records almost certainly exist | The ETL **reports** violations rather than silently dropping rows. Each class gets a decision before load |
| 🟡 Medium | **Aggregation results may drift.** 95 pipelines rewritten by hand; analytics and billing figures must match exactly or the business loses trust in the numbers | Reconcile every pipeline against its Mongo output on real data during the dual-run phase |
| 🟡 Medium | **Business logic hidden in 83 schema hooks** — behaviour that fires automatically today and is invisible at the call site | Inventory all 83 during Phase 0 schema mapping; each reimplemented explicitly and tested |

---

## 6. What the move gains, and what it costs

Worth confirming the driver before committing three months. Both columns are real.

| What PostgreSQL gives us | What it costs |
|---|---|
| Referential integrity enforced by the database rather than hoped for in application code — directly relevant to the orphaned-record defects already on our tracker | ~144 developer-days, during which little new product ships |
| Real transactions across tables, which the payment and invoicing code currently works around | Schema changes become migrations — slower to iterate than Mongo's implicit schema |
| Correct, uncontested reporting via SQL instead of 95 hand-built pipelines | A migration risk window across 19 production clinics |
| Schema-per-tenant removes the connection ceiling limiting us to ~9 clinics per process | Retraining and new operational tooling for the team |
| A far larger pool of engineers who can maintain it | Existing Mongo-specific work — connection manager, provisioning, tenant scripts — is rewritten, not reused |

---

## 7. What we need from you

1. **Approve Phase 0 — three days.** Tenancy decision, data profiling, schema design, verified migration of
   one clinic, two modules ported. No production system is written to.
2. ~~Ratify the tenancy model~~ — **done, 13 Aug 2026.** Schema-per-clinic with per-tenant roles, built to
   stay swappable. Recorded in §2.2 with its four implementation rules and CI guards.
3. **Confirm the business driver.** Reporting, integrity, scaling, or hiring? It changes which phases we
   prioritise — and whether the full programme is the right call at all.
4. **Authorise a development database.** A hard prerequisite: we currently cannot test anything without
   writing to live clinic data.
5. **Confirm staffing.** Recommendation is three developers for ~3 months. One developer is ~7 months and
   carries real key-person risk.
6. **Name the cutover constraints.** Acceptable downtime per clinic, and whether the invoice-series cutover
   must align with the financial year.

---

## Note on estimate confidence

The counts in §1 are exact — they were measured from the codebase. The day-figures in §3 are derived from
those counts using standard porting rates, **not** from observed throughput on this codebase. Phase 0 exists
specifically to replace them with real numbers, and the programme should be re-costed at its conclusion
before further commitment.
