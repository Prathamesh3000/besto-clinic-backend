#!/usr/bin/env node
'use strict';

/**
 * CP-9 — filter parity.
 *
 * The repository seam accepts Mongo's filter language and translates it to SQL.
 * Every ported module depends on that translation being exact, and the failure
 * mode is the quiet one: a filter that selects slightly different rows returns a
 * plausible answer, so nothing raises an error and the number is simply wrong.
 *
 * So each case below runs the *same filter object* through both repositories,
 * against the clinic's real data, and compares the ids that come back. Comparing
 * counts would not be enough — two different sets of eight rows are both eight
 * rows.
 *
 * The cases that matter most are the ones where SQL and Mongo disagree by
 * default:
 *
 *   - `$ne` must keep rows whose column is null. `col <> x` drops them.
 *   - `$or` must be parenthesised. Loose `orWhere` clauses rewrite the whole
 *     WHERE into something that matches far more than intended.
 *   - `{ field: null }` must match rows that never had the field.
 *
 * Run:
 *   npm run sql:test:filters
 *   npm run sql:test:filters -- --verbose
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');

const SLUG = (process.argv.find((a) => a.startsWith('--slug=')) || '--slug=jathar-dental').split('=')[1];
const VERBOSE = process.argv.includes('--verbose');

const write = (s) => process.stdout.write(s);

/**
 * Every case is (model, filter). Both backends get the identical object.
 *
 * Filters are written the way the services write them, including the shapes
 * that look redundant — `deletedAt: null` beside a repository that already
 * applies it — because that is what a ported module will actually pass.
 */
const CASES = [
  { name: 'equality', model: 'Patient', filter: { gender: 'male' } },
  { name: 'equality on boolean', model: 'Department', filter: { isActive: true } },
  { name: 'null matches absent', model: 'Patient', filter: { deletedAt: null } },
  { name: '$in', model: 'Patient', filter: { gender: { $in: ['male', 'female'] } } },
  { name: '$nin', model: 'Patient', filter: { gender: { $nin: ['male'] } } },
  { name: 'bare array is $in', model: 'Patient', filter: { gender: ['female'] } },

  // The one that motivates `is distinct from`.
  { name: '$ne keeps null rows', model: 'Patient', filter: { gender: { $ne: 'male' } } },
  { name: '$ne null is not-null', model: 'Patient', filter: { gender: { $ne: null } } },

  { name: '$exists true', model: 'Patient', filter: { email: { $exists: true } } },
  { name: '$exists false', model: 'Patient', filter: { email: { $exists: false } } },

  { name: '$gte on date', model: 'Patient', filter: { createdAt: { $gte: new Date('2020-01-01') } } },
  { name: '$lt on date', model: 'Patient', filter: { createdAt: { $lt: new Date('2030-01-01') } } },
  {
    name: 'date range ($gte + $lte)',
    model: 'Appointment',
    filter: { scheduledAt: { $gte: new Date('2020-01-01'), $lte: new Date('2030-12-31') } },
  },

  { name: '$regex case-insensitive', model: 'Patient', filter: { name: { $regex: 'a', $options: 'i' } } },
  { name: '$regex anchored', model: 'Patient', filter: { name: { $regex: '^A', $options: 'i' } } },
  { name: '$regex case-sensitive', model: 'Patient', filter: { name: { $regex: 'a' } } },

  // Grouping: if `$or` leaks out of its parentheses this returns every male
  // patient regardless of the gender clause, and the count goes up rather than
  // down — which is why the assertion is on ids, not counts.
  {
    name: '$or grouped',
    model: 'Patient',
    filter: { $or: [{ gender: 'male' }, { gender: 'female' }] },
  },
  /**
   * The case a grouping bug actually shows up in.
   *
   * `male AND (A* OR S*)`. If the `$or` escapes its parentheses it becomes
   * `(male AND A*) OR S*`, which pulls in every female patient whose name starts
   * with S — the result grows rather than erroring. Fields with real values in
   * this clinic were chosen deliberately: an empty result proves nothing, and
   * the first attempt at this case used bloodGroup, which no patient has.
   */
  {
    name: '$or beside a sibling clause',
    model: 'Patient',
    filter: {
      gender: 'male',
      $or: [{ name: { $regex: '^A', $options: 'i' } }, { name: { $regex: '^S', $options: 'i' } }],
    },
  },
  {
    name: '$and',
    model: 'Patient',
    filter: { $and: [{ gender: 'male' }, { createdAt: { $lt: new Date('2030-01-01') } }] },
  },
  {
    name: 'nested $or inside $and',
    model: 'Patient',
    filter: {
      $and: [
        { $or: [{ gender: 'male' }, { gender: 'female' }] },
        { deletedAt: null },
      ],
    },
  },
  {
    name: 'combined range, $in and $ne',
    model: 'Appointment',
    filter: {
      status: { $nin: ['cancelled'] },
      scheduledAt: { $gte: new Date('2020-01-01') },
      branch: { $ne: null },
    },
  },
];

/** Ids only, sorted — the set of rows selected, independent of order. */
function ids(items) {
  return items.map((d) => String(d._id)).sort();
}

async function main() {
  const env = require('../../src/config/env');
  const { connectRedis, disconnectRedis } = require('../../src/config/redis');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../../src/models/platform/Clinic');
  await connectRedis();

  const { runWithTenant } = require('../../src/db/repository/context');
  const { bothBackends } = require('../../src/db/repository');
  const { closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');

  write('\nCP-9 — filter parity\n');
  write('─'.repeat(72) + '\n');

  let passed = 0;
  let failed = 0;
  let uncompared = 0;

  await runWithTenant({ slug: SLUG, clinicId: null, sqlEntities: [] }, async () => {
    for (const c of CASES) {
      const { mongo, sql } = bothBackends(c.model);

      let a;
      let b;
      try {
        // A limit high enough to take everything this clinic has, so the
        // comparison is of whole result sets rather than of two first pages
        // that happen to agree.
        [a, b] = await Promise.all([
          mongo.find(c.filter, { limit: 10000, sort: { createdAt: 1 } }),
          sql.find(c.filter, { limit: 10000, sort: { createdAt: 1 } }),
        ]);
      } catch (err) {
        failed += 1;
        write(`  FAIL  ${c.name}\n        threw: ${err.message}\n`);
        continue;
      }

      const ma = ids(a.items);
      const sb = ids(b.items);

      /**
       * Both empty proves only that two queries ran.
       *
       * Reported separately rather than counted as a pass, for the same reason
       * CP-8 does it: a harness that goes green on absent data is worse than no
       * harness, because it is believed.
       */
      if (!ma.length && !sb.length) {
        uncompared += 1;
        write(`  ----  ${c.name} (no rows either side — nothing compared)\n`);
        continue;
      }

      if (JSON.stringify(ma) === JSON.stringify(sb)) {
        passed += 1;
        write(`  pass  ${c.name} (${ma.length} row(s))\n`);
        if (VERBOSE) write(`        ${JSON.stringify(c.filter)}\n`);
      } else {
        failed += 1;
        const onlyMongo = ma.filter((x) => !sb.includes(x));
        const onlySql = sb.filter((x) => !ma.includes(x));
        write(`  FAIL  ${c.name}\n`);
        write(`        filter: ${JSON.stringify(c.filter)}\n`);
        write(`        mongo ${ma.length} row(s), sql ${sb.length} row(s)\n`);
        if (onlyMongo.length) write(`        only in mongo: ${onlyMongo.slice(0, 5).join(', ')}\n`);
        if (onlySql.length) write(`        only in sql  : ${onlySql.slice(0, 5).join(', ')}\n`);
      }
    }

    // Unsupported operators, and fields that map to no column, must throw
    // rather than quietly returning unfiltered rows.
    for (const bad of [
      { $nor: [{ gender: 'male' }] },
      { x: { $size: 0 } },
      { $expr: {} },
      { noSuchField: 'x' },
    ]) {
      const { sql } = bothBackends('Patient');
      let threw = false;
      try {
        await sql.find(bad, { limit: 1 });
      } catch {
        threw = true;
      }
      if (threw) {
        passed += 1;
        write(`  pass  rejects ${JSON.stringify(bad)}\n`);
      } else {
        failed += 1;
        write(`  FAIL  silently accepted ${JSON.stringify(bad)} — it filtered nothing\n`);
      }
    }
  });

  write('\n' + '─'.repeat(72) + '\n');
  write(`${passed} matched, ${failed} failed`);
  write(uncompared ? `, ${uncompared} uncompared\n` : '\n');
  write(failed
    ? 'CP-9 FAILED\n\n'
    : 'CP-9 PASSED — both backends select the same rows for the same filter.\n\n');

  await closeAllTenantConnections();
  await disconnectRedis();
  await mongoose.disconnect();
  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    process.stderr.write(`\nFAILED: ${err.stack}\n\n`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
