'use strict';

const mongoose = require('mongoose');
const { INSURANCE_CLAIM_STATUS } = require('../../config/constants');

const insuranceClaimSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InsuranceProvider',
      required: true,
      index: true,
    },
    policyNumber: {
      type: String,
      required: [true, 'Policy number is required'],
      trim: true,
    },

    /** Pre-authorization */
    preAuthNumber: { type: String, trim: true },
    preAuthAmount: { type: Number, min: 0 },
    preAuthStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },

    /** Co-payment */
    coPayPercent: { type: Number, min: 0, max: 100 },
    coPayAmount: { type: Number, min: 0 },
    patientResponsibility: { type: Number, min: 0 },

    claimAmount: {
      type: Number,
      required: [true, 'Claim amount is required'],
      min: 0,
    },
    approvedAmount: { type: Number, min: 0 },
    settledAmount: { type: Number, min: 0 },

    /** Settlement tracking */
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }],
    reconciledAt: Date,
    reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    status: {
      type: String,
      enum: Object.values(INSURANCE_CLAIM_STATUS),
      default: INSURANCE_CLAIM_STATUS.PENDING,
    },

    submittedAt: Date,
    approvedAt: Date,
    settledAt: Date,
    rejectionReason: { type: String, trim: true },

    documents: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
      },
    ],

    diagnosis: { type: String, trim: true },
    notes: { type: String, trim: true },

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
insuranceClaimSchema.index({ patient: 1, provider: 1 });
insuranceClaimSchema.index({ status: 1 });
insuranceClaimSchema.index({ deletedAt: 1 });

// Soft-delete filter
insuranceClaimSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = insuranceClaimSchema;
