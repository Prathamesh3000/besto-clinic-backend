'use strict';

const { Schema } = require('mongoose');

const complianceAlertSchema = new Schema(
  {
    patient:      { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    task:         { type: Schema.Types.ObjectId, ref: 'PrescriptionTask', required: true },
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true },

    alertType: {
      type: String,
      enum: ['low_compliance', 'consecutive_misses'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },

    complianceRate:     { type: Number },
    consecutiveMisses:  { type: Number },
    message:            { type: String, required: true, maxlength: 500 },

    status: {
      type: String,
      enum: ['active', 'resolved', 'expired'],
      default: 'active',
      index: true,
    },
    resolvedAt:   { type: Date },
    resolvedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    resolveNote:  { type: String, maxlength: 500 },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

complianceAlertSchema.index({ patient: 1, task: 1, alertType: 1, status: 1 });
complianceAlertSchema.index({ doctor: 1, status: 1 });
complianceAlertSchema.index({ status: 1, createdAt: -1 });
complianceAlertSchema.index({ deletedAt: 1 });

complianceAlertSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = complianceAlertSchema;
