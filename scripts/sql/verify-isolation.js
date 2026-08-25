#!/usr/bin/env node
'use strict';

/**
 * CP-3 — Cross-tenant isolation.
 *
 * Tenant A's database role must not be able to read tenant B's schema, even with
 * a fully-qualified table name.
 *
 * PASSES ONLY ON `permission denied`. An empty result set is a FAILURE.
 * That distinction is the entire value of this gate and the easiest thing to get
 * wrong when writing it: an empty result means the query was *allowed* and merely
 * found nothing, which is indistinguishable from a leak against a clinic that
 * happens to have no matching rows today. Assert on the error code, never on the
 * row count.
 *
 * This is the guard that tracker item C-01 never had. Worth being precise about
 * what it does and does not cover: C-01 was an *ordering* bug — six routers
 * resolved the tenant before authenticating, so `req.tenantSlug` became whatever
 * the caller put in the header. The request was scoped correctly, to the wrong
 * clinic. No storage layout prevents that, and this gate would not have caught
 * it; the router-order assertion does. What per-tenant roles change is the blast
 * radius of the *other* bug class — the forgotten WHERE clause — and the failure
 * mode when tenant identity is missing entirely: a role without USAGE fails
 * closed, a header-derived clinic_id fails open.
 *
 * STATUS: blocked. Per-tenant schemas and roles do not exist yet.
 *
 * Run:  node scripts/sql/verify-isolation.js
 */

/**
 * Why this file exists before the thing it tests
 * ----------------------------------------------
 * A gate written after its implementation tests whatever that implementation
 * happened to do. Written first, it states the requirement and the
 * implementation has to meet it.
 *
 * It deliberately does not pass vacuously. A gate that goes green because it had
 * nothing to check is worse than no gate — it reports safety that was never
 * verified. This one exits non-zero until it can genuinely run.
 */

const ASSERTIONS = [
  'as the tenant_a role, SELECT FROM tenant_b.patients raises SQLSTATE 42501 (insufficient_privilege)',
  'the same query as the owner role SUCCEEDS — proving the table exists and the negative test is meaningful',
  'the assertion is on the error code, never on row count — an empty result is a failure',
  'SET LOCAL search_path inside a transaction does not leak to the next transaction on a pooled connection',
  'if RLS is enabled anywhere, ALTER TABLE ... FORCE ROW LEVEL SECURITY is set — without it the table owner is exempt and every policy is decorative',
];

const BLOCKED_BY = 'per-tenant schemas and roles';
const DELIVERABLE = 'Phase 0, deliverable 4 — runnable DDL including per-tenant roles and their GRANTs';

process.stdout.write('\nCP-3 — Cross-tenant isolation\n');
process.stdout.write('─'.repeat(64) + '\n');
process.stdout.write(`\n  Not yet runnable — ${BLOCKED_BY} do not exist.\n\n`);
process.stdout.write(`  Source: ${DELIVERABLE}\n\n`);
process.stdout.write('  This gate will assert:\n');
for (const a of ASSERTIONS) process.stdout.write(`    - ${a}\n`);
process.stdout.write('\n  Create the per-clinic schemas and roles (plan §2.2 rule 4: USAGE on exactly\n');
process.stdout.write('  one schema each), then this gate wires up with no further changes.\n');
process.stdout.write('\n' + '─'.repeat(64) + '\n');
process.stdout.write('CP-3 FAILED — blocked, not broken.\n\n');
process.exit(1);
