'use strict';

const mongoose = require('mongoose');
const { PAYMENT_MODE, PAYMENT_STATUS } = require('../../config/constants');

const paymentSchema = new mongoose.Schema(
  {
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
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Payment amount must be greater than zero'],
    },
    mode: {
      type: String,
      enum: Object.values(PAYMENT_MODE),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    gatewayProvider: {
      type: String,
      enum: ['razorpay', 'stripe'],
      default: null,
    },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    gatewaySignature: String,
    idempotencyKey: String,
    refundId: String,
    refundAmount: { type: Number, min: 0, default: 0 },
    refundReason: { type: String, trim: true },
    refundedAt: Date,
    cashRegister: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashRegister',
    },
    insuranceClaim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InsuranceClaim',
    },
    creditNote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditNote',
    },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    processedAt: Date,
    metadata: mongoose.Schema.Types.Mixed,
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
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
paymentSchema.index({ invoice: 1 });
paymentSchema.index({ patient: 1, createdAt: -1 });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
paymentSchema.index({ gatewayPaymentId: 1 }, { sparse: true });
paymentSchema.index({ status: 1 });
paymentSchema.index({ branch: 1, createdAt: -1 });
paymentSchema.index({ deletedAt: 1 });

// Soft-delete filter
paymentSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = paymentSchema;
