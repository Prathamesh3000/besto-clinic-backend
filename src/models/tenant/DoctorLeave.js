'use strict';

const mongoose = require('mongoose');

const doctorLeaveSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor is required'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    leaveType: {
      type: String,
      enum: ['planned', 'sick', 'personal', 'conference', 'other'],
      default: 'planned',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null, // null = all branches
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

doctorLeaveSchema.index({ doctor: 1, startDate: 1, endDate: 1 });
doctorLeaveSchema.index({ status: 1 });
doctorLeaveSchema.index({ deletedAt: 1 });

doctorLeaveSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = doctorLeaveSchema;
