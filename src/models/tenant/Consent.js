'use strict';

const { Schema } = require('mongoose');
const { CONSENT_STATUS, CONSENT_TYPE } = require('../../config/constants');

const consentSchema = new Schema(
  {
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    consentType: {
      type: String,
      enum: Object.values(CONSENT_TYPE),
      required: true,
    },
    grantedTo:   { type: Schema.Types.ObjectId, ref: 'User' },
    scope:       {
      type: String,
      enum: ['read', 'read_write'],
      default: 'read',
    },
    purpose:     { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(CONSENT_STATUS),
      default: CONSENT_STATUS.ACTIVE,
      index: true,
    },
    grantedAt:   { type: Date, default: Date.now },
    revokedAt:   { type: Date },
    expiresAt:   { type: Date, index: true },
    ipAddress:   { type: String },
    metadata:    { type: Schema.Types.Mixed },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

consentSchema.index({ patient: 1, consentType: 1 });
consentSchema.index({ patient: 1, status: 1 });
consentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = consentSchema;
