# Mongoose hooks — what the SQL path must replicate

Phase 2 deliverable. The plan names this as a risk:

> **Business logic hidden in 83 schema hooks** — behaviour that fires
> automatically today and is invisible at the call site.

That invisibility is the danger. A service calls `Model.find({})` and receives
only non-deleted rows because a `pre(/^find/)` hook quietly added
`deletedAt: null`. Port that service without knowing, and it starts returning
deleted rows — no error, no failing test, nothing in the diff to suggest it.

Regenerate this inventory at any time:

```
node scripts/sql/inventory-hooks.js          # summary
node scripts/sql/inventory-hooks.js --full   # every hook and its location
node scripts/sql/inventory-hooks.js --json   # machine-readable
```

---

## The count, measured

**76 hooks across 49 models**, not 83. The plan's figure was an estimate made
before the models were counted; this one comes from parsing the sources.

| Class | Count | What it means for the port |
|---|---:|---|
| `seam` | 45 | Soft-delete filters. The repository applies them centrally. |
| `generated` | 6 | Values Mongoose supplies — ids, password hashes. |
| `port` | 23 | Real logic needing an explicit reimplementation. |
| `review` | 2 | Not classifiable mechanically. |

**25 need individual attention. 51 are handled centrally or by the schema.**

---

## Why 25 is really 9

The raw count overstates the work. **18 of the 25 are one pattern, written
twice** — append-only immutability on `FinancialAuditLog` and `PatientLedger`:

```js
financialAuditLogSchema.pre('updateOne',        _blockMutation);
financialAuditLogSchema.pre('updateMany',       _blockMutation);
financialAuditLogSchema.pre('findOneAndUpdate', _blockMutation);
financialAuditLogSchema.pre('findOneAndReplace',_blockMutation);
financialAuditLogSchema.pre('replaceOne',       _blockMutation);
financialAuditLogSchema.pre('deleteOne',        _blockDelete);
financialAuditLogSchema.pre('deleteMany',       _blockDelete);
financialAuditLogSchema.pre('findOneAndDelete', _blockDelete);
financialAuditLogSchema.pre('save',             /* reject if !isNew */);
```

Nine hooks per model because Mongoose has nine ways to write, and each has to be
blocked separately. **PostgreSQL expresses this in one place** — revoke
`UPDATE` and `DELETE` on the table from the tenant role:

```sql
REVOKE UPDATE, DELETE ON jathar_dental.financial_audit_logs FROM tenant_jathar_dental;
REVOKE UPDATE, DELETE ON jathar_dental.patient_ledgers     FROM tenant_jathar_dental;
```

Stronger than the Mongoose version, too: a hook can be bypassed by anything that
talks to the driver directly, whereas a revoked grant cannot be bypassed by the
application at all. This is the one case where the port makes the guarantee
*better* rather than merely preserving it.

**That leaves 7 genuine `pre('save')` hooks plus 2 to read.**

---

## The seven, and where each belongs

| Model | Lines | What it does | Where it goes |
|---|---:|---|---|
| `Patient` | 18 | Assigns the OPD number from the `Counter` sequence | Repository. Needs the same atomicity — a PostgreSQL `SEQUENCE`, or `SELECT … FOR UPDATE` on the counter row. |
| `Invoice` | 20 | Computes totals from line items | Repository, inside the same transaction as the write. |
| `TreatmentPlan` | 14 | Appends to `statusHistory` on a status change | Repository. Depends on the previous value, so it must read before writing. |
| `InventoryItem` | 5 | Derives stock status from quantity vs threshold | A generated column, or the repository. |
| `ProcedureTemplate` | 5 | Uppercases the code | A `CHECK` plus normalisation in the repository. |
| `FinancialAuditLog` | 6 | Rejects modification of an existing row | Covered by the `REVOKE` above. |
| `PatientLedger` | 6 | Same | Covered by the `REVOKE` above. |

## The two to read

- `JobPosting` — `src/models/platform/JobPosting.js:184`, 12 lines
- `ServiceItem` — `src/models/tenant/ServiceItem.js:67`, 6 lines

Neither matched a rule. They need a person, which is what `review` means — the
classifier reports what it cannot decide rather than guessing.

---

## Consequences for the estimate

Phase 2 was budgeted at **6 days** on the assumption of 83 hooks each needing
individual work. The real shape is:

- 45 soft-delete filters — **already done**, centrally, in the repository seam
- 18 immutability hooks — **two `REVOKE` statements**
- 6 generated values — repository, mostly mechanical
- 7 `pre('save')` hooks — genuine work, the Patient and Invoice ones non-trivial
- 2 to read

The risk was real and worth naming. Its size was overstated, and the largest
single block of it collapses into a grant change.

---

## What this does not cover

Hooks are only one source of implicit behaviour. Still to inventory in Phase 2:

- **Virtuals** — computed properties services may read without realising
- **Setters and getters** on paths, which transform values in both directions
- **`toJSON` transforms** — several models delete `__v` or reshape output, and an
  API response that changes shape after the port is a client-visible break
- **Compound and partial indexes** carrying uniqueness the application relies on
  — the `TreatmentRecord` sparse-index bug found in September was exactly this
