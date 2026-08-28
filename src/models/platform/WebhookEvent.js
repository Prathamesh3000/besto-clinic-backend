'use strict';

const mongoose = require('mongoose');

/**
 * WebhookEvent — platform-level persistence for Razorpay webhook events.
 *
 * Stored in the platform DB (not tenant) because webhooks arrive without
 * tenant context. The tenantSlug is extracted from the payment entity's
 * notes after persistence.
 *
 * Provides:
 * - Idempotent deduplication via unique razorpayEventId
 * - Full payload audit trail
 * - Processing status tracking with error capture
 */
const webhookEventSchema = new mongoose.Schema(
  {
    /** Razorpay's unique event ID (e.g. "event_xxx") — deduplication key */
    razorpayEventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /** Razorpay event type (e.g. "payment.captured", "payment.failed", "refund.created") */
    eventType: {
      type: String,
      required: true,
      index: true,
    },

    /** Razorpay order ID from the payment entity */
    orderId: String,

    /** Razorpay payment ID from the payment entity */
    gatewayPaymentId: String,

    /** Amount in paise */
    amount: Number,

    /** Currency code */
    currency: { type: String, default: 'INR' },

    /** Resolved tenant slug (extracted from payment notes) */
    tenantSlug: {
      type: String,
      index: true,
    },

    /** Processing status */
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'ignored'],
      default: 'received',
      index: true,
    },

    /** Full raw webhook payload for audit trail */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    /** Razorpay signature header value */
    signature: String,

    /** When processing completed */
    processedAt: Date,

    /** Error message if processing failed */
    error: String,

    /** Number of processing attempts */
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// TTL index — auto-delete processed events after 90 days
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound index for finding unprocessed events
webhookEventSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
