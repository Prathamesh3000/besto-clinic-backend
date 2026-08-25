#!/usr/bin/env node
'use strict';

/**
 * CP-4 — ETL correctness.
 *
 * Row-count parity per collection, foreign-key integrity, spot-value comparison,
 * and idempotency.
 *
 * Idempotency is the assertion most often skipped and most often needed. An ETL
 * that cannot be re-run without duplicating data cannot be resumed after failing
 * halfway through 19 clinics — which is precisely when you need to resume it.
 *
 * Orphan handling is a report, never a silent drop. Mongo never enforced the 213
 * `ref:` declarations, so violations almost certainly exist in the live data.
 * Each class needs a human decision before load; an ETL that quietly discards
 * them converts a data-quality question into permanent data loss.
 *
 * Note this gate cannot detect the failure CP-5 exists for. Appointment times
 * shifted by 5½ hours preserve row counts, referential integrity and spot-value
 * *presence* perfectly. CP-4 green and CP-5 red is a coherent state, and the
 * reason both exist.
 *
 * STATUS: blocked. No ETL script exists yet.
 *
 * Run:  node scripts/sql/verify-etl.js
 */

const ASSERTIONS = [
  'per-collection row counts in PostgreSQL equal the MongoDB source exactly',
  'zero unreported foreign-key orphans — every violation appears in the orphan report',
  'spot-value comparison across a sample of rows per collection, field by field',
  'running the ETL a second time changes no row count and no value',
  'the source was a restored snapshot, not the live primary (plan §5)',
];

const BLOCKED_BY = 'the ETL script';
const DELIVERABLE = 'Phase 0, deliverable 5 — verified data migration for platform + one clinic';

process.stdout.write('\nCP-4 — ETL correctness\n');
process.stdout.write('─'.repeat(64) + '\n');
process.stdout.write(`\n  Not yet runnable — ${BLOCKED_BY} does not exist.\n\n`);
process.stdout.write(`  Source: ${DELIVERABLE}\n\n`);
process.stdout.write('  This gate will assert:\n');
for (const a of ASSERTIONS) process.stdout.write(`    - ${a}\n`);
process.stdout.write('\n  Add the ETL under sql/etl/, then this gate wires up with no further changes.\n');
process.stdout.write('\n' + '─'.repeat(64) + '\n');
process.stdout.write('CP-4 FAILED — blocked, not broken.\n\n');
process.exit(1);
