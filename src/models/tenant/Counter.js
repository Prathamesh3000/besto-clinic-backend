'use strict';

/**
 * Counter — atomic sequence generator, one document per named sequence.
 *
 * Lives in the tenant database, so every clinic numbers its own sequences from 1
 * and two clinics never share or collide.
 *
 * Why this exists rather than counting documents: `Patient.countDocuments() + 1`
 * is a read-then-write race. Two receptionists registering at the same moment
 * both read the same count and both write the same number, and the unique index
 * then rejects one of them. `$inc` inside findOneAndUpdate is applied atomically
 * by MongoDB, so concurrent callers are handed distinct values.
 *
 * Sequence names in use:
 *   opd — patient OPD numbers (OPD-000001)
 */

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    /** Sequence name, e.g. 'opd'. */
    _id: { type: String, required: true },

    /** Last issued value. The next caller receives seq + 1. */
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

/**
 * Reserve and return the next value in a sequence.
 *
 * Atomic: upsert creates the counter on first use, and $inc is applied by the
 * server, so concurrent callers cannot receive the same number.
 *
 * @param {import('mongoose').Connection} conn — tenant connection
 * @param {string} name — sequence name
 * @returns {Promise<number>} the reserved value
 */
async function nextSequence(conn, name) {
  const Counter = conn.model('Counter');
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
}

module.exports = counterSchema;
module.exports.nextSequence = nextSequence;
