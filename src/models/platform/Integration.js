'use strict';

const mongoose = require('mongoose');
const { INTEGRATION_TYPES } = require('../../config/constants');

const INTEGRATION_STATUSES = ['inactive', 'active', 'error', 'suspended'];

const integrationSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: INTEGRATION_TYPES,
    required: true,
  },
  status: {
    type: String,
    enum: INTEGRATION_STATUSES,
    default: 'inactive',
  },
  config: {
    baseUrl: String,
    apiVersion: { type: String, default: 'v1' },
    syncInterval: { type: Number, default: 60 }, // minutes
    syncEnabled: { type: Boolean, default: false },
    lastSyncAt: Date,
    lastSyncStatus: { type: String, enum: ['success', 'partial', 'failed', null], default: null },
    lastSyncRecordCount: { type: Number, default: 0 },
  },
  enabledBy: {
    userId: String,
    role: String,
  },
  enabledAt: Date,
  disabledAt: Date,
  deletedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } },
});

integrationSchema.index({ clinicSlug: 1, type: 1 }, { unique: true });
integrationSchema.index({ status: 1 });
integrationSchema.index({ deletedAt: 1 });

integrationSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = mongoose.model('Integration', integrationSchema);
