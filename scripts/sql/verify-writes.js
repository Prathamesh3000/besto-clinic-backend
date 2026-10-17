#!/usr/bin/env node
'use strict';

/**
 * CP-10 — write parity.
 *
 * The seam grew four write operations the modules need — `updateOne` (71 call
 * sites), `updateMany` (44), `insertMany` (6) and `distinct` (8). Each has two
 * implementations that must agree, and a disagreement between them does not
 * raise an error: it writes a different number of rows, or returns a differently
 * shaped result, and the module carries on.
 *
 * ── Why this writes to a live clinic, and how it stays safe ──
 *
 * Read-only parity cannot test a write. So this seeds its own rows, exercises
 * both backends against them, and removes them in a `finally`.
 *
 * Three things keep that safe:
 *
 * 1. **Notifications**, because they are transient by design and belong to one
 *    recipient rather than to the clinic's records.
 * 2. **A fabricated recipient id** that belongs to no user, so even mid-run
 *    nothing is addressed to a real person and nothing can appear in anyone's
 *    notification list.
 * 3. **A fixed tag**, so a run killed between seed and teardown leaves rows the
 *    next run's teardown still finds. Cleanup keyed on a timestamp or a random
 *    id would orphan them.
 *
 * Nothing here touches a patient, an appointment or an invoice.
 *
 * Run:  npm run sql:test:writes
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const knex = require('knex')(require('../../knexfile').platform);

const SLUG = (process.argv.find((a) => a.startsWith('--slug=')) || '--slug=jathar-dental').split('=')[1];
const write = (s) => process.stdout.write(s);

const TAG = 'ZZ-CP10-WRITE-PARITY';
/**
 * The recipient every test notification is addressed to.
 *
 * All-hex, because an ObjectId is 24 hex characters and Mongoose rejects
 * anything else — the first attempt at this spelled "cp10" into it and failed
 * on the cast before a single row was written.
 *
 * It is nobody. That is the point: a real user id would put three junk
 * notifications in a working clinician's list for as long as the run takes, and
 * "only for two seconds" is not a property worth relying on.
 *
 * PostgreSQL enforces the recipient foreign key that MongoDB does not — Phase 1
 * working as intended — so the ghost needs a `users` row to point at. It is
 * created in PostgreSQL only, never in MongoDB, so the application cannot see
 * it: no login, no directory entry, no staff list. It is removed with everything
 * else in teardown.
 */
const GHOST_RECIPIENT = '000000000000000000000c10';

const { schemaFor } = require('../../sql/tenant/naming');

let passed = 0;
let failed = 0;

function check(name, a, b, note) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) {
    passed += 1;
    write(`  pass  ${name}${note ? ` (${note})` : ''}\n`);
  } else {
    failed += 1;
    write(`  FAIL  ${name}\n`);
    write(`        mongo: ${JSON.stringify(a)}\n`);
    write(`        sql  : ${JSON.stringify(b)}\n`);
  }
}

/** Three notifications, distinguishable and all tagged. */
function seedDocs(marker) {
  return [1, 2, 3].map((n) => ({
    recipient: GHOST_RECIPIENT,
    title: `${TAG} ${marker} ${n}`,
    message: TAG,
    type: n === 3 ? 'system' : 'alert',
    isRead: false,
  }));
}

/** The PostgreSQL-only user row the recipient foreign key points at. */
async function ensureGhostUser(clinicId) {
  await knex.raw(
    `insert into ${schemaFor(SLUG)}.users (id, clinic_id, name, email, password, role, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, now(), now())
     on conflict (id) do nothing`,
    [GHOST_RECIPIENT, String(clinicId), TAG, `${TAG}@invalid.test`, 'x', 'support_staff'],
  );
}

async function teardown(conn) {
  const removed = { mongo: 0, sql: 0 };
  try {
    const r = await conn.db.collection('notifications').deleteMany({ message: TAG });
    removed.mongo = r.deletedCount;
  } catch { /* nothing seeded */ }
  try {
    const r = await knex.raw(
      `delete from ${schemaFor(SLUG)}.notifications where message = ?`, [TAG],
    );
    removed.sql = r.rowCount || 0;
  } catch { /* table may not exist */ }
  // After the notifications, or the foreign key refuses the delete.
  try {
    await knex.raw(`delete from ${schemaFor(SLUG)}.users where email = ?`, [`${TAG}@invalid.test`]);
  } catch { /* nothing seeded */ }
  return removed;
}

async function main() {
  const env = require('../../src/config/env');
  const { connectRedis, disconnectRedis } = require('../../src/config/redis');
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../../src/models/platform/Clinic');
  await connectRedis();

  const { runWithTenant } = require('../../src/db/repository/context');
  const { bothBackends } = require('../../src/db/repository');
  const { getTenantConnection, closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');
  const conn = await getTenantConnection(SLUG);

  /**
   * The real clinic id, because `clinic_id` is NOT NULL on most tenant tables
   * and the repository takes it from the request context.
   *
   * The first version of this passed null, the way a script outside the request
   * path naturally would, and every SQL insert failed on the not-null
   * constraint while the Mongo ones succeeded — Mongo has no such column. Any
   * background job or script writing through the seam has to bind a real clinic
   * id for the same reason.
   */
  const clinic = await mongoose.model('Clinic')
    .findOne({ slug: SLUG, deletedAt: null }).select('_id').lean();
  if (!clinic) throw new Error(`no clinic with slug "${SLUG}"`);

  write('\nCP-10 — write parity\n');
  write('─'.repeat(72) + '\n');

  try {
    // Anything a previous interrupted run left behind, before seeding.
    await teardown(conn);
    await ensureGhostUser(clinic._id);

    await runWithTenant({ slug: SLUG, clinicId: clinic._id, sqlEntities: [] }, async () => {
      const { mongo, sql } = bothBackends('Notification');

      /* ── insertMany ─────────────────────────────── */
      const [mIns, sIns] = [await mongo.insertMany(seedDocs('M')), await sql.insertMany(seedDocs('S'))];
      check('insertMany row count', mIns.length, sIns.length, `${mIns.length} each`);
      check(
        'insertMany returns documents with ids',
        mIns.every((d) => !!d._id) && mIns.every((d) => d.title.includes(TAG)),
        sIns.every((d) => !!d._id) && sIns.every((d) => d.title.includes(TAG)),
      );

      /* ── count ──────────────────────────────────── */
      const filter = { message: TAG, recipient: GHOST_RECIPIENT };
      check(
        'count after insertMany',
        await mongo.count({ ...filter, title: { $regex: 'M ' } }),
        await sql.count({ ...filter, title: { $regex: 'S ' } }),
        '3 each',
      );

      /* ── distinct ───────────────────────────────── */
      const [mDist, sDist] = [
        (await mongo.distinct('type', { ...filter, title: { $regex: 'M ' } })).sort(),
        (await sql.distinct('type', { ...filter, title: { $regex: 'S ' } })).sort(),
      ];
      check('distinct values', mDist, sDist, mDist.join(','));

      /* ── updateOne ──────────────────────────────── */
      // Scoped by ownership as well as title, which is the shape that matters:
      // the filter is a security boundary, not a convenience.
      const mOne = await mongo.updateOne(
        { ...filter, title: `${TAG} M 1` }, { isRead: true, readAt: new Date() },
      );
      const sOne = await sql.updateOne(
        { ...filter, title: `${TAG} S 1` }, { isRead: true, readAt: new Date() },
      );
      check('updateOne applied the patch', mOne && mOne.isRead, sOne && sOne.isRead, 'isRead true');
      check(
        'updateOne left the others alone',
        await mongo.count({ ...filter, title: { $regex: 'M ' }, isRead: false }),
        await sql.count({ ...filter, title: { $regex: 'S ' }, isRead: false }),
        '2 each',
      );

      /* ── updateOne, no match ────────────────────── */
      check(
        'updateOne returns null when nothing matches',
        await mongo.updateOne({ ...filter, title: 'no such title' }, { isRead: true }),
        await sql.updateOne({ ...filter, title: 'no such title' }, { isRead: true }),
      );

      /* ── updateMany ─────────────────────────────── */
      const mMany = await mongo.updateMany(
        { ...filter, title: { $regex: 'M ' }, isRead: false }, { isRead: true },
      );
      const sMany = await sql.updateMany(
        { ...filter, title: { $regex: 'S ' }, isRead: false }, { isRead: true },
      );
      check('updateMany modifiedCount', mMany, sMany, `${mMany.modifiedCount} each`);
      check(
        'updateMany left nothing unread',
        await mongo.count({ ...filter, title: { $regex: 'M ' }, isRead: false }),
        await sql.count({ ...filter, title: { $regex: 'S ' }, isRead: false }),
        '0 each',
      );

      /* ── soft-deleted rows are not bulk-updated ── */
      /**
       * The case the first version of this gate did not have, and so did not
       * catch: Mongoose's `pre(/^find/)` soft-delete hook does not fire on
       * `updateMany`, so the Mongo side would have updated deleted rows that the
       * SQL side skipped. Both are now explicit; this proves it.
       */
      await mongo.updateOne({ ...filter, title: `${TAG} M 3` }, { deletedAt: new Date() });
      await sql.updateOne({ ...filter, title: `${TAG} S 3` }, { deletedAt: new Date() });

      const mAfterDelete = await mongo.updateMany({ ...filter, title: { $regex: 'M ' } }, { isRead: false });
      const sAfterDelete = await sql.updateMany({ ...filter, title: { $regex: 'S ' } }, { isRead: false });
      check(
        'updateMany skips soft-deleted rows',
        mAfterDelete, sAfterDelete, `${mAfterDelete.modifiedCount} of 3 each`,
      );

      /* ── the guard ──────────────────────────────── */
      // Invoice refuses financial edits once paid, and that rule cannot be
      // consulted by a single bulk UPDATE. It must refuse rather than skip it.
      let refused = false;
      try {
        await bothBackends('Invoice').sql.updateMany({ status: 'paid' }, { notes: 'x' });
      } catch {
        refused = true;
      }
      check('updateMany refuses a guarded model', true, refused, 'Invoice');
    });
  } finally {
    const removed = await teardown(conn);
    write(`\nfixtures removed: ${removed.mongo} from mongo, ${removed.sql} from postgres.\n`);
  }

  write('\n' + '─'.repeat(72) + '\n');
  write(`${passed} matched, ${failed} failed\n`);
  write(failed
    ? 'CP-10 FAILED\n\n'
    : 'CP-10 PASSED — both backends write the same rows and report the same result.\n\n');

  await closeAllTenantConnections();
  await disconnectRedis();
  await mongoose.disconnect();
  await knex.destroy();
  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    process.stderr.write(`\nFAILED: ${err.stack}\n\n`);
    await mongoose.disconnect().catch(() => {});
    await knex.destroy().catch(() => {});
    process.exit(1);
  });
