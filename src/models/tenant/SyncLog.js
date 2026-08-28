'use strict';

const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  integrationType: {
    type: String,
    enum: ['rioview', 'romexis'],
    required: true,
    index: true,
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: 'inbound',
  },
  action: {
    type: String,
    enum: ['sync_full', 'sync_incremental', 'test_connection', 'manual_sync'],
    required: true,
  },
  status: {
    type: String,
    enum: ['started', 'in_progress', 'completed', 'partial', 'failed'],
    required: true,
    index: true,
  },
  recordType: {
    type: String,
    enum: ['patient', 'treatment_record', 'mixed'],
  },
  stats: {
    totalRecords: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  errors: [{
    externalId: String,
    message: String,
    code: String,
    _id: false,
  }],
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  durationMs: Number,
  triggeredBy: {
    type: String,
    enum: ['system', 'user', 'cron'],
    default: 'system',
  },
  triggeredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: mongoose.Schema.Types.Mixed,
}, {
  timestamps: true,
  toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } },
});

syncLogSchema.index({ integrationType: 1, createdAt: -1 });
syncLogSchema.index({ startedAt: -1 });

module.exports = syncLogSchema; // Schema, NOT model (tenant pattern)
