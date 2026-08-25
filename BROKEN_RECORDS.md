# Broken records — for manual review

Generated 2026-08-25T09:36:23.432Z by `node scripts/sql/export-broken-records.js`.

Every record below has a reference pointing at a row that does not exist. MongoDB never
enforced these references, so they accumulated without anything reporting them. **Nothing has
been deleted or changed** — the migration loads these rows and carries the damage behind a
`NOT VALID` foreign key, which is enforced for new rows and tolerant of the existing ones.

## What to decide

For each class below, one of:

- **Delete** — the rows are debris (seed data, an abandoned import) and carry no information.
- **Reattach** — the target still exists under a different id, or can be identified.
- **Keep as-is** — the rows matter and the dangling reference is acceptable; the foreign key stays `NOT VALID` permanently.

Once a class is resolved its constraint can be promoted with `VALIDATE CONSTRAINT`, and the
database will enforce it from then on.

## Summary

| # | Table | Column | Points at | Broken rows | of total | Distinct missing targets | Finding |
|--:|---|---|---|--:|--:|--:|---|
| 1 | `chat_messages` | `session_id` | `jathar_dental.video_sessions` | **2** | 77 | 1 | F-2 |
| 2 | `notifications` | `recipient_id` | `jathar_dental.users` | **2** | 3072 | 1 | — |
| 3 | `patient_ledgers` | `patient_id` | `jathar_dental.patients` | **1564** | 2191 | 320 | F-1 |
| 4 | `patient_ledgers` | `created_by_id` | `jathar_dental.users` | **1564** | 2191 | 3 | F-1 |
| 5 | `patient_ledgers` | `branch_id` | `jathar_dental.branches` | **1564** | 2191 | 6 | F-1 |

**4696 broken rows across 5 classes.**

---

## 1. `chat_messages.session_id` → `jathar_dental.video_sessions`

- **Broken rows:** 2 of 77 in the table (77 carry a reference at all)
- **Distinct missing targets:** 1
- **Clinic / schema:** `jathar_dental`
- **Source collection:** `chatmessages`
- **Recorded as:** F-2 in [`sql/FINDINGS.md`](sql/FINDINGS.md)
- **Current decision:** Column stays NOT NULL — see the correction in COLUMNS. FK NOT VALID pending the live-defect investigation.
- **Constraint state:** `NOT VALID` — existing rows tolerated, new rows checked

### When the broken rows were written

`2026-05-16T05:14:45.688Z` → `2026-05-16T05:14:45.982Z`  (span: 294 ms)

Span: **294 ms**

> **All of them landed inside a few seconds.** That is a bulk insert, not application
> traffic — the signature of seed or import data rather than damage caused by users.

### When the *missing* records were created

`2026-05-16T05:13:41.000Z` → `2026-05-16T05:13:41.000Z`

> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug
> would not carry plausible creation times, so this is evidence the targets **existed and
> were later removed** rather than never having been created.

### The broken rows

| id | type | created_at | deleted_at | session_id | sender_id |
|---|---|---|---|---|---|
| 6a07fd457e0486a477d274c7 | text | 2026-05-16T05:14:45.688Z |  | 6a07fd057e0486a477d2745a | 69fdc29435e22f6440674213 |
| 6a07fd457e0486a477d274cb | text | 2026-05-16T05:14:45.982Z |  | 6a07fd057e0486a477d2745a | 69fdc29435e22f6440674213 |

<details><summary>Missing target ids

</summary>

```
6a07fd057e0486a477d2745a  created 2026-05-16T05:13:41.000Z
```

</details>

**Decision:** _(delete / reattach / keep as-is — write it here)_

---

## 2. `notifications.recipient_id` → `jathar_dental.users`

- **Broken rows:** 2 of 3072 in the table (3072 carry a reference at all)
- **Distinct missing targets:** 1
- **Clinic / schema:** `jathar_dental`
- **Source collection:** `notifications`
- **Constraint state:** `NOT VALID` — existing rows tolerated, new rows checked

### When the broken rows were written

`2026-05-18T08:53:38.850Z` → `2026-05-18T08:54:09.654Z`  (span: 30804 ms)

Span: **30.8 seconds**

> **Written over 30.8 seconds.** That is spread out like ordinary application traffic,
> not a single bulk insert. Anything describing this class as "seed debris written in one
> operation" should be re-checked against this figure before rows are deleted on that basis.

### When the *missing* records were created

`2026-04-03T14:13:05.000Z` → `2026-04-03T14:13:05.000Z`

> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug
> would not carry plausible creation times, so this is evidence the targets **existed and
> were later removed** rather than never having been created.

### The broken rows

| id | type | title | created_at | deleted_at | recipient_id |
|---|---|---|---|---|---|
| 6a0ad392f667ff206c7f204c | appointment | Appointment Rescheduled | 2026-05-18T08:53:38.850Z |  | 69cfcaf15ed0c70cee242f31 |
| 6a0ad3b1f667ff206c7f209a | appointment | Appointment Rescheduled | 2026-05-18T08:54:09.654Z |  | 69cfcaf15ed0c70cee242f31 |

<details><summary>Missing target ids

</summary>

```
69cfcaf15ed0c70cee242f31  created 2026-04-03T14:13:05.000Z
```

</details>

**Decision:** _(delete / reattach / keep as-is — write it here)_

---

## 3. `patient_ledgers.patient_id` → `jathar_dental.patients`

- **Broken rows:** 1564 of 2191 in the table (2191 carry a reference at all)
- **Distinct missing targets:** 320
- **Clinic / schema:** `jathar_dental`
- **Source collection:** `patientledgers`
- **Recorded as:** F-1 in [`sql/FINDINGS.md`](sql/FINDINGS.md)
- **Current decision:** PENDING — delete as seed debris (recommended) or reattach. The 627 sound rows load either way.
- **Constraint state:** `NOT VALID` — existing rows tolerated, new rows checked

### When the broken rows were written

`2026-04-01T06:17:03.745Z` → `2026-04-02T09:37:42.000Z`  (span: 98438255 ms)

Span: **1.1 days**

> **Written over 1.1 days.** That is spread out like ordinary application traffic,
> not a single bulk insert. Anything describing this class as "seed debris written in one
> operation" should be re-checked against this figure before rows are deleted on that basis.

### When the *missing* records were created

`2026-04-01T06:17:01.000Z` → `2026-04-02T09:14:03.000Z`

> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug
> would not carry plausible creation times, so this is evidence the targets **existed and
> were later removed** rather than never having been created.

### The broken rows (first 15 of 1564)

| id | type | amount | description | created_at | patient_id | created_by_id | branch_id |
|---|---|---|---|---|---|---|---|
| 69ccb85f699d26770f512e9c | debit | 41300 | Invoice INV-JDFC-00068 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d55 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eca | debit | 590 | Invoice INV-JDFC-00094 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d2b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |
| 69ccb85f699d26770f512e6f | credit | 590 | Payment for INV-JDFC-00038 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d89 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e88 | debit | 4720 | Invoice INV-JDFC-00052 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e60 | debit | 17700 | Invoice INV-JDFC-00029 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d69 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec1 | credit | 590 | Payment for INV-JDFC-00089 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d25 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e52 | debit | 590 | Invoice INV-JDFC-00016 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e6b | credit | 2950 | Payment for INV-JDFC-00035 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d85 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e78 | debit | 590 | Invoice INV-JDFC-00043 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d7b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e5f | credit | 590 | Payment for INV-JDFC-00028 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eb1 | credit | 590 | Payment for INV-JDFC-00080 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf9 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec8 | debit | 590 | Invoice INV-JDFC-00093 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d5d | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ed4 | debit | 590 | Invoice INV-JDFC-00103 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e97 | credit | 590 | Payment for INV-JDFC-00063 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf1 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e44 | debit | 590 | Invoice INV-JDFC-00007 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cd5 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |

<details><summary>Missing target ids
 (first 200 of 320)
</summary>

```
69ccb85d699d26770f511cbd  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cbf  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cc1  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cc3  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cc5  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cc7  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cc9  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ccb  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ccd  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ccf  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cd1  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cd3  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cd5  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cd7  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cdb  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cdd  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cdf  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ce1  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ce3  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ce5  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ce7  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ceb  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511ced  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cef  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cf1  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cf3  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cf5  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cf7  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cf9  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cfb  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cfd  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511cff  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d03  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d07  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d09  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d0b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d0d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d0f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d13  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d15  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d17  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d19  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d1b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d1d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d1f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d21  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d23  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d25  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d27  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d29  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d2b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d2d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d2f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d31  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d35  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d39  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d3b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d3d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d3f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d41  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d43  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d45  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d49  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d4b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d4d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d4f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d51  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d53  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d55  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d57  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d59  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d5b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d5d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d5f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d61  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d63  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d65  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d67  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d69  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d6b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d6d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d6f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d71  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d73  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d75  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d77  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d79  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d7b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d7d  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d83  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d85  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d87  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d89  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d8b  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d8f  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d91  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d93  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d95  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d97  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511d99  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511da1  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511da3  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511da5  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511da7  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511da9  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511dab  created 2026-04-01T06:17:01.000Z
69ce335b783238a0ef422f7a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f7c  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f7e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f80  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f82  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f84  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f86  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f88  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f8a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f8c  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f8e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f90  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f94  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f96  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f9a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f9c  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f9e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fa0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fa2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fa4  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fa6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fa8  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422faa  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fae  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fb0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fb2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fb4  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fb6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fb8  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fba  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fbc  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fbe  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fc0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fc2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fc4  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fc6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fc8  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fca  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fcc  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fce  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fd0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fd2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fd6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fd8  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fda  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fdc  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fe0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fe2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fe4  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fe6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fe8  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fea  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fec  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422fee  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ff0  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ff2  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ff4  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ff6  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ffa  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422ffc  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423000  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423002  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423004  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423006  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423008  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42300a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42300e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423010  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423012  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423014  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423016  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42301a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42301c  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42301e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423020  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423022  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423024  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423026  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42302a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42302c  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42302e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423030  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423032  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423034  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423036  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423038  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42303a  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42303e  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423040  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423042  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423044  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423046  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef423048  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef42304a  created 2026-04-02T09:14:03.000Z
```

</details>

**Decision:** _(delete / reattach / keep as-is — write it here)_

---

## 4. `patient_ledgers.created_by_id` → `jathar_dental.users`

- **Broken rows:** 1564 of 2191 in the table (2191 carry a reference at all)
- **Distinct missing targets:** 3
- **Clinic / schema:** `jathar_dental`
- **Source collection:** `patientledgers`
- **Recorded as:** F-1 in [`sql/FINDINGS.md`](sql/FINDINGS.md)
- **Current decision:** PENDING — follows F-1
- **Constraint state:** `NOT VALID` — existing rows tolerated, new rows checked

### When the broken rows were written

`2026-04-01T06:17:03.745Z` → `2026-04-02T09:37:42.000Z`  (span: 98438255 ms)

Span: **1.1 days**

> **Written over 1.1 days.** That is spread out like ordinary application traffic,
> not a single bulk insert. Anything describing this class as "seed debris written in one
> operation" should be re-checked against this figure before rows are deleted on that basis.

### When the *missing* records were created

`2026-04-01T06:17:01.000Z` → `2026-04-02T09:37:37.000Z`

> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug
> would not carry plausible creation times, so this is evidence the targets **existed and
> were later removed** rather than never having been created.

### The broken rows (first 15 of 1564)

| id | type | amount | description | created_at | patient_id | created_by_id | branch_id |
|---|---|---|---|---|---|---|---|
| 69ccb85f699d26770f512e9c | debit | 41300 | Invoice INV-JDFC-00068 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d55 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eca | debit | 590 | Invoice INV-JDFC-00094 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d2b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |
| 69ccb85f699d26770f512e6f | credit | 590 | Payment for INV-JDFC-00038 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d89 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e88 | debit | 4720 | Invoice INV-JDFC-00052 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e60 | debit | 17700 | Invoice INV-JDFC-00029 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d69 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec1 | credit | 590 | Payment for INV-JDFC-00089 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d25 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e52 | debit | 590 | Invoice INV-JDFC-00016 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e6b | credit | 2950 | Payment for INV-JDFC-00035 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d85 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e78 | debit | 590 | Invoice INV-JDFC-00043 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d7b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e5f | credit | 590 | Payment for INV-JDFC-00028 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eb1 | credit | 590 | Payment for INV-JDFC-00080 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf9 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec8 | debit | 590 | Invoice INV-JDFC-00093 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d5d | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ed4 | debit | 590 | Invoice INV-JDFC-00103 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e97 | credit | 590 | Payment for INV-JDFC-00063 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf1 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e44 | debit | 590 | Invoice INV-JDFC-00007 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cd5 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |

<details><summary>Missing target ids

</summary>

```
69ccb85d699d26770f511c65  created 2026-04-01T06:17:01.000Z
69ce335b783238a0ef422f22  created 2026-04-02T09:14:03.000Z
69ce38e1ea15ea6b67847da3  created 2026-04-02T09:37:37.000Z
```

</details>

**Decision:** _(delete / reattach / keep as-is — write it here)_

---

## 5. `patient_ledgers.branch_id` → `jathar_dental.branches`

- **Broken rows:** 1564 of 2191 in the table (2150 carry a reference at all)
- **Distinct missing targets:** 6
- **Clinic / schema:** `jathar_dental`
- **Source collection:** `patientledgers`
- **Recorded as:** F-1 in [`sql/FINDINGS.md`](sql/FINDINGS.md)
- **Current decision:** PENDING — follows F-1
- **Constraint state:** `NOT VALID` — existing rows tolerated, new rows checked

### When the broken rows were written

`2026-04-01T06:17:03.745Z` → `2026-04-02T09:37:42.000Z`  (span: 98438255 ms)

Span: **1.1 days**

> **Written over 1.1 days.** That is spread out like ordinary application traffic,
> not a single bulk insert. Anything describing this class as "seed debris written in one
> operation" should be re-checked against this figure before rows are deleted on that basis.

### When the *missing* records were created

`2026-04-01T06:17:01.000Z` → `2026-04-02T09:37:37.000Z`

> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug
> would not carry plausible creation times, so this is evidence the targets **existed and
> were later removed** rather than never having been created.

### The broken rows (first 15 of 1564)

| id | type | amount | description | created_at | patient_id | created_by_id | branch_id |
|---|---|---|---|---|---|---|---|
| 69ccb85f699d26770f512e9c | debit | 41300 | Invoice INV-JDFC-00068 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d55 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eca | debit | 590 | Invoice INV-JDFC-00094 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d2b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |
| 69ccb85f699d26770f512e6f | credit | 590 | Payment for INV-JDFC-00038 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d89 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e88 | debit | 4720 | Invoice INV-JDFC-00052 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e60 | debit | 17700 | Invoice INV-JDFC-00029 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d69 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec1 | credit | 590 | Payment for INV-JDFC-00089 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d25 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e52 | debit | 590 | Invoice INV-JDFC-00016 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e6b | credit | 2950 | Payment for INV-JDFC-00035 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d85 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e78 | debit | 590 | Invoice INV-JDFC-00043 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d7b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e5f | credit | 590 | Payment for INV-JDFC-00028 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d6f | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512eb1 | credit | 590 | Payment for INV-JDFC-00080 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf9 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ec8 | debit | 590 | Invoice INV-JDFC-00093 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d5d | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512ed4 | debit | 590 | Invoice INV-JDFC-00103 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511d1b | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e97 | credit | 590 | Payment for INV-JDFC-00063 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cf1 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c47 |
| 69ccb85f699d26770f512e44 | debit | 590 | Invoice INV-JDFC-00007 | 2026-04-01T06:17:03.745Z | 69ccb85d699d26770f511cd5 | 69ccb85d699d26770f511c65 | 69ccb85d699d26770f511c48 |

<details><summary>Missing target ids

</summary>

```
69ccb85d699d26770f511c47  created 2026-04-01T06:17:01.000Z
69ccb85d699d26770f511c48  created 2026-04-01T06:17:01.000Z
69ce335b783238a0ef422f04  created 2026-04-02T09:14:03.000Z
69ce335b783238a0ef422f05  created 2026-04-02T09:14:03.000Z
69ce38e1ea15ea6b67847d85  created 2026-04-02T09:37:37.000Z
69ce38e1ea15ea6b67847d86  created 2026-04-02T09:37:37.000Z
```

</details>

**Decision:** _(delete / reattach / keep as-is — write it here)_

---

## How to act on a decision

Nothing here is automated on purpose — these are medical and financial records, and the
reasoning above is only worth having if a person reads it. Once decided:

```sql
-- Inspect the full rows for a class before doing anything:
SELECT * FROM jathar_dental.patient_ledgers c
WHERE c.patient_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM jathar_dental.patients p WHERE p.id = c.patient_id);

-- After a "delete" decision, and after a backup:
-- DELETE FROM jathar_dental.patient_ledgers c
-- WHERE c.patient_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM jathar_dental.patients p WHERE p.id = c.patient_id);

-- Then promote the constraint so the database enforces it from now on:
-- ALTER TABLE jathar_dental.patient_ledgers
--   VALIDATE CONSTRAINT patient_ledgers_patient_id_fkey;
```

The `VALIDATE CONSTRAINT` step takes only a SHARE UPDATE EXCLUSIVE lock — it does not rewrite
the table or block reads.
