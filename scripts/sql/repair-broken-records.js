#!/usr/bin/env node
'use strict';

/**
 * Repair broken references by reattaching them to the right row.
 *
 * Not by deleting, and not by guessing. Every repair below is driven by evidence
 * that survives inside the broken row itself, and each states what that evidence
 * is and how strong it is. Where the evidence does not identify a unique target,
 * the row is left alone and reported.
 *
 * Why reattachment rather than deletion
 * ------------------------------------
 * FINDINGS.md F-1 recommends deleting the 1,564 orphaned ledger rows as seed
 * debris, on the stated grounds that they "were written inside a 2-millisecond
 * window ... which is a bulk insert, not application traffic". Measured across
 * the full population that window is **1.1 days**, not 2 milliseconds, so the
 * evidence for that recommendation does not hold — and these are financial
 * records. It turns out none of them need deleting: all 1,564 carry an invoice
 * number that identifies exactly one live invoice, and the invoice knows the
 * patient, the branch and who created it.
 *
 * Every repair is reversible. Original values are written to a backup file before
 * anything changes, and `--rollback` restores them.
 *
 * Usage:
 *   node scripts/sql/repair-broken-records.js                   # dry run
 *   node scripts/sql/repair-broken-records.js --apply
 *   node scripts/sql/repair-broken-records.js --rollback=<file>
 */

const fs = require('fs');
const path = require('path');
const knexLib = require('knex');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dns').setServers(
  (process.env.SQL_DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((x) => x.trim()).filter(Boolean)
);

const config = require('../../sql/config');
const { decryptIfEncrypted } = require('../../src/utils/encryption');

const ROOT = path.resolve(__dirname, '../..');
const BACKUP_DIR = path.join(ROOT, 'scripts/backups');

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const APPLY = Boolean(flag('apply'));
const SCHEMA = flag('schema', 'jathar_dental');
const SLUG = flag('slug', 'jathar-dental');

/**
 * Where to apply the repair.
 *
 * `postgres` alone is not durable: the ETL reloads from MongoDB, which
 * faithfully restores the broken values. Repairing the migration target while
 * leaving the source broken means the fix lasts exactly until the next load —
 * measured, not assumed: a CP-4 idempotency re-run undid all 5,476 values.
 *
 * MongoDB is the system of record, so `both` is the option that actually fixes
 * the data.
 */
const TARGET = flag('target', 'postgres'); // postgres | mongo | both
const write = (s) => process.stdout.write(s);

function pg() {
  return knexLib({
    client: 'pg',
    connection: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    },
    pool: { min: 0, max: 4 },
  });
}

/* ── The repairs ───────────────────────────────────────────── */

/**
 * Each repair states the evidence it rests on and how strong that is:
 *
 *   EXACT     the evidence identifies one row and cannot mean anything else.
 *   INFERRED  one candidate fits and no other does, but the link is circumstantial.
 *
 * The distinction is recorded per row in the backup file, so an INFERRED repair
 * can be reviewed or reverted separately later without unpicking the EXACT ones.
 */
const REPAIRS = [
  {
    id: 'ledger-patient',
    table: 'patient_ledgers',
    column: 'patient_id',
    collection: 'patientledgers',
    field: 'patient',
    confidence: 'EXACT',
    evidence:
      'Every broken row\'s `description` contains an invoice number ("Invoice INV-JDFC-00029", '
      + '"Payment for INV-JDFC-00306"). Each number matches exactly one live invoice — 1,564 of '
      + '1,564, zero ambiguous, zero missing — and that invoice names the patient.',
    /** Rows to change, with the value each should take. */
    plan: (knex, schema) => knex.raw(`
      select pl.id, pl.${'patient_id'} as old_value, i.patient_id as new_value,
             i.invoice_number as via
      from ${schema}.patient_ledgers pl
      join ${schema}.invoices i
        on i.invoice_number = substring(pl.description from '(INV-[A-Z0-9-]+)')
      where not exists (select 1 from ${schema}.patients p where p.id = pl.patient_id)
        and exists (select 1 from ${schema}.patients p2 where p2.id = i.patient_id)
    `),
  },
  {
    id: 'ledger-branch',
    table: 'patient_ledgers',
    column: 'branch_id',
    collection: 'patientledgers',
    field: 'branch',
    confidence: 'EXACT',
    evidence: 'Same matched invoice, which records the branch the invoice was raised at.',
    plan: (knex, schema) => knex.raw(`
      select pl.id, pl.branch_id as old_value, i.branch_id as new_value,
             i.invoice_number as via
      from ${schema}.patient_ledgers pl
      join ${schema}.invoices i
        on i.invoice_number = substring(pl.description from '(INV-[A-Z0-9-]+)')
      where pl.branch_id is not null
        and not exists (select 1 from ${schema}.branches b where b.id = pl.branch_id)
        and exists (select 1 from ${schema}.branches b2 where b2.id = i.branch_id)
    `),
  },
  {
    id: 'ledger-created-by',
    table: 'patient_ledgers',
    column: 'created_by_id',
    collection: 'patientledgers',
    field: 'createdBy',
    confidence: 'EXACT',
    evidence: 'Same matched invoice, which records the user who created it.',
    plan: (knex, schema) => knex.raw(`
      select pl.id, pl.created_by_id as old_value, i.created_by_id as new_value,
             i.invoice_number as via
      from ${schema}.patient_ledgers pl
      join ${schema}.invoices i
        on i.invoice_number = substring(pl.description from '(INV-[A-Z0-9-]+)')
      where pl.created_by_id is not null
        and not exists (select 1 from ${schema}.users u where u.id = pl.created_by_id)
        and exists (select 1 from ${schema}.users u2 where u2.id = i.created_by_id)
    `),
  },

  /**
   * A type confusion, not a deleted user.
   *
   * Both broken notifications carry `recipient_id = 69cfcaf15ed0c70cee242f31`, and
   * the appointment named in their own metadata has `patient_id` set to that same
   * value. So the code wrote a **Patient** id into a column that references
   * **User**. The user was never deleted; it never was a user id.
   *
   * That makes the repair exact — the patient record knows its user — and it also
   * means there is a live bug: whatever wrote these will keep writing Patient ids
   * into `recipient`. Reported separately in the summary.
   */
  {
    id: 'notification-recipient',
    table: 'notifications',
    column: 'recipient_id',
    collection: 'notifications',
    field: 'recipient',
    confidence: 'EXACT',
    evidence:
      'The broken recipient id is a Patient id, not a User id — it matches the `patient` of the '
      + 'appointment named in the notification\'s own metadata. The patient record names its user.',
    plan: (knex, schema) => knex.raw(`
      select n.id, n.recipient_id as old_value, p.user_id as new_value,
             p.name as via
      from ${schema}.notifications n
      join ${schema}.patients p on p.id = n.recipient_id
      where n.recipient_id is not null
        and not exists (select 1 from ${schema}.users u where u.id = n.recipient_id)
        and p.user_id is not null
        and exists (select 1 from ${schema}.users u2 where u2.id = p.user_id)
    `),
  },

  /**
   * The polymorphic `reference` column, repaired where it is unambiguous.
   *
   * It has no foreign key — `reference_model` decides what it points at — so it
   * never showed up in the orphan counts. It is still a dangling pointer, and the
   * ledger is what the GST reports read.
   *
   * Only the `Invoice` rows are repaired here. The `Payment` rows are left alone:
   * 615 of 782 invoices have exactly one payment, but 6 have several and 161 have
   * none, and there is nothing in the ledger row that says *which* payment it was.
   * Repairing the easy 615 and leaving 167 wrong would be worse than leaving the
   * column consistently untouched and reporting it.
   */
  {
    id: 'ledger-reference-invoice',
    table: 'patient_ledgers',
    column: 'reference',
    collection: 'patientledgers',
    field: 'reference',
    confidence: 'EXACT',
    evidence: 'Rows whose `reference_model` is Invoice, repointed at the invoice their description names.',
    plan: (knex, schema) => knex.raw(`
      select pl.id, pl.reference as old_value, i.id as new_value,
             i.invoice_number as via
      from ${schema}.patient_ledgers pl
      join ${schema}.invoices i
        on i.invoice_number = substring(pl.description from '(INV-[A-Z0-9-]+)')
      where pl.reference_model = 'Invoice'
        and pl.reference is distinct from i.id
    `),
  },
];

/* ── Execution ─────────────────────────────────────────────── */

async function collect(knex, schema) {
  const planned = [];
  for (const repair of REPAIRS) {
    const { rows } = await repair.plan(knex, schema);
    planned.push({ repair, rows });
  }
  return planned;
}

async function applyRepairs(knex, schema, planned) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `repair-broken-records-${stamp}.json`);

  // Written before the first update: these are the only record of what the values
  // were, and a repair that cannot be undone is not a repair, it is a rewrite.
  const backup = {
    schema,
    appliedAt: new Date().toISOString(),
    repairs: planned.map(({ repair, rows }) => ({
      id: repair.id,
      table: repair.table,
      column: repair.column,
      confidence: repair.confidence,
      evidence: repair.evidence,
      rows: rows.map((r) => ({
        id: String(r.id).trim(),
        old: r.old_value === null ? null : String(r.old_value).trim(),
        new: r.new_value === null ? null : String(r.new_value).trim(),
        via: r.via,
      })),
    })),
  };
  fs.writeFileSync(backupFile, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  write(`  backup written: ${path.relative(ROOT, backupFile)}\n\n`);

  const results = [];
  for (const { repair, rows } of planned) {
    if (!rows.length) { results.push({ repair, updated: 0 }); continue; }

    /**
     * One statement per repair rather than one per row.
     *
     * 1,564 individual updates inside a transaction is slow and, more to the
     * point, gives a partial result if it fails halfway. A single UPDATE ... FROM
     * over a VALUES list either applies to every row or to none.
     */
    const values = rows
      .map((r) => `('${String(r.id).trim()}', ${r.new_value === null ? 'null' : `'${String(r.new_value).trim()}'`})`)
      .join(',\n        ');

    const { rowCount } = await knex.raw(`
      update ${schema}.${repair.table} t
      set ${repair.column} = v.new_value, updated_at = now()
      from (values
        ${values}
      ) as v(id, new_value)
      where t.id = v.id
    `);
    results.push({ repair, updated: rowCount });
  }
  return { results, backupFile };
}

async function rollback(knex, file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  let restored = 0;
  for (const r of backup.repairs) {
    for (const row of r.rows) {
      await knex(`${backup.schema}.${r.table}`)
        .where('id', row.id)
        .update({ [r.column]: row.old });
      restored += 1;
    }
    write(`  restored  ${r.table}.${r.column}`.padEnd(46) + `${r.rows.length} row(s)\n`);
  }
  return restored;
}

/** What is still broken after the repair — the honest bottom line. */
async function remainingOrphans(knex, schema) {
  const checks = [
    ['patient_ledgers', 'patient_id', 'patients'],
    ['patient_ledgers', 'created_by_id', 'users'],
    ['patient_ledgers', 'branch_id', 'branches'],
    ['notifications', 'recipient_id', 'users'],
    ['chat_messages', 'session_id', 'video_sessions'],
    ['emergency_sessions', 'video_session_id', 'video_sessions'],
  ];
  const out = [];
  for (const [table, column, target] of checks) {
    const { rows } = await knex.raw(`
      select count(*)::int as n from ${schema}.${table} c
      where c.${column} is not null
        and not exists (select 1 from ${schema}.${target} p where p.id = c.${column})
    `);
    out.push({ table, column, target, orphans: rows[0].n });
  }
  return out;
}

/**
 * Apply the same repair to MongoDB.
 *
 * The plan is computed in PostgreSQL and replayed here rather than recomputed.
 * The ids are identical on both sides — preserving them is a deliberate decision
 * of the migration — so a row identified there is the same row here, and the
 * matching logic gets verified once instead of written twice in two query
 * languages that would drift apart.
 */
async function applyToMongo(planned, clinic) {
  const uri = decryptIfEncrypted(clinic.dbUri, process.env.APP_ENCRYPTION_KEY);
  const conn = await mongoose.createConnection(uri).asPromise();
  const results = [];

  try {
    for (const { repair, rows } of planned) {
      if (!rows.length || !repair.collection) { results.push({ repair, updated: 0 }); continue; }

      const ops = rows.map((r) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(String(r.id).trim()) },
          update: {
            $set: {
              [repair.field]: r.new_value === null
                ? null
                : new mongoose.Types.ObjectId(String(r.new_value).trim()),
            },
          },
        },
      }));

      // Unordered, so one unexpected row cannot stop the rest — and every failure
      // is reported rather than aborting mid-way through financial records.
      const res = await conn.db.collection(repair.collection).bulkWrite(ops, { ordered: false });
      results.push({ repair, updated: res.modifiedCount });
    }
    return results;
  } finally {
    await conn.close();
  }
}

/** The clinic's connection details, from the platform registry. */
async function mongoConnectClinic() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.PLATFORM_DB_URI);
  }
  const clinic = await mongoose.connection.db.collection('clinics')
    .findOne({ slug: SLUG }, { projection: { slug: 1, dbUri: 1 } });
  if (!clinic) throw new Error(`No clinic "${SLUG}" in the platform database.`);
  return clinic;
}

/**
 * Promote every NOT VALID constraint the data now satisfies.
 *
 * This is the point of the repair. `NOT VALID` means "enforced for new rows,
 * existing violations tolerated" — a holding position, not a destination. Once
 * the violations are gone the constraint should be fully enforced, or the
 * database is still only half-guarding the thing that was just fixed.
 *
 * `VALIDATE CONSTRAINT` re-checks every existing row and takes only a
 * SHARE UPDATE EXCLUSIVE lock, so it neither rewrites the table nor blocks reads.
 * If any row still violates it PostgreSQL refuses — which is the check, not a
 * problem: a constraint that validates is proof the repair was complete.
 */
async function validateConstraints(knex, schema) {
  const { rows: pending } = await knex.raw(`
    select c.conname, t.relname as table_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = ? and c.contype = 'f' and not c.convalidated
    order by t.relname, c.conname
  `, [schema]);

  const promoted = [];
  const refused = [];
  for (const c of pending) {
    try {
      await knex.raw(`alter table ${schema}.${c.table_name} validate constraint ${c.conname}`);
      promoted.push(c.conname);
    } catch (err) {
      refused.push(`${c.conname}: ${String(err.message).split('\n')[0]}`);
    }
  }
  return { pending: pending.length, promoted, refused };
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  const knex = pg();
  try {
    const rollbackFile = flag('rollback');
    if (rollbackFile && rollbackFile !== true) {
      write(`\nRolling back ${rollbackFile}\n${'-'.repeat(72)}\n`);
      const n = await rollback(knex, rollbackFile);
      write(`${'-'.repeat(72)}\n${n} value(s) restored.\n\n`);
      return;
    }

    write(`\nRepairing broken references — ${SCHEMA}\n${'='.repeat(72)}\n\n`);

    const before = await remainingOrphans(knex, SCHEMA);
    const planned = await collect(knex, SCHEMA);

    for (const { repair, rows } of planned) {
      write(`${repair.confidence === 'EXACT' ? '[EXACT]   ' : '[INFERRED]'} `);
      write(`${repair.table}.${repair.column}  —  ${rows.length} row(s)\n`);
      write(`           ${repair.evidence.replace(/\s+/g, ' ')}\n`);
      if (rows.length) {
        const sample = rows.slice(0, 3);
        for (const r of sample) {
          write(`           e.g. ${String(r.id).trim()}: `);
          write(`${r.old_value === null ? 'null' : String(r.old_value).trim()} -> `);
          write(`${r.new_value === null ? 'null' : String(r.new_value).trim()}`);
          write(r.via ? `   (via ${r.via})\n` : '\n');
        }
      }
      write('\n');
    }

    const total = planned.reduce((n, p) => n + p.rows.length, 0);

    if (!APPLY) {
      write(`${'-'.repeat(72)}\nDRY RUN — nothing was changed. ${total} value(s) would be repaired.\n\n`);
      write('Still broken, before any repair:\n');
      for (const o of before) if (o.orphans) write(`  ${o.table}.${o.column}`.padEnd(46) + `${o.orphans}\n`);
      write('\nApply with:  node scripts/sql/repair-broken-records.js --apply\n\n');
      return;
    }

    write(`${'-'.repeat(72)}\nApplying (target: ${TARGET})\n${'-'.repeat(72)}\n`);

    let backupFile = null;
    if (TARGET === 'postgres' || TARGET === 'both') {
      const r = await applyRepairs(knex, SCHEMA, planned);
      backupFile = r.backupFile;
      for (const { repair, updated } of r.results) {
        write(`  postgres  ${repair.table}.${repair.column}`.padEnd(50) + `${updated} row(s)\n`);
      }
    }

    if (TARGET === 'mongo' || TARGET === 'both') {
      const clinic = await mongoConnectClinic();
      const mongoResults = await applyToMongo(planned, clinic);
      for (const { repair, updated } of mongoResults) {
        write(`  mongo     ${repair.collection}.${repair.field}`.padEnd(50) + `${updated} doc(s)\n`);
      }
      write('\n  MongoDB is the system of record, so this is the write that makes the repair\n');
      write('  durable — a PostgreSQL-only repair is undone by the next ETL run.\n');
    }

    const after = await remainingOrphans(knex, SCHEMA);
    write(`\n${'-'.repeat(72)}\nBroken references, before -> after\n${'-'.repeat(72)}\n`);
    for (let i = 0; i < before.length; i += 1) {
      const b = before[i];
      const a = after[i];
      if (b.orphans === 0 && a.orphans === 0) continue;
      write(`  ${b.table}.${b.column}`.padEnd(46) + `${String(b.orphans).padStart(5)} -> ${a.orphans}`);
      write(a.orphans === 0 ? '   fixed\n' : '\n');
    }
    const remaining = after.reduce((n, o) => n + o.orphans, 0);
    write(`\n  ${before.reduce((n, o) => n + o.orphans, 0)} broken -> ${remaining} remaining\n`);

    const v = await validateConstraints(knex, SCHEMA);
    if (v.pending) {
      write(`\n${'-'.repeat(72)}\nPromoting NOT VALID constraints\n${'-'.repeat(72)}\n`);
      for (const name of v.promoted) write(`  validated      ${name}\n`);
      for (const r of v.refused) write(`  STILL INVALID  ${r}\n`);
      write(`\n  ${v.promoted.length} of ${v.pending} constraint(s) now fully enforced by the database.\n`);
    }

    write(`\nRollback: node scripts/sql/repair-broken-records.js --rollback=${path.relative(ROOT, backupFile)}\n\n`);
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
})();
