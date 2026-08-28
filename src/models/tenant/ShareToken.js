'use strict';

const { Schema } = require('mongoose');

const shareTokenSchema = new Schema(
  {
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    token:       { type: String, required: true, unique: true },
    recordType:  {
      type: String,
      enum: ['treatment', 'prescription', 'invoice', 'all'],
      required: true,
    },
    recordId:    { type: Schema.Types.ObjectId, default: null },
    sharedBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sharedWith:  { type: String, trim: true, maxlength: 200 },

    // Indexed below as a TTL index — see the note in Consent.js.
    expiresAt:   { type: Date, required: true },
    accessCount: { type: Number, default: 0 },
    maxAccesses: { type: Number, default: 10, min: 1, max: 100 },

    isRevoked:   { type: Boolean, default: false },
    revokedAt:   { type: Date },
  },
  { timestamps: true },
);

shareTokenSchema.index({ patient: 1, createdAt: -1 });
shareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = shareTokenSchema;
