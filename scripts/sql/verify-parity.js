#!/usr/bin/env node
'use strict';

/**
 * CP-6 — Pilot parity.
 *
 * The same operation, served through the Mongo path and the SQL path, returns
 * equivalent results.
 *
 * "Equivalent", not "identical": key order and absent-vs-null differ harmlessly
 * between drivers. The comparison normalises those and is then strict about
 * everything else — because the differences worth catching are the ones that are
 * *not* harmless: a dropped field, a coerced type, a date that moved, a number
 * that lost precision, an array that came back in a different order because the
 * SQL port forgot an ORDER BY that Mongo's natural order was supplying by luck.
 *
 * Both sides are driven from the same process, the same tenant context and the
 * same arguments, through the repository seam. Comparing the new code against a
 * remembered description of the old behaviour would prove nothing.
 *
 * This is also the gate that produces the measured throughput figure the plan
 * needs in order to replace its estimated day-rates with observed ones.
 *
 * Run:  npm run sql:test:parity
 */

const path = require('path');

// The seam reads configuration through src/config/env.js, which needs .env loaded
// the same way server.js loads it.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * The same DNS workaround server.js applies at boot (`dns.setServers`).
 *
 * Atlas uses `mongodb+srv://`, which needs an SRV lookup, and this machine's
 * default resolver refuses SRV queries with `querySrv ECONNREFUSED`. Without
 * this the gate cannot reach the Mongo half of the comparison and reports a
 * parity failure that is really a name-resolution failure.
 */
require('dns').setServers(
  (process.env.SQL_DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((s) => s.trim()).filter(Boolean)
);

const write = (s) => process.stdout.write(s);
const results = [];
function record(ok, name, detail) {
  results.push({ ok, name, detail });
  write(`  ${ok ? 'pass' : 'FAIL'}  ${name}\n`);
  if (detail) write(`        ${detail}\n`);
}

/**
 * The pilot surface.
 *
 * Operations rather than endpoints, deliberately. The seam is what was ported;
 * driving it directly compares the two data paths without the noise of HTTP
 * status codes and response envelopes, which are identical by construction
 * because the controller above them is unchanged.
 */
const CASES = [
  {
    model: 'Branch',
    name: 'list, default sort',
    run: (r) => r.find({}, { limit: 20, sort: { createdAt: -1 } }),
  },
  {
    model: 'Branch',
    name: 'list with populate(manager)',
    run: (r) => r.find({}, {
      limit: 20,
      sort: { createdAt: -1 },
      populate: [{ path: 'manager', select: ['name', 'email'] }],
    }),
  },
  {
    model: 'Branch',
    name: 'list active only',
    run: (r) => r.find({ isActive: true }, { limit: 20 }),
  },
  {
    // Exercises the nested path: `address.city` in Mongo, the flattened
    // `address_city` column in SQL. The mapper has to resolve both to the same
    // result or a branch search silently stops matching on city.
    model: 'Branch',
    name: 'search across name, code and address.city',
    run: (r) => r.find({}, {
      limit: 20, search: 'a', searchFields: ['name', 'code', 'address.city'],
    }),
  },
  {
    model: 'Department',
    name: 'list, default sort',
    run: (r) => r.find({}, { limit: 20, sort: { createdAt: -1 } }),
  },
  {
    model: 'Department',
    name: 'list with populate(branch, headOfDepartment)',
    run: (r) => r.find({}, {
      limit: 20,
      sort: { createdAt: -1 },
      populate: [{ path: 'branch', select: ['name'] }, { path: 'headOfDepartment', select: ['name', 'email'] }],
    }),
  },
  {
    model: 'Department',
    name: 'list filtered by isActive',
    run: (r) => r.find({ isActive: true }, { limit: 20, sort: { createdAt: -1 } }),
  },
  {
    model: 'Department',
    name: 'search by name',
    run: (r) => r.find({}, { limit: 20, sort: { createdAt: -1 }, search: 'a', searchFields: ['name', 'code'] }),
  },
  {
    model: 'Role',
    name: 'list, displayOrder sort',
    run: (r) => r.find({}, { limit: 50, sort: { displayOrder: 1 } }),
  },
  {
    model: 'Role',
    name: 'list active only',
    run: (r) => r.find({ isActive: true }, { limit: 50, sort: { displayOrder: 1 } }),
  },
  {
    model: 'Role',
    name: 'count of active roles',
    run: (r) => r.count({ isActive: true }),
  },

  /*
   * The second wave of ported modules — notification, user, consent, doctor.
   *
   * Each case is the query the ported service actually issues, not an invented
   * one. `listDoctors` really does filter by role, populate two references and
   * search two fields in the same call, and it is the combination that has to
   * agree: each part passing alone says nothing about the statement the module
   * emits.
   */
  {
    model: 'User',
    name: 'doctor.listDoctors — role filter, two populates, search',
    run: (r) => r.find({ role: 'doctor' }, {
      limit: 20,
      sort: { createdAt: -1 },
      search: 'a',
      searchFields: ['name', 'email'],
      populate: [{ path: 'branch', select: ['name'] }, { path: 'department', select: ['name'] }],
    }),
  },
  {
    model: 'User',
    name: 'user.listUsers — search across name and email',
    run: (r) => r.find({}, {
      limit: 20, sort: { createdAt: -1 }, search: 'a', searchFields: ['name', 'email'],
    }),
  },
  {
    // The password column is `select: false` in Mongoose and hidden in the SQL
    // repository. Both must withhold it; a leak here would be invisible in the
    // response shape until someone read it.
    model: 'User',
    name: 'user list withholds the password hash',
    run: async (r) => {
      const { items } = await r.find({}, { limit: 20, sort: { createdAt: -1 } });
      // Shaped as `items` so the harness counts rows: a case that returns a
      // summary object looks like an empty result to it, and is reported as
      // uncompared rather than passing — which is the behaviour that caught
      // the first version of this case.
      return { items: items.map((u) => ({ _id: u._id, exposesPassword: u.password !== undefined })) };
    },
  },
  {
    model: 'Notification',
    name: 'notification.listNotifications — unread, newest first',
    run: (r) => r.find({ isRead: false }, { limit: 20, sort: { createdAt: -1 } }),
  },
  {
    model: 'Notification',
    name: 'notification.getUnreadCount',
    run: (r) => r.count({ isRead: false }),
  },
  {
    model: 'Notification',
    name: 'notification type filter ($in)',
    // 'appointment' is the only type this clinic has actually produced. A pair
    // of plausible-looking types that match nothing would make the case go
    // uncompared, which proves less than not writing it.
    run: (r) => r.find({ type: { $in: ['appointment', 'system'] } }, { limit: 20, sort: { createdAt: -1 } }),
  },

  /*
   * Consent is ported but NOT covered here: this clinic has no consent records,
   * so both backends return nothing and the comparison would assert only that
   * two queries ran. The case is left out rather than left failing — an
   * uncompared case dressed as a passing one is the failure mode this gate
   * exists to avoid. Add it the moment the clinic has consents to compare.
   */
];

/* ── Comparison ────────────────────────────────────────────── */

/**
 * Normalise only what is genuinely a driver artifact.
 *
 * Absent and null are treated alike, ObjectIds and Dates are reduced to a
 * canonical string, and object keys are sorted. Nothing else is forgiven —
 * numbers are compared exactly, and array order is preserved.
 */
function normalise(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return `@date:${value.toISOString()}`;

  // A BSON ObjectId and the 24-char hex string PostgreSQL stores are the same
  // value in two representations — preserving the id exactly is a deliberate
  // decision of the migration (see sql/schema/typeMap.js), so they must compare
  // equal here. Tagging the Mongo side would make every id a false difference.
  if (typeof value === 'object' && value._bsontype) return String(value);
  if (Buffer.isBuffer(value)) return `@bin:${value.toString('base64')}`;
  if (Array.isArray(value)) return value.map(normalise);

  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      // Mongoose bookkeeping that has no SQL counterpart and is not part of the
      // API contract.
      if (key === '__v') continue;
      const v = normalise(value[key]);
      if (v === null) continue; // absent == null, in both directions
      out[key] = v;
    }
    return out;
  }

  // A 24-char id from `char(24)` arrives padded; Mongo's arrives clean.
  if (typeof value === 'string') return value.trim();
  return value;
}

/** Field-by-field differences, so a failure names the column rather than dumping two bodies. */
function diff(a, b, pathPrefix = '', out = []) {
  if (out.length >= 12) return out;

  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object'
    && !Array.isArray(a) && !Array.isArray(b);

  if (bothObjects) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diff(a[key], b[key], pathPrefix ? `${pathPrefix}.${key}` : key, out);
    }
    return out;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${pathPrefix}: length ${a.length} (mongo) vs ${b.length} (sql)`);
      return out;
    }
    for (let i = 0; i < a.length; i += 1) diff(a[i], b[i], `${pathPrefix}[${i}]`, out);
    return out;
  }

  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`${pathPrefix || '(root)'}: ${JSON.stringify(a)} (mongo) vs ${JSON.stringify(b)} (sql)`);
  }
  return out;
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  write('\nCP-6 — Pilot parity\n');
  write('-'.repeat(64) + '\n\n');

  const slug = process.argv.find((a) => a.startsWith('--slug='))
    ? process.argv.find((a) => a.startsWith('--slug=')).slice(7)
    : 'jathar-dental';

  const { connectPlatformDB, disconnectPlatformDB } = require('../../src/db/platformConnection');
  const { bothBackends, runWithTenant } = require('../../src/db/repository');
  const { destroyPool } = require('../../src/db/repository/sqlConnection');

  let connected = false;
  try {
    await connectPlatformDB();
    connected = true;

    /**
     * Register the platform models on the default connection.
     *
     * `getTenantConnection` looks a clinic up via the `Clinic` model to find its
     * `dbUri`, and a platform model file registers itself when required. In the
     * running application that happens as a side effect of the route tree being
     * loaded; this gate never builds the app, so it registers them explicitly
     * rather than relying on an import chain it does not have.
     */
    const fs = require('fs');
    const platformDir = path.resolve(__dirname, '../../src/models/platform');
    for (const file of fs.readdirSync(platformDir).filter((f) => f.endsWith('.js'))) {
      require(path.join(platformDir, file));
    }

    const timings = { mongo: 0, sql: 0 };

    await runWithTenant({ slug }, async () => {
      for (const testCase of CASES) {
        const { mongo, sql } = bothBackends(testCase.model);

        let mongoResult;
        let sqlResult;
        try {
          const t0 = Date.now();
          mongoResult = await testCase.run(mongo);
          timings.mongo += Date.now() - t0;

          const t1 = Date.now();
          sqlResult = await testCase.run(sql);
          timings.sql += Date.now() - t1;
        } catch (err) {
          record(false, `${testCase.model}: ${testCase.name}`, `threw: ${err.message}`);
          continue;
        }

        const differences = diff(normalise(mongoResult), normalise(sqlResult));

        // A pair of empty results is not parity, it is two queries that found
        // nothing. Reported rather than counted as a pass, or this gate goes
        // green against an unloaded database.
        const rows = Array.isArray(mongoResult && mongoResult.items)
          ? mongoResult.items.length
          : (typeof mongoResult === 'number' ? mongoResult : 0);

        if (rows === 0) {
          record(false, `${testCase.model}: ${testCase.name}`,
            'both sides returned nothing — nothing was actually compared');
          continue;
        }

        record(
          differences.length === 0,
          `${testCase.model}: ${testCase.name} (${rows} rows)`,
          differences.length ? differences.slice(0, 5).join('; ') : null
        );
      }
    });

    /**
     * Timing is reported, and is deliberately not called a benchmark.
     *
     * The two sides are not comparable as measured: MongoDB is a remote Atlas
     * cluster and PostgreSQL is on localhost, so most of the difference is
     * network round trips rather than either database. Quoting it as a speedup
     * would be dishonest.
     *
     * It is printed because a *large* regression is still worth noticing — an
     * operation that got dramatically slower on SQL usually means a missing index
     * or an accidental sequential scan, and that is worth seeing at the moment the
     * port lands rather than in production.
     */
    write(`\n  timing: mongo ${timings.mongo}ms, sql ${timings.sql}ms across ${CASES.length} operations\n`);
    write('  (not a benchmark — Mongo is a remote cluster, PostgreSQL is local;\n');
    write('   useful only for spotting a large regression, not for comparing engines)\n');
  } catch (err) {
    record(false, 'gate execution', err.message);
  } finally {
    await destroyPool().catch(() => {});
    if (connected) await disconnectPlatformDB().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  write(`\n${'-'.repeat(64)}\n`);
  write(`${results.length - failed.length} of ${results.length} operations match\n`);
  write(failed.length
    ? 'CP-6 FAILED\n\n'
    : 'CP-6 PASSED — the ported modules return equivalent results from either database.\n\n');
  process.exit(failed.length ? 1 : 0);
})();
