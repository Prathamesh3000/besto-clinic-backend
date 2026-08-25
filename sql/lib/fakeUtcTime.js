'use strict';

/**
 * CommonJS loader for the frontend's fake-UTC display helpers.
 *
 * Why load the frontend file instead of reimplementing it
 * ------------------------------------------------------
 * CP-5 asserts that an appointment's wall-clock display is identical before and
 * after the migration. That assertion is only meaningful if the gate renders
 * times through the *same* function the UI does. A hand-copied version here
 * would drift from website/src/utils/fakeUtcTime.js, and a gate that renders
 * differently from the product proves nothing — it would go green while users
 * saw times 5½ hours out.
 *
 * So this reads that file and evaluates it. There is exactly one implementation
 * of the convention in the repository, and if it changes, the gate changes with
 * it.
 *
 * The frontend file is ESM and contains only pure functions with no imports, so
 * stripping `export ` and evaluating is safe. If someone adds an import to it,
 * this throws loudly rather than silently falling back to a stale copy — which
 * is the correct failure, because at that point the assumption behind this
 * loader no longer holds.
 *
 * The convention itself (from that file's own header):
 *   BestoClinic stores clinic-local IST times with a Z suffix, so
 *   "2025-06-15T10:00:00.000Z" means 10:00 IST, not 10:00 UTC. Display must
 *   read the UTC components verbatim; using local getters adds the viewer's
 *   offset and shows the wrong time.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = path.resolve(__dirname, '../../website/src/utils/fakeUtcTime.js');

/** Names CP-5 needs. Missing any of them is a hard error, not a silent undefined. */
const REQUIRED = ['displayTime', 'displayDate', 'displayDateTime', 'fakeUtcMinutes'];

function load() {
  let source;
  try {
    source = fs.readFileSync(SOURCE, 'utf8');
  } catch (err) {
    throw new Error(
      `Cannot read the canonical time helper at ${SOURCE}: ${err.message}\n`
      + 'CP-5 cannot verify the timezone convention without it.',
    );
  }

  if (/^\s*import\s/m.test(source)) {
    throw new Error(
      `${SOURCE} now contains an import statement.\n`
      + 'This loader evaluates that file as a standalone script, which is only valid while it has\n'
      + 'no dependencies. Either keep it dependency-free, or extract the pure display functions\n'
      + 'into a shared module that both the frontend and this gate can import.',
    );
  }

  // `export function foo` -> `function foo`; `export const` -> `const`.
  const stripped = source.replace(/^\s*export\s+/gm, '');

  const sandbox = { Date, Math, Number, String, isNaN, module: { exports: {} } };
  vm.createContext(sandbox);

  try {
    vm.runInContext(
      `${stripped}\n;module.exports = { ${REQUIRED.join(', ')} };`,
      sandbox,
      { filename: SOURCE, timeout: 5000 },
    );
  } catch (err) {
    throw new Error(
      `Failed to evaluate ${SOURCE}: ${err.message}\n`
      + `CP-5 expects it to define: ${REQUIRED.join(', ')}`,
    );
  }

  const loaded = sandbox.module.exports;
  const missing = REQUIRED.filter((name) => typeof loaded[name] !== 'function');
  if (missing.length > 0) {
    throw new Error(
      `${SOURCE} no longer exports: ${missing.join(', ')}\n`
      + 'CP-5 renders appointment times through these; it cannot run without them.',
    );
  }

  return loaded;
}

/**
 * Self-test with fixtures whose correct output is decided by the convention,
 * not by the implementation. If the helper is ever "fixed" to use local getters,
 * these fail — which is the point: that change would shift every appointment.
 */
function selfTest(helpers) {
  const cases = [
    { iso: '2026-06-12T10:00:00.000Z', time: '10:00 AM', date: '12 Jun 2026', minutes: 600 },
    { iso: '2026-01-01T00:00:00.000Z', time: '12:00 AM', date: '1 Jan 2026', minutes: 0 },
    { iso: '2026-12-31T23:45:00.000Z', time: '11:45 PM', date: '31 Dec 2026', minutes: 1425 },
    { iso: '2026-08-14T09:30:00.000Z', time: '09:30 AM', date: '14 Aug 2026', minutes: 570 },
  ];

  const failures = [];
  for (const c of cases) {
    const time = helpers.displayTime(c.iso);
    const date = helpers.displayDate(c.iso);
    const mins = helpers.fakeUtcMinutes(c.iso);
    if (time !== c.time) failures.push(`displayTime(${c.iso}) = "${time}", expected "${c.time}"`);
    if (date !== c.date) failures.push(`displayDate(${c.iso}) = "${date}", expected "${c.date}"`);
    if (mins !== c.minutes) failures.push(`fakeUtcMinutes(${c.iso}) = ${mins}, expected ${c.minutes}`);
  }
  return failures;
}

module.exports = { load, selfTest, SOURCE };
