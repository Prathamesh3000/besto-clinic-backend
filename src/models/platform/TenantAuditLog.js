'use strict';

/**
 * TenantAuditLog — immutable audit trail for every tenant lifecycle action.
 *
 * Records: creation, SuperAdmin assignment, activation, suspension,
 * cancellation, feature changes, usage updates, etc.
 *
 * This collection is append-only — documents are never updated or deleted.
 */

const mongoose = require('mongoose');

const tenantAuditLogSchema = new mongoose.Schema(
  {
    /** The tenant this action relates to */
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },

    /** Human-readable tenant slug (denormalised for log readability) */
    clinicSlug: {
      type: String,
      required: true,
    },

    /** What happened */
    action: {
      type: String,
      required: true,
      enum: [
        'tenant_created',
        'superadmin_assigned',
        'tenant_activated',
        'tenant_suspended',
        'tenant_reactivated',
        'tenant_cancelled',
        'tenant_deleted',
        'features_updated',
        'usage_synced',
        'subscription_changed',
        'tenant_updated',
      ],
      index: true,
    },

    /** Who triggered the action */
    performedBy: {
      userId: { type: String, required: true },
      role: { type: String, default: 'product_owner' },
    },

    /** Optional reason (for suspensions, cancellations, etc.) */
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    /** Snapshot of state before the action (partial) */
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /** Snapshot of state after the action (partial) */
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /** Additional structured metadata */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound index for querying a tenant's history with time ordering
tenantAuditLogSchema.index({ clinic: 1, createdAt: -1 });
tenantAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('TenantAuditLog', tenantAuditLogSchema);
