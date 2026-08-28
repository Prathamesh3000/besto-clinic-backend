'use strict';

const mongoose = require('mongoose');

const integrationCredentialSchema = new mongoose.Schema({
  integrationType: {
    type: String,
    enum: ['rioview', 'romexis'],
    required: true,
  },
  authType: {
    type: String,
    enum: ['api_key', 'oauth2'],
    required: true,
  },
  // All credential fields stored as AES-256-GCM encrypted strings
  encryptedApiKey: { type: String, select: false },
  encryptedClientId: { type: String, select: false },
  encryptedClientSecret: { type: String, select: false },
  encryptedAccessToken: { type: String, select: false },
  encryptedRefreshToken: { type: String, select: false },
  tokenExpiresAt: Date,
  scopes: [String],
  isActive: { type: Boolean, default: true },
  lastTestedAt: Date,
  lastTestResult: { type: String, enum: ['success', 'failed', null], default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      // Never expose encrypted fields
      delete ret.encryptedApiKey;
      delete ret.encryptedClientId;
      delete ret.encryptedClientSecret;
      delete ret.encryptedAccessToken;
      delete ret.encryptedRefreshToken;
      delete ret.__v;
      return ret;
    },
  },
});

integrationCredentialSchema.index({ integrationType: 1 }, { unique: true });
integrationCredentialSchema.index({ deletedAt: 1 });

integrationCredentialSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = integrationCredentialSchema; // Schema, NOT model (tenant pattern)
