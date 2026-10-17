'use strict';

/**
 * Promote deferred foreign keys — Phase 1.
 *
 * The ETL creates reference constraints as NOT VALID and says so on every run:
 * "Each class needs a decision before its foreign key can be promoted." That is
 * deliberate. A dangling reference is a data question, not a loading failure,
 * and dropping the row or nulling the column to force the load through would
 * destroy the evidence of what was wrong.
 *
 * So the rows are loaded, the constraint is left unenforced, and a human decides.
 * This script is the other half of that: once the source data is repaired, it
 * promotes every constraint whose rows now satisfy it.
 *
 * It reports what it cannot promote rather than forcing it. A constraint that
 * still has orphans is a decision nobody has made yet, and skipping the report
 * would hide it.
 *
 * Usage:
 *   node scripts/sql/validate-constraints.js --dry-run   # report only
 *   node scripts/sql/validate-constraints.js             # promote what is clean
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const knex = require('knex')(require('../../knexfile').platform);

const DRY_RUN = process.argv.includes('--dry-run');

/** Constraints PostgreSQL is not yet enforcing, with the columns they join on. */
async function deferredConstraints() {
  const { rows } = await knex.raw(`
    select n.nspname                       as schema,
           c.conname                       as name,
           c.conrelid::regclass::text      as child,
           c.confrelid::regclass::text     as parent,
           (select attname from pg_attribute
             where attrelid = c.conrelid and attnum = c.conkey[1])  as child_col,
           (select attname from pg_attribute
             where attrelid = c.confrelid and attnum = c.confkey[1]) as parent_col
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and not c.convalidated
    order by n.nspname, c.conname`);
  return rows;
}

/** Rows whose reference points at nothing. Counted before attempting to promote,
 *  so the report explains a refusal rather than just reporting a failure. */
async function orphanCount(c) {
  const { rows } = await knex.raw(
    `select count(*)::int as n
       from ${c.child} ch
      where ch.${c.child_col} is not null
        and not exists (
          select 1 from ${c.parent} p where p.${c.parent_col} = ch.${c.child_col})`);
  return rows[0].n;
}

async function sampleOrphans(c, limit = 5) {
  const { rows } = await knex.raw(
    `select distinct ch.${c.child_col} as ref
       from ${c.child} ch
      where ch.${c.child_col} is not null
        and not exists (
          select 1 from ${c.parent} p where p.${c.parent_col} = ch.${c.child_col})
      limit ${limit}`);
  return rows.map((r) => r.ref);
}

async function main() {
  const deferred = await deferredConstraints();

  process.stdout.write('\nDeferred foreign keys\n');
  process.stdout.write('─'.repeat(72) + '\n');

  if (deferred.length === 0) {
    process.stdout.write('  None. Every foreign key is already enforced.\n\n');
    return { promoted: 0, blocked: 0 };
  }

  const clean = [];
  const blocked = [];

  for (const c of deferred) {
    const n = await orphanCount(c);
    (n === 0 ? clean : blocked).push({ ...c, orphans: n });
    process.stdout.write(
      `  ${c.name.padEnd(46)} ${String(n).padStart(6)} orphan(s)\n`,
    );
  }

  process.stdout.write('\n');

  let promoted = 0;
  for (const c of clean) {
    if (DRY_RUN) {
      process.stdout.write(`  would promote  ${c.name}\n`);
      continue;
    }
    try {
      await knex.raw(`alter table ${c.child} validate constraint "${c.name}"`);
      process.stdout.write(`  promoted       ${c.name}\n`);
      promoted += 1;
    } catch (err) {
      process.stdout.write(`  FAILED         ${c.name} — ${err.message.split('\n')[0]}\n`);
    }
  }

  if (blocked.length) {
    process.stdout.write('\nNeeds a decision before it can be enforced:\n');
    for (const c of blocked) {
      const refs = await sampleOrphans(c);
      process.stdout.write(`\n  ${c.name}\n`);
      process.stdout.write(`    ${c.child}.${c.child_col} -> ${c.parent}.${c.parent_col}\n`);
      process.stdout.write(`    ${c.orphans} row(s) reference something that does not exist\n`);
      refs.forEach((r) => process.stdout.write(`      ${r}\n`));
    }
    process.stdout.write(
      '\n  Repair these in MongoDB and re-run the ETL. Repointing or clearing the\n'
      + '  reference at source keeps Mongo and PostgreSQL saying the same thing;\n'
      + '  patching PostgreSQL alone would leave the two disagreeing.\n',
    );
  }

  process.stdout.write(
    `\n${DRY_RUN ? clean.length + ' promotable' : promoted + ' promoted'}, `
    + `${blocked.length} blocked\n\n`,
  );
  return { promoted, blocked: blocked.length };
}

main()
  .then(({ blocked }) => knex.destroy().then(() => process.exit(blocked > 0 ? 1 : 0)))
  .catch((err) => {
    process.stderr.write(`\nFAILED: ${err.message}\n\n`);
    return knex.destroy().then(() => process.exit(1));
  });
