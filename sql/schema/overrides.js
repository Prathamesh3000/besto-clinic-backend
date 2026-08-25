'use strict';

/**
 * Explicit schema decisions — the ones a rule cannot make.
 *
 * SQL_MIGRATION_PLAN.md section 4 step 3 requires "an explicit documented decision
 * for each of the 237 embedded arrays (child table vs JSONB)". This file is where
 * the ones that deviate from the default rule are recorded, with the evidence.
 *
 * A correction to that figure, measured rather than estimated: there are **86**
 * arrays across the 73 schemas, not 237 — 52 object-subschema arrays, 6 arrays of
 * ObjectId references, and 28 scalar arrays. The 237 in the plan appears to count
 * textual `[` occurrences in the schema sources rather than array paths. Reproduce
 * with `node sql/schema/build.js --census`.
 *
 * ── The default rule ──────────────────────────────────────────
 *
 * An embedded array stays JSONB. It is promoted to a child table only when it is
 * *independently queried* — meaning something aggregates across it rather than
 * reading it back with its parent.
 *
 * That test is answerable from the code rather than from taste: an array queried
 * independently shows up as a `$unwind` in an aggregation pipeline. There are five
 * `$unwind` stages in the whole codebase and two of them unwind `$lookup` output
 * rather than an embedded array, which leaves exactly the three promotions below.
 *
 * Arrays of ObjectId references are a separate case and are always promoted, to
 * junction tables — they are pure relationships, and enforcing them is most of the
 * reason for moving to a relational database at all.
 */

/* ── Arrays promoted to child tables ───────────────────────── */

const CHILD_TABLES = {
  'tenant/Invoice.items': {
    table: 'invoice_items',
    reason:
      'Statutory. billing.service.js:1094 unwinds $items to build the HSN-wise GST '
      + 'summary, grouping by items.hsnCode and summing tax per line. That is a tax '
      + 'filing figure, and the plan names aggregation rewrites the highest defect '
      + 'risk in the programme (phase 5). A typed child table makes it an ordinary '
      + 'GROUP BY that the database can index; over JSONB it is a hand-written '
      + 'jsonb_array_elements that nothing checks.',
    orderColumn: 'line_no',
  },

  'platform/Subscription.invoiceHistory': {
    table: 'subscription_invoice_history',
    reason:
      'productOwner.service.js:306 unwinds $invoiceHistory and filters on '
      + 'invoiceHistory.paidAt and .status to build the monthly revenue trend. '
      + 'Range-filtering a date inside a JSONB array cannot use a normal btree '
      + 'index; as a column it can.',
    orderColumn: 'line_no',
  },

  'platform/GuestScan.result.observations': {
    table: 'guest_scan_observations',
    reason:
      'dentalScanAnalytics.service.js:216 and :240 both unwind $result.observations '
      + 'and group by .type and .confidence. Two independent aggregations over the '
      + 'same array is the clearest signal in the codebase that it is an entity '
      + 'rather than a detail of its parent.',
    orderColumn: 'line_no',
  },
};

/**
 * Deliberately NOT promoted, recorded because the omission looks like an oversight.
 *
 * `DentalScanResult.observations` (tenant) holds the same shape as
 * `GuestScan.result.observations` (platform) and is not promoted, because nothing
 * aggregates across it — the tenant-side analytics read it back with its parent
 * scan. Applying the rule consistently matters more than making the two tables
 * look alike, and promoting it "for symmetry" would add a child table, its
 * indexes and its ETL step to carry data nothing queries that way.
 *
 * Revisit if a tenant-scoped equivalent of the platform scan analytics is built.
 */
const NOT_PROMOTED = {
  'tenant/DentalScanResult.observations':
    'Same shape as the promoted platform array, but no $unwind anywhere — read only with its parent.',
  'tenant/Invoice.paidVia':
    'Four fields, read back with the invoice. No aggregation touches it.',
  'tenant/TreatmentRecord.teeth':
    'Read and written whole with the record. FDI tooth codes are a detail of the treatment, not an entity.',
};

/* ── Arrays of references promoted to junction tables ──────── */

/**
 * All six, without exception. Each is a many-to-many that Mongo has been storing
 * as an unenforced array of ObjectIds; as a junction table with two foreign keys
 * the database refuses a dangling member instead of the application discovering
 * it later.
 *
 * `Invoice.payments` and `InsuranceClaim.payments` both point at Payment, which
 * also carries its own `invoice` reference — so the relationship is already stored
 * twice and the two copies can disagree. The junction table is the authority; the
 * ETL reports rows where the two directions do not agree rather than silently
 * picking one.
 */
const JUNCTION_TABLES = {
  'platform/Promotion.applicablePlans': { table: 'promotion_applicable_plans', target: 'Plan' },
  'platform/Promotion.targetClinics': { table: 'promotion_target_clinics', target: 'Clinic' },
  'platform/Rebate.applicablePlans': { table: 'rebate_applicable_plans', target: 'Plan' },
  'tenant/ClinicHoliday.branches': { table: 'clinic_holiday_branches', target: 'Branch' },
  'tenant/InsuranceClaim.payments': { table: 'insurance_claim_payments', target: 'Payment' },
  'tenant/Invoice.payments': { table: 'invoice_payments', target: 'Payment' },
};

/* ── Column-level decisions ────────────────────────────────── */

/**
 * Keyed `scope/Model.path`. Only fields where the generated rule would be wrong,
 * or where a CP-1 finding requires a recorded decision, appear here.
 */
const COLUMNS = {
  /**
   * F-2, corrected. The column stays NOT NULL.
   *
   * FINDINGS.md recommends making `chat_messages.session_id` nullable. Re-reading
   * the evidence it cites, that is the wrong remedy for the measured problem, and
   * the correction is recorded here rather than applied silently.
   *
   * What was measured: `session` is present in **100%** of rows with **zero
   * nulls** in both clinics that hold chat data (77 and 2 documents). What is
   * broken is that every value points at a VideoSession that has since been
   * deleted — `missing: 18 of 18` and `1 of 1` in the two orphan checks.
   *
   * Those are two different constraints. Presence is satisfied by the data and
   * NOT NULL loads every row without complaint; it is the *foreign key* that
   * cannot be enforced, and NOT VALID is exactly the tool for that — new rows
   * are checked, the existing damage is tolerated, and VALIDATE CONSTRAINT
   * promotes it once the rows are decided.
   *
   * Making the column nullable instead would permit future messages with no
   * session at all, which `required: true` has prevented since the model was
   * written and which no document has ever contained. That is a real loss of
   * guarantee, accepted to solve a problem in a different constraint that is
   * already handled.
   *
   * The underlying defect is untouched either way: FINDINGS.md F-2 raises the
   * disappearing VideoSession records as a live bug, separately from the
   * migration, and this entry does not close it.
   */
  'tenant/ChatMessage.session': {
    notNull: true,
    reason:
      'F-2 CORRECTED: present in 100% of rows with zero nulls, so NOT NULL loads cleanly. '
      + 'The orphaning is referential and is carried by a NOT VALID foreign key instead.',
  },

  /**
   * F-5. `defaultValue` and the four `planDefaults.*` fields are declared Boolean
   * and hold `boolean x 5-7, int x 1` — one document per field wrote 1/0.
   *
   * The column stays boolean and the ETL coerces. Widening to jsonb to admit a
   * single malformed document would push the two-shapes problem onto every reader
   * of the column, permanently, to avoid one `CASE` in a load script.
   */
  'platform/FeatureFlag.defaultValue': {
    coerce: 'intToBool',
    reason: 'F-5: one document holds int where boolean is declared. Coerce 1 -> true, 0 -> false, logged not silent.',
  },

  /**
   * F-5's other four fields — `planDefaults.free`, `.starter`, `.professional`,
   * `.enterprise` — are NOT columns, and this is the record of why.
   *
   * `planDefaults` is a Mongoose `Map`, so it becomes a single `jsonb` column and
   * those four are keys inside it rather than fields beside it. The distinction
   * was not obvious from the profile, which reports them as ordinary dotted paths
   * exactly like the flattened `address.city` case.
   *
   * The consequence for F-5 is that the coercion moves too: there is no boolean
   * column to reject an int, so nothing fails at load and the drift survives
   * migration silently inside the JSON. The ETL coerces the map's values on the
   * way in, which is why this is declared on the map rather than dropped.
   *
   * JSON has a real boolean type, so `{"free": 1}` and `{"free": true}` stay
   * distinguishable after loading — this is a value to fix, not a type the column
   * cannot hold.
   */
  'platform/FeatureFlag.planDefaults': {
    coerce: 'intToBoolMapValues',
    reason:
      'F-5: a Map -> one jsonb column. The int/boolean drift is in the map values, '
      + 'where no column type will catch it, so the ETL coerces and logs each one.',
  },

  /**
   * F-4. Tenant database credentials are stored in plaintext in all 27 clinics,
   * despite the code commenting that they are encrypted.
   *
   * The column is marked sensitive so the DDL can withhold it from the read-only
   * roles and so it never lands in a profile or a parity fixture. Encrypting the
   * value is deliberately NOT folded into the ETL: FINDINGS.md recommends it as
   * its own security ticket, and quietly encrypting during migration would mean
   * cutover and key management have to succeed together or no clinic connects.
   */
  'platform/Clinic.dbUri': {
    sensitive: true,
    reason: 'F-4: plaintext connection credentials. Excluded from read roles; encryption tracked separately.',
  },
};

/* ── Foreign keys deliberately not enforced ────────────────── */

/**
 * A reference that existing data violates cannot become an enforced foreign key
 * on day one — the load would fail. Each entry here records the measured
 * violation and what has to happen before the constraint can be added.
 *
 * These are emitted as `NOT VALID` foreign keys: PostgreSQL enforces them for new
 * rows immediately while tolerating the existing violations, so the damage cannot
 * grow. `VALIDATE CONSTRAINT` promotes them to fully enforced once the rows are
 * cleaned, without rewriting the table.
 *
 * That is the part worth insisting on. Simply omitting the constraint would leave
 * the migration in exactly the state Mongo was in — the one the move to SQL is
 * meant to end.
 */
const DEFERRED_FOREIGN_KEYS = {
  'tenant/PatientLedger.patient': {
    finding: 'F-1',
    measured: '1,564 of 2,191 rows in jathar-dental reference 320 patient ids that do not exist (71.4%)',
    decision: 'PENDING — delete as seed debris (recommended) or reattach. The 627 sound rows load either way.',
  },
  'tenant/PatientLedger.createdBy': { finding: 'F-1', measured: '3 of 11 user ids missing, same 1,564 rows', decision: 'PENDING — follows F-1' },
  'tenant/PatientLedger.branch': { finding: 'F-1', measured: '6 of 11 branch ids missing, same 1,564 rows', decision: 'PENDING — follows F-1' },
  'tenant/ChatMessage.session': {
    finding: 'F-2',
    measured: '79 rows across 2 clinics, 100% of references orphaned (column itself 100% present)',
    decision: 'Column stays NOT NULL — see the correction in COLUMNS. FK NOT VALID pending the live-defect investigation.',
  },
  'tenant/EmergencySession.videoSession': { finding: 'F-2', measured: '8 rows, 100% orphaned', decision: 'Already optional in the schema; nullable column matches.' },
  'platform/Subscription.clinic': {
    finding: 'F-8',
    measured: '1 of 2 clinic ids missing (50%)',
    decision: 'PENDING — billing data. Needs a decision, not a default.',
  },
  'platform/TenantAuditLog.clinic': { finding: 'F-8', measured: '3 of 21 clinic ids missing (14.3%)', decision: 'PENDING — audit trail.' },
};

/* ── Lookup helpers ────────────────────────────────────────── */

const key = (scope, model, path) => `${scope}/${model}.${path}`;

module.exports = {
  CHILD_TABLES,
  JUNCTION_TABLES,
  NOT_PROMOTED,
  COLUMNS,
  DEFERRED_FOREIGN_KEYS,
  key,
  childTableFor: (scope, model, path) => CHILD_TABLES[key(scope, model, path)] || null,
  junctionFor: (scope, model, path) => JUNCTION_TABLES[key(scope, model, path)] || null,
  columnFor: (scope, model, path) => COLUMNS[key(scope, model, path)] || null,
  deferredFkFor: (scope, model, path) => DEFERRED_FOREIGN_KEYS[key(scope, model, path)] || null,
};
