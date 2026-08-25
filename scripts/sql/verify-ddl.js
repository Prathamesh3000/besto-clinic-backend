#!/usr/bin/env node
'use strict';

/**
 * CP-2 — DDL.
 *
 * Migrations apply, roll back and re-apply cleanly; every declared index and
 * constraint exists; per-tenant roles and their GRANTs are created.
 *
 * The up → down → up cycle is the part worth insisting on. A migration that only
 * rolls forward cannot be rehearsed, and Phase 7 requires a rehearsed rollback
 * before the first real clinic cutover. Discovering at that point that `down` was
 * never written is the expensive version of this finding.
 *
 * Index count is checked against a manifest rather than eyeballed. The plan
 * counts 225 index declarations across the Mongoose schemas; losing some of them
 * silently is how a migration lands and the product gets slow the same day
 * without anyone connecting the two events.
 *
 * STATUS: blocked. No Knex migrations exist yet.
 *
 * Run:  node scripts/sql/verify-ddl.js
 */

const ASSERTIONS = [
  'knex migrate:latest succeeds against an empty database',
  'knex migrate:rollback returns the schema to empty — proving down is written and works',
  'knex migrate:latest succeeds a second time (re-runnable, no duplicate objects)',
  'index count matches a manifest derived from the 225 Mongoose index declarations',
  'every NOT NULL and unique constraint in the manifest is present',
  'per-tenant roles exist, each holding USAGE on exactly one schema',
];

const BLOCKED_BY = 'Knex migrations';
const DELIVERABLE = 'Phase 0, deliverable 4 — runnable DDL for platform + tenant schema template';

process.stdout.write('\nCP-2 — DDL\n');
process.stdout.write('─'.repeat(64) + '\n');
process.stdout.write(`\n  Not yet runnable — ${BLOCKED_BY} do not exist.\n\n`);
process.stdout.write(`  Source: ${DELIVERABLE}\n\n`);
process.stdout.write('  This gate will assert:\n');
for (const a of ASSERTIONS) process.stdout.write(`    - ${a}\n`);
process.stdout.write('\n  Add knexfile.js and sql/migrations/, then this gate wires up with no further\n');
process.stdout.write('  changes. The index manifest can be generated from the Mongoose schemas.\n');
process.stdout.write('\n' + '─'.repeat(64) + '\n');
process.stdout.write('CP-2 FAILED — blocked, not broken.\n\n');
process.exit(1);
