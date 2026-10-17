'use strict';

/**
 * CP-8 — aggregation parity.
 *
 * Phase 5's requirement, stated by the plan: pipelines "rewritten as SQL, output
 * reconciled **row-for-row** against the Mongo originals". Row-for-row is the
 * operative part. An aggregation that returns plausible numbers is the failure
 * mode here — nothing throws, the report renders, and the totals are wrong by
 * however many rows the join treated differently.
 *
 * So each case runs both implementations against the same live data and
 * compares the results structurally. A case whose two sides both return nothing
 * is reported as uncompared rather than passing: a harness that goes green on
 * empty data proves only that both queries ran.
 *
 * Adding a case: write the SQL beside the pipeline it replaces, register it
 * below, and run this. The point is that the SQL is never trusted until its
 * output has been shown to match.
 *
 * Usage:
 *   node scripts/sql/verify-aggregations.js
 *   node scripts/sql/verify-aggregations.js --verbose   # show both result sets
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const knex = require('knex')(require('../../knexfile').platform);

const VERBOSE = process.argv.includes('--verbose');
const WITH_FIXTURES = process.argv.includes('--fixtures');

/**
 * Every fixture row carries this tag, and teardown deletes by it.
 *
 * A marker rather than a timestamp or a random id: if a run is killed between
 * seed and teardown, the next run's teardown still finds and removes the
 * orphans. Fake invoices left in a live clinic's books would show up in its
 * revenue reports, which is a worse outcome than a test that cannot run.
 */
const FIXTURE_TAG = 'ZZ-CP8-FIXTURE';
const SLUG = 'jathar-dental';
const SCHEMA = 'jathar_dental';

/* ── Cases ──────────────────────────────────────────── */

const CASES = [
  {
    name: 'inventory wastage by item',
    source: 'src/modules/inventory/inventory.service.js:218',
    /**
     * `$lookup` followed by `$unwind` with no `preserveNullAndEmptyArrays` is an
     * INNER JOIN, not a LEFT one — that `$unwind` discards any group whose
     * lookup came back empty.
     *
     * Reading it as LEFT would include wastage for items since deleted, and the
     * report would show more wastage than Mongo does. That is the whole reason
     * this harness exists: the difference is invisible unless the two outputs
     * are compared directly.
     */
    async mongo(conn) {
      const InventoryTransaction = conn.model('InventoryTransaction');
      const rows = await InventoryTransaction.aggregate([
        { $match: { type: { $in: ['expired', 'damaged'] } } },
        { $group: { _id: { item: '$item' }, totalQuantity: { $sum: '$quantity' }, count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'inventoryitems', localField: '_id.item', foreignField: '_id', as: 'itemInfo',
          },
        },
        { $unwind: '$itemInfo' },
        { $sort: { totalQuantity: -1 } },
      ]);
      return rows.map((r) => ({
        item: String(r._id.item),
        totalQuantity: Number(r.totalQuantity),
        count: Number(r.count),
        itemName: r.itemInfo.name,
      }));
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select t.item_id                       as item,
               sum(t.quantity)::numeric        as "totalQuantity",
               count(*)::int                   as count,
               i.name                          as "itemName"
          from ${SCHEMA}.inventory_transactions t
          join ${SCHEMA}.inventory_items i on i.id = t.item_id
         -- No soft-delete predicate: InventoryTransaction is an append-only
         -- ledger with no deletedAt, and the Mongo pipeline does not filter on
         -- one either. Adding it here would have been a silent behavioural
         -- difference rather than a translation.
         where t.type in ('expired', 'damaged')
         group by t.item_id, i.name
         order by sum(t.quantity) desc`);
      return rows.map((r) => ({
        item: String(r.item),
        totalQuantity: Number(r.totalQuantity),
        count: Number(r.count),
        itemName: r.itemName,
      }));
    },
  },

  {
    name: 'patients by gender',
    source: 'representative of the 91 direct pipelines',
    /**
     * Deliberately trivial. It exercises the harness itself against a pipeline
     * whose correctness is not in doubt, so a red result points at the harness
     * rather than at the port.
     */
    async mongo(conn) {
      const rows = await conn.model('Patient').aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: '$gender', total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
      return rows.map((r) => ({ gender: r._id || null, total: Number(r.total) }));
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select gender, count(*)::int as total
          from ${SCHEMA}.patients
         where deleted_at is null
         group by gender
         order by gender asc`);
      return rows.map((r) => ({ gender: r.gender || null, total: Number(r.total) }));
    },
  },

  {
    name: 'billing — revenue by doctor',
    source: 'src/modules/billing/billing.service.js:637',
    /**
     * The mirror image of the inventory case. This `$unwind` carries
     * `preserveNullAndEmptyArrays: true`, so it is a LEFT JOIN — an invoice whose
     * doctor has since been deleted still appears, with a null name.
     *
     * Reading it as INNER would drop that invoice and under-report revenue: the
     * opposite error to the inventory one, and equally silent.
     */
    async mongo(conn) {
      const rows = await conn.model('Invoice').aggregate([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: '$doctor',
            totalInvoiced: { $sum: '$totalAmount' },
            totalCollected: { $sum: '$paidAmount' },
            invoiceCount: { $sum: 1 },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doctorInfo' } },
        { $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true } },
        { $sort: { totalCollected: -1 } },
      ]);
      return rows.map((r) => ({
        doctor: r._id ? String(r._id) : null,
        doctorName: r.doctorInfo ? r.doctorInfo.name : null,
        totalInvoiced: Number(r.totalInvoiced),
        totalCollected: Number(r.totalCollected),
        invoiceCount: Number(r.invoiceCount),
      }));
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select i.doctor_id                  as doctor,
               u.name                       as "doctorName",
               sum(i.total_amount)::numeric as "totalInvoiced",
               sum(i.paid_amount)::numeric  as "totalCollected",
               count(*)::int                as "invoiceCount"
          from ${SCHEMA}.invoices i
          left join ${SCHEMA}.users u on u.id = i.doctor_id
         where i.deleted_at is null
         group by i.doctor_id, u.name
         order by sum(i.paid_amount) desc`);
      return rows.map((r) => ({
        doctor: r.doctor ? String(r.doctor) : null,
        doctorName: r.doctorName || null,
        totalInvoiced: Number(r.totalInvoiced),
        totalCollected: Number(r.totalCollected),
        invoiceCount: Number(r.invoiceCount),
      }));
    },
  },

  {
    name: 'platform — subscription revenue trend by month',
    source: 'src/modules/productOwner/productOwner.service.js:306',
    /**
     * `invoiceHistory` was promoted to its own table, so the `$unwind` is an
     * ordinary join. `$year`/`$month` become `date_part`, and both sides return
     * the grouping keys as numbers so a string/number mismatch cannot hide.
     */
    async mongo() {
      const Subscription = require('../../src/models/platform/Subscription');
      const rows = await Subscription.aggregate([
        { $unwind: '$invoiceHistory' },
        { $match: { 'invoiceHistory.status': 'paid' } },
        {
          $group: {
            _id: { year: { $year: '$invoiceHistory.paidAt' }, month: { $month: '$invoiceHistory.paidAt' } },
            revenue: { $sum: '$invoiceHistory.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]);
      return rows.map((r) => ({
        year: Number(r._id.year),
        month: Number(r._id.month),
        revenue: Number(r.revenue),
        count: Number(r.count),
      }));
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select date_part('year',  h.paid_at)::int as year,
               date_part('month', h.paid_at)::int as month,
               sum(h.amount)::numeric             as revenue,
               count(*)::int                      as count
          from platform.subscription_invoice_history h
         where h.status = 'paid'
         group by 1, 2
         order by 1 asc, 2 asc`);
      return rows.map((r) => ({
        year: Number(r.year),
        month: Number(r.month),
        revenue: Number(r.revenue),
        count: Number(r.count),
      }));
    },
  },

  {
    name: 'platform — scan observations by confidence',
    source: 'src/services/dentalScanAnalytics.service.js:237',
    async mongo() {
      const GuestScan = require('../../src/models/platform/GuestScan');
      const rows = await GuestScan.aggregate([
        { $match: { status: 'completed', 'result.observations': { $exists: true, $ne: [] } } },
        { $unwind: '$result.observations' },
        { $group: { _id: '$result.observations.confidence', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      return rows.map((r) => ({ confidence: r._id || null, count: Number(r.count) }));
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select o.confidence, count(*)::int as count
          from platform.guest_scan_observations o
          join platform.guest_scans g on g.id = o.guest_scan_id
         where g.status = 'completed'
         group by o.confidence
         order by count(*) desc`);
      return rows.map((r) => ({ confidence: r.confidence || null, count: Number(r.count) }));
    },
  },

  {
    name: 'platform — guest scan totals (single-branch $facet)',
    source: 'src/services/dentalScanAnalytics.service.js:98',
    /**
     * The pipeline the classifier first rated `hard` because it uses `$facet`.
     * It has exactly one branch, which makes it a plain `$group` wrapped in
     * ceremony — no CTEs needed. Registered to prove the downgrade was right.
     */
    async mongo() {
      const GuestScan = require('../../src/models/platform/GuestScan');
      const [r] = await GuestScan.aggregate([
        {
          $group: {
            _id: null,
            totalScans: { $sum: 1 },
            completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            reportsSent: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$reportSentAt', null] }, null] }, 1, 0] } },
          },
        },
      ]);
      return r ? [{
        totalScans: Number(r.totalScans),
        completedScans: Number(r.completedScans),
        failedScans: Number(r.failedScans),
        reportsSent: Number(r.reportsSent),
      }] : [];
    },
    async sql(db) {
      const { rows } = await db.raw(`
        select count(*)::int                                           as "totalScans",
               count(*) filter (where status = 'completed')::int       as "completedScans",
               count(*) filter (where status = 'failed')::int          as "failedScans",
               count(*) filter (where report_sent_at is not null)::int as "reportsSent"
          from platform.guest_scans`);
      return Number(rows[0].totalScans) === 0 ? [] : rows.map((r) => ({
        totalScans: Number(r.totalScans),
        completedScans: Number(r.completedScans),
        failedScans: Number(r.failedScans),
        reportsSent: Number(r.reportsSent),
      }));
    },
  },
];

/* ── Fixtures ─────────────────────────────── */

/**
 * Some pipelines have nothing to compare against, because the clinic has no
 * invoices, no subscription payments and no completed scans. A parity harness
 * that skips those is honest but unhelpful: the SQL stays unproven.
 *
 * So `--fixtures` seeds the minimum each case needs, runs the comparison, and
 * removes it again in a `finally`. Nothing survives the run.
 *
 * Seeded into MongoDB and then loaded through the real ETL rather than written
 * to both stores directly. Writing each side separately would prove only that
 * two scripts agree; routing through the ETL is what makes the comparison a
 * statement about the migration.
 */
const { ObjectId } = require('mongodb');

async function seedFixtures(conn) {
  const db = conn.db;
  const tag = FIXTURE_TAG;

  const branch = await db.collection('branches').findOne({});
  const patient = await db.collection('patients').findOne({});
  const doctor = await db.collection('users').findOne({ role: 'doctor', deletedAt: null });
  const ghostDoctor = new ObjectId();

  // Two invoices against a real doctor, one against a doctor that no longer
  // exists — the row that separates LEFT from INNER on this pipeline.
  await db.collection('invoices').insertMany([
    {
      _id: new ObjectId(), invoiceNumber: `${tag}-1`, patient: patient._id, doctor: doctor._id,
      branch: branch._id, subtotal: 1000, totalAmount: 1180, paidAmount: 1180,
      taxAmount: 180, status: 'paid', notes: tag, deletedAt: null,
      items: [
        { description: 'Consultation', quantity: 1, unitPrice: 600, discount: 0, tax: 108, total: 708, hsnCode: '9993', taxRate: 18 },
        { description: 'Scaling', quantity: 1, unitPrice: 400, discount: 0, tax: 72, total: 472, hsnCode: '9993', taxRate: 18 },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: new ObjectId(), invoiceNumber: `${tag}-2`, patient: patient._id, doctor: doctor._id,
      branch: branch._id, subtotal: 500, totalAmount: 590, paidAmount: 0,
      taxAmount: 90, status: 'sent', notes: tag, deletedAt: null,
      items: [
        { description: 'X-Ray', quantity: 1, unitPrice: 500, discount: 0, tax: 90, total: 590, hsnCode: '9992', taxRate: 18 },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: new ObjectId(), invoiceNumber: `${tag}-3`, patient: patient._id, doctor: ghostDoctor,
      branch: branch._id, subtotal: 200, totalAmount: 236, paidAmount: 236,
      taxAmount: 36, status: 'paid', notes: tag, deletedAt: null,
      items: [{ description: 'Orphan line', quantity: 1, unitPrice: 200, discount: 0, tax: 36, total: 236, hsnCode: '9991', taxRate: 18 }],
      createdAt: new Date(), updatedAt: new Date(),
    },
  ]);

  // Platform: a subscription with paid invoice history, and a completed scan
  // carrying observations.
  const platform = conn.client.db('besto_clinic');
  const clinic = await platform.collection('clinics').findOne({});
  const plan = await platform.collection('plans').findOne({});

  await platform.collection('subscriptions').insertOne({
    _id: new ObjectId(), clinic: clinic._id,
    // `plan` doubles as the fixture tag: it is the only declared string field
    // on this model that teardown can match on, and planRef carries the real
    // reference. A second `plan` key silently overwrote the first.
    plan: tag,
    planRef: plan ? plan._id : undefined,
    status: 'active', billingCycle: 'monthly',
    invoiceHistory: [
      { invoiceId: `${tag}-A`, amount: 2999, status: 'paid', paidAt: new Date('2026-07-15T00:00:00Z') },
      { invoiceId: `${tag}-B`, amount: 2999, status: 'paid', paidAt: new Date('2026-08-15T00:00:00Z') },
      { invoiceId: `${tag}-C`, amount: 2999, status: 'pending', paidAt: new Date('2026-09-15T00:00:00Z') },
    ],
    createdAt: new Date(), updatedAt: new Date(),
  });

  await platform.collection('guestscans').insertMany([
    {
      _id: new ObjectId(), sessionToken: `${tag}-S1`, status: 'completed', source: tag,
      consentGiven: true, scanMode: 'guided_3pos', reportSentAt: new Date(),
      result: {
        overallSummary: 'fixture',
        observations: [
          // Types drawn from the model's enum. 'caries' and 'stain' are not in
          // it, and the CHECK constraint rejected them — which is the schema
          // doing its job on a fixture, not a schema fault.
          { type: 'plaque', area: 'upper left', confidence: 'high', description: 'f' },
          { type: 'cavity', area: 'lower', confidence: 'medium', description: 'f' },
          { type: 'discoloration', area: 'front', confidence: 'high', description: 'f' },
        ],
      },
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: new ObjectId(), sessionToken: `${tag}-S2`, status: 'failed', source: tag,
      consentGiven: true, scanMode: 'guided_3pos', failureReason: 'fixture', createdAt: new Date(), updatedAt: new Date(),
    },
  ]);

  // Inventory: two transactions against a real item and one against an item
  // that does not exist. That orphan is the row separating INNER from LEFT on
  // the wastage pipeline, so the fixture is built around it deliberately.
  const item = {
    _id: new ObjectId(), name: `${tag} Gauze`, code: 'ZZCP8GAUZE', category: 'consumables',
    unit: 'piece', currentStock: 50, minimumThreshold: 5, branch: branch._id,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  await db.collection('inventoryitems').insertOne(item);

  const txBase = {
    branch: branch._id, performedBy: doctor._id, reason: tag,
    previousReserved: 0, newReserved: 0, createdAt: new Date(),
  };
  await db.collection('inventorytransactions').insertMany([
    { _id: new ObjectId(), item: item._id, type: 'expired', quantity: 7, previousStock: 50, newStock: 43, ...txBase },
    { _id: new ObjectId(), item: item._id, type: 'damaged', quantity: 3, previousStock: 43, newStock: 40, ...txBase },
    { _id: new ObjectId(), item: new ObjectId(), type: 'expired', quantity: 99, previousStock: 99, newStock: 0, ...txBase },
  ]);

  return { invoices: 3, subscriptions: 1, guestScans: 2, inventory: 3 };
}

async function tearDownFixtures(conn, db) {
  const tenant = conn.db;
  const platform = conn.client.db('besto_clinic');
  const tag = FIXTURE_TAG;

  await tenant.collection('invoices').deleteMany({ notes: tag });
  await tenant.collection('inventorytransactions').deleteMany({ reason: tag });
  await tenant.collection('inventoryitems').deleteMany({ code: 'ZZCP8GAUZE' });
  await platform.collection('subscriptions').deleteMany({ plan: tag });
  await platform.collection('guestscans').deleteMany({ source: tag });

  // PostgreSQL holds ETL copies; the ETL never deletes, so they go explicitly.
  await db.raw(`delete from ${SCHEMA}.invoice_items where invoice_id in (
                  select id from ${SCHEMA}.invoices where notes = ?)`, [tag]);
  await db.raw(`delete from ${SCHEMA}.invoices where notes = ?`, [tag]);
  await db.raw(`delete from ${SCHEMA}.inventory_transactions where reason = ?`, [tag]);
  await db.raw(`delete from ${SCHEMA}.inventory_items where code = 'ZZCP8GAUZE'`);
  await db.raw(`delete from platform.subscription_invoice_history where subscription_id in (
                  select id from platform.subscriptions where plan = ?)`, [tag]);
  await db.raw('delete from platform.subscriptions where plan = ?', [tag]);
  await db.raw(`delete from platform.guest_scan_observations where guest_scan_id in (
                  select id from platform.guest_scans where source = ?)`, [tag]);
  await db.raw('delete from platform.guest_scans where source = ?', [tag]);
}

/** Load the fixtures into PostgreSQL through the real ETL. */
async function loadFixtures() {
  const { execFileSync } = require('child_process');
  for (const args of [['--platform'], [`--slug=${SLUG}`]]) {
    execFileSync(process.execPath, [path.resolve(__dirname, '../../sql/etl/load.js'), ...args],
      { stdio: 'ignore' });
  }
}

/* ── Comparison ─────────────────────────────────────── */

/**
 * Structural comparison, order included.
 *
 * Order matters: both sides carry an explicit sort, and a port that produces the
 * right rows in the wrong order is still wrong for anything paginated or shown
 * as a ranking.
 */
function diff(a, b) {
  const problems = [];
  if (a.length !== b.length) {
    problems.push(`row count: mongo ${a.length} vs sql ${b.length}`);
  }
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const keys = [...new Set([...Object.keys(a[i]), ...Object.keys(b[i])])];
    for (const k of keys) {
      const l = a[i][k];
      const r = b[i][k];
      const same = typeof l === 'number' && typeof r === 'number'
        ? Math.abs(l - r) < 1e-9
        : String(l) === String(r);
      if (!same) problems.push(`row ${i} "${k}": mongo ${JSON.stringify(l)} vs sql ${JSON.stringify(r)}`);
    }
  }
  return problems;
}

async function main() {
  const env = require('../../src/config/env');
  const { connectRedis, disconnectRedis } = require('../../src/config/redis');
  await mongoose.connect(env.PLATFORM_DB_URI);
  await connectRedis();
  require('../../src/models/platform/Clinic');

  const { getTenantConnection, closeAllTenantConnections } = require('../../src/db/tenantConnectionManager');
  const conn = await getTenantConnection(SLUG);

  process.stdout.write('\nCP-8 — aggregation parity\n');
  process.stdout.write('─'.repeat(72) + '\n');

  if (WITH_FIXTURES) {
    // Remove anything a previous interrupted run left behind before seeding,
    // so a re-run cannot double-count.
    await tearDownFixtures(conn, knex);
    const seeded = await seedFixtures(conn);
    process.stdout.write(`  fixtures: ${seeded.invoices} invoices, `
      + `${seeded.subscriptions} subscription, ${seeded.guestScans} scans — loading via ETL\n`);
    await loadFixtures();
    process.stdout.write('\n');
  }


  let passed = 0;
  let failed = 0;
  let uncompared = 0;

  for (const c of CASES) {
    const [m, s] = await Promise.all([c.mongo(conn), c.sql(knex)]);

    if (m.length === 0 && s.length === 0) {
      uncompared += 1;
      process.stdout.write(`  SKIP  ${c.name}\n`);
      process.stdout.write('        both sides returned nothing — nothing was compared\n');
      continue;
    }

    const problems = diff(m, s);
    if (problems.length === 0) {
      passed += 1;
      process.stdout.write(`  pass  ${c.name} (${m.length} row(s))\n`);
    } else {
      failed += 1;
      process.stdout.write(`  FAIL  ${c.name}\n`);
      problems.slice(0, 5).forEach((p) => process.stdout.write(`        ${p}\n`));
    }

    if (VERBOSE) {
      process.stdout.write(`        mongo: ${JSON.stringify(m).slice(0, 200)}\n`);
      process.stdout.write(`        sql  : ${JSON.stringify(s).slice(0, 200)}\n`);
    }
  }

  process.stdout.write(`\n${'─'.repeat(72)}\n`);
  process.stdout.write(`${passed} of ${CASES.length} matched`);
  if (uncompared) process.stdout.write(`, ${uncompared} uncompared (no data)`);
  process.stdout.write('\n');

  // Uncompared is not a pass. A gate that goes green on empty data is a gate
  // that has told you nothing.
  const green = failed === 0 && uncompared === 0;
  process.stdout.write(green
    ? 'CP-8 PASSED — ported pipelines return identical rows from either database.\n\n'
    : 'CP-8 FAILED\n\n');

  if (WITH_FIXTURES) {
    await tearDownFixtures(conn, knex);
    process.stdout.write('fixtures removed from both databases.\n\n');
  }

  await closeAllTenantConnections();
  await mongoose.disconnect();
  await disconnectRedis();
  await knex.destroy();
  return green ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`\nFAILED: ${err.message}\n\n`);
    process.exit(1);
  });
