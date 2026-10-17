'use strict';

/**
 * Inventory the Mongoose hooks — Phase 2, and the risk the plan names explicitly:
 * "Business logic hidden in 83 schema hooks — behaviour that fires automatically
 * today and is invisible at the call site."
 *
 * That invisibility is the whole problem. A service calls `Model.find({})` and
 * gets non-deleted rows because a `pre(/^find/)` hook silently added
 * `deletedAt: null`. Port that service to SQL without knowing, and the query
 * starts returning deleted rows — with no error, no failing test, and nothing in
 * the diff to suggest it.
 *
 * So each hook is classified by what the SQL path has to do about it:
 *
 *   seam        the repository already handles it centrally
 *   port        real logic that must be reimplemented in the repository or service
 *   generated   a value Mongoose supplies that the database can supply instead
 *   review      cannot be classified mechanically; a human must read it
 *
 * Reading the source rather than the runtime is deliberate: a hook registered
 * conditionally still needs porting, and `schema.pre()` calls are not
 * enumerable from a compiled model in a way that tells you what they do.
 *
 * Usage:
 *   node scripts/sql/inventory-hooks.js              # summary
 *   node scripts/sql/inventory-hooks.js --full       # every hook
 *   node scripts/sql/inventory-hooks.js --json       # machine-readable
 */

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.resolve(__dirname, '../../src/models');
const FULL = process.argv.includes('--full');
const AS_JSON = process.argv.includes('--json');

/**
 * Classification rules, most specific first.
 *
 * `body` is the hook's source. Matching on what it does rather than on its name
 * matters: two `pre('save')` hooks can be a generated identifier and a
 * cross-collection write, which are not remotely the same porting job.
 */
const RULES = [
  {
    kind: 'seam',
    test: (ev, body) => /^\/\^find/.test(ev) && /deletedAt/.test(body) && body.length < 400,
    note: 'Soft-delete filter. The repository applies it centrally, so it cannot be forgotten per call site.',
  },
  {
    kind: 'generated',
    test: (ev, body) => ev === 'validate' && /Date\.now\(\)|Math\.random|toString\(36\)|crypto|nanoid/.test(body),
    note: 'Generates an identifier. A database DEFAULT or the repository can supply it.',
  },
  {
    kind: 'generated',
    test: (ev, body) => ev === 'save' && /bcrypt|hash\(/.test(body),
    note: 'Password hashing. Belongs in the repository, not the table.',
  },
  {
    kind: 'port',
    test: (ev, body) => /conn\.model|this\.constructor\.db|mongoose\.model|\.model\(/.test(body),
    note: 'Touches another collection. Needs an explicit call, and a transaction if it writes.',
  },
  {
    kind: 'port',
    test: (ev, body) => ev === 'save' && /this\.isModified|this\.isNew/.test(body),
    note: 'Conditional on what changed. The repository must compute the same condition.',
  },
  {
    kind: 'port',
    test: (ev) => /update|replace|delete/i.test(ev),
    note: 'Fires on writes that bypass save(). Easy to miss when porting.',
  },
];

function classify(event, body) {
  for (const r of RULES) if (r.test(event, body)) return r;
  return { kind: 'review', note: 'Not classifiable from source. Read it.' };
}

/** The hook's body, by brace matching from the opening paren. */
function extractBody(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length && i < open + 4000; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open, open + 4000);
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '../..'), file).replace(/\\/g, '/');
  const hooks = [];

  const re = /\.(pre|post)\(\s*(\/[^/]+\/[gimsuy]*|'[^']+'|"[^"]+")/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const event = m[2].replace(/^['"]|['"]$/g, '');
    const body = extractBody(src, m.index);
    const line = src.slice(0, m.index).split('\n').length;
    const { kind, note } = classify(event, body);
    hooks.push({
      file: rel,
      model: path.basename(file, '.js'),
      scope: rel.includes('/platform/') ? 'platform' : 'tenant',
      line,
      phase: m[1],
      event,
      kind,
      note,
      lines: body.split('\n').length,
    });
  }
  return hooks;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith('.js') && e.name !== 'index.js' ? [full] : [];
  });
}

/**
 * What already has a SQL counterpart.
 *
 * Read from the code rather than kept as a list here, so the report cannot claim
 * a hook is ported after someone deletes its behaviour. The inventory exists to
 * show remaining work; a hardcoded list would let it show fiction.
 */
const behaviours = require('../../src/db/repository/behaviours');
const ddl = require('../../sql/schema/ddl');

const CREATE_PORTED = new Set(Object.keys(behaviours.BEHAVIOURS || {}));
const UPDATE_PORTED = new Set(['Invoice']);
const APPEND_ONLY = new Set(
  (ddl.APPEND_ONLY_TABLES || []).map((t) => t
    .replace(/s$/, '').split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1)).join('')),
);

const hooks = walk(MODELS_DIR).flatMap(scanFile).map((h) => {
  if (APPEND_ONLY.has(h.model)) return { ...h, ported: 'REVOKE UPDATE, DELETE' };
  if ((h.event === 'save' || h.event === 'validate') && CREATE_PORTED.has(h.model)) return { ...h, ported: 'behaviours.BEHAVIOURS' };
  if (h.event === 'save' && UPDATE_PORTED.has(h.model)) return { ...h, ported: 'behaviours.UPDATE_GUARDS' };
  if (h.kind === 'seam') return { ...h, ported: 'repository seam' };
  return { ...h, ported: null };
});

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify(hooks, null, 2)}\n`);
} else {
  const by = (k) => hooks.reduce((a, h) => { a[h[k]] = (a[h[k]] || 0) + 1; return a; }, {});
  const kinds = by('kind');
  const ORDER = ['seam', 'generated', 'port', 'review'];

  process.stdout.write('\nMongoose hook inventory — Phase 2\n');
  process.stdout.write('─'.repeat(74) + '\n');
  process.stdout.write(`  ${hooks.length} hooks across ${new Set(hooks.map((h) => h.model)).size} models\n\n`);

  for (const k of ORDER) {
    if (!kinds[k]) continue;
    const note = hooks.find((h) => h.kind === k).note;
    process.stdout.write(`  ${k.padEnd(11)} ${String(kinds[k]).padStart(3)}   ${note}\n`);
  }

  const done = hooks.filter((h) => h.ported);
  const needsWork = hooks.filter((h) => !h.ported);

  process.stdout.write(`\n  Ported\n`);
  const byMechanism = done.reduce((a, h) => { a[h.ported] = (a[h.ported] || 0) + 1; return a; }, {});
  Object.entries(byMechanism).sort((a, b) => b[1] - a[1])
    .forEach(([m, n]) => process.stdout.write(`    ${String(n).padStart(3)}  ${m}\n`));

  process.stdout.write(`\n  ${done.length} of ${hooks.length} ported. ${needsWork.length} remaining.\n`);

  if (FULL) {
    for (const k of ORDER) {
      const group = hooks.filter((h) => h.kind === k);
      if (!group.length) continue;
      process.stdout.write(`\n${k.toUpperCase()}\n${'─'.repeat(74)}\n`);
      group
        .sort((a, b) => a.model.localeCompare(b.model))
        .forEach((h) => process.stdout.write(
          `  ${h.model.padEnd(24)} ${h.phase}(${h.event})`.padEnd(58)
          + `${String(h.lines).padStart(3)} lines  ${h.file}:${h.line}\n`,
        ));
    }
  } else {
    // eslint-disable-next-line no-lone-blocks
    if (!needsWork.length) {
      process.stdout.write('\n  Nothing outstanding.\n\n');
      return;
    }
    process.stdout.write('\n  Hooks needing work, by model:\n');
    const perModel = needsWork.reduce((a, h) => {
      (a[h.model] = a[h.model] || []).push(h.event);
      return a;
    }, {});
    Object.entries(perModel)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([model, events]) => process.stdout.write(
        `    ${model.padEnd(26)} ${events.length}  ${events.join(', ')}\n`,
      ));
    process.stdout.write('\n  Run with --full for every hook and its location.\n');
  }
  process.stdout.write('\n');
}
