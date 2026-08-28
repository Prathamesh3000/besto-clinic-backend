# CP-1 Findings — decisions required before DDL

> **Updated 25 Aug 2026, after Phase 0 was implemented.** Three items below were
> changed by running the migration rather than reading the profile. Each
> correction is marked inline and the original wording is kept, because the point
> of recording a finding is spoiled if it is quietly rewritten:
>
> - **F-2's recommendation was wrong** and is not what was built. See F-2.
> - **F-3 cites a file that does not exist** (`src/modules/procedure/`). The fix
>   was smaller than described. See F-3.
> - **A seventh orphaned reference exists** that this report does not list:
>   `notifications.recipient` → `users`, 2 rows, found by the ETL orphan audit.
>   It needs a decision like the rest.
>
> Also measured since: the array count in the plan is **86**, not 237
> (`npm run sql:schema:census`), and the platform database now holds **1** clinic
> rather than the 27 profiled here — see
> [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) §8.


Produced by `npm run sql:profile` against live data, 13 Aug 2026.
Source: platform DB + tenant `jathar-dental`. 74 collections profiled, 0 skipped.

Raw output: [`profile/SUMMARY.md`](profile/SUMMARY.md) and the per-collection JSON beside it.

Each item below states what was measured, what it does to the migration, and what someone needs to
decide. **These are the reason the profiling step exists** — none of them are visible in the Mongoose
schema files.

---

## Blocking — must be decided before the DDL is written

> **Revised 13-Aug-2026** after review. The first version of F-1 and F-2 below was based on the profiler's
> 500-row sample and was wrong in both directions. All figures here are now **full-population measurements**
> across **all 27 clinics** via `npm run sql:audit:orphans`. What changed is recorded at the foot of each item.

### F-1 · 1,564 patient-ledger rows are orphaned — isolated to one clinic

**Measured (full population, all 27 clinics).**

| | |
|---|---|
| Rows affected in `jathar-dental` | **1,564 of 2,191 (71.4%)** — not all of them |
| Distinct `patient` ids missing | **320 of 430 (74%)** — 110 resolve correctly |
| Clinics holding `patientledgers` data | **2** |
| Of those, clean | **1** |

`createdBy` (3 of 11 ids missing) and `branch` (6 of 11) affect **the same 1,564 rows** — one damaged
record set, not three separate faults.

**This is a seed artifact, not a write bug.** Two independent signals:

- All 1,564 rows were written inside a **2-millisecond window** (`06:17:03.745`–`.747`), which is a bulk
  insert, not application traffic.
- The ObjectIds they reference were created at `06:17:01` — two seconds earlier, in the same seeding run —
  and those patients were subsequently replaced rather than updated.
- **The second clinic holding ledger data is completely clean.** A defect in the ledger write path would
  damage both.

**Impact.** 1,564 rows rejected by a `patient_id` foreign key. Confined to one clinic's demo data.

**Decide:** delete the 1,564 rows as seed debris (recommended — they are demo data in a demo tenant), or
reattach them. The 627 sound rows migrate normally either way. **Not a code fix.**

*Superseded: the first report said "all 2,191 rows, patients missing entirely". Both figures came from
extrapolating a 500-row sample. 627 rows are sound and 110 patients resolve.*

### F-2 · Every clinic with chat data has 100% orphaned video sessions — systemic

**Measured (full population, all 27 clinics).**

| Reference | Clinics with data | Fully orphaned | Rows |
|---|---|---|---|
| `chatmessages.session` | 2 | **2 — both** | 79 |
| `emergencysessions.videoSession` | 1 | 1 | 8 |

**The sessions existed and were deleted — they were not "never created".** ObjectIds embed their creation
time, and the missing ids date to `2026-05-12 … 2026-05-20` while the messages referencing them were
written `2026-05-12 … 2026-05-19`. Ids invented by a bug would not correlate with the rows pointing at
them. This is corroborated by `ChatMessage.session` being `required: true`
([`ChatMessage.js:11`](../src/models/tenant/ChatMessage.js#L11)) — a message could not have been written
without a session id — and by `VideoSession` records being created automatically in
[`appointment.service.js:165`](../src/modules/appointment/appointment.service.js#L165),
[`patientPortal.service.js:286`](../src/modules/patientPortal/patientPortal.service.js#L286) and
[`emergency.service.js:207`](../src/modules/emergency/emergency.service.js#L207).

**Only one column is actually a relaxation.** `EmergencySession.videoSession`
([`EmergencySession.js:43`](../src/models/tenant/EmergencySession.js#L43)) carries no `required` flag, so a
nullable column matches the existing schema exactly. `ChatMessage.session` is the sole real change.

**Impact.** `chat_messages.session_id` cannot be `NOT NULL` against current data.

**Decide:** ~~make `chat_messages.session_id` nullable (recommended — do not fabricate sessions).~~

> ⚠ **Corrected 25 Aug 2026 — this recommendation was not followed, because the
> evidence above does not support it.**
>
> `session` is present in **100%** of rows with **zero nulls** in both clinics
> (77 and 2 documents). Nothing is missing. What is broken is that every value
> points at a VideoSession that has since been deleted.
>
> Those are two different constraints. NOT NULL is satisfied by the data and loads
> every row; it is the *foreign key* that cannot be enforced, and `NOT VALID` is
> exactly the tool for that — new rows checked, existing damage tolerated,
> promotable with `VALIDATE CONSTRAINT` once the rows are decided.
>
> Making the column nullable would permit future messages with no session at all,
> which `required: true` has prevented since the model was written and which no
> document has ever contained: a real loss of guarantee, accepted to solve a
> problem in a different constraint that is already handled.
>
> The column is **NOT NULL** in the shipped schema. Recorded in
> [`schema/overrides.js`](schema/overrides.js). The live defect below is
> unaffected and still open.

⚠ **Raise separately: this looks like a live defect, not just a migration constraint.** Both clinics that
have ever held chat data have lost 100% of their video sessions, and `videosessions` is empty in
`jathar-dental` despite 45 teleconsultation appointments. Something is deleting or failing to persist
`VideoSession` records across tenants. Nullable columns accommodate the damage; they do not explain it.
Corroborates [`BUGFIX_HANDOFF.md`](../BUGFIX_HANDOFF.md) §4.1 bug #29.

*Superseded: the first report reasoned "the sessions genuinely never existed" and treated this as
one-clinic damage. Both claims were wrong.*

### F-3 · `proceduretemplates` — 16 live documents, ~6 lines from being migratable

**Measured.** 16 documents, `category` is 100% present, 100% `string`, zero nulls, zero drift, and holds
exactly six values:

`cosmetic` · `surgery` · `prosthetic` · `orthodontic` · `endodontic` · `periodontal`

**Root cause.** [`ProcedureTemplate.js:4`](../src/models/tenant/ProcedureTemplate.js#L4) imports
`PROCEDURE_CATEGORY` from `src/config/constants.js`, where **it is not defined**. Line 19 calls
`Object.values()` on `undefined`, which throws at require time, so the model is excluded from the registry
([`index.js:88-92`](../src/models/tenant/index.js#L88)).

**The fix is one constant matching data we have already measured** — no guessing, and no risk of declaring
an enum the existing rows cannot satisfy. Two things make it slightly larger than a one-liner:

1. ~~There is a **second consumer** — `procedure.validator.js:4` imports the same
   constant in three places.~~
   **Corrected 25 Aug 2026: there is no second consumer.** Neither
   `src/modules/procedure/` nor `src/modules/reservation/` exists in the
   repository, so the only files affected are the two models. The fix was
   correspondingly smaller — a constant definition and nothing else.
2. Defining the constant makes the model **loadable**, not the feature **live**. The `procedure/` module is
   still unmounted in `routes/index.js`, and `MaterialReservation` is excluded for related reasons.
   Migrating the table and re-enabling the feature are separate decisions.

**Data quality.** ~14 of the 16 are genuine seeded clinical records (e.g. `PROC-IMP-001` "Dental Implant
Placement (Single)", ₹35,000, 9 required materials). Two are manual test entries (code `FWSD`, description
`fwff`, ₹321, 13 min).

**Recommendation: migrate it.** The fix is contained, the data is mostly real, and abandoning it writes off
14 costed procedure templates with material lists. Relates to tracker `D-01`/`C-5`.

> **Done, 25 Aug 2026.** `PROCEDURE_CATEGORY` and `RESERVATION_STATUS` are defined
> in `src/config/constants.js`; the six category values are the exact set measured
> above, not a guess. Both models load, and all 16 documents migrated. Neither
> feature is mounted — that stays a separate decision.

### F-8 · Two platform-table orphans still undecided

Flagged by CP-1 but not raised as decisions in the first report. These sit in the **platform** schema that
every clinic depends on, so they are not confined to one tenant.

| Collection | Field | Missing | Rows affected |
|---|---|---|---|
| `subscriptions` | `clinic` | 1 of 2 ids | 1 of 2 (50%) |
| `tenantauditlogs` | `clinic` | 3 of 21 ids | 3 of 21 (14.3%) |

Counts are small but `subscriptions` is **billing data**. Same call as F-1: reattach or drop, decided
rather than defaulted.

---

## Security — not caused by the migration, but exposed by it

### F-4 · Tenant database credentials are stored in plaintext

**Measured.** All **27** clinics store `dbUri` as a plain `mongodb+srv://user:password@host/db` string.
Zero are encrypted.

The code intends otherwise. `src/db/tenantConnectionManager.js` opens with *"Platform DB stores each
clinic's encrypted dbUri"*, [`BUGFIX_HANDOFF.md`](../BUGFIX_HANDOFF.md) repeats it, and an AES-256-GCM
helper exists at `src/utils/encryption.js`. But `_resolveTenantUri` encrypts only the copy it writes to
the **Redis cache** and returns the database value raw — so the field marked `select: false` is the one
protection actually in force.

**Impact.** Anyone with read access to the platform database holds every tenant's database credentials.
The `select: false` guard is defence against accidental exposure in API responses, not against a reader of
the collection.

**Decide:** encrypt at rest during migration (the helper already exists), or move connection secrets to a
secrets manager. Either way the misleading comments should be corrected now, before they mislead someone
else. **Recommend raising as its own security ticket rather than folding it into the migration.**

---

## Type drift

### F-5 · `featureflags` stores integers where booleans are declared

**Measured.** `defaultValue` and all four `planDefaults.*` fields: `boolean × 5–7`, `int × 1`.

**Impact.** One document per field. A `boolean` column rejects it.

**Decide:** coerce `1 → true` / `0 → false` at load, or fix the source document first. Coercion is
reasonable given the volume, but should be logged rather than silent.

### F-6 · Mixed ids inside `metadata` — no action needed

`notifications.metadata.appointmentId` (objectId × 1047, string × 106) and
`financialauditlogs.metadata.invoiceId` (string × 41, objectId × 1) hold both shapes.

Both sit inside fields declared `Schema.Types.Mixed`, which map to **`jsonb`** — a column that holds either
shape without complaint. **Recorded so nobody spends time "fixing" it.** Worth noting separately that the
application reads these back inconsistently, but that is an application bug, not a migration one.

### F-7 · 18 numeric fields span int and double — benign

`invoices.subtotal`, `payments.amount`, `patientledgers.amount` and 15 others report both types. This is
MongoDB's normal number encoding — `100` is an int32, `100.50` is a double. `numeric` holds both
losslessly. **No decision required**; listed so the count in the raw profile is not mistaken for drift.

---

## Schema drift — 29 collections carry undeclared fields

Fields present in data but absent from the Mongoose schema. A schema-derived DDL would drop them.

Heaviest: `notifications` (30), `accesslogs` (22), `financialauditlogs` (21), `proceduretemplates` (12),
`tenantauditlogs` (10), `clinics` (8), `subscriptions` (7), `plans` (6), `dentalscans` (6).

Many will be legitimately dead — fields written by removed code. Each needs a keep-or-drop call while
writing that table's DDL; per-collection detail is in the JSON files.

### Four collections are undesignable, not merely empty

Of the 13 empty collections, **nine have a schema** and can be created from it as empty tables. The other
four have **neither data nor a loadable schema**, so nothing describes what they are for:

| Collection | Scope | Documents | Schema |
|---|---|---|---|
| `candidateprofiles` | platform | 0 | none |
| `vendorportaltokens` | platform | 0 | none |
| `materialreservations` | tenant | 0 | excluded from registry |
| `proceduretemplates` | tenant | **16** | throws on require — see F-3 |

These are not "provisional tables to add later" — they cannot be designed until someone says what they
hold. `materialreservations` and `proceduretemplates` are the same unmounted-feature cluster (tracker
`D-01`/`D-02`), so F-3's decision likely settles both.

---

## Corrections to the plan

| Assumption in `SQL_MIGRATION_PLAN.md` | Measured |
|---|---|
| ~19 live clinics | **27** |
| 73 collections | **74 profiled** (22 platform + 52 tenant); 13 are empty |

The clinic count raises Phase 1 and Phase 7 effort — both scale per tenant. **Phase 0 is unaffected.**

---

## Two defects found in the profiler itself

Recorded because both produced confident, plausible, wrong numbers — and the checkpoint is what caught
them. Regression tests for both are in `tests/unit/sqlAnalyze.test.js`.

1. **Orphan counts were inflated roughly tenfold.** `new Set()` over ObjectId *instances* does not
   deduplicate by value — each is a distinct object — while `countDocuments()` counts distinct documents.
   Comparing the two reported every repeated reference as missing: 500 access logs pointing at 10 real
   users came back as *"98% orphaned"*. First run reported **48** collections with orphans; the true
   figure is **5**.

2. **Benign numeric encoding was reported as type drift.** First run: 26 mixed-type fields. Genuine: 8.

The first run's numbers would have driven real DDL decisions — nullable columns and dropped foreign keys —
for problems that did not exist.
