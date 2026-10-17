'use strict';

/**
 * Model behaviours the SQL path has to perform explicitly.
 *
 * Mongoose runs these as `pre('save')` hooks: invisible at the call site, and
 * therefore invisible when a module is ported. `sql/HOOKS.md` inventories all
 * 76; this file holds the ones that survive as logic rather than collapsing into
 * a grant or a column default.
 *
 * Registered in one place on purpose. The failure mode being avoided is a hook
 * that exists in Mongoose, has no counterpart here, and produces rows that are
 * subtly wrong — a patient with no OPD number, an invoice whose total does not
 * match its lines. Nothing throws; the data is just quietly incorrect.
 *
 * Each behaviour receives the Knex transaction, so anything it writes commits or
 * rolls back with the row that triggered it. Mongoose hooks have no such
 * guarantee, which is one of the few places the port is an improvement.
 */

const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');

/**
 * Reserve the next value of a named sequence.
 *
 * The Mongo original is `findByIdAndUpdate(name, { $inc: { seq: 1 } })` — one
 * atomic document update, so two receptionists registering at the same moment
 * are handed different numbers.
 *
 * `UPDATE ... RETURNING` holds a row lock for the duration of the statement and
 * gives the same guarantee: the second transaction blocks on the first, then
 * reads the value the first wrote. A `SELECT` followed by an `UPDATE` would not
 * — both would read the same number and one would lose to the unique index.
 *
 * Not a PostgreSQL `SEQUENCE`, deliberately: sequences are non-transactional and
 * leave gaps on rollback. An OPD number is read aloud to patients and written on
 * a physical file, so a visible gap invites the question "what happened to
 * OPD-000042?" — and the honest answer would be "a transaction rolled back",
 * which is not an answer a clinic wants to give.
 */
async function nextSequence(trx, schema, name) {
  const table = `${schema}.counters`;

  const updated = await trx.raw(
    `update ${table} set seq = seq + 1, updated_at = now() where id = ? returning seq`,
    [name],
  );
  if (updated.rows.length) return updated.rows[0].seq;

  // First use of this sequence. ON CONFLICT rather than a plain insert, because
  // two concurrent first-callers would otherwise race and one would fail on the
  // primary key rather than simply taking the next value.
  const created = await trx.raw(
    `insert into ${table} (id, seq, created_at, updated_at)
     values (?, 1, now(), now())
     on conflict (id) do update set seq = ${table}.seq + 1, updated_at = now()
     returning seq`,
    [name],
  );
  return created.rows[0].seq;
}

/**
 * The prefixed timestamp-plus-random identifier three models generate.
 *
 * Kept byte-identical to the Mongoose original rather than replaced with a
 * database sequence: these numbers are printed on invoices and credit notes
 * that patients already hold, and a format change would make old and new
 * documents look like they came from different systems.
 */
function generatedId(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password if it is not already hashed.
 *
 * Deliberately not a database trigger. The plaintext must never reach
 * PostgreSQL — it would land in the write-ahead log, in any query log, and in a
 * backup, none of which the application controls. Hashing has to happen before
 * the value leaves the process.
 *
 * The already-hashed check mirrors `this.$locals.skipPasswordHash` in the
 * Mongoose original, which exists because a password is sometimes copied from
 * PlatformPatient already hashed. Double-hashing it would lock the user out
 * with no error at the point it happened.
 */
async function hashPassword(doc) {
  if (!doc.password) return doc;
  if (/^\$2[aby]\$/.test(doc.password)) return doc;
  return { ...doc, password: await bcrypt.hash(doc.password, BCRYPT_ROUNDS) };
}

const PAD = 6;

/**
 * Uppercase a code field.
 *
 * `InventoryItem`, `ProcedureTemplate` and `ServiceItem` each declare
 * `uppercase: true` on `code` *and* repeat it in a `pre('save')` hook. The
 * schema option is a setter that fires on assignment; the hook is belt and
 * braces for paths that bypass it.
 *
 * Neither survives the port - a Mongoose setter is not a column default - so
 * the normalisation happens here. Doing it in the repository rather than as a
 * database trigger keeps it visible to anyone reading the write path, and a
 * CHECK constraint guards the invariant from the other side.
 */
function upperCaseCode(doc) {
  return doc.code ? { ...doc, code: String(doc.code).toUpperCase() } : doc;
}

/**
 * Create behaviours, keyed by Mongoose model name.
 *
 * Each may mutate the document before it is mapped to a row, and runs inside
 * the insert's transaction.
 */
const BEHAVIOURS = {
  /**
   * Patient — assign the OPD number.
   *
   * Replaces `patientSchema.pre('save', assignOpdNumber)`.
   *
   * Matches the original's failure posture as well as its logic: registering the
   * patient matters more than numbering them, so a counter failure is logged
   * loudly and the patient is still created. scripts/backfill-opd-numbers.js
   * fills any gap. Throwing here would lose a real patient record over a
   * cosmetic identifier.
   */
  async Patient(doc, { trx, schema }) {
    // Replaces patientSchema.pre('validate') as well as the OPD hook: both run
    // on create, and splitting them across two mechanisms here would mean two
    // places to look when a patient turns up without an identifier.
    const withId = doc.patientId
      ? doc
      : { ...doc, patientId: generatedId('PAT') };
    if (withId.opdNumber) return withId;
    doc = withId;
    try {
      const seq = await nextSequence(trx, schema, 'opd');
      return { ...doc, opdNumber: `OPD-${String(seq).padStart(PAD, '0')}` };
    } catch (err) {
      logger.error(
        'OPD number assignment failed for patient %s — record saved without one: %s',
        doc.patientId, err.message,
      );
      return doc;
    }
  },

  /**
   * Three models that uppercase a code on save. One rule, not three.
   */
  /** Replaces the bcrypt pre('save') hook on each of the three user models. */
  async User(doc) { return hashPassword(doc); },
  async PlatformUser(doc) { return hashPassword(doc); },
  async PlatformPatient(doc) { return hashPassword(doc); },

  /** Replaces pre('validate') on each. Same generator, different prefix. */
  async Invoice(doc) {
    return doc.invoiceNumber ? doc : { ...doc, invoiceNumber: generatedId('INV') };
  },
  async CreditNote(doc) {
    return doc.creditNoteNumber ? doc : { ...doc, creditNoteNumber: generatedId('CN') };
  },

  async InventoryItem(doc) { return upperCaseCode(doc); },
  async ProcedureTemplate(doc) { return upperCaseCode(doc); },
  async ServiceItem(doc) { return upperCaseCode(doc); },

  /**
   * JobPosting — derive the URL slug from the title.
   *
   * The timestamp suffix is what makes it unique, and it is kept rather than
   * replaced with a database sequence because the slug appears in public job
   * URLs. Changing how it is generated would break links already shared.
   */
  async JobPosting(doc) {
    if (doc.slug || !doc.title) return doc;
    const base = String(doc.title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
    return { ...doc, slug: `${base}-${Date.now().toString(36)}` };
  },

  /**
   * TreatmentPlan — open the status history.
   *
   * Replaces the `isNew` branch of `treatmentPlanSchema.pre('save')`. The
   * transition branch belongs to updates and is handled by the service, which
   * knows the previous value; reconstructing it here would mean an extra read on
   * every write to catch a case that is rare.
   */
  async TreatmentPlan(doc) {
    if (Array.isArray(doc.statusHistory) && doc.statusHistory.length) return doc;
    return {
      ...doc,
      statusHistory: [{
        to: doc.status || 'planned',
        changedBy: doc.createdBy || null,
        changedAt: new Date(),
      }],
    };
  },
};

/**
 * Guards that run before an update.
 *
 * Mongoose expresses these as `pre('save')` hooks branching on `isNew` and
 * `isModified`, which means they read the loaded document. The repository has
 * to fetch the current row to ask the same question - unavoidable, because the
 * rule genuinely depends on what is already stored.
 */
const UPDATE_GUARDS = {
  /**
   * Invoice — refuse to alter the money on an invoice that has been paid.
   *
   * Replaces the `isModified` branch of `invoiceSchema.pre('save')`. Not a
   * formatting rule: it is what stops an invoice being rewritten after the
   * patient has paid against it, which is the kind of change a financial audit
   * exists to catch. Worth the extra read.
   */
  async Invoice(current, patch) {
    const paid = (current.paidAmount || 0) > 0
      || (Array.isArray(current.payments) && current.payments.length > 0);
    if (!paid) return;

    const PROTECTED = ['items', 'subtotal', 'taxAmount', 'discountAmount', 'totalAmount'];
    const attempted = PROTECTED.filter((f) => patch[f] !== undefined);
    if (attempted.length) {
      const err = new Error(
        `Cannot modify ${attempted.join(', ')} on an invoice that has received payments`,
      );
      err.statusCode = 400;
      err.isOperational = true;
      throw err;
    }
  },
};

/** Whether a model needs its current row read before an update. */
function hasUpdateGuard(modelName) {
  return Boolean(UPDATE_GUARDS[modelName]);
}

/** Run a model's update guard. Throws to reject the write. */
async function applyBeforeUpdate(modelName, current, patch) {
  const fn = UPDATE_GUARDS[modelName];
  if (fn) await fn(current, patch);
}

/**
 * Apply a model's create behaviour, if it has one.
 *
 * Models with no entry pass through untouched — most have nothing to do, and
 * requiring an explicit no-op for each would be noise that obscures the ones
 * that matter.
 */
async function applyBeforeCreate(modelName, doc, ctx) {
  const fn = BEHAVIOURS[modelName];
  return fn ? fn(doc, ctx) : doc;
}

module.exports = {
  applyBeforeCreate,
  applyBeforeUpdate,
  hasUpdateGuard,
  nextSequence,
  BEHAVIOURS,
};
