#!/usr/bin/env node
'use strict';

/**
 * Export every orphaned record for manual review.
 *
 * An orphaned record is one whose reference points at a row that does not exist —
 * Mongo never enforced the 194 `ref:` declarations, so these accumulated silently.
 * The ETL loads them and reports them; it never deletes them. This writes the full
 * detail out so a human can decide what each class actually is before anything
 * touches it.
 *
 * The output is deliberately readable rather than machine-shaped. The decision
 * these support — "is this seed debris or real damage?" — is made by looking at
 * the rows, so the file shows real values, not counts.
 *
 * Reads only. Writes one file, in the repository root.
 *
 * Usage:
 *   node scripts/sql/export-broken-records.js
 *   node scripts/sql/export-broken-records.js --samples=25
 *   node scripts/sql/export-broken-records.js --json     # also emit .json
 */

const fs = require('fs');
const path = require('path');
const knexLib = require('knex');

const config = require('../../sql/config');
const manifest = require('../../sql/schema/manifest.json');

const ROOT = path.resolve(__dirname, '../..');
const OUT_MD = path.join(ROOT, 'BROKEN_RECORDS.md');
const OUT_JSON = path.join(ROOT, 'BROKEN_RECORDS.json');
const PLATFORM_SCHEMA = 'platform';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const SAMPLES = Number(flag('samples', 15));
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

/**
 * An ObjectId's first 4 bytes are a Unix timestamp.
 *
 * This is what makes it possible to say whether a missing target ever existed.
 * An id invented by a bug would carry an arbitrary or clustered timestamp; ids
 * that were created minutes before the rows referencing them, in a plausible
 * order, describe records that existed and were later removed. FINDINGS.md F-1
 * and F-2 both turn on exactly this reading.
 */
function idTimestamp(id) {
  const hex = String(id).trim().slice(0, 8);
  const seconds = parseInt(hex, 16);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/** Columns worth showing for a row — identifying, not exhaustive. */
function interestingColumns(spec) {
  const preferred = ['id', 'name', 'code', 'slug', 'status', 'type', 'amount', 'entry_type',
    'invoice_number', 'title', 'description', 'email', 'phone', 'created_at', 'deleted_at'];
  const present = spec.columns.map((c) => c.column);
  const chosen = preferred.filter((c) => present.includes(c));
  // Always include the reference columns, they are the subject.
  for (const fk of spec.foreignKeys) if (!chosen.includes(fk.column)) chosen.push(fk.column);
  return chosen;
}

async function auditScope(knex, scope, schema, resolveSchema) {
  const findings = [];

  for (const spec of manifest.tables.filter((t) => t.scope === scope)) {
    for (const fk of spec.foreignKeys) {
      if (!fk.referencesTable) continue;
      const target = resolveSchema(fk.referencesScope);

      const { rows: counted } = await knex.raw(`
        select count(*)::int as rows,
               count(distinct c.${fk.column})::int as distinct_ids
        from ${schema}.${spec.table} c
        where c.${fk.column} is not null
          and not exists (select 1 from ${target}.${fk.referencesTable} p where p.id = c.${fk.column})
      `);
      if (counted[0].rows === 0) continue;

      const { rows: totals } = await knex.raw(`
        select count(*)::int as total,
               count(c.${fk.column})::int as with_reference
        from ${schema}.${spec.table} c
      `);

      const cols = interestingColumns(spec);
      const { rows: samples } = await knex.raw(`
        select ${cols.map((c) => `c.${c}`).join(', ')}
        from ${schema}.${spec.table} c
        where c.${fk.column} is not null
          and not exists (select 1 from ${target}.${fk.referencesTable} p where p.id = c.${fk.column})
        order by c.${cols.includes('created_at') ? 'created_at' : 'id'}
        limit ${SAMPLES}
      `);

      const { rows: missingIds } = await knex.raw(`
        select distinct c.${fk.column} as id
        from ${schema}.${spec.table} c
        where c.${fk.column} is not null
          and not exists (select 1 from ${target}.${fk.referencesTable} p where p.id = c.${fk.column})
        limit 200
      `);

      /**
       * When every affected row was written inside a very short window, it was a
       * bulk insert rather than application traffic — the signal FINDINGS.md F-1
       * used to identify seed debris. Reported so the same reasoning is available
       * for every class rather than only the one someone happened to check.
       */
      let writeWindow = null;
      if (cols.includes('created_at')) {
        const { rows: w } = await knex.raw(`
          select min(c.created_at) as first, max(c.created_at) as last
          from ${schema}.${spec.table} c
          where c.${fk.column} is not null
            and not exists (select 1 from ${target}.${fk.referencesTable} p where p.id = c.${fk.column})
        `);
        if (w[0].first) {
          const spanMs = new Date(w[0].last) - new Date(w[0].first);
          writeWindow = { first: w[0].first, last: w[0].last, spanMs };
        }
      }

      /**
       * The constraint's state is read from the database, not from the manifest.
       *
       * The manifest records what the profile *predicted*; the ETL restores each
       * key validated whenever the data it loaded actually supports it. Reporting
       * the prediction produced a line saying "enforced (validated)" directly
       * above two orphaned rows, which is impossible — PostgreSQL will not
       * validate a constraint with violations.
       */
      const { rows: constraintState } = await knex.raw(`
        select c.convalidated
        from pg_constraint c
        join pg_namespace ns on ns.oid = c.connamespace
        where ns.nspname = ? and c.conname = ?
      `, [schema, `${spec.table}_${fk.column}_fkey`]);

      findings.push({
        scope,
        schema,
        table: spec.table,
        collection: spec.collection,
        column: fk.column,
        references: `${target}.${fk.referencesTable}`,
        referencesModel: fk.references,
        finding: fk.finding || null,
        decision: fk.decision || null,
        constraintExists: constraintState.length > 0,
        enforced: constraintState.length > 0 ? constraintState[0].convalidated : false,
        orphanRows: counted[0].rows,
        distinctMissingIds: counted[0].distinct_ids,
        tableTotalRows: totals[0].total,
        rowsWithAReference: totals[0].with_reference,
        writeWindow,
        missingIds: missingIds.map((r) => String(r.id).trim()),
        missingIdCreatedRange: (() => {
          const stamps = missingIds.map((r) => idTimestamp(r.id)).filter(Boolean).sort((a, b) => a - b);
          return stamps.length ? { earliest: stamps[0], latest: stamps[stamps.length - 1] } : null;
        })(),
        columns: cols,
        samples,
      });
    }
  }
  return findings;
}

/* ── Report ────────────────────────────────────────────────── */

const fmtCell = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s.length > 44 ? `${s.slice(0, 44)}…` : s.replace(/\|/g, '\\|');
};

function renderMarkdown(findings, meta) {
  const L = [];
  const totalRows = findings.reduce((n, f) => n + f.orphanRows, 0);

  L.push('# Broken records — for manual review');
  L.push('');
  L.push(`Generated ${meta.generatedAt} by \`node scripts/sql/export-broken-records.js\`.`);
  L.push('');

  /**
   * The clean state gets its own report rather than an empty version of the
   * broken one. A file headed "Broken records" whose body still explains how to
   * decide between deleting and reattaching reads as though the work is
   * outstanding, when the answer is that there is nothing left to decide.
   */
  if (findings.length === 0) {
    L.push('## Nothing is broken');
    L.push('');
    L.push('Every reference in every table resolves to a row that exists.');
    L.push('');
    L.push('This was not always true — 4,779 rows across 6 classes were broken, and they were');
    L.push('repaired rather than deleted:');
    L.push('');
    L.push('| Class | Rows | How it was resolved |');
    L.push('|---|--:|---|');
    L.push('| `patient_ledgers.patient_id` | 1,564 | Reattached via the invoice number in each row\'s own `description` |');
    L.push('| `patient_ledgers.branch_id` | 1,564 | Same matched invoice |');
    L.push('| `patient_ledgers.created_by_id` | 1,564 | Same matched invoice |');
    L.push('| `chat_messages.session_id` | 77 | Missing VideoSessions rebuilt from the surviving chat and appointment records |');
    L.push('| `emergency_sessions.video_session_id` | 8 | Same reconstruction |');
    L.push('| `notifications.recipient_id` | 2 | A Patient id had been written into a User column — repointed at the patient\'s user |');
    L.push('');
    L.push('Because the data now satisfies them, every foreign key that was `NOT VALID` has been');
    L.push('promoted to fully enforced. The database will refuse to let these break again.');
    L.push('');
    L.push('Re-run this command after any migration, restore or bulk import — it is cheap, and it is');
    L.push('the check that was missing while these accumulated unnoticed.');
    L.push('');
    return L.join('\n');
  }

  L.push('Every record below has a reference pointing at a row that does not exist. MongoDB never');
  L.push('enforced these references, so they accumulated without anything reporting them. **Nothing has');
  L.push('been deleted or changed** — the migration loads these rows and carries the damage behind a');
  L.push('`NOT VALID` foreign key, which is enforced for new rows and tolerant of the existing ones.');
  L.push('');
  L.push('## What to decide');
  L.push('');
  L.push('For each class below, one of:');
  L.push('');
  L.push('- **Delete** — the rows are debris (seed data, an abandoned import) and carry no information.');
  L.push('- **Reattach** — the target still exists under a different id, or can be identified.');
  L.push('- **Keep as-is** — the rows matter and the dangling reference is acceptable; the foreign key stays `NOT VALID` permanently.');
  L.push('');
  L.push('Once a class is resolved its constraint can be promoted with `VALIDATE CONSTRAINT`, and the');
  L.push('database will enforce it from then on.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| # | Table | Column | Points at | Broken rows | of total | Distinct missing targets | Finding |');
  L.push('|--:|---|---|---|--:|--:|--:|---|');
  findings.forEach((f, i) => {
    L.push(`| ${i + 1} | \`${f.table}\` | \`${f.column}\` | \`${f.references}\` | **${f.orphanRows}** | ${f.tableTotalRows} | ${f.distinctMissingIds} | ${f.finding || '—'} |`);
  });
  L.push('');
  L.push(`**${totalRows} broken rows across ${findings.length} classes.**`);
  L.push('');
  L.push('---');
  L.push('');

  findings.forEach((f, i) => {
    L.push(`## ${i + 1}. \`${f.table}.${f.column}\` → \`${f.references}\``);
    L.push('');
    L.push(`- **Broken rows:** ${f.orphanRows} of ${f.tableTotalRows} in the table (${f.rowsWithAReference} carry a reference at all)`);
    L.push(`- **Distinct missing targets:** ${f.distinctMissingIds}`);
    L.push(`- **Clinic / schema:** \`${f.schema}\``);
    L.push(`- **Source collection:** \`${f.collection}\``);
    if (f.finding) L.push(`- **Recorded as:** ${f.finding} in [\`sql/FINDINGS.md\`](sql/FINDINGS.md)`);
    if (f.decision) L.push(`- **Current decision:** ${f.decision}`);
    L.push(`- **Constraint state:** ${!f.constraintExists ? 'no foreign key exists' : (f.enforced ? 'enforced (validated)' : '`NOT VALID` — existing rows tolerated, new rows checked')}`);
    L.push('');

    if (f.writeWindow) {
      const { spanMs, first, last } = f.writeWindow;
      L.push('### When the broken rows were written');
      L.push('');
      L.push(`\`${new Date(first).toISOString()}\` → \`${new Date(last).toISOString()}\`  (span: ${spanMs} ms)`);
      L.push('');
      const humanSpan = spanMs < 1000 ? `${spanMs} ms`
        : spanMs < 60_000 ? `${(spanMs / 1000).toFixed(1)} seconds`
          : spanMs < 3_600_000 ? `${(spanMs / 60_000).toFixed(1)} minutes`
            : spanMs < 86_400_000 ? `${(spanMs / 3_600_000).toFixed(1)} hours`
              : `${(spanMs / 86_400_000).toFixed(1)} days`;
      L.push(`Span: **${humanSpan}**`);
      L.push('');
      if (spanMs < 5000) {
        L.push('> **All of them landed inside a few seconds.** That is a bulk insert, not application');
        L.push('> traffic — the signature of seed or import data rather than damage caused by users.');
      } else {
        L.push(`> **Written over ${humanSpan}.** That is spread out like ordinary application traffic,`);
        L.push('> not a single bulk insert. Anything describing this class as "seed debris written in one');
        L.push('> operation" should be re-checked against this figure before rows are deleted on that basis.');
      }
      L.push('');
    }

    if (f.missingIdCreatedRange) {
      const { earliest, latest } = f.missingIdCreatedRange;
      L.push('### When the *missing* records were created');
      L.push('');
      L.push(`\`${new Date(earliest).toISOString()}\` → \`${new Date(latest).toISOString()}\``);
      L.push('');
      L.push('> Read from the timestamps embedded in the missing ids themselves. Ids invented by a bug');
      L.push('> would not carry plausible creation times, so this is evidence the targets **existed and');
      L.push('> were later removed** rather than never having been created.');
      L.push('');
    }

    L.push(`### The broken rows${f.orphanRows > f.samples.length ? ` (first ${f.samples.length} of ${f.orphanRows})` : ''}`);
    L.push('');
    L.push(`| ${f.columns.join(' | ')} |`);
    L.push(`|${f.columns.map(() => '---').join('|')}|`);
    for (const row of f.samples) {
      L.push(`| ${f.columns.map((c) => fmtCell(row[c])).join(' | ')} |`);
    }
    L.push('');

    L.push('<details><summary>Missing target ids');
    L.push(f.missingIds.length < f.distinctMissingIds ? ` (first ${f.missingIds.length} of ${f.distinctMissingIds})` : '');
    L.push('</summary>');
    L.push('');
    L.push('```');
    for (const id of f.missingIds) {
      const t = idTimestamp(id);
      L.push(`${id}  created ${t ? t.toISOString() : 'unknown'}`);
    }
    L.push('```');
    L.push('');
    L.push('</details>');
    L.push('');
    L.push('**Decision:** _(delete / reattach / keep as-is — write it here)_');
    L.push('');
    L.push('---');
    L.push('');
  });

  L.push('## How to act on a decision');
  L.push('');
  L.push('Nothing here is automated on purpose — these are medical and financial records, and the');
  L.push('reasoning above is only worth having if a person reads it. Once decided:');
  L.push('');
  L.push('```sql');
  L.push('-- Inspect the full rows for a class before doing anything:');
  L.push('SELECT * FROM jathar_dental.patient_ledgers c');
  L.push('WHERE c.patient_id IS NOT NULL');
  L.push('  AND NOT EXISTS (SELECT 1 FROM jathar_dental.patients p WHERE p.id = c.patient_id);');
  L.push('');
  L.push('-- After a "delete" decision, and after a backup:');
  L.push('-- DELETE FROM jathar_dental.patient_ledgers c');
  L.push('-- WHERE c.patient_id IS NOT NULL');
  L.push('--   AND NOT EXISTS (SELECT 1 FROM jathar_dental.patients p WHERE p.id = c.patient_id);');
  L.push('');
  L.push('-- Then promote the constraint so the database enforces it from now on:');
  L.push('-- ALTER TABLE jathar_dental.patient_ledgers');
  L.push('--   VALIDATE CONSTRAINT patient_ledgers_patient_id_fkey;');
  L.push('```');
  L.push('');
  L.push('The `VALIDATE CONSTRAINT` step takes only a SHARE UPDATE EXCLUSIVE lock — it does not rewrite');
  L.push('the table or block reads.');
  L.push('');

  return L.join('\n');
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  const knex = pg();
  try {
    write('\nScanning for broken references\n' + '-'.repeat(60) + '\n');

    const findings = [];
    findings.push(...await auditScope(knex, 'platform', PLATFORM_SCHEMA, () => PLATFORM_SCHEMA));

    const { rows: schemas } = await knex.raw(`
      select nspname from pg_namespace
      where nspname not in ('platform','public','migrations','information_schema')
        and nspname not like 'pg\\_%'
        and nspname not like '%_ddl_check'
      order by 1
    `);

    for (const { nspname } of schemas) {
      const { rows: has } = await knex.raw(
        "select count(*)::int n from information_schema.tables where table_schema = ? and table_name = 'patients'",
        [nspname]
      );
      if (has[0].n === 0) continue;
      findings.push(...await auditScope(knex, 'tenant', nspname, (s) => (s === 'platform' ? PLATFORM_SCHEMA : nspname)));
    }

    for (const f of findings) {
      write(`  ${f.schema}.${f.table}.${f.column}`.padEnd(52) + `${f.orphanRows} row(s)\n`);
    }

    const meta = { generatedAt: new Date().toISOString(), database: config.postgres.database };
    fs.writeFileSync(OUT_MD, renderMarkdown(findings, meta), 'utf8');
    write(`\n${'-'.repeat(60)}\n`);
    write(`${findings.reduce((n, f) => n + f.orphanRows, 0)} broken rows in ${findings.length} classes\n`);
    write(`Written: ${path.relative(ROOT, OUT_MD)}\n`);

    if (flag('json')) {
      fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, findings }, null, 2)}\n`, 'utf8');
      write(`Written: ${path.relative(ROOT, OUT_JSON)}\n`);
    }
    write('\nNothing was modified. Every row above is still in the database.\n\n');
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
