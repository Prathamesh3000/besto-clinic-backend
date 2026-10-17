#!/usr/bin/env node
'use strict';

/**
 * The checkpoint board — runs every gate in SQL_MIGRATION_PLAN.md §4.1 in order
 * and prints one status line each.
 *
 * The plan's rule is that "a checkpoint is binary, is one command, and stops the
 * work when it is red". This is the command that shows all of them at once, so
 * the state of the migration is one invocation rather than seven.
 *
 * Gates are expected to be red before the work they guard has been done. That is
 * the design, not a defect: a gate written after the fact tests whatever the
 * implementation happened to do. Every gate here exists from day one and turns
 * green when its phase lands.
 *
 * Run:
 *   node scripts/sql/gates.js            # run all, report, exit 1 if any red
 *   node scripts/sql/gates.js --only=5   # run one
 *   node scripts/sql/gates.js --list     # show the board without running
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

/**
 * `blockedBy` names the artifact a gate needs before it can do real work. It is
 * documentation, not logic — every gate still runs and reports for itself.
 */
const GATES = [
  {
    id: 'CP-0', name: 'Environment',
    verifies: 'Postgres reachable and not production; Mongo suite still green',
    cmd: ['node', 'scripts/sql/check-env.js'],
  },
  {
    id: 'CP-1', name: 'Data profile',
    verifies: 'All 74 collections profiled — presence, types, orphaned refs',
    cmd: ['node', 'scripts/sql/profile-mongo.js', '--verify'],
    // 75 collections read from a remote Atlas cluster. It finishes inside the
    // 120s default on its own and does not when the board runs it after other
    // gates have been hammering the same cluster — and a gate that goes red
    // from impatience teaches people to stop reading the board.
    timeoutMs: 420_000,
  },
  {
    id: 'CP-2', name: 'DDL',
    verifies: 'Migrations up/down/up cleanly; every manifest object present; per-tenant roles',
    cmd: ['node', 'scripts/sql/verify-ddl.js'],
    // Runs the full up -> down -> up cycle in a child process, then compares every
    // table, index, column and constraint against the manifest. The manifest
    // rebuild inside it reads every model against the live cluster, so this is
    // the other gate that suffers when the board queues them back to back.
    timeoutMs: 720_000,
  },
  {
    id: 'CP-3', name: 'Isolation',
    verifies: "Tenant A's role cannot read tenant B — permission denied, not empty",
    cmd: ['node', 'scripts/sql/verify-isolation.js'],
    critical: true,
  },
  {
    id: 'CP-4', name: 'ETL correctness',
    verifies: 'Row-count parity, FK integrity, spot values, idempotency',
    cmd: ['node', 'scripts/sql/verify-etl.js'],
    // Re-runs the entire load to prove idempotency, so it costs a full ETL pass.
    timeoutMs: 900_000,
  },
  {
    id: 'CP-5', name: 'Timezone',
    verifies: 'Wall-clock display identical before and after migration',
    cmd: ['node', 'scripts/sql/verify-timezone.js'],
    critical: true,
  },
  {
    id: 'CP-6', name: 'Pilot parity',
    verifies: 'Same API request via Mongo and SQL returns equivalent responses',
    cmd: ['node', 'scripts/sql/verify-parity.js'],
    // Drives both backends from one process: a remote Mongo cluster and a local
    // PostgreSQL, so the network dominates the wall clock.
    timeoutMs: 300_000,
  },
  {
    id: 'CP-7', name: 'No regression',
    verifies: 'The live Mongo application still boots and passes its suite',
    cmd: ['node', 'scripts/sql/verify-no-regression.js'],
    timeoutMs: 600_000, // runs the whole Jest suite
  },

  /**
   * CP-8 and CP-9 are not in the plan's original list. They were added because
   * two things the plan treats as single line items turned out to carry most of
   * the defect risk, and neither was covered by a gate.
   *
   * CP-8 is the aggregation port — the plan's own "highest defect risk". It
   * needs `--fixtures` because several pipelines have nothing to compare
   * against in a clinic with no invoices or completed scans, and a parity
   * harness that skips those leaves the SQL unproven.
   *
   * CP-9 is the filter translation every ported module goes through. Its
   * failure mode is the quiet one: a filter that selects slightly different
   * rows returns a plausible answer.
   */
  {
    id: 'CP-8', name: 'Aggregation parity',
    verifies: 'Ported pipelines return identical rows from either database',
    cmd: ['node', 'scripts/sql/verify-aggregations.js', '--fixtures'],
    timeoutMs: 300_000, // seeds fixtures, runs the ETL, compares, tears down
  },
  {
    id: 'CP-9', name: 'Filter parity',
    verifies: 'The same Mongo filter selects the same rows from either database',
    cmd: ['node', 'scripts/sql/verify-filters.js'],
    timeoutMs: 300_000,
  },
  {
    id: 'CP-10', name: 'Write parity',
    verifies: 'updateOne, updateMany, insertMany and distinct agree across backends',
    cmd: ['node', 'scripts/sql/verify-writes.js'],
    timeoutMs: 300_000,
  },
];

/**
 * Per-gate timeout. A gate that hangs — an unreachable database, a suite waiting
 * on a connection that will never open — must go red rather than stall the
 * board. "Still running after 5 minutes" is a failure with extra steps.
 *
 * Gates that legitimately take longer set their own `timeoutMs`. Getting this
 * wrong is not harmless: at the default, CP-2 and CP-4 were reported FAILED on
 * this board while both passed when run directly, which is worse than a slow
 * board — a gate that reports red for a reason unrelated to what it tests
 * teaches people to ignore it.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

function run(gate) {
  const [bin, ...args] = gate.cmd;
  const res = spawnSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: gate.timeoutMs || DEFAULT_TIMEOUT_MS,
  });

  if (res.error && res.error.code === 'ETIMEDOUT') {
    return {
      ok: false,
      status: null,
      timedOut: true,
      out: `timed out after ${(gate.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000}s`,
    };
  }

  return {
    ok: res.status === 0,
    status: res.status,
    timedOut: false,
    out: `${res.stdout || ''}${res.stderr || ''}`,
  };
}

/** One-line summary pulled from a gate's own output, so the board echoes the gate. */
function summarise(out) {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const verdict = [...lines].reverse().find((l) => /^(CP-\d|✗|!)/.test(l) || /PASSED|FAILED/.test(l));
  return (verdict || lines[lines.length - 1] || '(no output)').slice(0, 96);
}

function list() {
  process.stdout.write('\nMigration checkpoint board — SQL_MIGRATION_PLAN.md §4.1\n');
  process.stdout.write('─'.repeat(78) + '\n');
  for (const g of GATES) {
    process.stdout.write(`${g.id}  ${g.name.padEnd(16)} ${g.verifies}\n`);
    process.stdout.write(`      ${g.cmd.join(' ')}\n`);
    if (g.blockedBy) process.stdout.write(`      blocked by: ${g.blockedBy}\n`);
    process.stdout.write('\n');
  }
}

(function main() {
  if (flag('list')) { list(); process.exit(0); }

  const only = flag('only');
  const selected = only
    ? GATES.filter((g) => g.id === `CP-${only}` || g.id === only)
    : GATES;

  if (selected.length === 0) {
    process.stderr.write(`\nNo gate matches --only=${only}. Known: ${GATES.map((g) => g.id).join(', ')}\n\n`);
    process.exit(1);
  }

  process.stdout.write('\nMigration checkpoint board\n');
  process.stdout.write('─'.repeat(78) + '\n');

  const results = [];
  for (const gate of selected) {
    const r = run(gate);
    results.push({ gate, ...r });
    const mark = r.ok ? 'PASS' : 'FAIL';
    process.stdout.write(`${mark.padEnd(5)} ${gate.id}  ${gate.name.padEnd(16)} ${summarise(r.out)}\n`);
  }

  const red = results.filter((r) => !r.ok);
  process.stdout.write('─'.repeat(78) + '\n');
  process.stdout.write(`${results.length - red.length} of ${results.length} green\n`);

  if (red.length > 0) {
    const timedOut = red.filter((r) => r.timedOut);
    const blocked = red.filter((r) => !r.timedOut && r.gate.blockedBy);
    const broken = red.filter((r) => !r.timedOut && !r.gate.blockedBy);

    if (timedOut.length > 0) {
      process.stdout.write('\nRed because they ran out of time, which says nothing about what they test:\n');
      for (const r of timedOut) {
        process.stdout.write(`  ${r.gate.id} — ${r.out}. Run it directly: ${r.gate.cmd.join(' ')}\n`);
      }
    }

    if (blocked.length > 0) {
      process.stdout.write('\nRed because the work they guard has not been done yet (expected):\n');
      for (const r of blocked) process.stdout.write(`  ${r.gate.id} — awaiting ${r.gate.blockedBy}\n`);
    }
    if (broken.length > 0) {
      process.stdout.write('\nRed and NOT explained by missing artifacts — these need attention:\n');
      for (const r of broken) {
        process.stdout.write(`  ${r.gate.id} ${r.gate.name}${r.gate.critical ? '  [critical gate]' : ''}\n`);
        process.stdout.write(`     re-run: ${r.gate.cmd.join(' ')}\n`);
      }
    }
    process.stdout.write('\n');
    process.exit(1);
  }

  process.stdout.write('\nAll gates green.\n\n');
  process.exit(0);
})();
