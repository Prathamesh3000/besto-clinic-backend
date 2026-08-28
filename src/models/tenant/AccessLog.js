'use strict';

const { Schema } = require('mongoose');

const accessLogSchema = new Schema(
  {
    patient:    { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    accessedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    accessType: {
      type: String,
      enum: ['view', 'download', 'share', 'export', 'create', 'update', 'cancel', 'revoke'],
      required: true,
    },
    resource:   {
      type: String,
      enum: [
        'profile', 'appointment', 'treatment', 'prescription',
        'invoice', 'consent', 'insurance', 'review', 'share_token',
      ],
      required: true,
    },
    resourceId: { type: Schema.Types.ObjectId },

    // Human-readable description of what happened
    description: { type: String, maxlength: 500 },

    // Structured details for the frontend to render rich cards
    metadata: { type: Schema.Types.Mixed, default: null },

    ipAddress:  { type: String },
    userAgent:  { type: String, maxlength: 500 },
    shareToken: { type: Schema.Types.ObjectId, ref: 'ShareToken' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

accessLogSchema.index({ patient: 1, createdAt: -1 });
accessLogSchema.index({ accessedBy: 1, createdAt: -1 });
accessLogSchema.index({ resource: 1, createdAt: -1 });

module.exports = accessLogSchema;
