'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../../config/constants');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      default: NOTIFICATION_TYPE.SYSTEM,
    },

    isRead: { type: Boolean, default: false },
    readAt: Date,

    metadata: { type: mongoose.Schema.Types.Mixed },

    expiresAt: Date,

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ 'metadata.appointmentId': 1 });
notificationSchema.index({ deletedAt: 1 });

// Soft-delete: automatically exclude deleted notifications from queries
notificationSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = notificationSchema;
