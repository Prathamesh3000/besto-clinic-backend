'use strict';

const mongoose = require('mongoose');
const { FINANCIAL_AUDIT_ACTION } = require('../../config/constants');

const financialAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: Object.values(FINANCIAL_AUDIT_ACTION),
      required: true,
    },
    entity: {
      type: String,
      enum: ['Payment', 'Invoice', 'CreditNote', 'CashRegister', 'PatientLedger', 'InsuranceClaim'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
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
financialAuditLogSchema.index({ entityId: 1, createdAt: -1 });
financialAuditLogSchema.index({ actor: 1 });
financialAuditLogSchema.index({ action: 1, createdAt: -1 });
financialAuditLogSchema.index({ entity: 1, entityId: 1 });

// ── Immutability guards — audit logs must NEVER be modified or deleted ──
function _blockMutation(next) {
  next(new Error('FinancialAuditLog is immutable — update operations are forbidden'));
}
function _blockDelete(next) {
  next(new Error('FinancialAuditLog is immutable — delete operations are forbidden'));
}

financialAuditLogSchema.pre('updateOne', _blockMutation);
financialAuditLogSchema.pre('updateMany', _blockMutation);
financialAuditLogSchema.pre('findOneAndUpdate', _blockMutation);
financialAuditLogSchema.pre('findOneAndReplace', _blockMutation);
financialAuditLogSchema.pre('replaceOne', _blockMutation);
financialAuditLogSchema.pre('deleteOne', _blockDelete);
financialAuditLogSchema.pre('deleteMany', _blockDelete);
financialAuditLogSchema.pre('findOneAndDelete', _blockDelete);
financialAuditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('FinancialAuditLog is immutable — existing documents cannot be modified'));
  }
  next();
});

module.exports = financialAuditLogSchema;
