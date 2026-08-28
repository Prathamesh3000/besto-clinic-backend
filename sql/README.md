# SQL Migration Tooling

Everything needed to run the MongoDB → PostgreSQL migration. See
[`../SQL_MIGRATION_PLAN.md`](../SQL_MIGRATION_PLAN.md) for the plan this implements, and §4.1 of that
document for the checkpoint gates.

> **Start with [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md).** It covers how the schema is generated,
> every decision and its reasoning, how to port a module, what is still undecided, and what the
> remaining phases involve. This file is setup and command reference only.

---

## First-time setup

### 1. Install PostgreSQL (this also installs pgAdmin 4)

```powershell
winget install PostgreSQL.PostgreSQL.17
```

The installer asks for a password for the `postgres` superuser — **note it down**, you need it in step 2.

This single install gives you three things:

| | What it is |
|---|---|
| **PostgreSQL server** | The database itself, listening on port 5432 |
| **pgAdmin 4** | Browser-based GUI — the equivalent of MongoDB Compass |
| **`psql`** | Command-line client, equivalent to `mongosh` |

### 2. Add settings to `.env`

```ini
# ── PostgreSQL target (the database we migrate TO) ──
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=bestoclinic_dev
PG_USER=postgres
PG_PASSWORD=<the password you chose during installation>

# ── MongoDB source (the database we migrate FROM) ──
# Preferred: a restored snapshot, so profiling adds no load to the live cluster.
# SQL_SOURCE_MONGO_URI=mongodb://localhost:27017/besto_clinic_snapshot

# If reading the live cluster is unavoidable, set this to acknowledge it.
# Reads then go to a replica, never the primary. All tooling here is read-only.
# SQL_ALLOW_PRODUCTION_READ=true
```

Defaults are safe: with nothing set, the tooling targets a **local** database and **refuses** to read a
live Mongo cluster.

### 3. Create the target database

```powershell
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres bestoclinic_dev
```

### 4. Verify

```bash
npm run sql:check
```

Must print **CP-0 PASSED** before any other command in this directory is run.

---

## Viewing the data — the MongoDB Compass equivalent

**pgAdmin 4** ships with PostgreSQL. Launch it from the Start menu; it opens in your browser.

To browse a table: **Servers → PostgreSQL 17 → Databases → bestoclinic_dev → Schemas → *schema* → Tables**,
then right-click a table → **View/Edit Data → All Rows**.

### How this maps to what you already know

| MongoDB Compass | pgAdmin 4 | Notes |
|---|---|---|
| Connection | Server | |
| Database | Database | |
| — | **Schema** | **New level.** This is where per-clinic isolation lives |
| Collection | Table | |
| Document | Row | |
| Field | Column | |
| Index | Index | |
| Aggregation pipeline | SQL query | Query Tool (⚡ icon) |

**The schema level is the one new concept.** Today each clinic has its own *database*. After migration each
clinic has its own *schema* inside one database, so `jathar_dental` → `patients` in pgAdmin is what the
`jathar_dental` database → `patients` collection is in Compass now. Your data stays organised the same way.

Platform-wide data (clinics, plans, subscriptions) lives in the `platform` schema.

### Alternatives

| Tool | Install | Why |
|---|---|---|
| **DBeaver** | `winget install dbeaver.dbeaver` | Connects to **both** Mongo and Postgres — useful for comparing source and target side by side during migration |
| **psql** | Included above | Scripting and quick checks |
| **VS Code** | *PostgreSQL* extension by Chris Kolkman | Browse without leaving the editor |

---

## Commands

| Command | Gate | What it does |
|---|---|---|
| `npm run sql:check` | **CP-0** | Verifies Postgres is reachable, refuses production targets, confirms the Mongo source |
| `npm run sql:profile` | — | Profiles real data — field presence, types, drift, orphaned refs. **Writes** `sql/profile/` |
| `npm run sql:profile:verify` | **CP-1** | Checks the same, and **writes nothing** — a gate must not mutate what later gates read |
| `npm run sql:schema` | — | Generates `schema/manifest.json` and `schema/SCHEMA.md` from the models + profile |
| `npm run sql:schema:census` | — | Table/column/index/array counts without writing |
| `npm run sql:schema:check` | — | Fails if the committed manifest is stale. For CI, next to lint |
| `npm run sql:migrate` | — | Builds the platform schema |
| `npm run sql:migrate:verify` | **CP-2** | up → down → up on a scratch schema, then compares the live one to the manifest |
| `npm run sql:tenant:list` | — | Clinics and the schema/role each maps to |
| `npm run sql:tenant:provision -- --all` | — | One schema, role and grant set per clinic |
| `node sql/etl/load.js --all` | — | Loads platform + every clinic. Add `--dry-run` to convert without writing |
| `npm run sql:test:isolation` | **CP-3** | Tenant A is refused a fully-qualified read of tenant B |
| `npm run sql:verify:etl` | **CP-4** | Row parity, spot values, orphan reporting, idempotency |
| `npm run sql:baseline:timezone` | — | Captures the pre-migration wall clock. Run **before** migrating appointments |
| `npm run sql:verify:timezone` | **CP-5** | Every sampled appointment displays the same wall-clock time |
| `npm run sql:test:parity` | **CP-6** | Ported modules return equivalent results from either database |
| `npm run sql:test:regression` | **CP-7** | The Mongo application still boots and passes its suite |
| `npm run sql:gates` | all | The board — every gate, one line each |

### Profiler options

```bash
npm run sql:profile -- --tenant=jathar-dental   # profile a specific clinic
npm run sql:profile -- --platform-only          # platform database only
npm run sql:profile -- --full                   # every document, not a 2000-doc sample
npm run sql:profile -- --sample=5000            # custom sample size
```

Output lands in `sql/profile/`: one JSON file per collection, plus `SUMMARY.md`.

---

## Layout

```
sql/
  config.js       Standalone config. Deliberately does NOT require src/config/env.js —
                  migration tooling must run on a machine with a database and nothing else.
  analyze.js      Pure document-analysis rules. Unit-tested in tests/unit/sqlAnalyze.test.js
                  because the DDL is derived from its output.
  profile/        Profiler output (generated).

scripts/sql/
  check-env.js    CP-0 gate.
  profile-mongo.js CP-1 profiler.
```

---

## Safety rules built into the tooling

These are enforced in code, not by convention:

1. **Mongo is read-only.** No tool here opens a write path to MongoDB. A migration bug cannot damage the
   source.
2. **Production targets are refused.** Postgres DDL will not run against a non-local host without
   `SQL_ALLOW_REMOTE=true`, and never against a database whose name contains `prod`.
3. **Live-cluster reads are refused by default.** Profiling scans every collection; against a cluster
   serving 19 clinics that is real load. Requires `SQL_ALLOW_PRODUCTION_READ=true`, and then reads go to a
   replica rather than the primary.
4. **The profile is the authority, not the schema files.** Mongoose schemas describe intent. The profiler
   reads through the native driver — not Mongoose models, which would cast values on read and hide the exact
   drift being hunted for — and enumerates collections that *exist* rather than collections the code
   *expects*.
