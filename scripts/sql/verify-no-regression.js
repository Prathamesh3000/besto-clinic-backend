#!/usr/bin/env node
'use strict';

/**
 * CP-7 — No regression.
 *
 * "Phase 0 must not degrade the running product." The migration work happens in
 * the same tree as a live application serving clinics; this gate is what makes
 * that claim checkable rather than assumed.
 *
 * Two assertions:
 *   1. The existing Jest suite is still green.
 *   2. The Express application still assembles — every route file loads, every
 *      middleware resolves, every model registers.
 *
 * The second matters more than it looks. Most ways of breaking this app during a
 * data-layer migration are require-time failures: a model moved, a service
 * renamed, a circular import introduced. None of those show up in a unit suite
 * that never builds the app.
 *
 * Run:  node scripts/sql/verify-no-regression.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const results = [];
let failed = false;

function record(name, ok, detail, fix) {
  results.push({ name, ok, detail, fix });
  if (!ok) failed = true;
}

// ── 1. Jest suite ──────────────────────────────────────────────
function checkTests() {
  const res = spawnSync('npx', ['jest', '--silent', '--passWithNoTests'], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    timeout: 10 * 60 * 1000,
  });

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const summary = /Tests:\s+(.+)/.exec(out);
  const detail = summary ? summary[1].trim() : (res.status === 0 ? 'passed' : 'see output below');

  if (res.status === 0) {
    record('Jest suite', true, detail);
  } else {
    record('Jest suite', false, detail,
      'Run `npx jest` for the full output. A test that was green before the migration\n'
      + '    work began and is red now is a regression, regardless of which file changed.');
  }
  return out;
}

// ── 2. The app still assembles ─────────────────────────────────
function checkAppBoots() {
  // A child process, because createApp() pulls in the whole route tree and we
  // do not want its module registrations polluting this one.
  const probe = `
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    // Mirror server.js's boot order: it requires src/config/env before src/app,
    // and that is what loads .env.
    //
    // Without this line the probe requires the app with no environment at all and
    // fails on the first mandatory variable — reporting "the running product has
    // been degraded" when the product is fine and only the probe was wrong. A
    // false red on a gate is worse than no gate: it trains people to skip it.
    require('./src/config/env');
    try {
      const createApp = require('./src/app');
      const app = createApp();
      if (typeof app !== 'function') throw new Error('createApp() did not return an Express app');
      // Count mounted layers as evidence the route tree actually attached.
      const layers = (app._router && app._router.stack) ? app._router.stack.length : 0;
      if (layers === 0) throw new Error('app has no middleware or routes mounted');
      process.stdout.write('OK ' + layers);
    } catch (err) {
      process.stderr.write(err.message);
      process.exit(1);
    }
  `;

  const res = spawnSync(process.execPath, ['-e', probe], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  });

  if (res.status === 0) {
    const layers = /OK (\d+)/.exec(res.stdout || '');
    record('App assembles', true, layers ? `${layers[1]} middleware/route layers mounted` : 'ok');
  } else {
    record('App assembles', false, (res.stderr || 'failed').split('\n')[0],
      'src/app.js no longer builds. This is the failure mode a unit suite misses:\n'
      + '    the app is broken at require time but no test constructs it.');
  }
}

// ── Report ─────────────────────────────────────────────────────
(function main() {
  process.stdout.write('\nCP-7 — No regression\n');
  process.stdout.write('─'.repeat(64) + '\n');

  const testOutput = checkTests();
  checkAppBoots();

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    process.stdout.write(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}\n`);
  }

  const fixes = results.filter((r) => !r.ok && r.fix);
  if (fixes.length > 0) {
    process.stdout.write('\nTo fix:\n');
    for (const r of fixes) process.stdout.write(`\n  ${r.name}\n    ${r.fix}\n`);
  }

  if (failed && testOutput && /FAIL/.test(testOutput)) {
    const failing = testOutput.split(/\r?\n/).filter((l) => /^\s*FAIL/.test(l)).slice(0, 10);
    if (failing.length > 0) {
      process.stdout.write('\nFailing suites:\n');
      for (const l of failing) process.stdout.write(`  ${l.trim()}\n`);
    }
  }

  process.stdout.write('\n' + '─'.repeat(64) + '\n');
  process.stdout.write(failed
    ? 'CP-7 FAILED — the running product has been degraded.\n\n'
    : 'CP-7 PASSED — the Mongo application is unaffected.\n\n');
  process.exit(failed ? 1 : 0);
})();
