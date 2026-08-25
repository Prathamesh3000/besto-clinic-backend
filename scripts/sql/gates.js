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
    verifies: 'All 73 collections profiled — presence, types, orphaned refs',
    cmd: ['node', 'scripts/sql/profile-mongo.js', '--verify'],
  },
  {
    id: 'CP-2', name: 'DDL',
    verifies: 'Migrations up/down/up cleanly; 225 indexes; per-tenant roles',
    cmd: ['node', 'scripts/sql/verify-ddl.js'],
    blockedBy: 'Knex migrations (Phase 0, deliverable 4)',
  },
  {
    id: 'CP-3', name: 'Isolation',
    verifies: "Tenant A's role cannot read tenant B — permission denied, not empty",
    cmd: ['node', 'scripts/sql/verify-isolation.js'],
    blockedBy: 'per-tenant schemas and roles (Phase 0, deliverable 4)',
    critical: true,
  },
  {
    id: 'CP-4', name: 'ETL correctness',
    verifies: 'Row-count parity, FK integrity, spot values, idempotency',
    cmd: ['node', 'scripts/sql/verify-etl.js'],
    blockedBy: 'the ETL script (Phase 0, deliverable 5)',
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
    blockedBy: 'the repository seam and two ported modules (Phase 0, deliverables 7-8)',
  },
  {
    id: 'CP-7', name: 'No regression',
    verifies: 'The live Mongo application still boots and passes its suite',
    cmd: ['node', 'scripts/sql/verify-no-regression.js'],
    timeoutMs: 600_000, // runs the whole Jest suite
  },
];

/**
 * Per-gate timeout. A gate that hangs — an unreachable database, a suite waiting
 * on a connection that will never open — must go red rather than stall the
 * board. "Still running after 5 minutes" is a failure with extra steps.
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
    const blocked = red.filter((r) => r.gate.blockedBy);
    const broken = red.filter((r) => !r.gate.blockedBy);

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
