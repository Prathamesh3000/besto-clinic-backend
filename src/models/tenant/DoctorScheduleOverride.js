'use strict';

const mongoose = require('mongoose');

const doctorScheduleOverrideSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor is required'],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    type: {
      type: String,
      enum: ['custom_hours', 'day_off', 'extra_day'],
      required: [true, 'Override type is required'],
    },
    slots: [{
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      label: { type: String, default: null },
    }],
    // Legacy fields — auto-populated from slots for backward compat
    startTime: { type: String, default: null }, // HH:mm — required for custom_hours, extra_day
    endTime: { type: String, default: null },
    breakStart: { type: String, default: null },
    breakEnd: { type: String, default: null },
    reason: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// One override per doctor-branch-date (soft-delete aware)
doctorScheduleOverrideSchema.index(
  { doctor: 1, branch: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
doctorScheduleOverrideSchema.index({ deletedAt: 1 });

doctorScheduleOverrideSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = doctorScheduleOverrideSchema;
