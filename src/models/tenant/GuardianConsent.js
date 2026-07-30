'use strict';

const mongoose = require('mongoose');

const guardianConsentSchema = new mongoose.Schema(
  {
    guardian: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dependent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    consentType: {
      type: String,
      enum: ['guardianship'],
      default: 'guardianship',
      required: true,
    },
    consentText: {
      type: String,
      required: true,
    },
    acceptedAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true },
);

guardianConsentSchema.index({ guardian: 1, dependent: 1 });
guardianConsentSchema.index({ dependent: 1 });

module.exports = guardianConsentSchema;
