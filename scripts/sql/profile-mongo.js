#!/usr/bin/env node
'use strict';

/**
 * CP-1 — Data profiler.
 *
 * Answers the question the Mongoose schema files cannot: what is *actually* in
 * the database?
 *
 * Mongoose schemas describe intent. Documents written before a validator
 * existed, or by code paths since deleted, silently violate them. Designing DDL
 * from the .js files alone is how you declare NOT NULL on a column that is
 * empty in 12% of rows, and discover it at cutover.
 *
 * Two deliberate design choices:
 *
 *   1. It reads through the **native driver**, not Mongoose models. Mongoose
 *      casts values on read — a string "42" in a Number field comes back as 42,
 *      hiding the exact drift we are hunting for.
 *
 *   2. It enumerates the collections that **exist in the database**, then maps
 *      schemas onto them — not the reverse. Schema-first would never reveal a
 *      collection holding live data that no schema describes.
 *
 * Output: one JSON file per collection in sql/profile/, plus SUMMARY.md.
 *
 * Run:
 *   node scripts/sql/profile-mongo.js                  # platform + one tenant
 *   node scripts/sql/profile-mongo.js --tenant=<slug>  # a specific clinic
 *   node scripts/sql/profile-mongo.js --full           # every document, not a sample
 *   node scripts/sql/profile-mongo.js --verify         # CP-1 gate: exit 1 if anything was skipped
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { mongo, redact, looksLikeProduction } = require('../../sql/config');
const { walk, summarizeFields } = require('../../sql/analyze');

const OUT_DIR = path.resolve(__dirname, '../../sql/profile');
const DEFAULT_SAMPLE = 2000;

// ── CLI ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const options = {
  sampleSize: has('full') ? Infinity : Number(flag('sample', DEFAULT_SAMPLE)),
  tenantSlug: flag('tenant', null),
  platformOnly: has('platform-only'),
  verify: has('verify'),
};

// ── Schema introspection ───────────────────────────────────────

/**
 * Pull the declared paths and their `ref:` targets out of a Mongoose schema, so
 * the profile can be diffed against what the code believes exists.
 */
function describeSchema(schema) {
  const declared = new Set();
  const refs = {};

  schema.eachPath((pathName, type) => {
    declared.add(pathName);
    const ref = type.options?.ref || type.caster?.options?.ref;
    if (ref) refs[pathName] = ref;
  });

  return { declared, refs };
}

/** Load the platform models — these are compiled models, so they carry collection names. */
function loadPlatformModels() {
  const dir = path.resolve(__dirname, '../../src/models/platform');
  const out = new Map();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const model = require(path.join(dir, file));
      if (model?.collection?.name && model.schema) {
        out.set(model.collection.name, { name: model.modelName, schema: model.schema });
      }
    } catch (err) {
      process.stderr.write(`  ! could not load platform model ${file}: ${err.message}\n`);
    }
  }
  return out;
}

/**
 * Load tenant schemas and resolve their collection names.
 *
 * The registry exports raw schemas rather than models, so collection names are
 * derived the same way Mongoose derives them — by registering each schema on a
 * throwaway connection and reading the name back. Guessing the pluralisation
 * rules by hand is how a collection silently goes unprofiled.
 */
function loadTenantSchemas(conn) {
  const registry = require('../../src/models/tenant');
  const out = new Map();

  for (const [name, schema] of Object.entries(registry)) {
    if (!schema?.eachPath) continue;
    const model = conn.models[name] || conn.model(name, schema);
    out.set(model.collection.name, { name, schema });
  }
  return out;
}

// ── Profiling one collection ───────────────────────────────────

async function profileCollection(db, collectionName, schemaInfo) {
  const collection = db.collection(collectionName);
  const total = await collection.countDocuments();

  const fields = {};
  let scanned = 0;

  if (total > 0) {
    const cursor =
      options.sampleSize === Infinity || total <= options.sampleSize
        ? collection.find({})
        : collection.aggregate([{ $sample: { size: options.sampleSize } }]);

    for await (const doc of cursor) {
      walk(doc, fields);
      scanned += 1;
    }
  }

  const described = schemaInfo ? describeSchema(schemaInfo.schema) : { declared: new Set(), refs: {} };
  const fieldReport = summarizeFields(fields, scanned, described.declared);

  // Drift, both directions. Undeclared fields would be dropped by a
  // schema-derived DDL; missing fields mean a column nothing will ever fill.
  const undeclared = Object.keys(fieldReport).filter(
    (p) => !fieldReport[p].declaredInSchema && !p.includes('[]') && !['_id', '__v'].includes(p),
  );
  const declaredButAbsent = [...described.declared].filter(
    (p) => !fields[p] && !['_id', '__v'].includes(p),
  );

  return {
    collection: collectionName,
    model: schemaInfo?.name || null,
    hasSchema: Boolean(schemaInfo),
    totalDocuments: total,
    documentsScanned: scanned,
    scanMode: options.sampleSize === Infinity || total <= options.sampleSize ? 'full' : `sample:${options.sampleSize}`,
    refs: described.refs,
    fields: fieldReport,
    drift: { undeclaredInSchema: undeclared, declaredButNeverPresent: declaredButAbsent },
  };
}

/**
 * Resolve a clinic's connection string, handling both storage formats.
 *
 * The platform DB stores `dbUri` in PLAINTEXT, despite the comment in
 * tenantConnectionManager.js claiming otherwise — `_resolveTenantUri` encrypts
 * only the copy it writes to the Redis cache and returns the database value
 * raw. All 27 clinics were verified plaintext.
 *
 * Both shapes are accepted so this keeps working if encryption at rest is added
 * later (see the finding recorded in the CP-1 summary).
 */
function resolveClinicUri(dbUri, encryptionKey) {
  if (/^mongodb(\+srv)?:\/\//i.test(dbUri)) return dbUri;

  const parts = String(dbUri).split(':');
  if (parts.length >= 3 && /^[0-9a-f]{32}$/i.test(parts[0])) {
    if (!encryptionKey) throw new Error('dbUri is encrypted but APP_ENCRYPTION_KEY is not set');
    return require('../../src/utils/encryption').decrypt(dbUri, encryptionKey);
  }

  throw new Error('dbUri is neither a MongoDB URI nor an iv:tag:ciphertext payload');
}

/** Check a sample of reference values actually resolve — FK feasibility. */
async function checkOrphans(db, report, collectionNameByModel) {
  const orphans = {};

  for (const [pathName, targetModel] of Object.entries(report.refs)) {
    const targetCollection = collectionNameByModel.get(targetModel);
    if (!targetCollection || pathName.includes('.')) continue;

    const sample = await db
      .collection(report.collection)
      .find({ [pathName]: { $ne: null } }, { projection: { [pathName]: 1 } })
      .limit(500)
      .toArray();

    // Deduplicate by hex string, NOT by Set of ObjectId instances.
    // Each ObjectId is a distinct object, so a plain Set keeps duplicates —
    // while countDocuments() below counts distinct documents. Comparing the two
    // reports every repeated reference as a missing one, which turned 10 real
    // users referenced by 500 access logs into a "98% orphaned" result.
    const byHex = new Map();
    for (const doc of sample) {
      const value = doc[pathName];
      for (const id of Array.isArray(value) ? value : [value]) {
        if (id) byHex.set(String(id), id);
      }
    }

    const ids = [...byHex.values()];
    if (ids.length === 0) continue;

    const found = await db.collection(targetCollection).countDocuments({ _id: { $in: ids } });
    const missing = ids.length - found;

    if (missing > 0) {
      orphans[pathName] = {
        target: `${targetModel} (${targetCollection})`,
        checked: ids.length,
        missing,
        pctMissing: Number(((missing / ids.length) * 100).toFixed(2)),
      };
    }
  }

  return orphans;
}

// ── Database-level run ─────────────────────────────────────────

async function profileDatabase(conn, label, schemasByCollection, results) {
  const db = conn.db;
  const collectionNameByModel = new Map(
    [...schemasByCollection.entries()].map(([collectionName, info]) => [info.name, collectionName]),
  );

  const existing = (await db.listCollections().toArray())
    .filter((c) => c.type === 'collection' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();

  process.stdout.write(`\n${label} — ${existing.length} collections\n`);

  for (const collectionName of existing) {
    const schemaInfo = schemasByCollection.get(collectionName) || null;
    try {
      const report = await profileCollection(db, collectionName, schemaInfo);
      report.orphanedReferences = await checkOrphans(db, report, collectionNameByModel);
      report.scope = label;
      results.push(report);

      const warnings = [];
      if (!schemaInfo) warnings.push('NO SCHEMA');
      if (report.drift.undeclaredInSchema.length) warnings.push(`${report.drift.undeclaredInSchema.length} undeclared`);
      const mixed = Object.values(report.fields).filter((f) => f.mixedTypes).length;
      if (mixed) warnings.push(`${mixed} mixed-type`);
      if (Object.keys(report.orphanedReferences).length) warnings.push(`${Object.keys(report.orphanedReferences).length} orphan refs`);

      process.stdout.write(
        `  ${collectionName.padEnd(28)} ${String(report.totalDocuments).padStart(7)} docs` +
        `${warnings.length ? `   ⚠ ${warnings.join(', ')}` : ''}\n`,
      );
    } catch (err) {
      results.push({ collection: collectionName, scope: label, skipped: true, error: err.message });
      process.stdout.write(`  ${collectionName.padEnd(28)} SKIPPED — ${err.message}\n`);
    }
  }
}

// ── Reporting ──────────────────────────────────────────────────

function writeSummary(results) {
  const ok = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  const noSchema = ok.filter((r) => !r.hasSchema && r.totalDocuments > 0);
  const withDrift = ok.filter((r) => r.drift?.undeclaredInSchema.length > 0);
  const withOrphans = ok.filter((r) => Object.keys(r.orphanedReferences || {}).length > 0);
  const allMixed = ok.flatMap((r) =>
    Object.entries(r.fields || {})
      .filter(([, f]) => f.mixedTypes)
      .map(([p, f]) => ({ collection: r.collection, path: p, types: f.types, severity: f.mixedTypeSeverity })),
  );
  // int+double is Mongo's normal number encoding; only 'real' mixing needs a decision.
  const mixedFields = allMixed.filter((m) => m.severity === 'real');
  const numericMixed = allMixed.filter((m) => m.severity === 'numeric');
  const emptyCollections = ok.filter((r) => r.totalDocuments === 0);

  const lines = [];
  lines.push('# CP-1 — Data Profile Summary', '');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: \`${redact(mongo.uri)}\``);
  lines.push(`Scan mode: ${options.sampleSize === Infinity ? 'full' : `sample of ${options.sampleSize} per collection`}`, '');
  lines.push('> This file, not the Mongoose schema files, is the authority for nullability, column type');
  lines.push('> and constraint decisions in the DDL.', '');

  lines.push('## Gate status', '');
  lines.push('| Check | Result |');
  lines.push('|---|---|');
  lines.push(`| Collections profiled | ${ok.length} |`);
  lines.push(`| Collections skipped | ${skipped.length}${skipped.length ? ' ❌' : ' ✓'} |`);
  lines.push(`| Empty collections | ${emptyCollections.length} |`);
  lines.push(`| Collections with live data but **no schema** | ${noSchema.length}${noSchema.length ? ' ⚠' : ' ✓'} |`);
  lines.push(`| Collections with undeclared fields | ${withDrift.length} |`);
  lines.push(`| Fields with **genuine type drift** | ${mixedFields.length}${mixedFields.length ? ' ⚠' : ' ✓'} |`);
  lines.push(`| Fields mixing int/double (benign — normal Mongo number encoding) | ${numericMixed.length} |`);
  lines.push(`| Reference fields with orphans | ${withOrphans.length}${withOrphans.length ? ' ⚠' : ' ✓'} |`);
  lines.push('');

  if (skipped.length) {
    lines.push('## ❌ Skipped — CP-1 cannot pass', '');
    lines.push('A skipped collection is a hole in the DDL, not an inconvenience.', '');
    for (const r of skipped) lines.push(`- \`${r.collection}\` — ${r.error}`);
    lines.push('');
  }

  if (numericMixed.length) {
    lines.push('## Numeric fields spanning int and double — no action needed', '');
    lines.push('MongoDB stores `100` as int32 and `100.50` as a double, so every money and measurement');
    lines.push('field reports both. `numeric` holds them losslessly. Listed for completeness only:', '');
    lines.push(numericMixed.map((m) => `\`${m.collection}.${m.path}\``).join(' · '), '');
  }

  if (mixedFields.length) {
    lines.push('## ⚠ Genuine type drift', '');
    lines.push('These hold values of fundamentally different kinds — something wrote a shape the schema did');
    lines.push('not intend. No single SQL column type holds them as they stand, so each needs an explicit');
    lines.push('decision: coerce on migration, or widen the column to text/JSONB.', '');
    lines.push('| Collection | Field | Types found |');
    lines.push('|---|---|---|');
    for (const m of mixedFields.slice(0, 60)) {
      lines.push(`| \`${m.collection}\` | \`${m.path}\` | ${Object.entries(m.types).map(([t, c]) => `${t}×${c}`).join(', ')} |`);
    }
    if (mixedFields.length > 60) lines.push(`| … | *${mixedFields.length - 60} more* | |`);
    lines.push('');
  }

  if (withOrphans.length) {
    lines.push('## ⚠ Orphaned references', '');
    lines.push('These become foreign keys. Every row below would be **rejected at load time**.', '');
    lines.push('| Collection | Field | Target | Missing | % |');
    lines.push('|---|---|---|---|---|');
    for (const r of withOrphans) {
      for (const [p, o] of Object.entries(r.orphanedReferences)) {
        lines.push(`| \`${r.collection}\` | \`${p}\` | ${o.target} | ${o.missing}/${o.checked} | ${o.pctMissing}% |`);
      }
    }
    lines.push('');
  }

  if (noSchema.length) {
    lines.push('## ⚠ Collections with data but no schema', '');
    lines.push('A schema-derived DDL would omit these entirely and the data would be lost at cutover.', '');
    for (const r of noSchema) lines.push(`- \`${r.collection}\` — ${r.totalDocuments} documents`);
    lines.push('');
  }

  if (withDrift.length) {
    lines.push('## Undeclared fields', '');
    lines.push('Present in data, absent from the Mongoose schema — a schema-derived DDL would drop them.', '');
    for (const r of withDrift) {
      lines.push(`- \`${r.collection}\`: ${r.drift.undeclaredInSchema.map((f) => `\`${f}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Per-collection detail', '');
  lines.push('| Collection | Scope | Docs | Scanned | Fields | Schema |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of ok) {
    lines.push(
      `| \`${r.collection}\` | ${r.scope} | ${r.totalDocuments} | ${r.documentsScanned} | ` +
      `${Object.keys(r.fields || {}).length} | ${r.model || '—'} |`,
    );
  }
  lines.push('');
  lines.push('Full field-level detail is in the per-collection JSON files alongside this summary.');

  fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.md'), lines.join('\n'), 'utf8');

  return { ok: ok.length, skipped: skipped.length, noSchema: noSchema.length, mixedFields: mixedFields.length, withOrphans: withOrphans.length };
}

// ── Main ───────────────────────────────────────────────────────

(async function main() {
  if (!mongo.uri) {
    process.stderr.write('No source URI. Set PLATFORM_DB_URI or SQL_SOURCE_MONGO_URI in .env\n');
    process.exit(1);
  }
  if (looksLikeProduction(mongo.uri) && !mongo.allowProductionRead) {
    process.stderr.write(
      `\nRefusing to profile ${redact(mongo.uri)} — it looks like a live cluster.\n\n` +
      'Profiling scans every collection. Preferred: point SQL_SOURCE_MONGO_URI at a restored snapshot.\n' +
      `Accepted: set SQL_ALLOW_PRODUCTION_READ=true — reads then go to ${mongo.readPreference}, never the primary.\n\n`,
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  process.stdout.write(`\nCP-1 — Data profiler\nSource: ${redact(mongo.uri)}\nRead preference: ${mongo.readPreference}\n`);

  const platformConn = await mongoose
    .createConnection(mongo.uri, { readPreference: mongo.readPreference, serverSelectionTimeoutMS: 10000 })
    .asPromise();

  const results = [];

  // ── Platform ──
  await profileDatabase(platformConn, 'platform', loadPlatformModels(), results);

  // ── Tenant ──
  if (!options.platformOnly) {
    const clinics = await platformConn.db
      .collection('clinics')
      .find({ deletedAt: null }, { projection: { slug: 1, name: 1, dbUri: 1 } })
      .toArray();

    const target = options.tenantSlug
      ? clinics.find((c) => c.slug === options.tenantSlug)
      : clinics.find((c) => c.dbUri);

    if (!target) {
      process.stderr.write(`\nNo tenant to profile${options.tenantSlug ? ` — slug "${options.tenantSlug}" not found` : ''}.\n`);
    } else {
      // A single unreachable tenant must not abort a run that has already
      // profiled the platform database — the partial result is still useful.
      try {
        const uri = resolveClinicUri(target.dbUri, process.env.APP_ENCRYPTION_KEY);
        const tenantConn = await mongoose
          .createConnection(uri, { readPreference: mongo.readPreference, serverSelectionTimeoutMS: 10000 })
          .asPromise();

        await profileDatabase(tenantConn, `tenant:${target.slug}`, loadTenantSchemas(tenantConn), results);
        await tenantConn.close();
      } catch (err) {
        results.push({ collection: `tenant:${target.slug}`, scope: 'tenant', skipped: true, error: err.message });
        process.stderr.write(`\nCould not profile tenant "${target.slug}": ${err.message}\n`);
      }
    }
  }

  await platformConn.close();

  // ── Write output ──
  for (const r of results) {
    const safeName = `${r.scope.replace(/[^a-z0-9]+/gi, '_')}__${r.collection}.json`;
    fs.writeFileSync(path.join(OUT_DIR, safeName), JSON.stringify(r, null, 2), 'utf8');
  }
  const stats = writeSummary(results);

  process.stdout.write('\n' + '─'.repeat(60) + '\n');
  process.stdout.write(`Profiled ${stats.ok} collections, skipped ${stats.skipped}\n`);
  process.stdout.write(`Mixed-type fields: ${stats.mixedFields} · Orphan refs: ${stats.withOrphans} · No schema: ${stats.noSchema}\n`);
  process.stdout.write(`Output: sql/profile/SUMMARY.md\n`);

  if (options.verify) {
    const passed = stats.skipped === 0;
    process.stdout.write(passed ? '\nCP-1 PASSED\n\n' : `\nCP-1 FAILED — ${stats.skipped} collection(s) skipped\n\n`);
    process.exit(passed ? 0 : 1);
  }
  process.stdout.write('\n');
  process.exit(0);
})().catch((err) => {
  process.stderr.write(`\nCP-1 crashed: ${err.stack}\n`);
  process.exit(1);
});
