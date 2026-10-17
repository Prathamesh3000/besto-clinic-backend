'use strict';

/**
 * Inventory the aggregation pipelines — Phase 5, the plan's highest defect risk:
 *
 * > **Aggregation port** — 95 pipelines rewritten as SQL, output reconciled
 * > row-for-row against the Mongo originals. **Highest defect risk**
 *
 * The risk is real but unevenly spread, and the raw count hides that. A
 * `$match` + `$group` + `$sum` is a `WHERE … GROUP BY … SUM()` — a translation
 * anyone can check by reading it. A `$facet` returning four differently-shaped
 * result sets from one pass, or a `$lookup` whose join key is computed inside
 * the pipeline, is where a port goes quietly wrong: the query runs, returns
 * plausible numbers, and nobody notices they are the wrong numbers.
 *
 * So each pipeline is classified by the hardest stage it contains:
 *
 *   direct    stages with a one-to-one SQL equivalent
 *   moderate  needs a join or a subquery, but the shape is obvious
 *   hard      no clean SQL analogue; needs a decision and row-for-row checking
 *
 * Counting pipelines rather than `$` occurrences, because the unit of work is a
 * pipeline: one with eleven stages is one thing to port and one thing to verify.
 *
 * Usage:
 *   node scripts/sql/inventory-aggregations.js            # summary
 *   node scripts/sql/inventory-aggregations.js --full     # every pipeline
 *   node scripts/sql/inventory-aggregations.js --hard     # only the risky ones
 *   node scripts/sql/inventory-aggregations.js --json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SEARCH_DIRS = ['src/modules', 'src/services', 'src/jobs'];
const FULL = process.argv.includes('--full');
const HARD_ONLY = process.argv.includes('--hard');
const AS_JSON = process.argv.includes('--json');

/**
 * Difficulty by stage, hardest wins.
 *
 * The notes say what the port has to decide, not what the stage does — the
 * second is in the MongoDB manual, the first is the thing that gets forgotten.
 */
const STAGES = {
  $match: { level: 'direct', sql: 'WHERE' },
  $group: { level: 'direct', sql: 'GROUP BY' },
  $sum: { level: 'direct', sql: 'SUM()' },
  $avg: { level: 'direct', sql: 'AVG()' },
  $min: { level: 'direct', sql: 'MIN()' },
  $max: { level: 'direct', sql: 'MAX()' },
  $count: { level: 'direct', sql: 'COUNT(*)' },
  $sort: { level: 'direct', sql: 'ORDER BY' },
  $limit: { level: 'direct', sql: 'LIMIT' },
  $skip: { level: 'direct', sql: 'OFFSET' },
  $project: { level: 'direct', sql: 'SELECT list' },
  $set: { level: 'direct', sql: 'computed column' },
  $addFields: { level: 'direct', sql: 'computed column' },

  $lookup: {
    level: 'moderate',
    sql: 'LEFT JOIN',
    note: 'On its own, a LEFT JOIN — $lookup keeps the left document when nothing matches. But $lookup immediately followed by $unwind WITHOUT preserveNullAndEmptyArrays is an INNER JOIN, because that $unwind drops rows whose array came back empty. Reading it as LEFT would keep rows Mongo discards; reading a bare $lookup as INNER would discard rows Mongo keeps. Check which idiom each one is.',
  },
  $unwind: {
    level: 'moderate',
    sql: 'LATERAL / jsonb_array_elements',
    note: 'Depends on whether the array became a child table or stayed JSONB. Child table: a join. JSONB: jsonb_array_elements. And preserveNullAndEmptyArrays decides inner vs left.',
  },
  $replaceRoot: { level: 'moderate', sql: 'SELECT the subdocument', note: 'Reshapes the row; the SELECT list changes rather than the FROM.' },
  $bucket: { level: 'moderate', sql: 'CASE … GROUP BY', note: 'Bucket boundaries become a CASE expression grouped on.' },

  $facet: {
    level: 'hard',
    sql: 'multiple CTEs',
    note: 'Several differently-shaped result sets from one pass. Each branch becomes its own CTE and the caller reassembles them — the single-pass property does not survive, so check whether anything depended on it. A $facet with ONE branch is just that branch, and is downgraded below.',
  },
  $graphLookup: {
    level: 'hard',
    sql: 'WITH RECURSIVE',
    note: 'Recursive CTE. Termination and depth limits have to be restated explicitly.',
  },
  $merge: { level: 'hard', sql: 'INSERT … ON CONFLICT', note: 'Writes from a read pipeline. Needs a transaction boundary the aggregation never had.' },
  $out: { level: 'hard', sql: 'CREATE TABLE AS', note: 'Replaces a whole collection. Destructive, and not idempotent.' },
};

const ORDER = { direct: 0, moderate: 1, hard: 2 };

/** Balanced-bracket extraction from the opening paren of `.aggregate(`. */
function extractCall(src, idx) {
  const open = src.indexOf('(', idx);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length && i < open + 12000; i += 1) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open, open + 12000);
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const found = [];

  const re = /\.aggregate\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = extractCall(src, m.index);
    const stages = [...new Set(
      (body.match(/\$[a-zA-Z]+/g) || []).filter((s) => STAGES[s]),
    )];

    /**
     * A $facet with one branch is not a facet in any meaningful sense — it is
     * that branch, wrapped. Rating it 'hard' inflates the risk and sends someone
     * to read a pipeline that turns out to be a plain GROUP BY.
     *
     * Counted by top-level keys in the facet object rather than by occurrences
     * of '[', which nested pipelines would inflate.
     */
    const facetBranches = (() => {
      const at = body.indexOf('$facet');
      if (at === -1) return 0;
      const open = body.indexOf('{', body.indexOf(':', at));
      if (open === -1) return 0;
      let depth = 0;
      let branches = 0;
      for (let i = open; i < body.length; i += 1) {
        const c = body[i];
        if (c === '{' || c === '[') depth += 1;
        else if (c === '}' || c === ']') { depth -= 1; if (depth === 0) break; }
        else if (c === ':' && depth === 1) branches += 1;
      }
      return branches;
    })();

    // $lookup + $unwind with no preserveNullAndEmptyArrays is an inner join.
    const joinIdiom = stages.includes('$lookup')
      ? (stages.includes('$unwind') && !/preserveNullAndEmptyArrays\s*:\s*true/.test(body)
        ? 'INNER JOIN' : 'LEFT JOIN')
      : null;

    let level = 'direct';
    for (const s of stages) {
      const stageLevel = (s === '$facet' && facetBranches <= 1) ? 'moderate' : STAGES[s].level;
      if (ORDER[stageLevel] > ORDER[level]) level = stageLevel;
    }

    found.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      module: rel.split('/')[2] || rel.split('/')[1],
      stages,
      hardest: stages.filter((s) => STAGES[s].level === level),
      level,
      facetBranches: facetBranches || undefined,
      joinIdiom: joinIdiom || undefined,
      lines: body.split('\n').length,
    });
  }
  return found;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith('.js') ? [full] : [];
  });
}

const pipelines = SEARCH_DIRS
  .flatMap((d) => walk(path.join(ROOT, d)))
  .flatMap(scanFile);

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify(pipelines, null, 2)}\n`);
} else {
  const byLevel = pipelines.reduce((a, p) => { a[p.level] = (a[p.level] || 0) + 1; return a; }, {});

  process.stdout.write('\nAggregation inventory — Phase 5\n');
  process.stdout.write('─'.repeat(76) + '\n');
  process.stdout.write(`  ${pipelines.length} pipelines across `
    + `${new Set(pipelines.map((p) => p.module)).size} modules\n\n`);

  for (const lvl of ['direct', 'moderate', 'hard']) {
    if (!byLevel[lvl]) continue;
    const pct = Math.round((byLevel[lvl] / pipelines.length) * 100);
    process.stdout.write(`  ${lvl.padEnd(10)} ${String(byLevel[lvl]).padStart(3)}  ${String(pct).padStart(3)}%\n`);
  }

  const risky = pipelines.filter((p) => p.level !== 'direct');
  process.stdout.write(`\n  ${byLevel.direct || 0} translate directly. `
    + `${risky.length} need a decision.\n`);

  const stageCounts = pipelines
    .flatMap((p) => p.stages)
    .reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {});

  process.stdout.write('\n  Stages that need a decision, and what it is:\n');
  Object.entries(stageCounts)
    .filter(([s]) => STAGES[s].level !== 'direct')
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => {
      process.stdout.write(`\n    ${s} — ${n} pipeline(s) → ${STAGES[s].sql}\n`);
      if (STAGES[s].note) {
        process.stdout.write(`      ${STAGES[s].note}\n`);
      }
    });

  const show = HARD_ONLY ? pipelines.filter((p) => p.level === 'hard') : risky;
  if (FULL || HARD_ONLY) {
    process.stdout.write(`\n  ${HARD_ONLY ? 'Hard' : 'Needing a decision'}, by location:\n`);
    show
      .sort((a, b) => ORDER[b.level] - ORDER[a.level] || a.file.localeCompare(b.file))
      .forEach((p) => process.stdout.write(
        `    ${p.level.padEnd(9)} ${p.hardest.join(' ').padEnd(22)} `
        + `${String(p.lines).padStart(3)} lines  ${p.file}:${p.line}\n`,
      ));
  } else {
    const perModule = risky.reduce((a, p) => {
      (a[p.module] = a[p.module] || []).push(p.level);
      return a;
    }, {});
    process.stdout.write('\n  By module:\n');
    Object.entries(perModule)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .forEach(([mod, levels]) => {
        const hard = levels.filter((l) => l === 'hard').length;
        process.stdout.write(`    ${mod.padEnd(24)} ${String(levels.length).padStart(2)}`
          + `${hard ? `  (${hard} hard)` : ''}\n`);
      });
    process.stdout.write('\n  --full for every one, --hard for just the risky ones.\n');
  }
  process.stdout.write('\n');
}
