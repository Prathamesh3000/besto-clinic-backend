'use strict';

const mongoose = require('mongoose');
const { CREDIT_NOTE_REASON, CREDIT_NOTE_STATUS } = require('../../config/constants');

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: {
      type: String,
      unique: true,
      required: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: Object.values(CREDIT_NOTE_REASON),
      required: true,
    },

    /** Line items */
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        tax: { type: Number, default: 0, min: 0 },
        total: { type: Number, required: true, min: 0 },
      },
    ],

    /** Totals */
    subtotal: { type: Number, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: Object.values(CREDIT_NOTE_STATUS),
      default: CREDIT_NOTE_STATUS.DRAFT,
    },
    appliedToInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    appliedAmount: { type: Number, default: 0, min: 0 },
    appliedAt: Date,
    validUntil: Date,
    notes: { type: String, trim: true },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
creditNoteSchema.index({ patient: 1, status: 1 });
creditNoteSchema.index({ deletedAt: 1 });

// Soft-delete filter
creditNoteSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// Auto-generate credit note number
creditNoteSchema.pre('validate', function (next) {
  if (!this.creditNoteNumber) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.creditNoteNumber = `CN-${ts}-${rand}`;
  }
  next();
});

module.exports = creditNoteSchema;
