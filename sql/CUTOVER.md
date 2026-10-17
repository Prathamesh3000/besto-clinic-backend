# Cutover runbook — Phase 7

> **Dual-run & cutover** — shadow reads against both databases, comparison
> harness, **per-clinic cutover, rehearsed rollback**

One clinic moves at a time, and moving it back takes one command and effect on
the next request. That is the whole design goal, because the alternative — a
global switch — makes the first defect everybody's defect.

```
npm run sql:cutover:list                                     # who is where
npm run sql:cutover -- --slug=<clinic> --status
npm run sql:cutover -- --slug=<clinic> --entities=Department,Role
npm run sql:cutover -- --slug=<clinic> --rollback --reason="..."
```

---

## Two switches, and which one is real

| | Scope | Use |
|---|---|---|
| `Clinic.migration.sqlEntities` | one clinic | **how production cuts over** |
| `SQL_ENTITIES` env var | every clinic | parity harnesses, CP-6, platform-scoped entities |

`isSqlBacked()` takes the **union**, deliberately. A clinic that has been cut
over must not be pulled back to MongoDB because an environment variable happens
to omit that entity — rolling a clinic back is an explicit act on its record, not
a side effect of configuration.

### Platform-scoped entities cannot be cut over per clinic

21 of the 75 tables are `platform`-scoped: `Plan`, `Clinic`, `Subscription` and
the rest. There is one set of rows shared by every clinic, so moving one clinic's
reads to PostgreSQL while the others still write to MongoDB makes the two stores
diverge on common data — the cut-over clinic stops seeing plans created after it
moved.

The script refuses these, and `--force` will not override it. They belong to
`SQL_ENTITIES`, which moves everyone at once because there is only one copy to
move.

---

## Before cutting over

The script checks this itself and refuses if it fails, but the reason is worth
understanding rather than arguing with:

**PostgreSQL must already hold at least as many rows as MongoDB, per entity.**

Pointing a clinic at a schema the ETL has not filled is not a cutover. Every list
in the application comes back empty, and the staff using it conclude their
records are gone. Nothing has been lost, but by the time that is established the
damage is done.

```
node sql/etl/load.js --slug=<clinic>      # then re-check
npm run sql:cutover -- --slug=<clinic> --entities=...
```

`--force` exists for the case where a count mismatch is understood and expected.
It is not a way past a red readiness board.

---

## Rolling back

```
npm run sql:cutover -- --slug=<clinic> --rollback --reason="what went wrong"
```

Takes effect on the next request — the Redis cache of the entity list is cleared
explicitly rather than left to expire, because the one moment a stale cache
matters is a rollback.

### The one thing rollback does not undo

**Writes made while the clinic was on PostgreSQL stay in PostgreSQL.** Rolling
back returns reads to MongoDB, which does not have them.

So `--rollback` counts the rows written since the cutover and refuses if there
are any, printing the number per entity. `--force` proceeds. The rows are not
deleted — they remain in PostgreSQL and can be migrated back — but the
application stops seeing them until someone does that.

This is the reason to cut over a *low-write* entity first. `Department` and
`Role` change a few times a year; `Appointment` and `Invoice` change hourly.

---

## The rehearsal

Run on 2026-09-21 against `jathar-dental`, with `SQL_ENTITIES` empty throughout,
so every routing decision came from the clinic record alone:

| Step | Result |
|---|---|
| `--entities=Plan` | refused — platform-scoped, `--force` rejected |
| `--entities=Department,Role` | ready 8 rows / 5 rows → cut over |
| routing check | `Department`, `Role` → `SqlRepository`; `Patient` → `MongoRepository` |
| parity of served rows | Department 8 = 8, Role 5 = 5, contents identical |
| `--rollback` with backdated `cutoverAt` | refused, 13 rows reported as post-cutover |
| `--rollback` | clean, nothing stranded |
| routing re-check | all three back on MongoDB, immediately |

The clinic ended where it started: everything on MongoDB. `migration.rolledBackAt`
and `rollbackReason` still record the rehearsal, which is what those fields are
for.

---

## What the rehearsal found

Adding `Clinic.migration` put five columns in the manifest that no migration
created, and **CP-2 caught it** — `every column matches the nullability the
manifest decided` went red naming all five.

That is the gate board working as intended, and it changed how schema edits are
made from here:

- The initial migration builds the whole schema from the manifest and its `down`
  **drops the schema**. Correct for creating a database, destructive for changing
  one that holds data.
- So schema *changes* are additive migrations —
  `20260921000100_clinic_migration_state.js` is the first, and the pattern: take
  the column definitions from the manifest via `ddl.columnClause`, use
  `add column if not exists` so it is a no-op on a schema built fresh from the
  current manifest, and say in the `down` what is lost.

CP-4 then went red too, because the columns existed but the ETL had not filled
them. Re-running `node sql/etl/load.js --platform` fixed it. Expect that pair
after any schema addition.
