#!/usr/bin/env node
'use strict';

/**
 * CP-6 — Pilot parity.
 *
 * The same API request, served through the Mongo path and the SQL path, returns
 * equivalent responses.
 *
 * "Equivalent", not "identical": key order and absent-vs-null differ harmlessly
 * between drivers. The comparison must normalise those and then be strict about
 * everything else — because the differences worth catching are the ones that are
 * *not* harmless: a dropped field, a coerced type, a date that moved, a number
 * that lost precision, an array that came back in a different order because the
 * SQL port forgot an ORDER BY that Mongo's natural order was supplying by luck.
 *
 * This is also the gate that produces the measured throughput figure the plan
 * needs in order to replace its estimated day-rates with observed ones.
 *
 * STATUS: blocked. The repository seam and ported modules do not exist yet.
 *
 * Run:  node scripts/sql/verify-parity.js
 */

const ASSERTIONS = [
  'for each pilot endpoint, Mongo-backed and SQL-backed responses match after normalisation',
  'normalisation covers key order and absent-vs-null only — nothing else is forgiven',
  'differences are reported field by field, not as an unreadable whole-body diff',
  'array ordering is compared strictly — Mongo natural order is not a contract the SQL port inherits',
  'numeric precision is compared exactly, not with a tolerance',
];

const BLOCKED_BY = 'the repository seam and at least one ported module';
const DELIVERABLE = 'Phase 0, deliverables 7-8 — repository seam and two modules ported end to end';

process.stdout.write('\nCP-6 — Pilot parity\n');
process.stdout.write('─'.repeat(64) + '\n');
process.stdout.write(`\n  Not yet runnable — ${BLOCKED_BY} do not exist.\n\n`);
process.stdout.write(`  Source: ${DELIVERABLE}\n\n`);
process.stdout.write('  This gate will assert:\n');
for (const a of ASSERTIONS) process.stdout.write(`    - ${a}\n`);
process.stdout.write('\n  Build the repository seam and port a module, then list its endpoints here.\n');
process.stdout.write('\n' + '─'.repeat(64) + '\n');
process.stdout.write('CP-6 FAILED — blocked, not broken.\n\n');
process.exit(1);
