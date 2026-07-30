'use strict';

const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    /** Link to video session */
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VideoSession',
      required: true,
      index: true,
    },

    /** Sender */
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['doctor', 'patient', 'receptionist', 'admin', 'owner', 'system'],
      required: true,
    },
    senderName: { type: String, trim: true },

    /** Message content */
    type: {
      type: String,
      enum: ['text', 'file', 'image', 'system'],
      default: 'text',
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    /** File attachment (for type=file/image) */
    attachment: {
      name: String,
      url: String,
      mimeType: String,
      size: Number,
    },

    /**
     * Delivery + read tracking.
     * `deliveredAt`    — set when the peer's socket acknowledges arrival.
     * `readBy[]`       — list of participants who have opened this message
     *                    (in a 2-party call there's typically one entry, but the
     *                    shape is array-based so future group chat is painless).
     * `readAt`         — kept for backwards compatibility; mirrors
     *                    `readBy[0].at` when first read-receipt lands.
     */
    deliveredAt: Date,
    readBy: [{
      _id: false,
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at:   { type: Date, default: Date.now },
    }],
    readAt: Date,

    /** Encryption metadata */
    encrypted: { type: Boolean, default: true },
    iv: String,  // initialization vector for decryption

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
chatMessageSchema.index({ session: 1, createdAt: 1 });
chatMessageSchema.index({ sender: 1 });
chatMessageSchema.index({ deletedAt: 1 });

// Soft-delete filter
chatMessageSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = chatMessageSchema;
