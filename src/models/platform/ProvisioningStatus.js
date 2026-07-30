'use strict';

const mongoose = require('mongoose');
const { PROVISIONING_STATUS, PROVISIONING_TRANSITIONS } = require('../../config/constants');

const stepLogSchema = new mongoose.Schema({
  step: { type: String, required: true },
  status: { type: String, enum: ['started', 'completed', 'failed'], required: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  error: String,
  metadata: mongoose.Schema.Types.Mixed,
}, { _id: false });

const provisioningStatusSchema = new mongoose.Schema({
  clinic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clinic',
    required: true,
    index: true,
  },
  clinicSlug: {
    type: String,
    required: true,
    index: true,
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(PROVISIONING_STATUS),
    default: PROVISIONING_STATUS.PENDING,
    index: true,
  },
  steps: [stepLogSchema],
  attempt: { type: Number, default: 1 },
  maxAttempts: { type: Number, default: 3 },
  lastError: String,
  completedAt: Date,
  rolledBackAt: Date,
  triggeredBy: {
    userId: String,
    role: String,
  },
}, {
  timestamps: true,
  toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } },
});

provisioningStatusSchema.index({ status: 1, createdAt: 1 });

provisioningStatusSchema.methods.transition = function (newStatus, error) {
  const allowed = PROVISIONING_TRANSITIONS[this.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid provisioning transition: ${this.status} -> ${newStatus}. ` +
      `Allowed: [${(allowed || []).join(', ')}]`,
    );
  }
  this.status = newStatus;
  if (error) this.lastError = error;
  if (newStatus === PROVISIONING_STATUS.COMPLETED) this.completedAt = new Date();
  if (newStatus === PROVISIONING_STATUS.ROLLED_BACK) this.rolledBackAt = new Date();
  return this;
};

module.exports = mongoose.model('ProvisioningStatus', provisioningStatusSchema);
