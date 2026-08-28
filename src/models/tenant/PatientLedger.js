'use strict';

const mongoose = require('mongoose');
const { LEDGER_ENTRY_TYPE, LEDGER_SOURCE } = require('../../config/constants');

const patientLedgerSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(LEDGER_ENTRY_TYPE),
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balance: { type: Number, required: true },
    source: {
      type: String,
      enum: Object.values(LEDGER_SOURCE),
      required: true,
    },
    reference: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceModel: {
      type: String,
      enum: ['Invoice', 'Payment', 'CreditNote'],
    },
    description: { type: String, required: true, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
patientLedgerSchema.index({ patient: 1, createdAt: -1 });
patientLedgerSchema.index({ source: 1 });
patientLedgerSchema.index({ reference: 1 });

// ── Immutability guards — ledger entries must NEVER be modified or deleted ──
function _blockMutation(next) {
  next(new Error('PatientLedger is immutable — update operations are forbidden'));
}
function _blockDelete(next) {
  next(new Error('PatientLedger is immutable — delete operations are forbidden'));
}

patientLedgerSchema.pre('updateOne', _blockMutation);
patientLedgerSchema.pre('updateMany', _blockMutation);
patientLedgerSchema.pre('findOneAndUpdate', _blockMutation);
patientLedgerSchema.pre('findOneAndReplace', _blockMutation);
patientLedgerSchema.pre('replaceOne', _blockMutation);
patientLedgerSchema.pre('deleteOne', _blockDelete);
patientLedgerSchema.pre('deleteMany', _blockDelete);
patientLedgerSchema.pre('findOneAndDelete', _blockDelete);
patientLedgerSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('PatientLedger is immutable — existing entries cannot be modified'));
  }
  next();
});

module.exports = patientLedgerSchema;
