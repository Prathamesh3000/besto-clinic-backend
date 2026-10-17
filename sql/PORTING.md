# Porting a module to the repository seam

Phases 3 and 4. **9 of 51 services ported**; the other 42 are the bulk of the
remaining work and are the part best handed to a developer rather than done in
one sitting.

```
bookingPolicy  branch  consent  consultationTemplate  department
doctor (partial)  notification  role  user
```

This is what to do, what the seam can and cannot express, and which mistakes
have already been made once.

---

## The shape of a port

Before:

```js
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function listThings(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Thing = conn.model('Thing');
  const filter = { deletedAt: null };
  ...
  const [items, total] = await Promise.all([
    Thing.find(filter).sort(sort).skip(skip).limit(limit).populate('branch', 'name'),
    Thing.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}
```

After:

```js
const { repo } = require('../../db/repository');

async function listThings(query) {
  const filter = {};                              // deletedAt is the seam's job
  ...
  const { items, total } = await repo('Thing').find(filter, {
    sort, skip, limit, populate: [{ path: 'branch', select: ['name'] }],
  });
  return { items, total, page, limit };
}
```

Three rules:

1. **Drop `tenantSlug` from the signature.** Tenant identity comes from
   request-scoped context. Keep the *position* if the controller passes it
   (`function f(data, _tenantSlug, user)`) — controllers were not changed.
2. **Delete `deletedAt: null`.** The repository applies it to every read. Leaving
   it is harmless; relying on each module to remember it is not, which is why it
   moved.
3. **Leave authorisation in the module.** Role hierarchies, self-scoping, and
   ownership checks are decisions about the *user*. The repository knows nothing
   about users, and a security rule pushed into it is a security rule nobody can
   review.

---

## What the seam can express

| | |
|---|---|
| Reads | `findById`, `findOne`, `find`, `count`, `distinct` |
| Writes | `create`, `insertMany`, `updateById`, `updateOne`, `updateMany`, `upsertOne`, `softDeleteById` |
| Filters | `$in` `$nin` `$gt` `$gte` `$lt` `$lte` `$ne` `$exists` `$regex`/`$options` `$or` `$and`, bare equality, arrays, `null` |
| Options | `sort`, `skip`, `limit`, `search` + `searchFields`, `populate`, `includeDeleted` |

Filters are written in Mongo's language on both backends. The operator list was
counted across the services, not guessed: `$in` 120, `$gte` 100, `$lte` 83,
`$regex` 49, `$or` 42, `$ne` 35, `$gt` 15, `$nin` 13, `$lt` 10, `$exists` 6.

**Anything unsupported throws.** `$expr`, `$type`, `$size`, `$text`, `$nor`,
`$not`, subdocument matching, and any field that maps to no column. That is
deliberate — a filter that silently stops filtering returns rows the caller
meant to exclude.

## What it cannot

- **Aggregation pipelines.** 97 of them; see [AGGREGATIONS.md](AGGREGATIONS.md).
  A module with `.aggregate()` needs its pipelines ported and registered in CP-8
  before it can move.
- **Junction-table membership.** `ClinicHoliday.branches` is a promoted junction
  table (`clinic_holiday_branches`), and there is no way to write
  `{ branches: someId }` or `{ branches: { $size: 0 } }` through the seam yet.
  **Holiday is blocked on this.**
- **Platform-scoped entities.** `SqlRepository` always runs through
  `withTenantScope`, which sets `search_path` to the clinic's schema. Platform
  tables are not in it, so `repo('Clinic')` would look right and query the wrong
  schema. Keep platform work on Mongoose — `doctor.service.js` is the worked
  example of a mixed-backend module.
- **Narrowing the projection.** `select` only opts *into* hidden columns
  (`'+password'`). It does not restrict what comes back.
- **Cross-document transactions.** Two modules use `startSession`; they need a
  decision before they move.

---

## Verify every port

```
npm run sql:test:parity      # CP-6  — add cases for what your module queries
npm run sql:test:filters     # CP-9  — filter translation
npm run sql:test:writes      # CP-10 — updateOne/updateMany/insertMany/distinct
npm run sql:test:regression  # CP-7  — the Mongo app still passes its suite
```

**Add CP-6 cases for the queries your module actually issues**, not invented
ones. `listDoctors` filters by role, populates two references and searches two
fields *in one call*; each part passing alone says nothing about the statement
the module emits.

A case where both sides return nothing is reported as a failure, not a pass. If
your entity has no data in the pilot clinic, say so in a comment and leave the
case out — `Consent` is ported but deliberately uncovered for this reason.

---

## Mistakes already made once

**`$ne` drops null rows.** Mongo's `{ status: { $ne: 'paid' } }` matches
documents where status is absent; SQL's `status <> 'paid'` evaluates to NULL for
a null column and the row vanishes. The seam uses `is distinct from`. If you add
an operator, think about what it does to nulls.

**`$or` must be parenthesised.** Adding `orWhere` to the outer builder turns
`a AND (b OR c)` into `a AND b OR c`. On the pilot data that is 31 rows versus
37 — a plausible number, and wrong.

**Dates inside JSONB come back as strings.** JSON has no date type, so a `Date`
in an embedded object array is stored and read as an ISO string, while Mongo
returns a real `Date`. 23 JSONB columns contain dates. The manifest now records
which sub-paths they are and the mapper revives exactly those — caught by CP-6
on `User.fcmTokens[].updatedAt`, not by review.

**`updateMany` does not fire `pre(/^find/)`.** That regex covers `find`,
`findOne` and `findOneAndUpdate` and stops there, so the Mongo side would have
bulk-updated soft-deleted rows the SQL side skipped. Both are explicit now.

**Scope the write, don't check it afterwards.** `updateOne({ _id: id, recipient:
userId }, ...)` is an authorisation boundary. Reading first and then calling
`updateById` drops the ownership clause from the statement that writes, and opens
a window between the two.

**A script is not a request.** `clinic_id` is NOT NULL on most tenant tables and
the repository takes it from the context. Anything running outside the request
path — a job, a migration script — has to bind a real clinic id in
`runWithTenant`, or every insert fails on the constraint.
